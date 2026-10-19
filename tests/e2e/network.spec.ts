// The privacy claim as a test: Tusk talks to nobody except the model provider the family chose.
//  A. dynamic: with the scripted model, a chat contacts only the local demo server and the extension itself.
//  B. static: the source has no URL literal outside a short, explained allowlist, and no fetch/XHR/WebSocket to a literal URL.
//  C. a real provider (Anthropic, fake key, canned answer): the request goes only to api.anthropic.com, carries the key
//     only in the x-api-key header, and the body holds no password-field value.
import { test, expect } from "./fixtures";
import { freePort, spyExtension } from "./cdp-net";
import { readdirSync, readFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";

const root = resolve(import.meta.dirname, "../..");
const cdpPort = await freePort();
// Opens Chrome's DevTools port so the spy can see the offscreen document and the service worker (not visible to Playwright).
test.use({ extraArgs: [`--remote-debugging-port=${cdpPort}`] });
const FAKE_KEY = "sk-" + "ant-" + "fake-network-test-0000";

const isLocalOrExtension = (u: string, demoHost: string) => {
  const x = new URL(u);
  if (["chrome-extension:", "data:", "blob:", "about:"].includes(x.protocol)) return true;
  return x.protocol === "http:" && x.host === demoHost;
};

test("A. a chat contacts only the demo server and the extension", async ({ context, demoUrl, tusk }) => {
  const spy = await spyExtension(cdpPort); // offscreen document, service worker and their workers
  const seen: string[] = [];
  context.on("request", (r) => seen.push(r.url())); // every page in the context, and the service worker
  await tusk.configure();
  await tusk.script([{ tools: [{ name: "read_page" }] }, { text: "Done." }]);
  const page = await context.newPage();
  await page.goto(`${demoUrl}/shop.html`);
  await tusk.openChat(page);
  await tusk.say(page, "what is on this page?");
  await expect(page.locator(".msg.tusk", { hasText: "Done." })).toBeVisible({ timeout: 20_000 });
  spy.close();
  expect(seen.length).toBeGreaterThan(0);
  const demoHost = new URL(demoUrl).host;
  expect(seen.filter((u) => !isLocalOrExtension(u, demoHost)), "requests to third parties").toEqual([]);
  // With the scripted model the agent makes no network calls, so the proof that the spy is watching is where it is attached.
  const watched = spy.watching();
  expect(watched.some((u) => u.endsWith("/pages/offscreen.html")), `the spy watches the offscreen document, where the agent runs (watching: ${watched.join(", ")})`).toBe(true);
  expect(watched.some((u) => u.endsWith("/background.js")), "the spy watches the service worker").toBe(true);
  expect(spy.requests.map((r) => r.url).filter((u) => !isLocalOrExtension(u, demoHost)), "extension requests to third parties").toEqual([]);
});

// ---------- B ----------
function tsFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? tsFiles(join(dir, e.name)) : e.name.endsWith(".ts") ? [join(dir, e.name)] : []));
}
/** Every URL literal in src, with the reason it may be there. */
const URL_ALLOW: [RegExp, string][] = [
  [/^http:\/\/www\.w3\.org\/2000\/svg$/, "SVG namespace, not a request"],
  [/^https:\/\/thejeswi\.github\.io\/littletusk\/(setup|voices)\.html/, "the project's static pages: the family's setup link and the voices help page (links a person opens; the pages are static)"],
  [/^https:\/\/(console\.anthropic\.com|platform\.openai\.com|aistudio\.google\.com|console\.mistral\.ai|openrouter\.ai|platform\.deepseek\.com)\//, "key help link shown to the family (src/shared/providers.ts), opened by a click only"],
];
test("B. source has no unexplained URL and no fetch to a literal URL", () => {
  const files = tsFiles(join(root, "src"));
  const literal = /["'`](https?:\/\/[^"'`\s]*)/g;
  const unexplained: string[] = [];
  const calls: string[] = [];
  for (const f of files) {
    const text = readFileSync(f, "utf8");
    for (const m of text.matchAll(literal)) if (!URL_ALLOW.some(([re]) => re.test(m[1]))) unexplained.push(`${relative(root, f)}: ${m[1]}`);
    // network calls with a literal URL (provider API hosts live inside pi-ai, not here)
    for (const m of text.matchAll(/\b(fetch\s*\(|new\s+XMLHttpRequest|new\s+WebSocket\s*\(|new\s+EventSource\s*\(|sendBeacon\s*\()\s*["'`]?/g)) calls.push(`${relative(root, f)}: ${m[0]}`);
  }
  expect(unexplained).toEqual([]);
  // Any fetch(...) in src would be a new network path: none exists, and a new one must be reviewed here.
  expect(calls).toEqual([]);
});

// ---------- C ----------
function sse(events: [string, unknown][]): string {
  return events.map(([e, d]) => `event: ${e}\ndata: ${JSON.stringify(d)}\n\n`).join("");
}
const usage = { input_tokens: 10, output_tokens: 5 };
function message(content: unknown, stop: string, blockEvents: [string, unknown][]): string {
  return sse([
    ["message_start", { type: "message_start", message: { id: "msg_test", type: "message", role: "assistant", model: "claude-haiku-5-5", content: [], stop_reason: null, usage } }],
    ...blockEvents,
    ["message_delta", { type: "message_delta", delta: { stop_reason: stop, stop_sequence: null }, usage: { output_tokens: 5 } }],
    ["message_stop", { type: "message_stop" }],
  ]);
}
const toolTurn = message(null, "tool_use", [
  ["content_block_start", { type: "content_block_start", index: 0, content_block: { type: "tool_use", id: "toolu_test", name: "read_page", input: {} } }],
  ["content_block_delta", { type: "content_block_delta", index: 0, delta: { type: "input_json_delta", partial_json: "{}" } }],
  ["content_block_stop", { type: "content_block_stop", index: 0 }],
]);
const textTurn = message(null, "end_turn", [
  ["content_block_start", { type: "content_block_start", index: 0, content_block: { type: "text", text: "" } }],
  ["content_block_delta", { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "This is a form for a meter reading." } }],
  ["content_block_stop", { type: "content_block_stop", index: 0 }],
]);

test("C. a real provider request goes only to the provider, key only in the header, no password value", async ({ context, demoUrl, tusk }) => {
  const demoHost = new URL(demoUrl).host;
  const spy = await spyExtension(cdpPort, {
    intercept: {
      urlPrefix: "https://api.anthropic.com/",
      respond: (n) => ({ status: 200, headers: { "content-type": "text/event-stream", "access-control-allow-origin": "*" }, body: n === 1 ? toolTurn : textTurn }),
    },
  });
  await tusk.configure({ provider: "anthropic", model: "claude-haiku-5-5", strongModel: "claude-sonnet-5-5", apiKey: FAKE_KEY });
  const page = await context.newPage();
  await page.goto(`${demoUrl}/form.html`);
  const secret = "hunter2-" + "not-for-the-model";
  await page.locator('input[type="password"]').fill(secret);
  await page.locator('input[name="kundennummer"]').fill("4711-0815");
  await tusk.openChat(page);
  await tusk.say(page, "what is this page?");
  await expect(page.locator(".msg.tusk", { hasText: "meter reading" })).toBeVisible({ timeout: 30_000 });
  spy.close();

  const calls = spy.requests.filter((r) => r.url.startsWith("https://api.anthropic.com/"));
  expect(calls.length).toBeGreaterThanOrEqual(2); // the question, then the answer to read_page
  for (const c of calls) {
    const lower = Object.fromEntries(Object.entries(c.headers).map(([k, v]) => [k.toLowerCase(), v]));
    expect(lower["x-api-key"]).toBe(FAKE_KEY);
    expect(JSON.stringify({ ...lower, "x-api-key": "" })).not.toContain(FAKE_KEY); // the key is in no other header
    expect(c.url).not.toContain(FAKE_KEY);
    expect(c.body).not.toContain(FAKE_KEY);
    expect(c.body).not.toContain(secret);
  }
  // The second request carries what read_page returned: the page is really in there, the password is not.
  expect(calls[1].body).toContain("Zählerstand");
  expect(calls[1].body).toContain("4711-0815"); // ordinary fields are shared
  // Nothing else left the extension.
  expect(spy.requests.map((r) => r.url).filter((u) => !isLocalOrExtension(u, demoHost) && !u.startsWith("https://api.anthropic.com/"))).toEqual([]);
});
