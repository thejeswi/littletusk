// Safety rules for the page tools: what counts as irreversible, secret, a download or a close button.

import { isWebUrl } from "../../shared/protocol";

const STEMS = [
  // en
  "send", "submit", "buy", "pay", "order", "place order", "checkout", "check out", "confirm", "delete",
  "remove account", "close account", "transfer", "book", "purchase", "payment", "subscribe and pay",
  // de
  "senden", "absenden", "kaufen", "jetzt kaufen", "zahlungspflichtig", "bestellen", "bezahlen", "löschen",
  "bestätigen", "überweisen", "buchen", "kasse", "abschicken",
  // es
  "enviar", "comprar", "pagar", "confirmar", "eliminar", "borrar", "reservar",
];
const IRREVERSIBLE = new RegExp(`(?<![\\p{L}])(?:${STEMS.join("|")})[\\p{L}]{0,3}(?![\\p{L}])`, "iu");
const PAYMENT_HINT = /(pay|checkout|zahlung|bezahl|kasse|bestell|pago|payment|order|purchase)/i;

export function looksIrreversible(label: string): boolean {
  return IRREVERSIBLE.test(label.normalize("NFC"));
}

export function paymentHint(text: string): boolean {
  return PAYMENT_HINT.test(text);
}

const SECRET_WORDS = /(^|[^a-z])(pin|tan|mtan|otp|iban|cvc|cvv|cvv2|password|passwort|kennwort|contrase[nñ]a|passcode|2fa|totp)([^a-z]|$)/i;
const CODE_CONTEXT = /(sms|verif|best[aä]tig|sicherheit|security|einmal|one.?time|c[oó]digo|text message)/i;

function labelTextFor(el: Element): string {
  const doc = el.ownerDocument;
  const parts: string[] = [];
  const id = el.getAttribute("id");
  if (id) {
    for (const l of Array.from(doc.querySelectorAll("label"))) {
      if (l.getAttribute("for") === id) parts.push(l.textContent ?? "");
    }
  }
  const wrap = el.closest("label");
  if (wrap) parts.push(wrap.textContent ?? "");
  return parts.join(" ");
}

export function isSecretField(el: Element): boolean {
  const tag = el.tagName.toLowerCase();
  if (tag !== "input" && tag !== "textarea" && tag !== "select") return false;
  const type = (el.getAttribute("type") ?? "").toLowerCase();
  if (type === "password") return true;
  const ac = (el.getAttribute("autocomplete") ?? "").toLowerCase();
  if (/(current-password|new-password|one-time-code|(^|\s)cc-)/.test(ac)) return true;
  const hay = [
    el.getAttribute("name"),
    el.getAttribute("id"),
    el.getAttribute("aria-label"),
    el.getAttribute("placeholder"),
    labelTextFor(el),
  ]
    .filter(Boolean)
    .join(" ");
  if (SECRET_WORDS.test(hay)) return true;
  if (/(code|kode|c[oó]digo)/i.test(hay) && CODE_CONTEXT.test(hay)) return true;
  return false;
}

const DOWNLOAD_EXT = /\.(exe|msi|dmg|pkg|apk|zip|bat|scr)(?:[?#].*)?$/i;

/** Returns an error string when the element would download a file or open a non-web address, else null. */
export function blockedTarget(el: Element): string | null {
  const holder = el.closest("a, button, area") ?? el;
  const doc = el.ownerDocument;
  if (holder.hasAttribute("download")) return "DOWNLOAD_BLOCKED: this would download a file, which Little Tusk never does.";
  const href = holder.getAttribute("href");
  if (href !== null && holder.tagName.toLowerCase() !== "button") {
    let abs: string;
    try {
      abs = new URL(href, doc.baseURI).href;
    } catch {
      return "NON_WEB_ADDRESS: this link does not lead to a normal web page.";
    }
    if (!isWebUrl(abs)) return "NON_WEB_ADDRESS: this link does not lead to a normal web page.";
    if (DOWNLOAD_EXT.test(new URL(abs).pathname + new URL(abs).search)) {
      return "DOWNLOAD_BLOCKED: this would download a file, which Little Tusk never does.";
    }
  }
  return null;
}

const CLOSE_LIKE = /^(?:[x✕✖×✗❌]|close|dismiss|schlie(?:ß|ss)en|zumachen|cerrar|nein,? danke|no,? thanks?|no,? gracias|not now|maybe later|sp[aä]ter|ahora no)$/i;
const CLOSE_WORDS = /(close|schlie(?:ß|ss)en|cerrar|dismiss|nein,? danke|no,? thanks?|no,? gracias)/i;
const REJECT_LIKE = /(only necessary|necessary only|nur notwendige|nur erforderliche|nur essenzielle|ablehnen|alle ablehnen|reject|decline|deny|rechazar|solo necesarias|s[oó]lo necesarias|refuse)/i;

/** Score how well a label says "dismiss this": 0 = not a dismiss, higher is better. */
export function dismissScore(label: string, cookie: boolean): number {
  const l = label.trim();
  if (!l) return 0;
  if (REJECT_LIKE.test(l)) return cookie ? 100 : 60;
  if (CLOSE_LIKE.test(l)) return 70;
  if (l.length <= 24 && CLOSE_WORDS.test(l)) return 65;
  return 0;
}

export function looksLikeClose(label: string): boolean {
  return CLOSE_LIKE.test(label.trim()) || (label.length <= 24 && CLOSE_WORDS.test(label));
}

export function looksLikeDismiss(label: string): boolean {
  return looksLikeClose(label) || REJECT_LIKE.test(label);
}
