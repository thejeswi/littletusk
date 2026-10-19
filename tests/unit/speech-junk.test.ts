import { describe, expect, it } from "vitest";
import { fitsScript, isJunkTranscript, scriptMix } from "../../src/speech/junk";

describe("misheard transcripts", () => {
  it("drops empty and one- or two-character transcripts", () => {
    expect(isJunkTranscript("", "en")).toBe(true);
    expect(isJunkTranscript("   ", "de")).toBe(true);
    expect(isJunkTranscript("a", "en")).toBe(true);
    expect(isJunkTranscript("ok", "en")).toBe(true);
    expect(isJunkTranscript(" hm ", "es")).toBe(true);
  });

  it("keeps ordinary sentences in each language", () => {
    expect(isJunkTranscript("where do I log in", "en")).toBe(false);
    expect(isJunkTranscript("Wo melde ich mich an?", "de")).toBe(false);
    expect(isJunkTranscript("¿Dónde inicio sesión?", "es")).toBe(false);
    expect(isJunkTranscript("कृपया मदद करें", "en-IN")).toBe(false);
    expect(isJunkTranscript("please help me", "en-IN")).toBe(false);
  });

  it("drops transcripts mostly in a script that does not fit the language", () => {
    expect(isJunkTranscript("как войти в систему", "en")).toBe(true);
    expect(isJunkTranscript("ログイン方法を教えてください", "de")).toBe(true);
    expect(isJunkTranscript("كيف أسجل الدخول", "es")).toBe(true);
    expect(isJunkTranscript("कृपया मदद करें", "en")).toBe(true); // Devanagari is only expected for English (India)
  });

  it("counts letters by script and ignores spaces, punctuation and digits", () => {
    expect(scriptMix("hi 42!")).toEqual({ latin: 2, devanagari: 0, other: 0 });
    expect(scriptMix("नमस्ते")).toEqual({ latin: 0, devanagari: 4, other: 0 });
    expect(fitsScript("123 456", "en")).toBe(true); // no letters: not judged on script
  });
});
