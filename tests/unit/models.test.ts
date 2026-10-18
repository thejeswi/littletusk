import { describe, expect, it } from "vitest";
import { createTuskModels } from "../../src/offscreen/models";
import { PROVIDERS, modelsFor } from "../../src/shared/providers";

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

  it("every provider offered in settings is wired up, and its default models exist", async () => {
    const { models, setKey } = createTuskModels();
    for (const p of PROVIDERS) {
      const ids = modelsFor(p.id).map((m) => m.id);
      expect(ids, `${p.id} everyday model`).toContain(p.model);
      expect(ids, `${p.id} strong model`).toContain(p.strongModel);
      expect(models.getModel(p.id, p.model), `${p.id} provider registered`).toBeTruthy();
    }
    await setKey("deepseek", "sk-deepseek-test-1234");
    expect((await models.getAuth("deepseek"))?.auth.apiKey).toBe("sk-deepseek-test-1234");
  });
});
