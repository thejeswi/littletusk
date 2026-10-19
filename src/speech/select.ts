// Chooses how Tusk listens. On-device browser recognizer first (C3), Whisper as the fallback, and the
// browser's online listener only when the family allowed it. The caller sees one engine with the same
// interface as createSpeech, so the chat microphone and the conversation do not care which one runs.
import type { Language } from "../shared/protocol";
import { DEFAULT_MIC_SILENT, createBrowserSpeech, installPackFor, packState, recognizerCtor, type PackState } from "./browser";
import { createSpeech, type SpeechOptions } from "./index";

export type EngineChoice = "browser-local" | "browser-install" | "browser-online" | "whisper";

/** What to use for a pack state, given whether the family allowed the online listener. Pure: unit tested. */
export function engineChoice(pack: PackState, online: boolean, packPolicy: "auto" = "auto"): EngineChoice {
  if (pack === "available") return "browser-local";
  if (pack === "downloadable" || pack === "downloading") return packPolicy === "auto" ? "browser-install" : online ? "browser-online" : "whisper";
  return online ? "browser-online" : "whisper";
}

/** A browser session that failed for a reason Whisper can work around. */
export function canFallBack(detail: string | undefined): boolean {
  if (!detail) return false;
  if (detail === "MIC_PERMISSION") return false; // permission is about the microphone, not the engine
  return detail === DEFAULT_MIC_SILENT || detail === "MIC_UNAVAILABLE" || detail === "PACK_NEEDED" || /^BROWSER_/.test(detail);
}

export interface AutoSpeechOptions extends SpeechOptions {
  /** Family settings: the browser's online listener may be used as a backup. */
  online(): boolean;
  /** Live words while the person speaks (browser recognizer only; Whisper writes them down at the end). */
  onPartial?(text: string): void;
}

interface Engine {
  start(lang: Language): Promise<void>;
  stop(): Promise<string>;
  pause(paused: boolean): void;
  preload?(): Promise<void>;
  dispose(): void;
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** True in the composing iframe: the browser's on-device recognizer refuses cross-origin iframes,
 * so Whisper runs there instead (its microphone works with the iframe's allow="microphone"). */
export function inCrossOriginFrame(): boolean {
  try {
    return window.top !== window && !window.top?.location.href;
  } catch {
    return true;
  }
}
const PACK_STATE_MS = 10_000; // the browser answers at once; do not leave the microphone hanging
const PACK_INSTALL_MS = 180_000; // a slow download is fine, an endless one is not

export function createSpeechAuto(opts: AutoSpeechOptions) {
  let engine: Engine | null = null;
  let kind: "browser" | "whisper" | "faux" | null = null;
  let active = false;
  let lang: Language = "en";
  let token = 0; // callbacks from a replaced engine are ignored

  function makeBrowser(mine: number, online: boolean): Engine {
    return createBrowserSpeech({
      online,
      onLevel: (level) => { if (mine === token) opts.onLevel(level); },
      onState: (s, detail) => {
        if (mine !== token) return;
        if (s === "error" && active && kind === "browser" && canFallBack(detail)) { void fallBack(); return; }
        opts.onState(s, detail);
      },
      onPartial: (text) => { if (mine === token) opts.onPartial?.(text); },
    });
  }

  function makeWhisper(mine: number): Engine {
    return createSpeech({
      wasmBase: opts.wasmBase,
      onLevel: (level) => { if (mine === token) opts.onLevel(level); },
      onState: (s, detail) => { if (mine === token) opts.onState(s, detail); },
    });
  }

  async function fallBack(): Promise<void> {
    if (!active || kind !== "browser") return;
    token += 1;
    const old = engine;
    engine = null;
    kind = "whisper";
    try { old?.dispose(); } catch { /* replaced */ }
    const mine = token;
    engine = makeWhisper(mine);
    await engine.start(lang);
  }

  async function pick(): Promise<void> {
    if (__E2E__) {
      const faux = await import("./faux");
      if (await faux.fauxSpeechOn()) {
        kind = "faux";
        engine = faux.createFauxSpeech({ onLevel: opts.onLevel, onState: opts.onState, onPartial: opts.onPartial });
        await engine.start(lang);
        return;
      }
    }
    const mine = token;
    if (inCrossOriginFrame()) {
      // Chrome: "Access denied from cross-origin iframes" for SpeechRecognition.install.
      kind = "whisper";
      engine = makeWhisper(mine);
      await engine.start(lang);
      return;
    }
    if (recognizerCtor()) {
      const state = (await Promise.race([packState(lang), sleep(PACK_STATE_MS).then(() => "unavailable" as PackState)]));
      if (!active) return;
      const choice = engineChoice(state, opts.online());
      if (choice === "browser-install") {
        opts.onState("loading", "pack");
        const ok = await Promise.race([
          installPackFor(lang, (p) => { if (mine === token && active) opts.onState("loading", p); }),
          sleep(PACK_INSTALL_MS).then(() => false),
        ]);
        if (!active) return;
        if (ok) {
          kind = "browser";
          engine = makeBrowser(mine, false);
          await engine.start(lang);
          return;
        }
        // The download did not finish: the online listener (if allowed) or Whisper takes over.
        if (opts.online()) {
          kind = "browser";
          engine = makeBrowser(mine, true);
          await engine.start(lang);
          return;
        }
      } else if (choice === "browser-local" || choice === "browser-online") {
        kind = "browser";
        engine = makeBrowser(mine, choice === "browser-online");
        await engine.start(lang);
        return;
      }
    }
    if (!active) return;
    kind = "whisper";
    engine = makeWhisper(mine);
    await engine.start(lang);
  }

  async function start(nextLang: Language): Promise<void> {
    lang = nextLang;
    active = true;
    token += 1;
    try {
      await pick();
    } catch (e) {
      if (!active) return;
      active = false;
      opts.onState("error", `BROWSER_FAILED:${String((e as Error)?.message ?? e)}`);
    }
  }

  async function stop(): Promise<string> {
    active = false;
    const e = engine;
    if (!e) return "";
    const text = await e.stop();
    engine = null;
    kind = null;
    return text;
  }

  function pause(paused: boolean): void {
    engine?.pause(paused);
  }

  async function preload(): Promise<void> {
    await engine?.preload?.();
  }

  function dispose(): void {
    active = false;
    token += 1;
    try { engine?.dispose(); } catch { /* closing */ }
    engine = null;
    kind = null;
  }

  return { start, stop, pause, preload, dispose };
}
