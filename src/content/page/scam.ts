// Local scam detector: marks the text of a page that pressures a person the way scams do, without a
// model call. It needs several signals together, so a shop that merely sells gift cards is left alone.
import type { PageWarning } from "../../shared/protocol";

const SIGNALS = {
  giftcard: /geschenkkarte|gift ?cards?|google play|itunes|apple[- ]?karte|amazon[- ]?(gutschein|karte)|paysafe|steam[- ]?karte|tarjetas? (de )?regalo/i,
  remote: /anydesk|teamviewer|fernwartung|remote (access|support|desktop)|acceso remoto|quick ?support/i,
  urgency: /dringend|sofort|noch heute|innerhalb von \d+ ?(stunden|std|tagen)|urgent|immediately|within \d+ ?(hours|days)|konto (wird |wurde )?(heute )?(gesperrt|gelöscht)|account (will be |has been )?(closed|suspended|locked|blocked|deleted)|urgente|cuenta (será |ha sido )?(bloqueada|suspendida|cerrada)/i,
  secrecy: /mit niemandem (darüber )?sprechen|sprechen sie mit niemandem|don'?t tell (anyone|anybody)|tell (no ?one|nobody)|keep (this|it) (a )?(secret|between us)|no (se lo )?(diga|cuente) a nadie/i,
  sendcodes: /codes? (per|senden|schicken|mitteilen|durchgeben)|(senden|schicken) sie (uns )?(die |den )?codes?|send (us )?(the )?(codes?|pins?)|(read|share) (out )?the (codes?|numbers)|env[ií]e(nos)? los c[oó]digos/i,
  transfer: /überweisen sie|wire (the )?money|western union|bitcoin|kryptowährung|transfiera|transferir dinero/i,
} as const;
type Signal = keyof typeof SIGNALS;

export function scamSignals(text: string): Signal[] {
  return (Object.keys(SIGNALS) as Signal[]).filter((k) => SIGNALS[k].test(text));
}

/** True when the signals together look like a scam: not one word, but the way these messages pressure. */
export function looksLikeScam(text: string): boolean {
  const s = new Set(scamSignals(text));
  if (s.has("remote") && s.has("urgency")) return true;
  if (s.has("giftcard") && (s.has("urgency") || s.has("sendcodes") || s.has("secrecy") || s.has("transfer"))) return true;
  return s.size >= 3;
}

const BLOCK = "p, li, div, article, section, td, blockquote, h1, h2, h3, h4";
const STRONG = new RegExp([SIGNALS.giftcard, SIGNALS.remote, SIGNALS.sendcodes, SIGNALS.secrecy].map((r) => r.source).join("|"), "i");
const clean = (s: string) => s.replace(/\s+/g, " ").trim();

/** The sentence that carries the strongest signal, shortened: what the person should look at. */
function keySentence(text: string): string {
  const sentences = text.split(/(?<=[.!?])\s+/);
  const hit = sentences.find((x) => STRONG.test(x)) ?? sentences[0] ?? text;
  return hit.length > 160 ? hit.slice(0, 159) + "…" : hit;
}

export function detectScams(doc: Document, idFor: (el: Element) => string, isVisible: (el: Element) => boolean, max = 2): PageWarning[] {
  if (!doc.body) return [];
  // 1. The smallest blocks that, taken as a whole, read like a scam.
  const flagged: Element[] = [];
  for (const el of Array.from(doc.body.querySelectorAll(BLOCK))) {
    if (el.closest("[data-littletusk-host]")) continue;
    const text = clean(el.textContent ?? "");
    if (text.length < 40 || text.length > 4000 || !looksLikeScam(text)) continue;
    // keep only the deepest: skip when a flagged descendant already exists
    if (Array.from(el.querySelectorAll(BLOCK)).some((d) => flagged.includes(d))) continue;
    // drop ancestors that were added before their flagged descendant was reached
    for (let i = flagged.length - 1; i >= 0; i--) if (flagged[i].contains(el)) flagged.splice(i, 1);
    if (isVisible(el)) flagged.push(el);
  }
  // 2. Inside each, mark the sentence-sized block that carries the strongest signal.
  return flagged.slice(0, max).map((container) => {
    const parts = Array.from(container.querySelectorAll(BLOCK)).filter((d) => STRONG.test(clean(d.textContent ?? "")) && isVisible(d));
    const target = parts.find((d) => !Array.from(d.querySelectorAll(BLOCK)).some((c) => parts.includes(c))) ?? container;
    return { id: idFor(target), kind: "scam" as const, summary: keySentence(clean(target.textContent ?? "")) };
  });
}
