// Test-only page: runs pi-durable's storage conformance suite and a persistence check against the real
// OPFS-backed storage. Result goes to <pre id="out" data-state="done|error"> as JSON.
import { registerStorageConformance } from "@earendil-works/pi-durable/testing";
import { AssistantEntry, createRegistry, Harness } from "@earendil-works/pi-durable";
import { BACKGROUND_CONTEXT } from "@earendil-works/chord/context";
import { createModels } from "@earendil-works/pi-ai/models";
import { fauxAssistantMessage, fauxProvider } from "@earendil-works/pi-ai/providers/faux";
import { openTuskStorage } from "../storage/index";

const out = document.getElementById("out")!;
const mode = new URLSearchParams(location.search).get("mode") ?? "conformance";
const finish = (state: string, data: unknown) => {
  out.textContent = JSON.stringify(data);
  out.dataset.state = state;
};

function same(a: any, b: any): boolean {
  if (Object.is(a, b)) return true;
  if (typeof a !== "object" || typeof b !== "object" || !a || !b) return false;
  if (Object.getPrototypeOf(a) !== Object.getPrototypeOf(b)) return false;
  const ka = Object.keys(a), kb = Object.keys(b);
  return ka.length === kb.length && ka.every((k) => same(a[k], b[k]));
}
function partial(a: any, b: any): boolean {
  if (typeof b !== "object" || b === null) return Object.is(a, b);
  if (typeof a !== "object" || a === null) return false;
  if (b instanceof Uint8Array) return same(a, b);
  return Object.keys(b).every((k) => partial(a[k], b[k]));
}
const fmt = (v: unknown) => { try { return JSON.stringify(v, (_, x) => (typeof x === "bigint" ? String(x) : x)); } catch { return String(v); } };
function expect(actual: any, message?: string) {
  const fail = (what: string) => { throw new Error(`${message ? message + ": " : ""}expected ${fmt(actual)} ${what}`); };
  const m = {
    toBeTruthy: () => { if (!actual) fail("to be truthy"); },
    toBe: (e: unknown) => { if (!Object.is(actual, e)) fail(`to be ${fmt(e)}`); },
    toEqual: (e: unknown) => { if (!same(actual, e)) fail(`to equal ${fmt(e)}`); },
    toMatchObject: (e: unknown) => { if (!partial(actual, e)) fail(`to match ${fmt(e)}`); },
    toBeGreaterThan: (e: number) => { if (!(actual > e)) fail(`to be > ${e}`); },
  };
  return {
    ...m,
    rejects: {
      toThrow: async (sub: string) => {
        try { await actual; } catch (e) {
          const text = e instanceof Error ? e.message : String(e);
          if (!text.includes(sub)) throw new Error(`rejection "${text}" does not include "${sub}"`);
          return;
        }
        throw new Error("expected promise to reject");
      },
    },
  };
}

async function conformance() {
  const tests: { name: string; fn: () => Promise<void> }[] = [];
  let suite = "";
  registerStorageConformance(
    { describe: (n, f) => { suite = n; f(); }, it: (n, fn) => { tests.push({ name: `${suite} ${n}`, fn }); }, expect },
    "littletusk opfs",
    async (use) => {
      const t = await openTuskStorage({ dbName: `conf-${crypto.randomUUID()}.sqlite3` });
      try { await use(t.storage); } finally { await t.close({ destroy: true }); }
    },
  );
  const results: { name: string; ok: boolean; error?: string }[] = [];
  for (const t of tests) {
    try { await t.fn(); results.push({ name: t.name, ok: true }); }
    catch (e) { results.push({ name: t.name, ok: false, error: e instanceof Error ? e.message : String(e) }); }
  }
  return { total: results.length, passed: results.filter((r) => r.ok).length, failed: results.filter((r) => !r.ok) };
}

// mode=write: one faux conversation; mode=read: reopen the same db and report what persisted.
async function conversation(write: boolean) {
  const dbName = "selftest-persist.sqlite3";
  const t = await openTuskStorage({ dbName });
  const faux = fauxProvider();
  faux.setResponses([fauxAssistantMessage("Hello from the faux elephant")]);
  const models = createModels();
  models.setProvider(faux.provider);
  const harness = await Harness.open(t.storage, { models, registry: createRegistry() }, BACKGROUND_CONTEXT);
  const model = { provider: faux.models[0].provider, modelId: faux.models[0].id };
  const root = await harness.root(BACKGROUND_CONTEXT, { agent: { model } });
  let answer: string | undefined;
  if (write) {
    const sub = await root.submit({ type: "input", content: "Hi Tusk" }, BACKGROUND_CONTEXT);
    const settled = await sub.wait(BACKGROUND_CONTEXT);
    if (settled.status === "done" && settled.type === "input") {
      const entry = await root.commit((tx) => tx.entry(AssistantEntry, settled.answer), BACKGROUND_CONTEXT);
      answer = JSON.stringify(entry);
    }
  }
  const entries = await t.database.all<{ n: number }>("SELECT count(*) AS n FROM pi_entries");
  await harness.close(BACKGROUND_CONTEXT);
  if (!write) { /* keep file */ }
  return { entryCount: entries[0].n, answer };
}

async function main() {
  try {
    if (mode === "conformance") finish("done", await conformance());
    else if (mode === "write") finish("done", await conversation(true));
    else if (mode === "read") finish("done", await conversation(false));
    else if (mode === "cleanup") {
      const t = await openTuskStorage({ dbName: "selftest-persist.sqlite3" });
      await t.close({ destroy: true });
      finish("done", { cleaned: true });
    }
  } catch (e) {
    finish("error", { error: e instanceof Error ? (e.stack ?? e.message) : String(e) });
  }
}
void main();
