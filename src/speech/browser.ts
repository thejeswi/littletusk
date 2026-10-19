// Speech input with the browser's own recognizer (Web Speech API), on this computer by default.
// Same interface as createSpeech (src/speech/index.ts), plus onPartial for live words.
// The recognizer cannot pick a microphone and gives no audio level, so a second, unprocessed
// stream from the default input drives the level and detects a digitally silent default input.
import type { Language } from "../shared/protocol";
import { MAX_SECONDS, SILENCE_SECONDS, levelFromRms, rms } from "./audio";
import type { SpeechOptions } from "./index";

export type PackState = "available" | "downloadable" | "downloading" | "unavailable";

export interface BrowserSpeechOptions extends Omit<SpeechOptions, "wasmBase"> {
  wasmBase?: string;
  /** Live words while the person speaks (finished words plus the one being heard). */
  onPartial?(text: string): void;
  /** Use the browser's online recognizer (audio goes to the browser vendor's service). Default: on this computer only. */
  online?: boolean;
}

export const SILENT_DEFAULT_MS = 1500;
export const DEFAULT_MIC_SILENT = "DEFAULT_MIC_SILENT";

/** BCP-47 tag the browser recognizer expects. */
export function recognitionLang(lang: Language): string {
  switch (lang) {
    case "de": return "de-DE";
    case "es": return "es-ES";
    case "en-IN": return "en-IN";
    default: return "en-US";
  }
}

/** Says when an input is digitally silent: every peak exactly 0 for `ms` milliseconds in a row. */
export class SilenceGuard {
  private since: number | null = null;
  constructor(private ms = SILENT_DEFAULT_MS) {}
  /** Feed the peak of one analysis window with its time; true once the input has been exactly silent long enough. */
  push(peak: number, nowMs: number): boolean {
    if (peak !== 0) { this.since = null; return false; }
    if (this.since === null) this.since = nowMs;
    return nowMs - this.since >= this.ms;
  }
  reset(): void { this.since = null; }
}

/** Joins finished text and the words still being heard into one line. */
export function joinTranscript(finals: string[], interim: string): string {
  return [...finals, interim].map((s) => s.trim()).filter(Boolean).join(" ");
}

// The Web Speech types are not in the TypeScript DOM library on every setup: keep a small local shape.
interface RecEvent { resultIndex: number; results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }
interface Rec {
  lang: string; continuous: boolean; interimResults: boolean; maxAlternatives: number; processLocally?: boolean;
  onstart: (() => void) | null; onend: (() => void) | null; onerror: ((e: { error: string }) => void) | null; onresult: ((e: RecEvent) => void) | null;
  start(): void; stop(): void; abort(): void;
}
interface RecCtor {
  new (): Rec;
  available?(o: { langs: string[]; processLocally: boolean }): Promise<string>;
  install?(o: { langs: string[]; processLocally: boolean }): Promise<boolean>;
}

export function recognizerCtor(): RecCtor | undefined {
  const g = globalThis as unknown as { SpeechRecognition?: RecCtor; webkitSpeechRecognition?: RecCtor };
  return g.SpeechRecognition ?? g.webkitSpeechRecognition;
}

/** State of the on-device language pack for `lang`; "unavailable" when the browser has no recognizer or no pack support. */
export async function packState(lang: Language): Promise<PackState> {
  const SR = recognizerCtor();
  if (!SR || typeof SR.available !== "function") return "unavailable";
  try {
    const s = await SR.available({ langs: [recognitionLang(lang)], processLocally: true });
    return s === "available" || s === "downloadable" || s === "downloading" ? s : "unavailable";
  } catch {
    return "unavailable";
  }
}

/** Download the on-device language pack, reporting progress while it runs. Resolves true when it is ready. */
export async function installPackFor(lang: Language, onProgress?: (progress: string) => void): Promise<boolean> {
  const SR = recognizerCtor();
  if (!SR || typeof SR.install !== "function") return false;
  let done = false;
  // The browser gives no byte count; poll the pack state so the UI can show a bar while it works.
  const poll = (async () => {
    while (!done) {
      await new Promise((r) => setTimeout(r, 400));
      if (done) return;
      const s = await packState(lang);
      if (s === "available") { onProgress?.("100%"); return; }
      onProgress?.("…");
    }
  })();
  try {
    await SR.install({ langs: [recognitionLang(lang)], processLocally: true });
  } catch {
    done = true;
    await poll;
    return false;
  }
  done = true;
  await poll;
  return (await packState(lang)) === "available";
}

export function createBrowserSpeech(opts: BrowserSpeechOptions) {
  let active = false; // a session is running
  let paused = false;
  let finishing: Promise<string> | null = null;
  let lastFinish: Promise<string> | null = null;
  let rec: Rec | null = null;
  let finals: string[] = [];
  let interim = "";
  let lastHeard = 0;
  let startedAt = 0;
  let stream: MediaStream | null = null;
  let ctx: AudioContext | null = null;
  let analyser: AnalyserNode | null = null;
  let timer: ReturnType<typeof setInterval> | null = null;
  let lastLang: Language = "en";
  let ended: (() => void) | null = null;

  const text = () => joinTranscript(finals, interim);

  function launch(lang: Language): void {
    const SR = recognizerCtor();
    if (!SR) return void fail("BROWSER_SPEECH_MISSING");
    const r = new SR();
    r.lang = recognitionLang(lang);
    r.continuous = true;
    r.interimResults = true;
    r.maxAlternatives = 1;
    if (!opts.online) {
      try { r.processLocally = true; } catch { /* older browsers: the check below catches it */ }
      if (r.processLocally !== true) return void fail("BROWSER_FAILED:no-on-device");
    } else {
      try { r.processLocally = false; } catch { /* older browsers always use the online listener */ }
    }
    rec = r;
    r.onstart = () => { if (rec === r && active && !paused) opts.onState("listening"); };
    r.onresult = (e) => {
      if (rec !== r || paused) return;
      let live = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const res = e.results[i];
        const t = res[0]?.transcript ?? "";
        if (res.isFinal) finals.push(t); else live += t;
      }
      interim = live;
      lastHeard = Date.now();
      opts.onPartial?.(text());
    };
    r.onerror = (e) => {
      if (rec !== r) return;
      const code = e.error;
      if (code === "no-speech" || code === "aborted") return; // the end handler finishes the session
      if (code === "not-allowed") return void fail("MIC_PERMISSION");
      fail(`BROWSER_FAILED:${code}`);
    };
    r.onend = () => {
      if (rec !== r) return;
      rec = null;
      if (paused) return; // switched off on purpose
      if (active) void finish(); // the browser ended it (no speech, or its own time limit)
      ended?.();
    };
    try { r.start(); } catch (e) { fail(`BROWSER_FAILED:${String((e as Error)?.message ?? e)}`); }
  }

  function teardown(): void {
    if (timer) clearInterval(timer);
    timer = null;
    stream?.getTracks().forEach((t) => t.stop());
    stream = null;
    analyser = null;
    void ctx?.close().catch(() => {});
    ctx = null;
  }

  /** Ends the session with an error and no text. */
  function fail(detail: string): void {
    if (!active && !rec) return;
    active = false;
    const r = rec;
    rec = null;
    try { r?.abort(); } catch { /* already over */ }
    teardown();
    opts.onLevel(0);
    finals = [];
    interim = "";
    lastFinish = Promise.resolve("");
    opts.onState("error", detail);
  }

  function finish(): Promise<string> {
    if (finishing) return finishing;
    finishing = lastFinish = (async () => {
      if (!active) return "";
      active = false;
      const r = rec;
      if (r) {
        // stop() delivers the last words, then fires end.
        await new Promise<void>((resolve) => {
          const t = setTimeout(resolve, 1500);
          ended = () => { clearTimeout(t); resolve(); };
          try { r.stop(); } catch { resolve(); }
        });
        ended = null;
        rec = null;
      }
      teardown();
      opts.onLevel(0);
      const out = text();
      finals = [];
      interim = "";
      opts.onState("idle", out); // detail = transcript, for sessions that auto-stopped
      return out;
    })();
    return finishing;
  }

  async function openGuard(): Promise<"ok" | "denied" | "none"> {
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } });
    } catch (e) {
      const name = (e as DOMException)?.name;
      return name === "NotAllowedError" || name === "SecurityError" || name === "PermissionDeniedError" ? "denied" : "none";
    }
    try {
      ctx = new AudioContext();
      void ctx.resume().catch(() => {});
      analyser = ctx.createAnalyser();
      analyser.fftSize = 2048;
      ctx.createMediaStreamSource(stream).connect(analyser);
    } catch { analyser = null; }
    return "ok";
  }

  function watch(): void {
    const guard = new SilenceGuard();
    const buf = new Float32Array(2048);
    timer = setInterval(() => {
      if (!active) return;
      if (Date.now() - startedAt >= MAX_SECONDS * 1000 || (lastHeard && Date.now() - lastHeard >= SILENCE_SECONDS * 1000 && text())) { void finish(); return; }
      if (paused || !analyser || ctx?.state !== "running") return;
      analyser.getFloatTimeDomainData(buf);
      let peak = 0;
      for (const v of buf) peak = Math.max(peak, Math.abs(v));
      if (guard.push(peak, Date.now())) return fail(DEFAULT_MIC_SILENT);
      opts.onLevel(levelFromRms(rms(buf)));
    }, 50);
  }

  async function start(lang: Language): Promise<void> {
    if (active || finishing) { if (!active) finishing = null; if (active) return; }
    finishing = null;
    lastFinish = null;
    lastLang = lang;
    finals = [];
    interim = "";
    paused = false;
    active = true;
    startedAt = Date.now();
    lastHeard = 0;
    opts.onState("loading");
    const g = await openGuard();
    if (!active) { teardown(); return; }
    if (g === "denied") return void fail("MIC_PERMISSION");
    if (g === "none") return void fail("MIC_UNAVAILABLE");
    watch();
    launch(lang);
  }

  async function stop(): Promise<string> {
    if (active) return finish();
    const p = lastFinish;
    lastFinish = null;
    return p ? p : "";
  }

  /** Switch the microphone off (true) or on again (false) without ending the session. Nothing is heard while off. */
  function pause(p: boolean): void {
    if (!active || p === paused) return;
    paused = p;
    stream?.getAudioTracks().forEach((t) => (t.enabled = !p));
    if (p) {
      const r = rec;
      rec = null;
      try { r?.abort(); } catch { /* already over */ }
      interim = "";
      opts.onLevel(0);
      opts.onState("paused");
    } else {
      launch(lastLang);
      opts.onState("listening");
    }
  }

  async function preload(): Promise<void> {
    opts.onState("loading");
    const s = await packState(lastLang);
    if (opts.online ? !!recognizerCtor() : s === "available") return void opts.onState("idle");
    opts.onState("error", s === "unavailable" ? "BROWSER_SPEECH_UNAVAILABLE" : "PACK_NEEDED");
  }

  function dispose(): void {
    if (active) void finish();
    else teardown();
  }

  return { start, stop, pause, preload, dispose };
}
