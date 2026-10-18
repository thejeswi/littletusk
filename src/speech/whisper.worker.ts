// Whisper speech recognition in a module worker. Audio stays in the browser; the only network use is
// downloading model weights from huggingface.co on first use (then cached by the Cache API).
import { env, pipeline } from "@huggingface/transformers";
import type { WorkerIn, WorkerOut } from "./protocol";

const MODEL = "onnx-community/whisper-base";
const post = (m: WorkerOut) => (self as unknown as Worker).postMessage(m);

let asr: any = null;
let loading: Promise<void> | null = null;

async function load(wasmBase: string) {
  env.allowLocalModels = false;
  env.allowRemoteModels = true;
  env.useBrowserCache = true;
  const onnx = env.backends.onnx as any;
  onnx.wasm.wasmPaths = wasmBase; // never fetch runtime code from a CDN
  onnx.wasm.numThreads = (self as any).crossOriginIsolated ? Math.min(4, navigator.hardwareConcurrency || 2) : 1;

  const files = new Map<string, { loaded: number; total: number }>();
  const progress_callback = (p: any) => {
    if (p.status === "progress" && p.file) {
      files.set(p.file, { loaded: p.loaded, total: p.total });
      let l = 0, t = 0;
      for (const f of files.values()) { l += f.loaded; t += f.total; }
      post({ type: "progress", percent: t ? Math.round((l / t) * 100) : 0 });
    }
  };
  const build = (device: "webgpu" | "wasm") =>
    pipeline("automatic-speech-recognition", MODEL, {
      device,
      // Encoder is the sensitive part: fp32 on GPU, q8 on wasm; decoder q8.
      dtype: device === "webgpu" ? { encoder_model: "fp32", decoder_model_merged: "q8" } : { encoder_model: "q8", decoder_model_merged: "q8" },
      progress_callback,
    } as any);
  let device = "wasm";
  const hasGpu = typeof navigator !== "undefined" && !!(navigator as any).gpu && (await (navigator as any).gpu.requestAdapter().catch(() => null));
  if (hasGpu) {
    try { asr = await build("webgpu"); device = "webgpu"; } catch { asr = null; files.clear(); }
  }
  if (!asr) asr = await build("wasm");
  post({ type: "ready", device });
}

self.onmessage = async (e: MessageEvent<WorkerIn>) => {
  const m = e.data;
  try {
    if (m.type === "init") {
      if (asr) return post({ type: "ready", device: "cached" });
      loading ??= load(m.wasmBase);
      await loading;
    } else if (m.type === "transcribe") {
      if (!asr) throw new Error("not initialised");
      const out: any = await asr(m.audio, { language: m.language, task: "transcribe", chunk_length_s: 30 });
      post({ type: "result", id: m.id, text: String(out.text ?? "").trim() });
    }
  } catch (err) {
    loading = null;
    post({ type: "error", id: m.type === "transcribe" ? m.id : undefined, message: String((err as Error)?.message ?? err) });
  }
};
