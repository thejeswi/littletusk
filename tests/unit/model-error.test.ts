import { describe, it, expect } from "vitest";
import { explainModelError } from "../../src/offscreen/view";

describe("model errors in plain words", () => {
  it("names the likely cause and keeps a short detail for the family", () => {
    expect(explainModelError("en", '401 {"type":"error","error":{"type":"authentication_error","message":"invalid x-api-key"}}')).toMatch(/key was not accepted[\s\S]*Details for your family/);
    expect(explainModelError("en", "529 overloaded_error")).toMatch(/very busy/);
    expect(explainModelError("en", "Your credit balance is too low")).toMatch(/no credit/);
    expect(explainModelError("en", "TypeError: Failed to fetch")).toMatch(/internet/);
    expect(explainModelError("de", "404 model: claude-x not found")).toMatch(/Denk-Modell/);
    expect(explainModelError("en", "")).toMatch(/could not think/);
  });
  it("never shows a key", () => {
    expect(explainModelError("en", "bad key " + "sk-" + "ant-api03-" + "abcdefghijklmnop")).not.toContain("abcdefgh");
  });
});
