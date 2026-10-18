import { test as base, chromium, type BrowserContext } from "@playwright/test";
import { createServer, type Server } from "node:http";
import { readFile } from "node:fs/promises";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve, normalize } from "node:path";
import type { AddressInfo } from "node:net";

const root = resolve(import.meta.dirname, "../..");
const dist = join(root, "dist");
const demoDir = join(root, "demo");
const types: Record<string, string> = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".json": "application/json" };

// Usage: import { test, expect } from "./fixtures"; test("...", async ({ context, extensionId, demoUrl }) => {...})
// Needs `npm run build` first. Runs headless (new headless supports extensions).
export const test = base.extend<{ context: BrowserContext; extensionId: string; demoUrl: string }>({
  // eslint-disable-next-line no-empty-pattern
  context: async ({}, use) => {
    const userDataDir = await mkdtemp(join(tmpdir(), "littletusk-"));
    const context = await chromium.launchPersistentContext(userDataDir, {
      channel: "chromium",
      headless: true,
      args: [`--disable-extensions-except=${dist}`, `--load-extension=${dist}`],
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
