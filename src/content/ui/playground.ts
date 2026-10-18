// Test hook: main.ts calls playground(ctrl) when the page has <meta name="littletusk-playground">.
// It fills the overlay with fake data and wires any [data-tusk-demo] element on the page:
//   data-tusk-demo="point|spotlight|ask|offer|say|clear|view|busy"  data-target="#selector"  data-say="text"
import type { OverlayController } from "./index";

export function playground(ctrl: OverlayController): void {
  if (!document.querySelector('meta[name="littletusk-playground"]')) return;
  const view = (busy: boolean) => ({
    busy,
    spend: { month: 1.37, limit: 10, currency: "EUR" as const },
    items: [
      { kind: "user" as const, id: "u1", text: "How do I close this box?" },
      { kind: "action" as const, id: "a1", text: "Looked at the page", state: "done" as const },
      { kind: "action" as const, id: "a2", text: "Pointed at the ✕", state: "running" as const },
      { kind: "tusk" as const, id: "t1", text: "The small ✕ in the top right corner closes it." },
      { kind: "offer" as const, id: "o1", text: "Shall I do it for you?" },
      { kind: "confirm" as const, id: "c1", question: "Send this form now?" },
      { kind: "notice" as const, id: "n1", text: "Ask your family to set me up." },
    ],
  });
  ctrl.setView(view(false));
  document.addEventListener("click", (e) => {
    const src = (e.target as Element | null)?.closest?.("[data-tusk-demo]");
    if (!src) return;
    const kind = src.getAttribute("data-tusk-demo");
    const target = document.querySelector(src.getAttribute("data-target") ?? "");
    const say = src.getAttribute("data-say") ?? "Here it is.";
    if (kind === "clear") ctrl.clear();
    else if (kind === "say") ctrl.say(say);
    else if (kind === "view") ctrl.setView(view(false));
    else if (kind === "busy") ctrl.setView(view(true));
    else if (!target) return;
    else if (kind === "point") ctrl.pointAt(target, say);
    else if (kind === "spotlight") ctrl.spotlight(target, say);
    else if (kind === "ask") ctrl.askType(target, say);
    else if (kind === "offer") ctrl.offerOverlayHelp("demo-overlay", target, say);
  });
}
