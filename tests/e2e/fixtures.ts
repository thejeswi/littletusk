import { test as base, chromium, type BrowserContext, type Page, type Worker } from "@playwright/test";
import { createServer, type Server } from "node:http";
import { readFile } from "node:fs/promises";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve, normalize } from "node:path";
import type { AddressInfo } from "node:net";

const root = resolve(import.meta.dirname, "../..");
// End-to-end tests run the test build (npm run build:e2e): same code plus the scripted fake model.
// LITTLETUSK_SPEECH=1 selects the speech-on variant (npm run build:e2e:speech).
export const speechBuild = process.env.LITTLETUSK_SPEECH === "1";
const dist = join(root, speechBuild ? "dist-e2e-speech" : "dist-e2e");
const demoDir = join(root, "demo");
const types: Record<string, string> = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".json": "application/json" };

export type Step = { text?: string; tools?: { name: string; args?: Record<string, unknown> }[] };

/** Helpers for the extension's storage and the scripted model, run inside the service worker. */
export interface Tusk {
  sw: Worker;
  /** Faux provider + a fake key, merged with `patch`. Call before opening pages. */
  configure(patch?: Record<string, unknown>): Promise<void>;
  /** Replace the scripted model's answers (steps: see src/offscreen/faux.ts). */
  script(steps: Step[]): Promise<void>;
  get(key: string): Promise<unknown>;
  set(key: string, value: unknown): Promise<void>;
  /** Open the chat panel of the overlay on `page`. */
  openChat(page: Page): Promise<void>;
  /** Type into the chat and send. */
  say(page: Page, text: string): Promise<void>;
}

// Usage: import { test, expect } from "./fixtures"; test("...", async ({ context, extensionId, demoUrl, tusk }) => {...})
// Needs `npm run build:e2e` first. Runs headless (new headless supports extensions).
export const test = base.extend<{ extraArgs: string[]; context: BrowserContext; extensionId: string; demoUrl: string; tusk: Tusk }>({
  /** Extra Chromium flags for one spec, e.g. a fake microphone: test.use({ extraArgs: [...] }). */
  extraArgs: [[], { option: true }],
  context: async ({ extraArgs }, use) => {
    const userDataDir = await mkdtemp(join(tmpdir(), "littletusk-"));
    const context = await chromium.launchPersistentContext(userDataDir, {
      channel: "chromium",
      headless: true,
      args: [`--disable-extensions-except=${dist}`, `--load-extension=${dist}`, ...extraArgs],
    });
    await use(context);
    await context.close();
    await rm(userDataDir, { recursive: true, force: true });
  },
  extensionId: async ({ context }, use) => {
    let [sw] = context.serviceWorkers();
    if (!sw) sw = await context.waitForEvent("serviceworker");
    await use(new URL(sw.url()).host);
  },
  tusk: async ({ context, extensionId }, use) => {
    void extensionId;
    let [sw] = context.serviceWorkers();
    if (!sw) sw = await context.waitForEvent("serviceworker");
    const set = (key: string, value: unknown) => sw.evaluate(([k, v]) => chrome.storage.local.set({ [k as string]: v }), [key, value] as const);
    const helpers: Tusk = {
      sw,
      set,
      get: (key) => sw.evaluate(async (k) => (await chrome.storage.local.get(k))[k], key),
      configure: async (patch = {}) => {
        await sw.evaluate(async (p) => {
          const got = (await chrome.storage.local.get("settings")).settings ?? {};
          await chrome.storage.local.set({
            settings: { ...got, provider: "faux", model: "faux-1", strongModel: "faux-1", apiKey: "test-key-0000", setupDone: true, language: "en", mode: "show", monthlyLimit: 0, ...p },
          });
        }, patch);
        await new Promise((r) => setTimeout(r, 400)); // let the agent pick the new settings up
      },
      script: (steps) => set("__faux_script", steps),
      openChat: async (page) => {
        await page.locator("button.tusk").click(); // Tusk always opens the chat
        await page.frameLocator(".compose-frame").locator("#t").waitFor(); // the typing box is its own frame
      },
      say: async (page, text) => {
        const box = page.frameLocator(".compose-frame");
        await box.locator("#t").fill(text);
        await box.locator("#s").click();
      },
    };
    await use(helpers);
  },
  // Base URL of a static server for demo/, e.g. `${demoUrl}/blank.html`.
  // eslint-disable-next-line no-empty-pattern
  demoUrl: async ({}, use) => {
    const server: Server = createServer(async (req, res) => {
      const p = normalize(decodeURIComponent((req.url ?? "/").split("?")[0])).replace(/^(\.\.[/\\])+/, "");
      try {
        const body = await readFile(join(demoDir, p));
        res.writeHead(200, { "content-type": types[p.slice(p.lastIndexOf("."))] ?? "application/octet-stream" });
        res.end(body);
      } catch {
        res.writeHead(404).end("not found");
      }
    });
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
    await use(`http://127.0.0.1:${(server.address() as AddressInfo).port}`);
    server.closeAllConnections();
    await new Promise((r) => server.close(r));
  },
});
export { expect } from "@playwright/test";
