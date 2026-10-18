// TEST BUILDS ONLY (vite --mode e2e). Never imported when __E2E__ is false, so it is not in dist/.
// A scripted fake model: the script sits in chrome.storage.local under "__faux_script" as an array of steps
//   { text: "..." }                                   a text answer
//   { text?: "...", tools: [{ name, args }] }         tool calls (args strings "@find:<regex>" become the id of the
//                                                     first element of the latest read_page result whose line matches)
// The number of model calls is stored under "__faux_calls".
import { fauxAssistantMessage, fauxProvider, fauxText, fauxToolCall, type FauxResponseStep } from "@earendil-works/pi-ai/providers/faux";
import type { MutableModels } from "@earendil-works/pi-ai/models";

type Step = { text?: string; tools?: { name: string; args?: Record<string, unknown> }[] };
export interface Store {
  get(key: string): Promise<unknown>;
  set(key: string, value: unknown): Promise<void>;
}

function findId(messages: readonly any[], pattern: string): string {
  const re = new RegExp(pattern, "i");
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m.role !== "toolResult" || m.toolName !== "read_page") continue;
    const body = (m.content ?? []).map((c: any) => c.text ?? "").join("");
    for (const line of body.split("\n")) {
      const hit = /^(?:- )?\[(e\d+)\]/.exec(line); // an element line, or a WARNING line ("- [e12] ...")
      if (hit && re.test(line)) return hit[1];
    }
  }
  return "e0-not-found";
}

export function installFaux(models: MutableModels, store: Store) {
  const faux = fauxProvider();
  models.setProvider(faux.provider);
  let loaded = "";
  const toStep = (s: Step): FauxResponseStep => async (context, _options, state) => {
    await store.set("__faux_calls", state.callCount);
    const blocks: any[] = [];
    if (s.text) blocks.push(fauxText(s.text));
    for (const t of s.tools ?? []) {
      const args: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(t.args ?? {})) {
        args[k] = typeof v === "string" && v.startsWith("@find:") ? findId(context.messages as any[], v.slice(6)) : v;
      }
      blocks.push(fauxToolCall(t.name, args as any));
    }
    return fauxAssistantMessage(blocks, { stopReason: s.tools?.length ? "toolUse" : "stop" });
  };
  return {
    /** Load the script if it changed since last time. */
    async reload() {
      const raw = JSON.stringify((await store.get("__faux_script")) ?? []);
      if (raw === loaded) return;
      loaded = raw;
      faux.setResponses((JSON.parse(raw) as Step[]).map(toStep));
    },
  };
}
