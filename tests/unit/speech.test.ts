import { describe, it, expect } from "vitest";
import { EndpointDetector, concat, levelFromRms, resampleTo16k, rms, whisperLanguage } from "../../src/speech/audio";

const tone = (n: number, amp: number) => Float32Array.from({ length: n }, (_, i) => amp * Math.sin(i / 5));

describe("speech helpers", () => {
  it("maps languages", () => {
    expect(whisperLanguage("en")).toBe("english");
    expect(whisperLanguage("en-IN")).toBe("english");
    expect(whisperLanguage("de")).toBe("german");
    expect(whisperLanguage("es")).toBe("spanish");
  });
  it("computes rms and level", () => {
    expect(rms(new Float32Array(0))).toBe(0);
    expect(rms(new Float32Array([0.5, -0.5]))).toBeCloseTo(0.5);
    expect(levelFromRms(0)).toBe(0);
    expect(levelFromRms(1)).toBe(1);
    expect(levelFromRms(0.05)).toBeGreaterThan(levelFromRms(0.01));
  });
  it("resamples to 16 kHz", () => {
    const x = tone(48000, 0.5);
    const y = resampleTo16k(x, 48000);
    expect(y.length).toBe(16000);
    expect(rms(y)).toBeCloseTo(rms(x), 1);
    const same = new Float32Array(10);
    expect(resampleTo16k(same, 16000)).toBe(same);
    expect(resampleTo16k(tone(44100, 0.5), 44100).length).toBe(16000);
  });
  it("concatenates", () => {
    expect([...concat([new Float32Array([1]), new Float32Array([2, 3])])]).toEqual([1, 2, 3]);
  });
  it("stops after 2 s of silence following speech, not before speech", () => {
    const d = new EndpointDetector(16000);
    const silence = new Float32Array(1600);
    for (let i = 0; i < 40; i++) expect(d.push(silence)).toBe(false); // 4 s of silence, no speech yet
    expect(d.heardSpeech).toBe(false);
    expect(d.push(tone(1600, 0.3))).toBe(false);
    let stopped = false;
    for (let i = 0; i < 25 && !stopped; i++) stopped = d.push(silence);
    expect(stopped).toBe(true);
  });
  it("stops at the 30 s maximum", () => {
    const d = new EndpointDetector(16000);
    let stopped = false;
    for (let i = 0; i < 400 && !stopped; i++) stopped = d.push(tone(1600, 0.3));
    expect(stopped).toBe(true);
  });
});
