// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mountOverlay, type OverlayCallbacks, type OverlayController } from "../../src/content/ui";
import { DEFAULT_SETTINGS, type ChatView } from "../../src/shared/protocol";

const { apiKey: _k, ...settings } = DEFAULT_SETTINGS;
void _k;
let root: ShadowRoot;
let ctrl: OverlayController;
let cb: OverlayCallbacks;

beforeEach(() => {
  const orig = Element.prototype.attachShadow;
  vi.spyOn(Element.prototype, "attachShadow").mockImplementation(function (this: Element, init) {
    root = orig.call(this, init);
    return root;
  });
  cb = {
    onAnswer: vi.fn(), onMicStart: vi.fn(), onMicStop: vi.fn(), onMicPause: vi.fn(), onNewTopic: vi.fn(),
    onSettingsChange: vi.fn(), onTuck: vi.fn(), onOpenFamilySettings: vi.fn(), onAcceptOverlayHelp: vi.fn(),
  };
  ctrl = mountOverlay(cb, settings);
});
afterEach(() => { ctrl.destroy(); vi.restoreAllMocks(); });

const q = <T extends Element>(s: string) => root.querySelector(s) as T;
const view = (items: ChatView["items"], busy = false): ChatView => ({ items, busy, spend: { month: 2, limit: 10, currency: "EUR" } });

describe("overlay", () => {
  it("renders a closed shadow host without stealing focus", () => {
    const host = document.querySelector("[data-littletusk]") as HTMLElement;
    expect(host.parentElement).toBe(document.documentElement);
    expect(host.shadowRoot).toBeNull();
    expect(q("button.tusk")).toBeTruthy();
    expect(root.activeElement).toBeNull();
  });

  it("clicking Tusk opens the chat; Settings in its header opens settings and closing them returns to the chat", () => {
    const chat = () => root.querySelectorAll<HTMLElement>(".panel")[0];
    const settings = () => root.querySelectorAll<HTMLElement>(".panel")[1];
    q<HTMLButtonElement>("button.tusk").click();
    expect(chat().hidden).toBe(false);
    expect(q(".head-btn").textContent).toContain("Settings");
    q<HTMLButtonElement>(".head-btn").click();
    expect(settings().hidden).toBe(false);
    expect(chat().hidden).toBe(true);
    settings().querySelector<HTMLButtonElement>(".head .x")!.click();
    expect(chat().hidden).toBe(false);
    q<HTMLButtonElement>("button.tusk").click();
    expect(chat().hidden).toBe(true);
  });

  it("renders view items and calls onAnswer once", () => {
    q<HTMLButtonElement>("button.tusk").click();
    ctrl.setView(view([
      { kind: "user", id: "1", text: "hi" },
      { kind: "tusk", id: "2", text: "hello" },
      { kind: "action", id: "3", text: "Looked at the page", state: "done" },
      { kind: "confirm", id: "4", question: "Send it?" },
      { kind: "notice", id: "5", text: "careful" },
    ], true));
    expect(root.querySelectorAll(".msg.user").length).toBe(1);
    expect(root.querySelector(".chip")!.textContent).toContain("✅");
    expect(root.querySelector(".think")).toBeTruthy();
    expect(root.querySelector(".foot")!.textContent).toContain("2.00");
    const yes = root.querySelector<HTMLButtonElement>(".q .btn.yes")!;
    yes.click();
    expect(cb.onAnswer).toHaveBeenCalledWith("4", true);
    expect(root.querySelector<HTMLButtonElement>(".q .btn.yes")!.disabled).toBe(true);
    expect(root.querySelector(".q .res")!.textContent).toContain("Yes");
  });

  it("the chat holds the typing box as its own frame, and no microphone while speech is off", () => {
    q<HTMLButtonElement>("button.tusk").click();
    expect(root.querySelector(".compose iframe.compose-frame")).toBeTruthy();
    expect(root.querySelector(".compose input")).toBeNull();
    expect(root.querySelector(".compose .mic")).toBeNull();
  });

  it("switches language and reports setting changes", () => {
    const sel = q<HTMLSelectElement>("select");
    sel.value = "de";
    sel.dispatchEvent(new Event("change"));
    expect(cb.onSettingsChange).toHaveBeenCalledWith({ language: "de" });
    expect(q(".head-btn").textContent).toContain("Einstellungen");
  });

  it("points, shows bubble and clears", () => {
    const target = document.createElement("button");
    document.body.append(target);
    ctrl.pointAt(target, "Click here");
    expect(q<HTMLElement>(".bubble").hidden).toBe(false);
    expect(q(".bubble").textContent).toBe("Click here");
    expect(q("button.tusk").classList.contains("pointing")).toBe(true);
    ctrl.clear();
    expect(q<HTMLElement>(".bubble").hidden).toBe(true);
    expect(q("button.tusk").classList.contains("pointing")).toBe(false);
  });

  it("offer help calls onAcceptOverlayHelp", () => {
    const target = document.createElement("div");
    document.body.append(target);
    ctrl.offerOverlayHelp("ov1", target, "Close it?");
    q<HTMLButtonElement>(".bubble .btn.yes").click();
    expect(cb.onAcceptOverlayHelp).toHaveBeenCalledWith("ov1");
  });

  it("pops a bubble for a pending question when chat is closed", () => {
    ctrl.setView(view([{ kind: "offer", id: "o", text: "Shall I do it for you?" }]));
    q<HTMLButtonElement>(".bubble .btn.no").click();
    expect(cb.onAnswer).toHaveBeenCalledWith("o", false);
  });

  it("shows the listening bubble", () => {
    ctrl.setMic(0.5, true);
    expect(q<HTMLElement>(".listen").hidden).toBe(false);
    ctrl.setMic(0, false);
    expect(q<HTMLElement>(".listen").hidden).toBe(true);
  });
});
