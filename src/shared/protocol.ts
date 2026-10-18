// Shared contracts between the content script (overlay + page tools), the service worker
// (router), the offscreen document (agent) and extension pages. Every part imports from here;
// change it only on purpose, and update all sides together.

export type Language = "en" | "de" | "es" | "en-IN";
export type Mode = "show" | "look-after"; // "Show me how" | "Look after me"

export interface Settings {
  language: Language;
  mode: Mode;
  provider: string; // pi-ai provider id, e.g. "anthropic", "openai", "google", "openrouter"
  apiKey: string; // never sent anywhere except the provider; never shown to the model
  model: string; // everyday model id from pi-ai's catalog
  strongModel: string; // used when the everyday model is stuck
  monthlyLimit: number; // in `currency`, 0 = no limit
  currency: "EUR" | "USD";
  speakAnswers: boolean;
  /** hostname -> epoch ms until which Tusk stays tucked away on that site (Infinity-like: 8.64e15) */
  tuckedSites: Record<string, number>;
  /** epoch ms until which Tusk is tucked away everywhere */
  tuckedUntil: number;
  setupDone: boolean;
  /** the person's first name, optional, for the greeting */
  name?: string;
}

export const DEFAULT_SETTINGS: Settings = {
  language: "en",
  mode: "show",
  provider: "anthropic",
  apiKey: "",
  model: "claude-haiku-5-5",
  strongModel: "claude-sonnet-5-5",
  monthlyLimit: 10,
  currency: "EUR",
  speakAnswers: false,
  tuckedSites: {},
  tuckedUntil: 0,
  setupDone: false,
};

export const SETTINGS_KEY = "settings";

// ---------- Page snapshot (content script -> agent) ----------

export type ElementKind =
  | "button"
  | "link"
  | "textbox"
  | "checkbox"
  | "radio"
  | "select"
  | "heading"
  | "close" // looks like a close button of a popup/banner (✕, "Schließen", "No thanks")
  | "other";

export interface SnapElement {
  id: string; // short stable id, also stamped on the element as data-tusk-id
  kind: ElementKind;
  name: string; // accessible name / visible text, trimmed, max ~80 chars
  value?: string; // current value; for secret fields "(filled, hidden)" or "(empty)"
  secret?: boolean; // password / one-time code / PIN / IBAN field: the model must not type here
  irreversible?: boolean; // send/buy/pay/delete/confirm-like button
  inOverlay?: boolean; // inside a detected popup/banner/overlay
  inViewport: boolean;
}

export interface OverlayInfo {
  id: string; // id of the overlay container element
  kind: "cookie-banner" | "newsletter" | "modal" | "ad" | "other";
  closeId?: string; // id of the element that most likely closes/dismisses it
  summary: string; // short text, e.g. "Newsletter abonnieren! ..."
}

export interface PageSnapshot {
  url: string;
  title: string;
  lang: string; // page language from <html lang>, may be ""
  elements: SnapElement[];
  text: string; // visible main text, bounded (~3000 chars)
  overlays: OverlayInfo[];
}

// ---------- Page commands (agent -> content script in the task tab) ----------

export type PageCommand =
  | { op: "snapshot" }
  | { op: "point"; id: string; say: string }
  | { op: "spotlight"; id: string; say: string }
  | { op: "clear" }
  | { op: "click"; id: string }
  | { op: "type"; id: string; text: string; enter: boolean }
  | { op: "select"; id: string; option: string }
  | { op: "scroll"; direction: "up" | "down" }
  | { op: "back" }
  | { op: "ask-type"; id: string; say: string }
  | { op: "describe"; id: string }; // returns name/kind/irreversible/secret of one element

export type PageResult =
  | { ok: true; text?: string; snapshot?: PageSnapshot; element?: SnapElement }
  | { ok: false; error: string };

// ---------- Chat view (agent -> overlay) ----------

export type ChatItem =
  | { kind: "user"; id: string; text: string }
  | { kind: "tusk"; id: string; text: string; streaming?: boolean }
  | { kind: "action"; id: string; text: string; state: "running" | "done" | "failed" }
  | { kind: "confirm"; id: string; question: string; answered?: "yes" | "no" }
  | { kind: "offer"; id: string; text: string; answered?: "yes" | "no" } // "Shall I do it for you?"
  | { kind: "notice"; id: string; text: string }; // budget reached, no key, errors in plain words

export interface ChatView {
  items: ChatItem[];
  busy: boolean;
  spend: { month: number; limit: number; currency: "EUR" | "USD" };
  taskTabId?: number;
}

// ---------- Runtime messages ----------
// Overlay/extension pages -> service worker -> offscreen agent
export type ToAgent =
  | { to: "agent"; type: "user-input"; text: string; tabId?: number; via: "chat" | "voice" }
  | { to: "agent"; type: "answer"; itemId: string; yes: boolean } // confirm or offer
  | { to: "agent"; type: "new-topic" }
  | { to: "agent"; type: "get-view" }
  | { to: "agent"; type: "settings-changed" }
  | { to: "agent"; type: "mic-start"; tabId?: number }
  | { to: "agent"; type: "mic-stop" }
  | { to: "agent"; type: "overlay-help"; tabId?: number; overlay: OverlayInfo; url: string }; // person accepted help in look-after mode

// Agent -> service worker
export type FromAgent =
  | { to: "sw"; type: "page"; tabId: number; cmd: PageCommand; reqId: string }
  | { to: "sw"; type: "broadcast-view"; view: ChatView }
  | { to: "sw"; type: "speak"; text: string; lang: Language }
  | { to: "sw"; type: "mic-level"; level: number; listening: boolean } // for the listening wave
  | { to: "sw"; type: "open-url"; tabId: number; url: string; reqId: string };

// Service worker -> content script
export type ToContent =
  | { to: "content"; type: "page"; cmd: PageCommand }
  | { to: "content"; type: "view"; view: ChatView }
  | { to: "content"; type: "mic"; level: number; listening: boolean }
  | { to: "content"; type: "settings"; settings: Omit<Settings, "apiKey"> };

/** URLs Tusk may open or act on. No allowlist of sites, only web schemes. */
export function isWebUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}
