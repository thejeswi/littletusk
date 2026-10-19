import { describe, expect, it } from "vitest";
import { DEFAULT_MIC_SILENT, SILENT_DEFAULT_MS, SilenceGuard, joinTranscript, recognitionLang } from "../../src/speech/browser";
import { canFallBack, engineChoice } from "../../src/speech/select";

describe("browser speech helpers", () => {
  it("maps each language to the BCP-47 tag the recognizer expects", () => {
    expect(recognitionLang("en")).toBe("en-US");
    expect(recognitionLang("de")).toBe("de-DE");
    expect(recognitionLang("es")).toBe("es-ES");
    expect(recognitionLang("en-IN")).toBe("en-IN");
  });

  it("joins finished words and the words still being heard", () => {
    expect(joinTranscript([], "")).toBe("");
    expect(joinTranscript(["hello", " "], "wor")).toBe("hello wor");
    expect(joinTranscript(["one", "two"], "")).toBe("one two");
    expect(joinTranscript([], "  live  ")).toBe("live");
  });

  it("notices a digitally silent input only after the whole window was zero", () => {
    const g = new SilenceGuard(1000);
    expect(g.push(0, 0)).toBe(false);
    expect(g.push(0.01, 300)).toBe(false); // real noise: not silent
    expect(g.push(0, 350)).toBe(false);
    expect(g.push(0, 1000)).toBe(false);
    expect(g.push(0, 1350)).toBe(true);
    g.reset();
    expect(g.push(0, 2000)).toBe(false);
    expect(SILENT_DEFAULT_MS).toBe(1500);
  });
});

describe("choosing how to listen (C3)", () => {
  it("uses an existing on-device pack first", () => {
    expect(engineChoice("available", false)).toBe("browser-local");
    expect(engineChoice("available", true)).toBe("browser-local");
  });

  it("downloads a missing pack on first use (B3), unless the online listener is allowed", () => {
    expect(engineChoice("downloadable", false)).toBe("browser-install");
    expect(engineChoice("downloading", false)).toBe("browser-install");
    expect(engineChoice("downloadable", true)).toBe("browser-install");
  });

  it("falls back to Whisper, and only uses the online listener when the family allowed it", () => {
    expect(engineChoice("unavailable", false)).toBe("whisper");
    expect(engineChoice("unavailable", true)).toBe("browser-online");
  });

  it("falls back from a browser session only for engine problems, never for a missing permission", () => {
    expect(canFallBack(DEFAULT_MIC_SILENT)).toBe(true);
    expect(canFallBack("BROWSER_FAILED:no-on-device")).toBe(true);
    expect(canFallBack("PACK_NEEDED")).toBe(true);
    expect(canFallBack("MIC_PERMISSION")).toBe(false);
    expect(canFallBack(undefined)).toBe(false);
  });
});
