// Local speech input: microphone -> 16 kHz mono -> Whisper worker -> text.
import type { Language } from "../shared/protocol";
import { EndpointDetector, TARGET_RATE, concat, levelFromRms, resampleTo16k, rms, whisperLanguage } from "./audio";
import type { WorkerIn, WorkerOut } from "./protocol";

export type SpeechState = "loading" | "listening" | "transcribing" | "idle" | "error";
export interface SpeechOptions {
  wasmBase: string; // chrome.runtime.getURL("wasm/")
  onLevel(level: number): void;
  onState(s: SpeechState, detail?: string): void;
}

export function createSpeech(opts: SpeechOptions) {
  let worker: Worker | null = null;
  let ready: Promise<void> | null = null;
  let nextId = 1;
  const pending = new Map<number, { resolve(t: string): void; reject(e: Error): void }>();

  function ensureWorker(): Promise<void> {
    if (ready) return ready;
    worker = new Worker(new URL("./whisper.worker.ts", import.meta.url), { type: "module" });
    ready = new Promise<void>((resolve, reject) => {
      worker!.onmessage = (e: MessageEvent<WorkerOut>) => {
        const m = e.data;
        if (m.type === "progress") opts.onState("loading", `${m.percent}%`);
        else if (m.type === "ready") resolve();
        else if (m.type === "result") { pending.get(m.id)?.resolve(m.text); pending.delete(m.id); }
        else if (m.type === "error") {
          if (m.id !== undefined) { pending.get(m.id)?.reject(new Error(m.message)); pending.delete(m.id); }
          else { reject(new Error(m.message)); ready = null; worker?.terminate(); worker = null; }
        }
      };
      worker!.onerror = (e) => { reject(new Error(e.message || "worker failed")); ready = null; };
      const init: WorkerIn = { type: "init", wasmBase: opts.wasmBase };
      worker!.postMessage(init);
    });
    ready.catch(() => {});
    return ready;
  }

  // ---- recording session ----
  let session: null | { finish(): Promise<string> } = null;
  // Transcript of a session that ended by itself (silence / 30 s); stop() hands it over once.
  let lastFinish: Promise<string> | null = null;

  async function start(lang: Language): Promise<void> {
    if (session) return;
    lastFinish = null;
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (e) {
      const name = (e as DOMException)?.name;
      opts.onState("error", name === "NotAllowedError" || name === "SecurityError" || name === "PermissionDeniedError" ? "MIC_PERMISSION" : "MIC_UNAVAILABLE");
      return;
    }
    void ensureWorker().catch((e) => opts.onState("error", String(e.message ?? e)));

    let ctx: AudioContext;
    try { ctx = new AudioContext({ sampleRate: TARGET_RATE }); } catch { ctx = new AudioContext(); }
    const rate = ctx.sampleRate;
    const source = ctx.createMediaStreamSource(stream);
    const chunks: Float32Array[] = [];
    const detector = new EndpointDetector(rate);
    let stopped = false;
    let resolveText: (t: string) => void = () => {};
    const textPromise = new Promise<string>((r) => (resolveText = r));
    let lastLevel = 0;
    let acc = 0;
    const cleanup: Array<() => void> = [];

    const onChunk = (chunk: Float32Array) => {
      if (stopped) return;
      chunks.push(chunk);
      acc += chunk.length;
      if (acc >= rate / 20) { // ~20 updates per second
        acc = 0;
        lastLevel = levelFromRms(rms(chunk));
        opts.onLevel(lastLevel);
      }
      if (detector.push(chunk)) void finish();
    };

    let finishing: Promise<string> | null = null;
    function finish(): Promise<string> {
      if (finishing) return finishing;
      stopped = true;
      finishing = lastFinish = (async () => {
        cleanup.forEach((f) => f());
        stream.getTracks().forEach((t) => t.stop());
        void ctx.close().catch(() => {});
        session = null;
        opts.onLevel(0);
        const audio = resampleTo16k(concat(chunks), rate);
        let text = "";
        if (detector.heardSpeech && audio.length > TARGET_RATE / 4) {
          opts.onState("transcribing");
          try {
            await ensureWorker();
            const id = nextId++;
            text = await new Promise<string>((resolve, reject) => {
              pending.set(id, { resolve, reject });
              const msg: WorkerIn = { type: "transcribe", id, audio, language: whisperLanguage(lang) };
              worker!.postMessage(msg, [audio.buffer]);
            });
          } catch (e) {
            opts.onState("error", String((e as Error).message ?? e));
            resolveText("");
            return "";
          }
        }
        text = text.trim();
        opts.onState("idle", text); // detail = transcript, for sessions that auto-stopped
        resolveText(text);
        return text;
      })();
      return finishing;
    }

    // Prefer AudioWorklet; fall back to ScriptProcessorNode.
    let usedWorklet = false;
    try {
      await ctx.audioWorklet.addModule(new URL("./capture.worklet.js?no-inline", import.meta.url).href);
      const node = new AudioWorkletNode(ctx, "littletusk-capture");
      node.port.onmessage = (e) => onChunk(e.data as Float32Array);
      source.connect(node);
      cleanup.push(() => { node.port.onmessage = null; source.disconnect(); node.disconnect(); });
      usedWorklet = true;
    } catch { /* fall through */ }
    if (!usedWorklet) {
      const sp = ctx.createScriptProcessor(4096, 1, 1);
      sp.onaudioprocess = (e) => onChunk(new Float32Array(e.inputBuffer.getChannelData(0)));
      const mute = ctx.createGain();
      mute.gain.value = 0;
      source.connect(sp);
      sp.connect(mute);
      mute.connect(ctx.destination);
      cleanup.push(() => { sp.onaudioprocess = null; source.disconnect(); sp.disconnect(); mute.disconnect(); });
    }
    session = { finish };
    opts.onState("listening");
    void textPromise;
  }

  async function stop(): Promise<string> {
    if (session) return session.finish();
    const p = lastFinish;
    lastFinish = null;
    return p ? p : "";
  }

  async function preload(): Promise<void> {
    opts.onState("loading", "0%");
    try {
      await ensureWorker();
      opts.onState("idle");
    } catch (e) {
      opts.onState("error", String((e as Error).message ?? e));
    }
  }

  function dispose(): void {
    if (session) void session.finish();
    worker?.terminate();
    worker = null;
    ready = null;
    pending.forEach((p) => p.reject(new Error("disposed")));
    pending.clear();
  }

  return { start, stop, preload, dispose };
}
