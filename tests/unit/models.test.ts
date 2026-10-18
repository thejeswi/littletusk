import { describe, expect, it } from "vitest";
import { createTuskModels } from "../../src/offscreen/models";

describe("models", () => {
  it("uses the key set programmatically, per provider, and forgets it when cleared", async () => {
    const { models, setKey } = createTuskModels();
    await setKey("anthropic", "sk-ant-test-key-1234");
    expect((await models.getAuth("anthropic"))?.auth.apiKey).toBe("sk-ant-test-key-1234");
    expect(models.getModel("anthropic", "claude-haiku-5-5")).toBeTruthy();
    expect((await models.getAuth("openai"))?.auth.apiKey).toBeUndefined();
    await setKey("anthropic", "");
    expect((await models.getAuth("anthropic"))?.auth.apiKey).toBeUndefined();
  });
});
