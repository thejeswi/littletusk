// Local popup detector: finds cookie banners, newsletter boxes, ads and modals without a model.

import type { OverlayInfo } from "../../shared/protocol";
import { dismissScore } from "./safety";

export interface DetectHelpers {
  idFor(el: Element): string;
  nameOf(el: Element): string;
  isVisible(el: Element): boolean;
  hasLayout: boolean;
}

const NAME_HINT = /(modal|popup|pop-up|overlay|banner|cookie|consent|dialog|lightbox|newsletter|interstitial|gdpr)/i;
const AD_HINT = /(^|[^a-z])(ads?|advert\w*|anzeige|sponsor\w*|werbung|publicidad)([^a-z]|$)/i;
const COOKIE_WORDS = /(cookie|consent|datenschutz|einwilligung|akzeptieren|aceptar|privacidad)/i;
const NEWS_WORDS = /(newsletter|abonnieren|subscribe|suscr[ií]be|suscripci)/i;
const DISCOUNT_WORDS = /(rabatt|discount|descuento|gutschein|coupon)/i;

const CLICKABLE = "button, a[href], [role=button], [role=link], input[type=button], input[type=submit], [aria-label], [class*=close i]";

function pos(win: Window, el: Element): string {
  return win.getComputedStyle(el).position;
}

function summarize(el: Element): string {
  const t = (el.textContent ?? "").replace(/\s+/g, " ").trim();
  return t.length > 100 ? t.slice(0, 97) + "..." : t;
}

function classify(el: Element, text: string): OverlayInfo["kind"] {
  const attrs = `${el.getAttribute("class") ?? ""} ${el.getAttribute("id") ?? ""} ${el.getAttribute("aria-label") ?? ""}`;
  if (COOKIE_WORDS.test(text) || /(cookie|consent|gdpr)/i.test(attrs)) return "cookie-banner";
  if (NEWS_WORDS.test(text) || (DISCOUNT_WORDS.test(text) && el.querySelector("input[type=email]"))) return "newsletter";
  if (AD_HINT.test(attrs) || /^(anzeige|werbung|advertisement)\b/i.test(text)) return "ad";
  if (el.getAttribute("role") === "dialog" || el.getAttribute("role") === "alertdialog" || el.getAttribute("aria-modal") === "true" || /(modal|dialog)/i.test(attrs)) return "modal";
  return "other";
}

function findClose(el: Element, kind: OverlayInfo["kind"], h: DetectHelpers): string | undefined {
  let best: { score: number; node: Element } | null = null;
  for (const c of Array.from(el.querySelectorAll(CLICKABLE))) {
    if (!h.isVisible(c)) continue;
    const label = h.nameOf(c) || (c.getAttribute("class") ?? "");
    let score = dismissScore(h.nameOf(c), kind === "cookie-banner");
    if (!score && /close/i.test(c.getAttribute("class") ?? "")) score = 55;
    if (score > (best?.score ?? 0)) best = { score, node: c };
    void label;
  }
  return best ? h.idFor(best.node) : undefined;
}

function coversCentre(doc: Document, el: Element, r: DOMRect, vw: number, vh: number): boolean {
  const cx = vw / 2, cy = vh / 2;
  if (!(r.left <= cx && r.right >= cx && r.top <= cy && r.bottom >= cy)) return false;
  const hit = typeof doc.elementFromPoint === "function" ? doc.elementFromPoint(cx, cy) : null;
  if (!hit || hit.closest("[data-littletusk-host], [data-littletusk=overlay]")) return true; // Tusk itself is there: judge by the box
  return el.contains(hit);
}

export function detectOverlays(doc: Document, win: Window, h: DetectHelpers): OverlayInfo[] {
  const vw = win.innerWidth || 1024;
  const vh = win.innerHeight || 768;
  const found: Element[] = [];
  const all = Array.from(doc.body ? doc.body.querySelectorAll("*") : []);
  for (const el of all) {
    const tag = el.tagName.toLowerCase();
    if (tag === "script" || tag === "style" || tag === "header" || tag === "nav" || el.closest("[data-littletusk-host]")) continue;
    if (found.some((f) => f.contains(el))) continue;
    const p = pos(win, el);
    const z = parseInt(win.getComputedStyle(el).zIndex, 10);
    const isFloating = p === "fixed" || p === "sticky";
    const role = el.getAttribute("role");
    const isDialog = role === "dialog" || role === "alertdialog" || el.getAttribute("aria-modal") === "true";
    const attrs = `${el.getAttribute("class") ?? ""} ${el.getAttribute("id") ?? ""}`;
    const hinted = NAME_HINT.test(attrs);
    if (!(isFloating || isDialog || (z >= 100) || (!h.hasLayout && hinted))) continue;
    if (!h.isVisible(el)) continue;
    if (el.getAttribute("aria-hidden") === "true" && !isDialog) continue;
    const text = (el.textContent ?? "").replace(/\s+/g, " ").trim();
    if (!text && !el.querySelector("img, iframe")) continue;
    const kind = classify(el, text);
    if (h.hasLayout) {
      const r = el.getBoundingClientRect();
      const area = (Math.max(0, Math.min(r.right, vw) - Math.max(r.left, 0)) * Math.max(0, Math.min(r.bottom, vh) - Math.max(r.top, 0))) / (vw * vh);
      const banner = (isFloating || z >= 100) && r.width >= vw * 0.6 && r.height >= 24 && (r.top <= 8 || r.bottom >= vh - 8) && kind !== "other";
      const dialog = isDialog && area > 0.05;
      if (!(area > 0.25 || banner || dialog)) continue;
      // Headers, sidebars and corner players are page furniture, not popups: an unnamed overlay
      // must be a dialog or actually take the clicks in the middle of the screen.
      if (kind === "other" && !dialog && !coversCentre(doc, el, r, vw, vh)) continue;
    } else if (kind === "other" && !isFloating && !isDialog && !hinted) {
      continue;
    }
    found.push(el);
  }
  return found.map((el) => {
    const text = (el.textContent ?? "").replace(/\s+/g, " ").trim();
    const kind = classify(el, text);
    return { id: h.idFor(el), kind, closeId: findClose(el, kind, h), summary: summarize(el) };
  });
}
