// Shared contracts between the content script (overlay + page tools), the service worker
// (router), the offscreen document (agent) and extension pages. Every part imports from here;
// change it only on purpose, and update all sides together.

export type Language = "en" | "de" | "es" | "en-IN";
/** What the listening UI shows. */
export type MicPhase = "starting" | "listening" | "paused" | "transcribing";
/** How a spoken conversation is going (E1 + F1). */
export type ConversationPhase = "starting" | "listening" | "thinking" | "speaking";
/** The speech engine runs in the compose iframe (an extension page), because an offscreen document cannot get microphone permission. */
export type SpeechHostState = "loading" | "listening" | "paused" | "transcribing" | "idle" | "error";
export type SpeechHostCommand =
  | { op: "start"; lang: Language }
  | { op: "stop" }
  | { op: "pause"; paused: boolean };
export type SpeechEvent =
  | { event: "level"; level: number }
  | { event: "partial"; text: string }
  | { event: "state"; state: SpeechHostState; detail?: string };
export interface ConversationState {
  on: boolean;
  phase: ConversationPhase;
  you?: string; // what the person said, as heard
  tusk?: string; // Tusk's answer, as the captions show it
  progress?: string; // a percentage while the listening pack downloads
  noVoice?: boolean; // captions only: this computer cannot read aloud in this language
}

export type Mode = "show" | "look-after"; // "Show me how" | "Look after me"

export interface Settings {
  language: Language;
  mode: Mode;
  provider: string; // pi-ai provider id, e.g. "anthropic", "openai", "google", "openrouter", "deepseek"
  apiKey: string; // never sent anywhere except the provider; never shown to the model
  model: string; // everyday model id from pi-ai's catalog
  strongModel: string; // used when the everyday model is stuck
  monthlyLimit: number; // in `currency`, 0 = no limit
  currency: "EUR" | "USD";
  speakAnswers: boolean;
  /** Family only: allow the browser's online listener as a backup (the voice goes to its maker). */
  listenOnline: boolean;
  /** B3: download a missing listening pack on first use, with progress. */
  packPolicy: "auto";
  /** The one-time "this computer has no voice" note has been shown. */
  noVoiceNoticed: boolean;
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
  listenOnline: false,
  packPolicy: "auto",
  noVoiceNoticed: false,
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
  kind: "cookie-banner" | "newsletter" | "modal" | "ad" | "scam" | "other";
  closeId?: string; // id of the element that most likely closes/dismisses it
  summary: string; // short text, e.g. "Newsletter abonnieren! ..."
}

/** Text on the page that pressures a person the way scams do (found locally, no model involved). */
export interface PageWarning {
  id: string; // id of the element holding the pressuring text
  kind: "scam";
  summary: string;
}

export interface PageSnapshot {
  url: string;
  title: string;
  lang: string; // page language from <html lang>, may be ""
  elements: SnapElement[];
  text: string; // visible main text, bounded (~3000 chars)
  overlays: OverlayInfo[];
  warnings: PageWarning[];
}

// ---------- Page commands (agent -> content script in the task tab) ----------

export type PageCommand =
  | { op: "snapshot" }
  | { op: "point"; id: string; say: string }
  | { op: "spotlight"; id: string; say: string }
  | { op: "clear" }
  // `confirmed` is set ONLY by the agent's code-enforced confirmation state, never by the model.
  | { op: "click"; id: string; confirmed?: boolean }
  | { op: "type"; id: string; text: string; enter: boolean; confirmed?: boolean }
  | { op: "select"; id: string; option: string; confirmed?: boolean }
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
  | { to: "agent"; type: "mic-pause"; paused: boolean } // the person switched the microphone off / on again
  | { to: "agent"; type: "mic-granted" } // the person allowed the microphone in the small permission window
  | { to: "agent"; type: "conversation-start"; tabId?: number } // the microphone badge on Tusk
  | { to: "agent"; type: "conversation-stop" } // Stop talking, or the badge again
  | { to: "agent"; type: "speech-event"; event: SpeechEvent } // from the composing iframe, where the microphone lives
  | { to: "agent"; type: "overlay-help"; tabId?: number; overlay: OverlayInfo; url: string } // person accepted help in look-after mode
  | { to: "agent"; type: "log-action"; text: string; failed?: boolean; tabId?: number }; // an action done locally (no model call), shown in the chat log

/** What the service worker adds when it forwards a ToAgent message to the offscreen document. */
export type RelayedToAgent =
  | (ToAgent & { relayed: true })
  | { to: "agent"; type: "speak-ended"; reqId: string; relayed: true } // the voice finished (or stopped)
  | { to: "agent"; type: "no-voice"; lang: Language; relayed: true }; // no voice exists for that language

// Agent -> service worker
export type FromAgent =
  | { to: "sw"; type: "page"; tabId: number; cmd: PageCommand; reqId: string }
  | { to: "sw"; type: "broadcast-view"; view: ChatView }
  // reqId: the service worker reports back when the voice has finished ("speak-ended").
  | { to: "sw"; type: "speak"; text: string; lang: Language; reqId?: string }
  | { to: "sw"; type: "mic-level"; level: number; listening: boolean; phase?: MicPhase; progress?: string; text?: string } // live words for the chat box
  | { to: "sw"; type: "conversation-state"; state: ConversationState | null }
  | { to: "sw"; type: "no-voice-noticed" } // remember that the one-time "no voice" note was shown
  | { to: "sw"; type: "speech-host"; tabId?: number; cmd: SpeechHostCommand } // tell the composing iframe to listen
  | { to: "sw"; type: "open-mic-permission" } // offscreen pages cannot ask for the mic: open a small window that can
  | { to: "sw"; type: "open-url"; tabId: number; url: string; reqId: string }
  | { to: "sw"; type: "get-settings" } // full settings including the key; only the offscreen document may ask
  | { to: "sw"; type: "e2e-get"; key: string } // test builds only
  | { to: "sw"; type: "e2e-set"; key: string; value: unknown }; // test builds only

// Content script -> service worker
export type FromContent =
  | { to: "sw"; type: "get-public-settings" }
  | { to: "sw"; type: "patch-settings"; patch: Partial<Pick<Settings, "language" | "mode" | "speakAnswers">> }
  | { to: "sw"; type: "tuck"; scope: "site" | "hour" }
  | { to: "sw"; type: "open-setup" }
  | { to: "sw"; type: "test-voice"; lang: Language } // Tusk's settings: say a sentence and name the voice
  | { to: "sw"; type: "list-voices" }; // family settings: one line per language

// Service worker -> content script
export type ToContent =
  | { to: "content"; type: "page"; cmd: PageCommand }
  | { to: "content"; type: "view"; view: ChatView }
  | { to: "content"; type: "mic"; level: number; listening: boolean; phase?: MicPhase; progress?: string; text?: string }
  | { to: "content"; type: "conversation"; state: ConversationState | null }
  | { to: "content"; type: "speech-host"; cmd: SpeechHostCommand }
  | { to: "content"; type: "speaking"; on: boolean } // read-aloud is playing (Tusk's speaking mood)
  | { to: "content"; type: "settings"; settings: Omit<Settings, "apiKey"> };

/** What the family settings page learns about the browser's voices. */
export interface VoiceInfo { name: string; online: boolean }
export type VoiceList = Record<Language, VoiceInfo | null>;
export type VoiceTest = { voice: VoiceInfo } | { none: true }; // "none": no voice for that language

/** URLs Tusk may open or act on. No allowlist of sites, only web schemes. */
export function isWebUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}
