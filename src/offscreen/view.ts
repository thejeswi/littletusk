// Builds the chat the overlay shows from pi-durable's conversation view. Pure: no chrome, no storage.
import type { ChatItem, ChatView, Language } from "../shared/protocol";
import { t } from "../shared/i18n";
import { KIND } from "./state";

export type EntryLike = { id: string | number; kind: string; model?: readonly any[]; data?: any };
export type ViewValueLike = { entries: readonly EntryLike[]; docs: Readonly<Record<string, any>> };

/** Tools that have their own item (confirm/offer) or no useful plain-words line. */
const HIDDEN_TOOLS = new Set(["ask_confirmation", "offer_to_do_it", "clear", "remember"]);

export function actionText(lang: Language, tool: string, args: any, details: any): string | undefined {
  const name = typeof details?.name === "string" && details.name ? details.name : undefined;
  const fallback = "…";
  switch (tool) {
    case "read_page":
      return t(lang, "actLooked");
    case "point_at":
    case "spotlight":
      return t(lang, "actPointed", { name: name ?? fallback });
    case "click":
      return details?.popup ? t(lang, "actClosed") : t(lang, "actClicked", { name: name ?? fallback });
    case "type_text":
      return t(lang, "actTyped", { name: name ?? fallback });
    case "select_option":
      return t(lang, "actChose", { name: typeof args?.option === "string" ? args.option : (name ?? fallback) });
    case "scroll":
      return t(lang, "actScrolled");
    case "go_back":
      return t(lang, "actBack");
    case "open_url":
      return t(lang, "actOpened", { name: hostOf(args?.url) ?? fallback });
    case "ask_person_to_type":
      return t(lang, "actAskedType", { name: name ?? fallback });
    default:
      return undefined;
  }
}

function hostOf(url: unknown): string | undefined {
  try {
    return new URL(String(url)).hostname;
  } catch {
    return undefined;
  }
}

const textOf = (content: unknown): string =>
  typeof content === "string"
    ? content
    : Array.isArray(content)
      ? content.filter((b) => b?.type === "text").map((b) => b.text).join("")
      : "";

export function buildView(input: {
  value: ViewValueLike | undefined;
  lang: Language;
  spend: number;
  limit: number;
  currency: "EUR" | "USD";
  taskTabId?: number;
}): ChatView {
  const { value, lang } = input;
  const entries = value?.entries ?? [];
  const live = value?.docs?.["pi.live"];

  const answers = new Map<string, "yes" | "no">();
  const results = new Map<string, { isError: boolean; details: any }>();
  for (const e of entries) {
    if (e.kind === KIND.answer && e.data) answers.set(String(e.data.itemId), e.data.yes ? "yes" : "no");
    const m = e.model?.[0];
    if (m?.role === "toolResult") results.set(m.toolCallId, { isError: !!m.isError, details: m.details });
  }
  const liveTools = new Map<string, string>();
  for (const s of (live?.tools ?? []) as { callId: string; status: string }[]) liveTools.set(s.callId, s.status);

  const items: ChatItem[] = [];
  for (const e of entries) {
    const id = String(e.id);
    switch (e.kind) {
      case KIND.user:
        if (e.data?.text) items.push({ kind: "user", id, text: String(e.data.text) });
        break;
      case "pi.user": {
        const text = textOf(e.model?.[0]?.content);
        if (text) items.push({ kind: "user", id, text });
        break;
      }
      case KIND.say:
        items.push({ kind: "tusk", id, text: String(e.data?.text ?? "") });
        break;
      case KIND.notice:
        items.push({ kind: "notice", id, text: String(e.data?.text ?? "") });
        break;
      case KIND.action:
        items.push({ kind: "action", id, text: String(e.data?.text ?? ""), state: "done" });
        break;
      case KIND.confirm:
        items.push({ kind: "confirm", id, question: String(e.data?.question ?? ""), answered: answers.get(id) });
        break;
      case KIND.offer:
        items.push({ kind: "offer", id, text: String(e.data?.text ?? t(lang, "shallIDoIt")), answered: answers.get(id) });
        break;
      case "pi.assistant": {
        const m = e.model?.[0];
        if (!m) break;
        (m.content ?? []).forEach((b: any, i: number) => {
          if (b.type === "text" && String(b.text).trim()) {
            items.push({ kind: "tusk", id: `${id}:${i}`, text: String(b.text).trim() });
          } else if (b.type === "toolCall" && !HIDDEN_TOOLS.has(b.name)) {
            const r = results.get(b.id);
            const text = actionText(lang, b.name, b.arguments, r?.details);
            if (!text) return;
            const state = r ? (r.isError ? "failed" : "done") : liveTools.get(b.id) === "done" ? "failed" : "running";
            items.push({ kind: "action", id: b.id, text, state });
          }
        });
        if (m.stopReason === "error") items.push({ kind: "notice", id: `${id}:error`, text: t(lang, "modelError") });
        break;
      }
    }
  }

  // The answer being written right now.
  const partial = live?.generation?.message;
  const partialText = textOf((partial?.content ?? []).filter((b: any) => b.type === "text"));
  if (partialText.trim()) items.push({ kind: "tusk", id: "live", text: partialText.trim(), streaming: true });

  return {
    items,
    busy: !!live?.run,
    spend: { month: Math.round(input.spend * 10000) / 10000, limit: input.limit, currency: input.currency },
    taskTabId: input.taskTabId || undefined,
  };
}

/** Collapses bursts of changes into one call, at most every `ms`, always delivering the newest state. */
export function throttle(fn: () => void, ms: number): { call(): void; flush(): void } {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let last = 0;
  return {
    call() {
      if (timer !== undefined) return;
      const wait = Math.max(0, last + ms - Date.now());
      timer = setTimeout(() => {
        timer = undefined;
        last = Date.now();
        fn();
      }, wait);
    },
    flush() {
      if (timer !== undefined) clearTimeout(timer);
      timer = undefined;
      last = Date.now();
      fn();
    },
  };
}
