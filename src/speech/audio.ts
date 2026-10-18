// Pure audio helpers (no browser APIs), unit tested.
import type { Language } from "../shared/protocol";

export const TARGET_RATE = 16000;
export const MAX_SECONDS = 30;
export const SILENCE_SECONDS = 2;
/** RMS above this counts as speech (input is -1..1 floats). */
export const SPEECH_RMS = 0.015;

export type WhisperLanguage = "english" | "german" | "spanish";

export function whisperLanguage(lang: Language): WhisperLanguage {
  if (lang === "de") return "german";
  if (lang === "es") return "spanish";
  return "english"; // en, en-IN
}

export function rms(samples: Float32Array): number {
  if (samples.length === 0) return 0;
  let sum = 0;
  for (let i = 0; i < samples.length; i++) sum += samples[i] * samples[i];
  return Math.sqrt(sum / samples.length);
}

/** Maps RMS to a 0..1 level for the listening wave. */
export function levelFromRms(r: number): number {
  return Math.min(1, Math.sqrt(r) * 2.2);
}

/** Linear-interpolation resampling of mono audio to 16 kHz. */
export function resampleTo16k(input: Float32Array, fromRate: number): Float32Array {
  if (fromRate === TARGET_RATE) return input;
  const ratio = fromRate / TARGET_RATE;
  const outLen = Math.floor(input.length / ratio);
  const out = new Float32Array(outLen);
  for (let i = 0; i < outLen; i++) {
    const pos = i * ratio;
    const i0 = Math.floor(pos);
    const i1 = Math.min(i0 + 1, input.length - 1);
    const f = pos - i0;
    out[i] = input[i0] * (1 - f) + input[i1] * f;
  }
  return out;
}

export function concat(chunks: Float32Array[]): Float32Array {
  const total = chunks.reduce((n, c) => n + c.length, 0);
  const out = new Float32Array(total);
  let o = 0;
  for (const c of chunks) {
    out.set(c, o);
    o += c.length;
  }
  return out;
}

/** Tracks speech and silence from a stream of chunks; says when to auto-stop. */
export class EndpointDetector {
  heardSpeech = false;
  private silent = 0;
  private total = 0;
  constructor(private sampleRate: number, private silenceSeconds = SILENCE_SECONDS, private maxSeconds = MAX_SECONDS, private threshold = SPEECH_RMS) {}
  /** Feed one chunk; returns true when recording should stop. */
  push(chunk: Float32Array): boolean {
    const dur = chunk.length / this.sampleRate;
    this.total += dur;
    if (rms(chunk) >= this.threshold) {
      this.heardSpeech = true;
      this.silent = 0;
    } else {
      this.silent += dur;
    }
    if (this.total >= this.maxSeconds) return true;
    return this.heardSpeech && this.silent >= this.silenceSeconds;
  }
}
