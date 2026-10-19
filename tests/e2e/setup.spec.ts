import { test, expect } from "./fixtures";
import { FEATURES } from "../../src/shared/features";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { join, resolve, normalize } from "node:path";
import type { AddressInfo } from "node:net";

const root = resolve(import.meta.dirname, "../..");
const types: Record<string, string> = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml" };
const cfg = { v: 1, provider: "anthropic", apiKey: "sk-ant-test-a1b2", language: "de", mode: "look-after", monthlyLimit: 7, currency: "EUR", name: "Ayse" };
const fragment = "#lt=" + Buffer.from(JSON.stringify(cfg)).toString("base64url");

test("setup link opens the extension setup page and saves on yes", async ({ context, extensionId }) => {
  // The site is served by a second static server (the fixture only serves demo/).
  const server = createServer(async (req, res) => {
    const p = normalize(decodeURIComponent((req.url ?? "/").split("?")[0])).replace(/^(\.\.[/\\])+/, "");
    try {
      const body = await readFile(join(root, p));
      res.writeHead(200, { "content-type": types[p.slice(p.lastIndexOf("."))] ?? "application/octet-stream" });
      res.end(body);
    } catch { res.writeHead(404).end("not found"); }
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const port = (server.address() as AddressInfo).port;
  try {
    const page = await context.newPage();
    await page.goto(`http://127.0.0.1:${port}/site/setup.html${fragment}`);
    await page.waitForURL(new RegExp(`^chrome-extension://${extensionId}/pages/setup\\.html`), { timeout: 10000 });
    await expect(page.locator("#app")).toHaveAttribute("data-view", "confirm");
    await expect(page.locator("#s-key")).toHaveText("sk-…a1b2");
    await expect(page.locator("#s-limit")).toHaveText("7 EUR");
    expect(page.url()).not.toContain("#lt=");
    await page.locator("#yes").click();
    // After "yes": the microphone step when speaking to Tusk is on, otherwise straight to the done message.
    await expect(page.locator("#app")).toHaveAttribute("data-view", FEATURES.speechInput ? "mic" : "done");
    await expect(page.locator("#doneMsg")).toBeVisible();
    await expect(page.locator("#micBtn")).toHaveCount(FEATURES.speechInput ? 1 : 0);
    const stored = await page.evaluate(async () => (await chrome.storage.local.get("settings")).settings);
    expect(stored).toMatchObject({ provider: "anthropic", apiKey: cfg.apiKey, language: "de", mode: "look-after", monthlyLimit: 7, setupDone: true });
  } finally {
    server.closeAllConnections();
    await new Promise((r) => server.close(r));
  }
});

test("family settings form saves and builds a link", async ({ context, extensionId }) => {
  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/pages/setup.html`);
  await page.locator("#key").fill("sk-ant-form-key-9999");
  await page.locator("#save").click();
  await expect(page.locator("#saveMsg")).toHaveClass("ok");
  const stored = (await page.evaluate(async () => (await chrome.storage.local.get("settings")).settings)) as { apiKey: string };
  expect(stored.apiKey).toBe("sk-ant-form-key-9999");
  await expect(page.locator("#micBtn")).toHaveCount(FEATURES.speechInput ? 1 : 0); // no microphone section while speech is off
  await page.locator("#makeLink").click();
  await expect(page.locator("#linkOut")).toContainText("https://thejeswi.github.io/littletusk/setup.html#lt=");
});
