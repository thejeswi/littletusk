// The chat's typing box. It runs as an extension page inside an iframe in Tusk's chat, so the
// website cannot steal its focus or its key presses, and it sends the message straight to the
// agent through extension messaging: the website can neither read it nor fake it.
//
// A1: the microphone sits next to the text box. While listening, the words appear here live, with a
// two-line hint; nothing is sent until the person presses Send. The overlay tells this frame about the
// microphone (phase, words, progress) with postMessage.
import { t } from "../shared/i18n";
import { FEATURES } from "../shared/features";
import { loadSettings } from "../shared/settings";
import { createSpeechAuto } from "../speech/select";
import type { Language, MicPhase, SpeechEvent, SpeechHostCommand, ToAgent } from "../shared/protocol";
import { SETTINGS_KEY, type Settings } from "../shared/protocol";

const form = document.getElementById("f") as HTMLFormElement;
const input = document.getElementById("t") as HTMLInputElement;
const sendBtn = document.getElementById("s") as HTMLButtonElement;
const micBtn = document.getElementById("m") as HTMLButtonElement;
const hint = document.getElementById("hint") as HTMLElement;
const h1 = document.getElementById("h1") as HTMLElement;
const h2 = document.getElementById("h2") as HTMLElement;
const bar = document.getElementById("bar") as HTMLElement;
const barFill = bar.querySelector("i") as HTMLElement;

let lang: Language = "en";
let listening = false;
let phase: MicPhase = "listening";
let progress: string | undefined;
let sendAfterStop = false;
let micBusy = false; // mic-start was sent, the engine is not answering yet
let settings: Settings | null = null;
let engine: ReturnType<typeof createSpeechAuto> | null = null;

// The microphone runs here, in an extension page, because an offscreen document cannot get
// microphone permission. The agent sends start/stop/pause; this frame reports levels, words and state.
function sendSpeechEvent(event: SpeechEvent): void {
  void chrome.runtime.sendMessage({ to: "agent", type: "speech-event", event }).catch(() => undefined);
}

async function startEngine(lang: Language): Promise<void> {
  settings = await loadSettings().catch(() => null);
  if (!engine) {
    engine = createSpeechAuto({
      wasmBase: chrome.runtime.getURL("wasm/"),
      online: () => settings?.listenOnline === true,
      onLevel: (level) => sendSpeechEvent({ event: "level", level }),
      onPartial: (text) => sendSpeechEvent({ event: "partial", text }),
      onState: (state, detail) => sendSpeechEvent({ event: "state", state, detail }),
    });
  }
  await engine.start(lang);
}

function runSpeechCommand(cmd: SpeechHostCommand): void {
  if (!FEATURES.speechInput) return;
  if (cmd.op === "start") void startEngine(cmd.lang);
  else if (cmd.op === "stop") void engine?.stop();
  else engine?.pause(cmd.paused);
}

function announceReady(): void {
  try { window.parent.postMessage({ __littletusk: "speech-ready" }, "*"); } catch { /* top level */ }
}

// The chat gives this frame exactly the height its content needs: the text box, the hint when it is
// shown, and the model download bar. Without this the frame keeps a fixed height and leaves an empty
// strip under the send bar.
const wrap = document.getElementById("wrap") as HTMLElement;
function reportHeight(): void {
  const height = Math.ceil(wrap.getBoundingClientRect().height);
  try { window.parent.postMessage({ __littletusk: "compose-height", height }, "*"); } catch { /* top level */ }
}
if (typeof ResizeObserver === "function") new ResizeObserver(reportHeight).observe(wrap);
else window.addEventListener("resize", reportHeight);

function applyLanguage(next: Language): void {
  lang = next;
  document.documentElement.lang = next;
  input.placeholder = t(next, "typeShort");
  input.setAttribute("aria-label", t(next, "typeHere"));
  sendBtn.textContent = t(next, "send");
  micBtn.setAttribute("aria-label", t(next, listening ? "micStop" : "micStart"));
  renderHint();
}

async function loadLanguage(): Promise<void> {
  const stored = (await chrome.storage.local.get(SETTINGS_KEY))[SETTINGS_KEY] as { language?: Language } | undefined;
  applyLanguage(stored?.language ?? "en");
}

/** A new listening session starts with an empty box; afterwards the words stay for checking. */
function setWords(text: string, replace: boolean): void {
  if (replace) input.value = text;
  else if (text) input.value = text;
}

let sessionWords = false; // the current session has put words in the box

function renderHint(): void {
  const starting = listening && (phase === "starting" || micBusy);
  const showBar = starting && !!progress;
  const hasWords = sendAfterStop || sessionWords || (!listening && input.value.trim().length > 0);
  hint.hidden = !listening && !hasWords;
  if (starting) {
    h1.textContent = t(lang, "capStarting");
    h2.textContent = progress && progress !== "…" ? progress : "";
  } else if (listening && phase === "transcribing") {
    h1.textContent = t(lang, "transcribing");
    h2.textContent = progress && progress !== "…" ? progress : "";
  } else if (listening && phase === "paused") {
    h1.textContent = t(lang, "micPausedTitle");
    h2.textContent = "";
  } else if (listening) {
    h1.textContent = t(lang, "speakHint1");
    h2.textContent = t(lang, "speakHint2");
  } else {
    h1.textContent = t(lang, "speakCheck1");
    h2.textContent = t(lang, "speakCheck2");
  }
  bar.hidden = !showBar;
  bar.classList.toggle("indeterminate", showBar && (!progress || !/^\d+%$/.test(progress)));
  barFill.style.width = progress && /^\d+%$/.test(progress) ? progress : "40%";
  micBtn.classList.toggle("on", listening);
  micBtn.textContent = listening ? "■" : "🎤";
  micBtn.setAttribute("aria-pressed", String(listening));
  micBtn.setAttribute("aria-label", t(lang, listening ? "micStop" : "micStart"));
  reportHeight();
}

function sendToAgent(msg: ToAgent): void {
  void chrome.runtime.sendMessage(msg).catch(() => undefined);
}

/** The content script knows this page's tab, so it asks the agent for us (the iframe has no sender.tab). */
function requestMic(op: "start" | "stop"): void {
  try { window.parent.postMessage({ __littletusk: "mic-request", op }, "*"); } catch { /* top level */ }
}

function startListening(): void {
  if (listening || micBusy) return;
  sendAfterStop = false; // a new session is not a second half of the last one
  listening = true; // optimistic: the hint appears at once, the engine confirms
  micBusy = true;
  input.focus({ preventScroll: true });
  requestMic("start");
  renderHint();
}

function stopListening(): void {
  if (!listening || micBusy) return;
  requestMic("stop");
  listening = false;
  micBusy = false;
  sessionWords = false;
  renderHint();
}

micBtn.addEventListener("click", () => {
  if (listening) stopListening();
  else startListening();
});

form.addEventListener("submit", (e) => {
  e.preventDefault();
  if (listening) {
    // The person pressed Send while still speaking: stop, then send the words that arrive.
    sendAfterStop = true;
    stopListening();
    return;
  }
  const text = input.value.trim();
  if (!text) return;
  input.value = "";
  sessionWords = false;
  sendAfterStop = false;
  hint.hidden = true;
  sendToAgent({ to: "agent", type: "user-input", text, via: "chat" });
});

// The overlay's microphone state (A1): words, phase, pack progress.
window.addEventListener("message", (e) => {
  const m = e.data as { __littletusk?: string; cmd?: SpeechHostCommand; listening?: boolean; phase?: MicPhase; progress?: string; text?: string } | undefined;
  if (!m) return;
  if (m.__littletusk === "speech-host" && m.cmd) { runSpeechCommand(m.cmd); return; }
  if (m.__littletusk === "speech-ping") { announceReady(); return; }
  if (m.__littletusk !== "mic") return;
  const wasListening = listening;
  const wasBusy = micBusy;
  listening = m.listening === true;
  micBusy = false;
  if (m.phase) phase = m.phase;
  progress = m.progress;
  if (listening) {
    if (!wasListening || wasBusy) {
      // A new session: live words replace whatever was there.
      input.value = "";
      sessionWords = false;
    }
    if (typeof m.text === "string" && m.text) {
      setWords(m.text, true);
      sessionWords = true;
    }
  } else if (typeof m.text === "string" && m.text) {
    // The final words stay in the box for checking.
    setWords(m.text, true);
    sessionWords = true;
    if (sendAfterStop) {
      sendAfterStop = false;
      const text = input.value.trim();
      if (text) {
        input.value = "";
        sessionWords = false;
        hint.hidden = true;
        sendToAgent({ to: "agent", type: "user-input", text, via: "voice" });
        return;
      }
    }
  }
  renderHint();
});

// When Tusk opens the chat it focuses this frame; hand that on to the text box.
window.addEventListener("focus", () => input.focus({ preventScroll: true }));

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && changes[SETTINGS_KEY]) void loadLanguage();
});

void loadLanguage();
if (!FEATURES.speechInput) { micBtn.hidden = true; hint.hidden = true; }
announceReady();
reportHeight();
document.body.dataset.ready = "1";
