// Opt-in (downloads ~100 MB of model weights): SPEECH_E2E=1 npx playwright test tests/e2e/speech.spec.ts
// Needs `espeak-ng` and a prior `npm run build`. Runs the built Whisper worker in an extension page and
// transcribes a generated English sentence. The microphone path (src/speech/index.ts) needs a human or a
// fake-device browser; manual check: load dist/, open the setup page, allow the mic, speak.
import { test, expect } from "./fixtures";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const dist = resolve(import.meta.dirname, "../../dist");
const enabled = process.env.SPEECH_E2E === "1";

function hasEspeak(): boolean {
  try { execFileSync("espeak-ng", ["--version"], { stdio: "ignore" }); return true; } catch { return false; }
}

test("whisper worker transcribes spoken English", async ({ context, extensionId }) => {
  test.skip(!enabled, "set SPEECH_E2E=1 to run (downloads model weights)");
  test.skip(!hasEspeak(), "espeak-ng not installed");
  test.setTimeout(600_000);
  const dir = mkdtempSync(join(tmpdir(), "littletusk-speech-"));
  try {
    const wav = join(dir, "hello.wav");
    execFileSync("espeak-ng", ["-w", wav, "-s", "140", "Please help me send an email to my daughter"]);
    const buf = readFileSync(wav);
    // 16-bit PCM mono WAV, 44-byte header
    const rate = buf.readUInt32LE(24);
    const samples = Array.from({ length: (buf.length - 44) >> 1 }, (_, i) => buf.readInt16LE(44 + i * 2) / 32768);
    const chunk = readdirSync(join(dist, "chunks")).find((f) => /^whisper\.worker-.*\.js$/.test(f));
    expect(chunk).toBeTruthy();
    const page = await context.newPage();
    await page.goto(`chrome-extension://${extensionId}/pages/storage-selftest.html?mode=cleanup`);
    const text = await page.evaluate(async ({ chunk, samples, rate, base }) => {
      // resample to 16 kHz (linear)
      const ratio = rate / 16000;
      const n = Math.floor(samples.length / ratio);
      const audio = new Float32Array(n);
      for (let i = 0; i < n; i++) audio[i] = samples[Math.floor(i * ratio)];
      const w = new Worker(chrome.runtime.getURL(`chunks/${chunk}`), { type: "module" });
      return await new Promise<string>((resolve, reject) => {
        w.onmessage = (e) => {
          if (e.data.type === "ready") w.postMessage({ type: "transcribe", id: 1, audio, language: "english" });
          else if (e.data.type === "result") resolve(e.data.text);
          else if (e.data.type === "error") reject(new Error(e.data.message));
        };
        w.postMessage({ type: "init", wasmBase: base });
      });
    }, { chunk: chunk!, samples, rate, base: `chrome-extension://${extensionId}/wasm/` });
    expect(text.toLowerCase()).toContain("email");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
