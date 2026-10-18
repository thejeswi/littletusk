// Page tools: read the page as a bounded snapshot and act on it, with the safety rules enforced here.

import type { ElementKind, OverlayInfo, PageCommand, PageResult, PageSnapshot, SnapElement } from "../../shared/protocol";
import { detectOverlays as detect } from "./overlays";
import { blockedTarget, isSecretField, looksIrreversible, looksLikeClose, looksLikeDismiss, paymentHint } from "./safety";

export { looksIrreversible, isSecretField };

export interface PageTools {
  snapshot(): PageSnapshot;
  run(
    cmd: Exclude<PageCommand, { op: "point" } | { op: "spotlight" } | { op: "clear" } | { op: "ask-type" }>,
    opts: { confirmed: boolean },
  ): Promise<PageResult>;
  element(id: string): Element | null;
  describe(id: string): SnapElement | null;
  detectOverlays(): OverlayInfo[];
  watchOverlays(cb: (o: OverlayInfo) => void): () => void;
}

const MAX_ELEMENTS = 150;
const MAX_TEXT = 3000;
const SETTLE_MS = 400;
const HOST_SELECTOR = "[data-littletusk-host]";
const INTERACTIVE =
  "button, a[href], input:not([type=hidden]), select, textarea, [role=button], [role=link], [role=checkbox], [role=radio], [role=tab], [role=menuitem], [onclick], [contenteditable=true], summary";
const SKIP_TEXT_TAGS = new Set(["script", "style", "noscript", "template", "textarea", "select", "input", "svg", "head"]);

const clip = (s: string, n: number) => {
  const t = s.replace(/\s+/g, " ").trim();
  return t.length > n ? t.slice(0, n - 1) + "…" : t;
};

export function createPageTools(doc: Document, win: Window): PageTools {
  const G = win as unknown as typeof globalThis;
  const ids = new WeakMap<Element, string>();
  let counter = 0;

  const idFor = (el: Element): string => {
    let id = ids.get(el);
    if (!id) {
      const stamped = el.getAttribute("data-tusk-id");
      id = stamped || `e${++counter}`;
      if (stamped) {
        const n = parseInt(stamped.slice(1), 10);
        if (n > counter) counter = n;
      }
      ids.set(el, id);
    }
    if (el.getAttribute("data-tusk-id") !== id) el.setAttribute("data-tusk-id", id);
    return id;
  };

  const hasLayout = (): boolean => doc.documentElement.getBoundingClientRect().height > 0;

  const isVisible = (el: Element): boolean => {
    for (let n: Element | null = el; n && n !== doc.documentElement; n = n.parentElement) {
      if (n.hasAttribute("hidden") && !n.hasAttribute("data-tusk-id-ignore")) return false;
      const s = win.getComputedStyle(n);
      if (s.display === "none") return false;
      if (n === el && (s.visibility === "hidden" || s.visibility === "collapse")) return false;
      if (n.tagName.toLowerCase() === "input" && (n as HTMLInputElement).type === "hidden") return false;
    }
    if (hasLayout()) {
      const r = el.getBoundingClientRect();
      if (r.width === 0 && r.height === 0) return false;
    }
    return true;
  };

  const inViewport = (el: Element): boolean => {
    if (!hasLayout()) return true;
    const r = el.getBoundingClientRect();
    const vw = win.innerWidth || 1024;
    const vh = win.innerHeight || 768;
    return r.bottom > 0 && r.right > 0 && r.top < vh && r.left < vw;
  };

  const textOfIds = (attr: string | null): string => {
    if (!attr) return "";
    return attr
      .split(/\s+/)
      .map((i) => doc.getElementById(i)?.textContent ?? "")
      .join(" ");
  };

  const labelFor = (el: Element): string => {
    const id = el.getAttribute("id");
    if (id) {
      for (const l of Array.from(doc.querySelectorAll("label"))) {
        if (l.getAttribute("for") === id) return l.textContent ?? "";
      }
    }
    return el.closest("label")?.textContent ?? "";
  };

  const nameOf = (el: Element): string => {
    const tag = el.tagName.toLowerCase();
    const type = (el.getAttribute("type") ?? "").toLowerCase();
    const raw =
      el.getAttribute("aria-label") ||
      textOfIds(el.getAttribute("aria-labelledby")) ||
      (["input", "select", "textarea"].includes(tag) && type !== "button" && type !== "submit" && type !== "reset" ? labelFor(el) : "") ||
      (tag === "input" && (type === "button" || type === "submit" || type === "reset") ? el.getAttribute("value") ?? "" : "") ||
      el.getAttribute("alt") ||
      (tag === "img" ? "" : visibleText(el, 120)) ||
      el.querySelector("img[alt]")?.getAttribute("alt") ||
      el.getAttribute("title") ||
      el.getAttribute("placeholder") ||
      el.getAttribute("name") ||
      "";
    return clip(raw, 80);
  };

  function visibleText(root: Element, max: number): string {
    const out: string[] = [];
    let len = 0;
    const walk = (n: Node) => {
      if (len >= max) return;
      if (n.nodeType === 3) {
        const t = (n.nodeValue ?? "").replace(/\s+/g, " ");
        if (t.trim()) {
          out.push(t);
          len += t.length;
        }
        return;
      }
      if (n.nodeType !== 1) return;
      const e = n as Element;
      if (SKIP_TEXT_TAGS.has(e.tagName.toLowerCase()) || e.matches(HOST_SELECTOR) || e.getAttribute("aria-hidden") === "true") return;
      if (e.hasAttribute("hidden")) return;
      const s = win.getComputedStyle(e);
      if (s.display === "none" || s.visibility === "hidden") return;
      for (const c of Array.from(e.childNodes)) walk(c);
    };
    walk(root);
    return out.join("").replace(/\s+/g, " ").trim();
  }

  const kindOf = (el: Element): ElementKind => {
    const tag = el.tagName.toLowerCase();
    const type = (el.getAttribute("type") ?? "text").toLowerCase();
    const role = el.getAttribute("role");
    if (/^h[1-6]$/.test(tag)) return "heading";
    if (tag === "select") return "select";
    if (tag === "textarea") return "textbox";
    if (tag === "input") {
      if (type === "checkbox") return "checkbox";
      if (type === "radio") return "radio";
      if (["button", "submit", "reset", "image"].includes(type)) return "button";
      return "textbox";
    }
    if (role === "checkbox") return "checkbox";
    if (role === "radio") return "radio";
    if (tag === "button" || role === "button" || role === "tab" || role === "menuitem") return "button";
    if (tag === "a" || role === "link") return "link";
    if (el.hasAttribute("contenteditable")) return "textbox";
    return "other";
  };

  const isButtonLike = (el: Element): boolean => {
    const tag = el.tagName.toLowerCase();
    const type = (el.getAttribute("type") ?? "").toLowerCase();
    const role = el.getAttribute("role");
    return tag === "button" || role === "button" || (tag === "input" && ["button", "submit", "image"].includes(type));
  };

  const submitButtonOf = (form: HTMLFormElement): Element | null =>
    form.querySelector("button:not([type]), button[type=submit], input[type=submit], input[type=image]");

  const formLooksLikePayment = (form: HTMLFormElement): boolean => {
    const heading = form.querySelector("h1,h2,h3,legend")?.textContent ?? "";
    return paymentHint(`${form.getAttribute("action") ?? ""} ${heading}`);
  };

  const irreversibleEl = (el: Element): boolean => {
    if (!isButtonLike(el)) return false;
    if (looksIrreversible(nameOf(el)) || looksIrreversible(el.getAttribute("title") ?? "")) return true;
    const type = (el.getAttribute("type") ?? (el.tagName.toLowerCase() === "button" ? "submit" : "")).toLowerCase();
    const form = (el as HTMLButtonElement).form ?? el.closest("form");
    if (type === "submit" && form && formLooksLikePayment(form)) return true;
    return false;
  };

  const valueOf = (el: Element, secret: boolean): string | undefined => {
    const tag = el.tagName.toLowerCase();
    if (tag !== "input" && tag !== "textarea" && tag !== "select") return undefined;
    const input = el as HTMLInputElement;
    const type = (input.type || "").toLowerCase();
    if (secret) return input.value ? "(filled, hidden)" : "(empty)";
    if (["button", "submit", "reset", "image"].includes(type)) return undefined;
    if (type === "checkbox" || type === "radio") return input.checked ? "checked" : "unchecked";
    if (tag === "select") {
      const sel = el as HTMLSelectElement;
      return clip(sel.selectedOptions[0]?.textContent ?? "", 80);
    }
    return input.value ? clip(input.value, 200) : "(empty)";
  };

  const describeEl = (el: Element, overlayRoots: Element[]): SnapElement => {
    const kind0 = kindOf(el);
    const secret = isSecretField(el);
    const name = nameOf(el);
    const inOv = overlayRoots.some((o) => o === el || o.contains(el));
    const kind: ElementKind = kind0 !== "heading" && kind0 !== "textbox" && (looksLikeClose(name) || (inOv && looksLikeDismiss(name))) ? "close" : kind0;
    const s: SnapElement = { id: idFor(el), kind, name, inViewport: inViewport(el) };
    const value = valueOf(el, secret);
    if (value !== undefined) s.value = value;
    if (secret) s.secret = true;
    if (irreversibleEl(el)) s.irreversible = true;
    if (inOv) s.inOverlay = true;
    return s;
  };

  const detectHelpers = () => ({ idFor, nameOf, isVisible, hasLayout: hasLayout() });
  const detectOverlays = (): OverlayInfo[] => detect(doc, win, detectHelpers());

  const overlayRootsOf = (overlays: OverlayInfo[]): Element[] =>
    overlays.map((o) => doc.querySelector(`[data-tusk-id="${o.id}"]`)).filter((e): e is Element => !!e);

  const pageText = (): string => {
    const main = doc.querySelector("main, article, [role=main]");
    const parts: string[] = [];
    if (main) parts.push(visibleText(main, MAX_TEXT));
    const mainLen = parts.join(" ").length;
    if (mainLen < MAX_TEXT && doc.body) {
      const rest = visibleText(doc.body, MAX_TEXT + mainLen);
      if (!main) parts.push(rest);
      else if (rest) {
        const mainText = parts[0];
        parts.push(rest.split(mainText).join(" "));
      }
    }
    return clip(parts.join(" "), MAX_TEXT);
  };

  const snapshot = (): PageSnapshot => {
    const overlays = detectOverlays();
    const roots = overlayRootsOf(overlays);
    const cands = new Set<Element>(Array.from(doc.querySelectorAll(INTERACTIVE + ", h1, h2, h3")));
    // clickable-looking elements without proper roles
    let scanned = 0;
    for (const el of Array.from(doc.querySelectorAll("div, span, li, img, td, p"))) {
      if (++scanned > 2000) break;
      if (cands.has(el) || el.closest(HOST_SELECTOR)) continue;
      if (win.getComputedStyle(el).cursor !== "pointer") continue;
      if (el.querySelector(INTERACTIVE) || el.closest("a, button")) continue;
      const t = (el.textContent ?? "").trim();
      if (el.tagName.toLowerCase() === "img" ? !el.getAttribute("alt") : !t || t.length > 40) continue;
      cands.add(el);
    }
    const ranked: { el: Element; order: number; rank: number }[] = [];
    let order = 0;
    for (const el of cands) {
      order++;
      if (el.closest(HOST_SELECTOR) || !isVisible(el)) continue;
      const tag = el.tagName.toLowerCase();
      if (/^h[1-3]$/.test(tag) && !visibleText(el, 5)) continue;
      const inOv = roots.some((o) => o.contains(el));
      ranked.push({ el, order, rank: (inOv ? 0 : 2) + (inViewport(el) ? 0 : 1) });
    }
    ranked.sort((a, b) => a.rank - b.rank || a.order - b.order);
    const chosen = ranked.slice(0, MAX_ELEMENTS).sort((a, b) => a.order - b.order);
    // doc order for Set insertion is mixed (selector groups); sort by DOM position instead
    chosen.sort((a, b) => (a.el.compareDocumentPosition(b.el) & 4 ? -1 : 1));
    return {
      url: win.location.href,
      title: doc.title,
      lang: doc.documentElement.getAttribute("lang") ?? "",
      elements: chosen.map((c) => describeEl(c.el, roots)),
      text: pageText(),
      overlays,
    };
  };

  const element = (id: string): Element | null => {
    const el = doc.querySelector(`[data-tusk-id="${id.replace(/["\\]/g, "")}"]`);
    return el && !el.closest(HOST_SELECTOR) ? el : null;
  };

  const describe = (id: string): SnapElement | null => {
    const el = element(id);
    return el ? describeEl(el, overlayRootsOf(detectOverlays())) : null;
  };

  const sleep = (ms: number) => new Promise<void>((r) => win.setTimeout(r, ms));

  const nowShows = (): string => {
    const ov = detectOverlays();
    const bits = [`The page now shows: ${clip(pageText(), 300) || "(nothing readable)"}`];
    if (ov.length) bits.push(`Popups open: ${ov.map((o) => `${o.kind} "${clip(o.summary, 50)}"`).join("; ")}.`);
    return bits.join(" ");
  };

  const fire = (el: Element, type: string, init: EventInit = {}) => {
    const opts = { bubbles: true, cancelable: true, composed: true, button: 0, ...init };
    let ev: Event;
    try {
      ev = type.startsWith("pointer") && typeof G.PointerEvent === "function" ? new G.PointerEvent(type, opts) : new G.MouseEvent(type, opts);
    } catch {
      ev = new G.MouseEvent(type.replace("pointer", "mouse"), opts);
    }
    el.dispatchEvent(ev);
  };

  const key = (el: Element, type: string) =>
    el.dispatchEvent(new G.KeyboardEvent(type, { key: "Enter", code: "Enter", keyCode: 13, which: 13, bubbles: true, cancelable: true } as KeyboardEventInit));

  const setNative = (el: HTMLInputElement | HTMLTextAreaElement, value: string) => {
    const proto = el instanceof G.HTMLTextAreaElement ? G.HTMLTextAreaElement.prototype : G.HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
    if (setter) setter.call(el, value);
    else el.value = value;
  };

  const lookup = (id: string): { el: Element } | { err: PageResult } => {
    const el = element(id);
    if (!el) return { err: { ok: false, error: `NOT_FOUND: no element [${id}] on this page now. Read the page again.` } };
    return { el };
  };

  const run: PageTools["run"] = async (cmd, opts) => {
    switch (cmd.op) {
      case "snapshot":
        return { ok: true, snapshot: snapshot() };
      case "describe": {
        const d = describe(cmd.id);
        return d ? { ok: true, element: d } : { ok: false, error: `NOT_FOUND: no element [${cmd.id}].` };
      }
      case "back":
        win.history.back();
        await sleep(SETTLE_MS);
        return { ok: true, text: `Went back. ${nowShows()}` };
      case "scroll":
        try {
          win.scrollBy({ top: (cmd.direction === "down" ? 1 : -1) * Math.round((win.innerHeight || 700) * 0.8), behavior: "instant" as ScrollBehavior });
        } catch {
          /* no layout, nothing to scroll */
        }
        await sleep(150);
        return { ok: true, text: `Scrolled ${cmd.direction}.` };
      case "click": {
        const f = lookup(cmd.id);
        if ("err" in f) return f.err;
        const el = f.el;
        const name = nameOf(el);
        const blocked = blockedTarget(el);
        if (blocked) return { ok: false, error: blocked };
        if ((el as HTMLButtonElement).disabled) return { ok: false, error: `DISABLED: [${cmd.id}] "${name}" cannot be clicked right now.` };
        if (irreversibleEl(el) && !opts.confirmed) {
          return { ok: false, error: `NEEDS_CONFIRMATION: [${cmd.id}] "${name}" cannot be undone. Ask the person for a yes first.` };
        }
        (el as HTMLElement).scrollIntoView?.({ block: "center", inline: "nearest" });
        (el as HTMLElement).focus?.();
        for (const t of ["pointerdown", "mousedown", "pointerup", "mouseup", "click"]) fire(el, t);
        await sleep(SETTLE_MS);
        return { ok: true, text: `Clicked [${cmd.id}] "${name}". ${nowShows()}` };
      }
      case "type": {
        const f = lookup(cmd.id);
        if ("err" in f) return f.err;
        const el = f.el;
        if (isSecretField(el)) {
          return { ok: false, error: `SECRET_FIELD: [${cmd.id}] is a private field (password, code, PIN or bank number). Never type here; ask the person to type it themselves.` };
        }
        const tag = el.tagName.toLowerCase();
        const editable = tag === "input" || tag === "textarea" || (el as HTMLElement).isContentEditable || el.getAttribute("contenteditable") === "true";
        if (!editable) return { ok: false, error: `NOT_EDITABLE: [${cmd.id}] is not a text field.` };
        const form = (el as HTMLInputElement).form ?? null;
        let submitBtn: Element | null = null;
        if (cmd.enter && form) {
          submitBtn = submitButtonOf(form);
          const risky = (submitBtn && irreversibleEl(submitBtn)) || formLooksLikePayment(form);
          if (risky && !opts.confirmed) {
            return { ok: false, error: `NEEDS_CONFIRMATION: pressing Enter here would send "${submitBtn ? nameOf(submitBtn) : "the form"}" and cannot be undone. Ask the person for a yes first.` };
          }
        }
        (el as HTMLElement).scrollIntoView?.({ block: "center" });
        (el as HTMLElement).focus?.();
        if (tag === "input" || tag === "textarea") {
          setNative(el as HTMLInputElement, cmd.text);
          el.dispatchEvent(new G.Event("input", { bubbles: true }));
          el.dispatchEvent(new G.Event("change", { bubbles: true }));
        } else {
          el.textContent = cmd.text;
          el.dispatchEvent(new G.Event("input", { bubbles: true }));
        }
        let extra = "";
        if (cmd.enter) {
          key(el, "keydown");
          key(el, "keypress");
          key(el, "keyup");
          if (form) {
            if (typeof form.requestSubmit === "function") {
              try {
                form.requestSubmit(submitBtn instanceof G.HTMLElement ? (submitBtn as HTMLInputElement) : undefined);
              } catch {
                form.requestSubmit();
              }
            } else form.submit();
          }
          extra = " and pressed Enter";
        }
        await sleep(SETTLE_MS);
        return { ok: true, text: `Typed into [${cmd.id}] "${nameOf(el)}"${extra}. ${nowShows()}` };
      }
      case "select": {
        const f = lookup(cmd.id);
        if ("err" in f) return f.err;
        const el = f.el;
        if (el.tagName.toLowerCase() !== "select") return { ok: false, error: `NOT_A_SELECT: [${cmd.id}] is not a drop-down list.` };
        if (isSecretField(el)) return { ok: false, error: `SECRET_FIELD: [${cmd.id}] is private; ask the person to choose.` };
        const sel = el as HTMLSelectElement;
        const want = cmd.option.trim().toLowerCase();
        const opts2 = Array.from(sel.options);
        const opt = opts2.find((o) => o.value.toLowerCase() === want || (o.textContent ?? "").trim().toLowerCase() === want) ?? opts2.find((o) => (o.textContent ?? "").toLowerCase().includes(want));
        if (!opt) return { ok: false, error: `NO_SUCH_OPTION: "${cmd.option}". Options: ${opts2.slice(0, 12).map((o) => (o.textContent ?? "").trim()).join(", ")}.` };
        const setter = Object.getOwnPropertyDescriptor(G.HTMLSelectElement.prototype, "value")?.set;
        if (setter) setter.call(sel, opt.value);
        else sel.value = opt.value;
        sel.dispatchEvent(new G.Event("input", { bubbles: true }));
        sel.dispatchEvent(new G.Event("change", { bubbles: true }));
        await sleep(150);
        return { ok: true, text: `Chose "${(opt.textContent ?? "").trim()}" in [${cmd.id}].` };
      }
    }
  };

  const watchOverlays = (cb: (o: OverlayInfo) => void): (() => void) => {
    const seen = new WeakSet<Element>();
    let timer: number | undefined;
    const check = () => {
      for (const o of detectOverlays()) {
        const el = element(o.id);
        if (!el || seen.has(el)) continue;
        seen.add(el);
        cb(o);
      }
    };
    const schedule = () => {
      if (timer !== undefined) win.clearTimeout(timer);
      timer = win.setTimeout(check, 300);
    };
    const MO = (win as unknown as { MutationObserver: typeof MutationObserver }).MutationObserver;
    const mo = new MO(schedule);
    mo.observe(doc.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ["style", "class", "hidden", "open", "aria-hidden"] });
    schedule();
    return () => {
      mo.disconnect();
      if (timer !== undefined) win.clearTimeout(timer);
    };
  };

  return { snapshot, run, element, describe, detectOverlays, watchOverlays };
}
