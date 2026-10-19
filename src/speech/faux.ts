// Test builds only: a scripted "microphone" for the end-to-end specs. It follows the same interface as
// the real engines, so the chat microphone, the conversation and the junk filter can be tested without
// audio, without a speech model and without a network. Never used in a production build.
//
// chrome.storage.local keys the specs set:
//   __speech_fake     true to use this engine
//   __speech_queue    string[]: one spoken line per listening session (used in order)
//   __speech_text     string: the line, when no queue is set
//   __speech_partial  string: live words to show while listening
//   __speech_auto     true: stop by itself after a pause (like a hands-free conversation)
import type { SpeechState } from "./index";
import type { Language } from "../shared/protocol";

export interface FauxSpeechOptions {
  onLevel(level: number): void;
  onState(s: SpeechState, detail?: string): void;
  onPartial?(text: string): void;
}

// The offscreen document can only use chrome.runtime: the script lives in chrome.storage, reached
// through the service worker's test-only e2e-get / e2e-set messages.
async function get(key: string): Promise<unknown> {
  try {
    const r = (await chrome.runtime.sendMessage({ to: "sw", type: "e2e-get", key })) as { value?: unknown } | undefined;
    return r?.value;
  } catch {
    return undefined;
  }
}

async function put(key: string, value: unknown): Promise<void> {
  try {
    await chrome.runtime.sendMessage({ to: "sw", type: "e2e-set", key, value });
  } catch { /* test build only */ }
}

async function fakeEnabled(): Promise<boolean> {
  return __E2E__ && (await get("__speech_fake")) === true;
}

export async function fauxSpeechOn(): Promise<boolean> {
  return fakeEnabled();
}

async function nextLine(): Promise<string> {
  const queue = (await get("__speech_queue")) as string[] | undefined;
  if (Array.isArray(queue) && queue.length) {
    const [line, ...rest] = queue;
    await put("__speech_queue", rest);
    return String(line ?? "");
  }
  return String((await get("__speech_text")) ?? "where do I log in");
}

export function createFauxSpeech(opts: FauxSpeechOptions) {
  let active = false;
  let paused = false;
  let line = "";
  let finish: ((text: string) => void) | null = null;
  let result: Promise<string> | null = null;
  let timers: ReturnType<typeof setTimeout>[] = [];
  let lastPartial = "";

  const later = (fn: () => void, ms: number) => {
    const t = setTimeout(fn, ms);
    timers.push(t);
  };

  async function start(lang: Language): Promise<void> {
    void lang;
    if (active) return;
    active = true;
    paused = false;
    line = await nextLine();
    lastPartial = "";
    opts.onState("loading");
    // A spec can make the microphone fail, e.g. MIC_PERMISSION for the permission window.
    const error = (await get("__speech_error")) as string | undefined;
    if (error) {
      later(() => { if (active) { active = false; opts.onState("error", error); } }, 150);
      return;
    }
    opts.onState("listening");
    result = new Promise<string>((resolve) => (finish = resolve));
    const partial = (await get("__speech_partial")) as string | undefined;
    const auto = (await get("__speech_auto")) === true;
    // A little level movement, so the wave and Tusk's listening mood have something to show.
    for (let i = 0; i < 6; i++) later(() => { if (active && !paused) opts.onLevel(0.4 + (i % 3) * 0.2); }, 80 + i * 90);
    if (partial) later(() => { if (active && !paused) { lastPartial = partial; opts.onPartial?.(partial); } }, 180);
    if (auto) later(() => { if (active && !paused) void stop(); }, 900);
  }

  async function stop(): Promise<string> {
    if (!active) return "";
    active = false;
    paused = false;
    for (const t of timers) clearTimeout(t);
    timers = [];
    opts.onLevel(0);
    const text = line;
    opts.onState("idle", text);
    finish?.(text);
    finish = null;
    return text;
  }

  function pause(p: boolean): void {
    if (!active || p === paused) return;
    paused = p;
    opts.onLevel(0);
    opts.onState(p ? "paused" : "listening");
  }

  async function preload(): Promise<void> {
    opts.onState("idle");
  }

  function dispose(): void {
    void stop();
    result = null;
    lastPartial = "";
  }

  return { start, stop, pause, preload, dispose, get partial() { return lastPartial; }, get result() { return result; } };
}
