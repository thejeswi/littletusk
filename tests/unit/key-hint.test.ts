import { describe, it, expect } from "vitest";
import { guessProvider, keyMismatch } from "../../src/shared/key-hint";

// Fixtures are assembled at runtime: spelled out in full, they look like real keys to secret scanners.
const deepseekShaped = "sk-" + "0123456789abcdef".repeat(2);
const anthropicShaped = "sk-" + "ant-api03-" + "abcdefghijklmnopqrstuvwxyz";
const googleShaped = "AIza" + "SyA-1234567890abcdefghijklmnop";

describe("key shape hints", () => {
  it("recognises common key shapes without ever claiming a key works", () => {
    expect(guessProvider(anthropicShaped)).toBe("anthropic");
    expect(guessProvider("sk-or-v1-abcdef0123456789")).toBe("openrouter");
    expect(guessProvider(googleShaped)).toBe("google");
    expect(guessProvider(deepseekShaped)).toBe("deepseek");
    expect(guessProvider("sk-proj-abcdefghijklmnopqrstuvwxyz0123")).toBe("openai");
    expect(guessProvider("something else")).toBeNull();
  });
  it("flags only a clear mismatch with the selected provider", () => {
    expect(keyMismatch("anthropic", deepseekShaped)).toBe("deepseek");
    expect(keyMismatch("deepseek", deepseekShaped)).toBeNull();
    expect(keyMismatch("mistral", "unknownshape1234567890")).toBeNull();
  });
});
