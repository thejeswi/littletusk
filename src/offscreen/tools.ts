// The model-facing tools and the hooks that enforce the safety rules in code.
import { Type } from "@earendil-works/pi-ai";
import { configure, defineExtension, defineTool, hook, ToolTask, UsageDoc, type ToolExecutionApi, type ToolExecutionResult } from "@earendil-works/pi-durable";
import type { Context } from "@earendil-works/chord";
import type { PageCommand, PageResult, Settings } from "../shared/protocol";
import { isWebUrl } from "../shared/protocol";
import { monthKey, overLimit, spendNow, totalCost } from "./budget";
import { afterToolResult, gate, looksSecret, TARGETED_TOOLS } from "./gate";
import { createSections } from "./prompt";
import { renderSnapshot } from "./render";
import { INITIAL_STATE, KIND, LedgerDoc, NOTEBOOK_MAX, NotebookDoc, StateDoc, type TuskState } from "./state";

/** What the tools need from the outside world. The harness provides it. */
export interface Runtime {
  settings(): Settings;
  /** Run a command in the task tab (service worker -> content script). */
  page(cmd: PageCommand): Promise<PageResult>;
  openUrl(url: string): Promise<PageResult>;
  /** Test builds only: spend that is not in the ledger. */
  extraSpend(): number;
}

const text = (s: string) => [{ type: "text" as const, text: s }];
const done = (s: string, details?: Record<string, string | boolean>): ToolExecutionResult => ({ output: text(s), ...(details ? { details } : {}) });
const failed = (s: string): ToolExecutionResult => ({ output: text(s), isError: true });

export function createExtension(rt: Runtime) {
  const readState = async (api: { conversationId: any; snapshot: ToolExecutionApi["snapshot"] }, ctx: Context): Promise<TuskState> =>
    ({ ...INITIAL_STATE, ...((await api.snapshot(StateDoc, api.conversationId, ctx)) ?? {}) }) as TuskState;

  /** Count a tool result for escalation: two errors in a row move this topic to the strong model. */
  async function track(api: ToolExecutionApi, ctx: Context, ok: boolean) {
    const s = rt.settings();
    await api.commit(async (tx) => {
      const st = await tx.doc(StateDoc, api.conversationId);
      const next = afterToolResult(st, ok);
      const newlyEscalated = next.escalated && !st.escalated;
      st.failStreak = next.failStreak;
      st.escalated = next.escalated;
      if (newlyEscalated) await configure(tx, api.conversationId, { model: { provider: s.provider, modelId: s.strongModel } });
    }, ctx);
  }

  const fromPage = (r: PageResult, details?: Record<string, string | boolean>): ToolExecutionResult =>
    r.ok ? done(r.text ?? "Done.", details) : failed(r.error);

  /** Run an acting command, with escalation tracking. */
  async function act(api: ToolExecutionApi, ctx: Context, cmd: PageCommand, details?: (r: PageResult) => Record<string, string | boolean> | undefined) {
    const r = await rt.page(cmd);
    await track(api, ctx, r.ok);
    return fromPage(r, details?.(r));
  }

  const consumeGrant = (api: ToolExecutionApi, ctx: Context) =>
    api.commit(async (tx) => {
      (await tx.doc(StateDoc, api.conversationId)).grantConfirm = false;
    }, ctx);

  const readPage = defineTool({
    name: "read_page",
    description: "Read the page in the person's tab: address, title, popups, the clickable elements with ids like [e12], and the text. Call it before acting and after every change.",
    parameters: Type.Object({}),
    replay: "safe",
    execute: async (_a, api, ctx) => {
      const r = await rt.page({ op: "snapshot" });
      if (!r.ok) {
        await track(api, ctx, false);
        return failed(r.error);
      }
      return done(r.snapshot ? renderSnapshot(r.snapshot) : "The page could not be read.");
    },
  });

  const idSay = { id: Type.String({ description: "element id such as e12, from read_page" }), say: Type.String({ description: "one short sentence in the person's language" }) };

  const pointAt = defineTool({
    name: "point_at",
    description: "Walk Tusk over to an element and point at it with the trunk, with a short speech bubble. The person clicks it themselves.",
    parameters: Type.Object(idSay),
    replay: "safe",
    execute: (a, api, ctx) => act(api, ctx, { op: "point", id: a.id, say: a.say }, (r) => (r.ok && r.element ? { name: r.element.name } : undefined)),
  });

  const spotlight = defineTool({
    name: "spotlight",
    description: "Dim the whole page and cut a bright hole around one element, with a short speech bubble. Use it when the person is lost.",
    parameters: Type.Object(idSay),
    replay: "safe",
    execute: (a, api, ctx) => act(api, ctx, { op: "spotlight", id: a.id, say: a.say }, (r) => (r.ok && r.element ? { name: r.element.name } : undefined)),
  });

  const clear = defineTool({
    name: "clear",
    description: "Remove the pointing, glow and spotlight from the page.",
    parameters: Type.Object({}),
    replay: "safe",
    execute: async () => fromPage(await rt.page({ op: "clear" })),
  });

  const click = defineTool({
    name: "click",
    description: "Click an element for the person. Blocked unless the mode and the person's answers allow it.",
    parameters: Type.Object({ id: Type.String() }),
    execute: async (a, api, ctx) => {
      const d = await rt.page({ op: "describe", id: a.id });
      const el = d.ok ? d.element : undefined;
      const st = await readState(api, ctx);
      const irreversible = !!el?.irreversible;
      const r = await rt.page({ op: "click", id: a.id, confirmed: irreversible && st.grantConfirm });
      await track(api, ctx, r.ok);
      if (r.ok && irreversible && st.grantConfirm) await consumeGrant(api, ctx);
      return fromPage(r, { name: el?.name ?? "", popup: !!el?.inOverlay && el.kind === "close" });
    },
  });

  const typeText = defineTool({
    name: "type_text",
    description: "Type ordinary text into a text field. Never for passwords, PINs, codes or bank details: use ask_person_to_type.",
    parameters: Type.Object({ id: Type.String(), text: Type.String(), press_enter: Type.Optional(Type.Boolean()) }),
    execute: async (a, api, ctx) => {
      const st = await readState(api, ctx);
      const d = await rt.page({ op: "describe", id: a.id });
      const enter = !!a.press_enter;
      const r = await rt.page({ op: "type", id: a.id, text: a.text, enter, confirmed: enter && st.grantConfirm });
      await track(api, ctx, r.ok);
      if (r.ok && enter && st.grantConfirm) await consumeGrant(api, ctx);
      return fromPage(r, { name: d.ok && d.element ? d.element.name : "" });
    },
  });

  const selectOption = defineTool({
    name: "select_option",
    description: "Choose an option in a drop-down list by its visible text.",
    parameters: Type.Object({ id: Type.String(), option: Type.String() }),
    execute: async (a, api, ctx) => {
      const st = await readState(api, ctx);
      const d = await rt.page({ op: "describe", id: a.id });
      const irreversible = d.ok && !!d.element?.irreversible;
      const r = await rt.page({ op: "select", id: a.id, option: a.option, confirmed: irreversible && st.grantConfirm });
      await track(api, ctx, r.ok);
      if (r.ok && irreversible && st.grantConfirm) await consumeGrant(api, ctx);
      return fromPage(r, { name: d.ok && d.element ? d.element.name : "" });
    },
  });

  const scroll = defineTool({
    name: "scroll",
    description: "Scroll the page up or down by about one screen.",
    parameters: Type.Object({ direction: Type.Union([Type.Literal("up"), Type.Literal("down")]) }),
    execute: (a, api, ctx) => act(api, ctx, { op: "scroll", direction: a.direction }),
  });

  const goBack = defineTool({
    name: "go_back",
    description: "Go back one page in the browser history.",
    parameters: Type.Object({}),
    execute: (_a, api, ctx) => act(api, ctx, { op: "back" }),
  });

  const openUrl = defineTool({
    name: "open_url",
    description: "Open a web address (http or https) in the person's tab.",
    parameters: Type.Object({ url: Type.String() }),
    execute: async (a, api, ctx) => {
      if (!isWebUrl(a.url)) return failed("NOT_ALLOWED: only web addresses (http or https) can be opened.");
      const r = await rt.openUrl(a.url);
      await track(api, ctx, r.ok);
      return fromPage(r);
    },
  });

  const askPersonToType = defineTool({
    name: "ask_person_to_type",
    description: "Mark a field and ask the person to type in it themselves (passwords, PINs, codes, bank details). You will not see what they type.",
    parameters: Type.Object(idSay),
    replay: "safe",
    execute: (a, api, ctx) => act(api, ctx, { op: "ask-type", id: a.id, say: a.say }, (r) => (r.ok && r.element ? { name: r.element.name } : undefined)),
  });

  /** Write a Yes/No item and end the run: the person's answer arrives as the next input. */
  const ask = (kind: typeof KIND.confirm | typeof KIND.offer, data: (t: string) => Record<string, string>) => async (a: { question?: string; text?: string }, api: ToolExecutionApi, ctx: Context): Promise<ToolExecutionResult> => {
    const entry = await api.commit(async (tx) => {
      const st = await tx.doc(StateDoc, api.conversationId);
      if (kind === KIND.confirm) st.grantConfirm = false; // a new question withdraws any older yes
      return tx.appendEntry(api.conversationId, { kind, data: data(String(a.question ?? a.text ?? "")) });
    }, ctx);
    return { output: text("Asked the person. Their answer arrives as the next message. Do not write anything more now."), control: { terminate: true }, details: { itemId: String(entry.id) } };
  };

  const askConfirmation = defineTool({
    name: "ask_confirmation",
    description: "Ask the person a plain yes/no question before something that cannot be undone. Shows big Yes and No buttons and ends your turn; their answer arrives as the next message. Call it alone.",
    parameters: Type.Object({ question: Type.String({ description: "in the person's language: what will happen if they say yes" }) }),
    executionMode: "sequential",
    execute: ask(KIND.confirm, (q) => ({ question: q })),
  });

  const offerToDoIt = defineTool({
    name: "offer_to_do_it",
    description: 'In "Show me how" mode: offer to do the current step for the person. Ends your turn; if they say yes you may then click and type.',
    parameters: Type.Object({ text: Type.String({ description: "in the person's language, e.g. a short 'Shall I do it for you?'" }) }),
    executionMode: "sequential",
    execute: ask(KIND.offer, (t) => ({ text: t })),
  });

  const remember = defineTool({
    name: "remember",
    description: "Keep a short note about the person that helps next time (preferences, family names). Never secrets.",
    parameters: Type.Object({ note: Type.String() }),
    execute: async (a, api, ctx) => {
      const note = a.note.trim().slice(0, 300);
      if (!note) return failed("The note is empty.");
      if (looksSecret(note)) return failed("REFUSED: that looks like a secret (password, code, bank or card number). Never store those.");
      let stored = true;
      await api.commit(async (tx) => {
        const nb = await tx.doc(NotebookDoc, api.conversationId);
        const total = nb.notes.reduce((n, s) => n + s.length, 0);
        if (total + note.length > NOTEBOOK_MAX) stored = false;
        else nb.notes.push(note);
      }, ctx);
      return stored ? done("Noted.") : failed("The notebook is full. Do not store more.");
    },
  });

  const guard = hook(ToolTask, {
    beforeTool: async (call, api, ctx) => {
      const state = await readState(api, ctx);
      const [ledger, usage] = await Promise.all([api.snapshot(LedgerDoc, api.conversationId, ctx), api.snapshot(UsageDoc, api.conversationId, ctx)]);
      const s = rt.settings();
      const overBudget = overLimit(spendNow(ledger, totalCost(usage as any), monthKey(), rt.extraSpend()), s.monthlyLimit);
      const args = call.arguments as Record<string, unknown>;
      const base = { tool: call.name, args, mode: s.mode, state, overBudget } as const;
      const first = gate(base);
      if (first || !TARGETED_TOOLS.has(call.name) || typeof args.id !== "string") return first;
      const d = await rt.page({ op: "describe", id: args.id });
      return gate({ ...base, targetIrreversible: d.ok && !!d.element?.irreversible });
    },
  });

  return defineExtension({
    name: "little-tusk",
    sections: createSections(rt.settings),
    tools: [readPage, pointAt, spotlight, clear, click, typeText, selectOption, scroll, goBack, openUrl, askPersonToType, askConfirmation, offerToDoIt, remember],
    hooks: [guard],
  });
}
