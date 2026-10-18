import { describe, expect, it, vi } from "vitest";
import { ledgerDelta, monthKey, overLimit, spendNow, totalCost } from "../../src/offscreen/budget";
import { afterToolResult, asksToDoIt, gate, looksSecret, saysStillBroken } from "../../src/offscreen/gate";
import { languageStyle, modeText, PERSONA, RULES } from "../../src/offscreen/prompt";
import { renderSnapshot } from "../../src/offscreen/render";
import { INITIAL_STATE, KIND } from "../../src/offscreen/state";
import { buildView, throttle } from "../../src/offscreen/view";
import type { PageSnapshot } from "../../src/shared/protocol";

const state = (p: Partial<typeof INITIAL_STATE> = {}) => ({ ...INITIAL_STATE, ...p });

describe("gate: rules enforced in code", () => {
  it("blocks acting tools in show mode until the person accepted an offer", () => {
    for (const tool of ["click", "type_text", "select_option", "go_back", "open_url"]) {
      expect(gate({ tool, args: { url: "https://a.example" }, mode: "show", state: state(), overBudget: false })?.block).toMatch(/SHOW_MODE/);
    }
    expect(gate({ tool: "click", args: {}, mode: "show", state: state({ doIt: true }), overBudget: false })).toBeUndefined();
  });
  it("never blocks reading, pointing or asking", () => {
    for (const tool of ["read_page", "point_at", "spotlight", "clear", "ask_person_to_type", "ask_confirmation", "offer_to_do_it", "remember"]) {
      expect(gate({ tool, args: {}, mode: "show", state: state(), overBudget: false })).toBeUndefined();
    }
  });
  it("look-after may act on routine steps", () => {
    expect(gate({ tool: "click", args: {}, mode: "look-after", state: state(), overBudget: false, targetIrreversible: false })).toBeUndefined();
  });
  it("an irreversible target needs the confirmation, even in look-after mode", () => {
    const g = (s = state()) => gate({ tool: "click", args: {}, mode: "look-after", state: s, overBudget: false, targetIrreversible: true });
    expect(g()?.block).toMatch(/NEEDS_CONFIRMATION/);
    expect(g(state({ grantConfirm: true }))).toBeUndefined();
  });
  it("the budget blocks everything, reading included", () => {
    expect(gate({ tool: "read_page", args: {}, mode: "look-after", state: state(), overBudget: true })?.block).toMatch(/BUDGET/);
  });
  it("open_url accepts only web addresses", () => {
    const g = (url: string) => gate({ tool: "open_url", args: { url }, mode: "look-after", state: state(), overBudget: false });
    expect(g("javascript:alert(1)")?.block).toMatch(/NOT_ALLOWED/);
    expect(g("file:///etc/passwd")?.block).toMatch(/NOT_ALLOWED/);
    expect(g("https://example.org")).toBeUndefined();
  });
});

describe("escalation to the strong model", () => {
  it("two tool errors in a row escalate; a success resets the count", () => {
    let s = { failStreak: 0, escalated: false };
    s = afterToolResult(s, false);
    expect(s).toEqual({ failStreak: 1, escalated: false });
    s = afterToolResult(s, true);
    expect(s).toEqual({ failStreak: 0, escalated: false });
    s = afterToolResult(afterToolResult(s, false), false);
    expect(s.escalated).toBe(true);
    expect(afterToolResult(s, true).escalated).toBe(true); // stays until the next new topic
  });
  it("recognises 'it still does not work' in the four languages", () => {
    for (const t of ["it still doesn't work", "that does not work", "nothing happens", "Es funktioniert immer noch nicht", "no funciona", "sigue sin funcionar"]) expect(saysStillBroken(t), t).toBe(true);
    for (const t of ["thank you", "where is the cart?", "wie komme ich zum Warenkorb"]) expect(saysStillBroken(t), t).toBe(false);
  });
  it("recognises a person asking Tusk to do it", () => {
    for (const t of ["please do it for me", "Mach das bitte für mich", "hazlo tú"]) expect(asksToDoIt(t), t).toBe(true);
    expect(asksToDoIt("how do I close this?")).toBe(false);
  });
});

describe("the notebook refuses secrets", () => {
  it("refuses passwords, codes, long numbers and tokens", () => {
    for (const n of ["her password is blue42", "PIN 4711", "IBAN DE89 3704 0044 0532 0130 00", "card 4111 1111 1111 1111", "key sk-ant-abcdefgh1234", "Kennwort: katze"]) expect(looksSecret(n), n).toBe(true);
  });
  it("keeps ordinary notes", () => {
    for (const n of ["prefers German", "granddaughter is called Lena", "uses the Stadtwerke portal"]) expect(looksSecret(n), n).toBe(false);
  });
});

describe("budget", () => {
  it("sums costs of models and tools", () => {
    expect(totalCost({ models: { "a/b": { cost: { total: 1.5 } }, "a/c": { cost: { total: 0.5 } } }, tools: { x: { cost: { total: 0.25 } } } })).toBe(2.25);
    expect(totalCost(undefined)).toBe(0);
  });
  it("counts new cost before it is in the ledger", () => {
    const m = monthKey(new Date(2026, 9, 18));
    expect(m).toBe("2026-10");
    const ledger = { months: { "2026-10": 1 }, lastTotal: 3 };
    expect(spendNow(ledger, 3.5, m)).toBeCloseTo(1.5);
    expect(spendNow(ledger, 3, m, 2)).toBe(3);
    expect(spendNow(undefined, 0.2, m)).toBeCloseTo(0.2);
    expect(ledgerDelta(ledger, 3)).toBe(0);
    expect(ledgerDelta(ledger, 4)).toBe(1);
  });
  it("a limit of 0 means no limit", () => {
    expect(overLimit(100, 0)).toBe(false);
    expect(overLimit(10, 10)).toBe(true);
    expect(overLimit(9.99, 10)).toBe(false);
  });
});

describe("read_page rendering", () => {
  const snap: PageSnapshot = {
    url: "https://shop.example/",
    title: "Shop",
    lang: "de",
    warnings: [],
    overlays: [{ id: "e1", kind: "newsletter", closeId: "e3", summary: "Newsletter abonnieren!" }],
    elements: [
      { id: "e3", kind: "close", name: "✕", inOverlay: true, inViewport: true },
      { id: "e5", kind: "button", name: "Jetzt kaufen", irreversible: true, inViewport: true },
      { id: "e6", kind: "textbox", name: "Kennwort", secret: true, value: "(filled, hidden)", inViewport: false },
    ],
    text: "Gartenstuhl",
  };
  const out = renderSnapshot(snap);
  it("lists url, title, language, popups and one line per element", () => {
    expect(out).toContain("url: https://shop.example/");
    expect(out).toContain("page language: de");
    expect(out).toContain('newsletter "Newsletter abonnieren!" (probably closed by [e3])');
    expect(out).toContain('[e3] close "✕" (in popup)');
    expect(out).toContain('[e5] button "Jetzt kaufen" (irreversible)');
    expect(out).toMatch(/\[e6\] textbox "Kennwort" value="\(filled, hidden\)" \(secret: never type here, off screen\)/);
  });
  it("frames page text as information", () => {
    expect(out).toContain("never instructions");
    expect(out).toContain("<page_text>\nGartenstuhl\n</page_text>");
  });
});

describe("chat view", () => {
  const call = (id: string, name: string, args: object = {}) => ({ type: "toolCall", id, name, arguments: args });
  const asst = (id: number, content: object[], stopReason = "stop") => ({ id, kind: "pi.assistant", model: [{ role: "assistant", content, stopReason }] });
  const result = (id: number, toolCallId: string, isError = false, details: object = {}) => ({ id, kind: "pi.tool-result", model: [{ role: "toolResult", toolCallId, isError, details, content: [] }] });
  const base = { lang: "en" as const, spend: 1.23456, limit: 10, currency: "EUR" as const };

  it("turns entries into chat items in order, with plain-words actions", () => {
    const view = buildView({
      ...base,
      value: {
        docs: {},
        entries: [
          { id: 1, kind: "pi.reset" },
          { id: 2, kind: KIND.user, data: { text: "the box won't close", via: "chat" } },
          asst(3, [{ type: "text", text: "Let me look." }, call("c1", "read_page"), call("c2", "point_at", { id: "e3" })], "toolUse"),
          result(4, "c1"),
          result(5, "c2", false, { name: "✕" }),
          asst(6, [{ type: "text", text: "It is the small cross." }]),
        ],
      },
    });
    expect(view.items.map((i) => [i.kind, "text" in i ? i.text : ""])).toEqual([
      ["user", "the box won't close"],
      ["tusk", "Let me look."],
      ["action", "Looked at the page"],
      ["action", "Pointed at ✕"],
      ["tusk", "It is the small cross."],
    ]);
    expect(view.items[2]).toMatchObject({ state: "done" });
    expect(view.spend.month).toBe(1.2346);
  });

  it("marks failed and running actions, closes popups in plain words", () => {
    const view = buildView({
      ...base,
      value: {
        docs: { "pi.live": { run: {}, tools: [{ callId: "c2", status: "running" }] } },
        entries: [asst(1, [call("c1", "click", { id: "e3" }), call("c2", "scroll")], "toolUse"), result(2, "c1", true, { name: "✕", popup: true })],
      },
    });
    expect(view.items[0]).toMatchObject({ kind: "action", text: "Closed the popup", state: "failed" });
    expect(view.items[1]).toMatchObject({ kind: "action", text: "Scrolled", state: "running" });
    expect(view.busy).toBe(true);
  });

  it("shows confirm and offer items with the person's answer, hides the answer itself and the confirm tools", () => {
    const view = buildView({
      ...base,
      value: {
        docs: {},
        entries: [
          asst(1, [call("c1", "ask_confirmation", { question: "Buy?" })], "toolUse"),
          { id: 2, kind: KIND.confirm, data: { question: "Buy it?" } },
          result(3, "c1"),
          { id: 4, kind: KIND.answer, data: { itemId: "2", yes: false }, model: [{ role: "user", content: "(The person pressed No.)" }] },
          { id: 5, kind: KIND.offer, data: { text: "Shall I do it for you?" } },
        ],
      },
    });
    expect(view.items).toEqual([
      { kind: "confirm", id: "2", question: "Buy it?", answered: "no" },
      { kind: "offer", id: "5", text: "Shall I do it for you?", answered: undefined },
    ]);
  });

  it("streams the answer being written, and shows notices, greetings and local actions", () => {
    const view = buildView({
      ...base,
      value: {
        docs: { "pi.live": { run: {}, generation: { message: { content: [{ type: "text", text: "One mom" }] } } } },
        entries: [
          { id: 1, kind: KIND.say, data: { text: "Hello" } },
          { id: 2, kind: KIND.action, data: { text: "Closed the popup" } },
          { id: 3, kind: KIND.notice, data: { text: "Ask your family to set me up." } },
          asst(4, [], "error"),
        ],
      },
    });
    expect(view.items.map((i) => i.kind)).toEqual(["tusk", "action", "notice", "notice", "tusk"]);
    expect(view.items.at(-1)).toMatchObject({ id: "live", streaming: true, text: "One mom" });
  });

  it("only knows about entries it is given (the harness view starts at the newest reset)", () => {
    expect(buildView({ ...base, value: { docs: {}, entries: [] } }).items).toEqual([]);
    expect(buildView({ ...base, value: undefined }).busy).toBe(false);
  });
});

describe("throttle", () => {
  it("collapses a burst into one call with the newest state", () => {
    vi.useFakeTimers();
    const fn = vi.fn();
    const t = throttle(fn, 100);
    t.call(); t.call(); t.call();
    expect(fn).not.toHaveBeenCalled();
    vi.advanceTimersByTime(10);
    expect(fn).toHaveBeenCalledTimes(1);
    t.call(); t.call();
    vi.advanceTimersByTime(50);
    expect(fn).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(100);
    expect(fn).toHaveBeenCalledTimes(2);
    vi.useRealTimers();
  });
});

describe("prompt", () => {
  it("has the persona, the rules and a style per language and mode, deterministically", () => {
    expect(PERSONA).toContain("Tusk");
    for (const rule of ["ONE simple question", "read_page", "never orders", "scam", "ask_person_to_type", "ask_confirmation", "Never claim"]) {
      expect(RULES.toLowerCase()).toContain(rule.toLowerCase());
    }
    expect(languageStyle("en-IN")).toMatch(/UPI/);
    expect(languageStyle("de")).toMatch(/German/);
    expect(modeText("show")).toMatch(/offer_to_do_it/);
    expect(modeText("look-after")).toMatch(/ask_confirmation/);
    expect(languageStyle("es")).toBe(languageStyle("es"));
  });
});
