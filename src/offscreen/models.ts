// pi-ai models with the person's key, set programmatically (never read from the environment, never logged).
import { InMemoryCredentialStore } from "@earendil-works/pi-ai";
import { createModels, type MutableModels } from "@earendil-works/pi-ai/models";
import { anthropicProvider } from "@earendil-works/pi-ai/providers/anthropic";
import { googleProvider } from "@earendil-works/pi-ai/providers/google";
import { mistralProvider } from "@earendil-works/pi-ai/providers/mistral";
import { openaiProvider } from "@earendil-works/pi-ai/providers/openai";
import { openrouterProvider } from "@earendil-works/pi-ai/providers/openrouter";
import { deepseekProvider } from "@earendil-works/pi-ai/providers/deepseek";

export interface TuskModels {
  models: MutableModels;
  /** Store (or with an empty key, remove) the key of one provider. */
  setKey(provider: string, key: string): Promise<void>;
}

export function createTuskModels(): TuskModels {
  const credentials = new InMemoryCredentialStore();
  const models = createModels({ credentials });
  for (const p of [anthropicProvider(), openaiProvider(), googleProvider(), mistralProvider(), openrouterProvider(), deepseekProvider()]) models.setProvider(p);
  return {
    models,
    async setKey(provider, key) {
      if (key) await credentials.modify(provider, async () => ({ type: "api_key", key }));
      else await credentials.delete(provider);
    },
  };
}
