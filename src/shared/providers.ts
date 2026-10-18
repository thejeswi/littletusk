import { ANTHROPIC_MODELS } from "@earendil-works/pi-ai/providers/anthropic.models";
import { OPENAI_MODELS } from "@earendil-works/pi-ai/providers/openai.models";
import { GOOGLE_MODELS } from "@earendil-works/pi-ai/providers/google.models";
import { MISTRAL_MODELS } from "@earendil-works/pi-ai/providers/mistral.models";
import { OPENROUTER_MODELS } from "@earendil-works/pi-ai/providers/openrouter.models";

export interface ProviderInfo {
  id: string;
  label: string;
  keyHelpUrl: string;
  model: string; // default everyday model id
  strongModel: string; // default strong model id
}

export interface ModelInfo {
  id: string;
  name: string;
  inputPerMillion: number;
  outputPerMillion: number;
}

export const PROVIDERS: ProviderInfo[] = [
  { id: "anthropic", label: "Anthropic (Claude)", keyHelpUrl: "https://console.anthropic.com/settings/keys", model: "claude-haiku-5-5", strongModel: "claude-sonnet-5-5" },
  { id: "openai", label: "OpenAI", keyHelpUrl: "https://platform.openai.com/api-keys", model: "gpt-5.4-mini", strongModel: "gpt-5.5" },
  { id: "google", label: "Google (Gemini)", keyHelpUrl: "https://aistudio.google.com/apikey", model: "gemini-3.5-flash-lite", strongModel: "gemini-3.1-pro-preview" },
  { id: "mistral", label: "Mistral", keyHelpUrl: "https://console.mistral.ai/api-keys", model: "mistral-small-latest", strongModel: "mistral-large-latest" },
  { id: "openrouter", label: "OpenRouter", keyHelpUrl: "https://openrouter.ai/settings/keys", model: "anthropic/claude-haiku-5.5", strongModel: "anthropic/claude-sonnet-5.5" },
];

export function providerInfo(id: string): ProviderInfo {
  return PROVIDERS.find((p) => p.id === id) ?? PROVIDERS[0];
}

type Catalog = Record<string, { id: string; name: string; cost: { input: number; output: number } }>;
const CATALOGS: Record<string, Catalog> = {
  anthropic: ANTHROPIC_MODELS as unknown as Catalog,
  openai: OPENAI_MODELS as unknown as Catalog,
  google: GOOGLE_MODELS as unknown as Catalog,
  mistral: MISTRAL_MODELS as unknown as Catalog,
  openrouter: OPENROUTER_MODELS as unknown as Catalog,
};

/** Catalog models of a provider (cost in USD per million tokens), cheapest first. */
export function modelsFor(provider: string): ModelInfo[] {
  const cat = CATALOGS[provider] ?? {};
  return Object.values(cat)
    .filter((m) => !m.id.endsWith(":batch"))
    .map((m) => ({ id: m.id, name: m.name, inputPerMillion: m.cost.input, outputPerMillion: m.cost.output }))
    .sort((a, b) => a.inputPerMillion - b.inputPerMillion || a.name.localeCompare(b.name));
}
