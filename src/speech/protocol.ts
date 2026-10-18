import type { WhisperLanguage } from "./audio";
export type WorkerIn =
  | { type: "init"; wasmBase: string }
  | { type: "transcribe"; id: number; audio: Float32Array; language: WhisperLanguage };
export type WorkerOut =
  | { type: "progress"; percent: number }
  | { type: "ready"; device: string }
  | { type: "result"; id: number; text: string }
  | { type: "error"; id?: number; message: string };
