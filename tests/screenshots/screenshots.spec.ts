// Regenerates docs/screenshots/*.png on the local demo pages, with the test build and its scripted fake model
// (no API key, no cost). Run with `npm run screenshots`.
import { chromium, type BrowserContext, type Locator, type Page } from "@playwright/test";
import { createServer } from "node:http";
import { readFile, mkdir, mkdtemp, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve, normalize } from "node:path";
import type { AddressInfo } from "node:net";
import { test as e2e, expect, type Tusk } from "../e2e/fixtures";

const root = resolve(import.meta.dirname, "../..");
const dist = join(root, "dist-e2e");
const out = join(root, "docs/screenshots");
const MAX_BYTES = 400 * 1024;

// Same fixture as the e2e tests, but a sharper screen (deviceScaleFactor 2) and a fixed 1280x800 window.
const test = e2e.extend<{ context: BrowserContext }>({
  // eslint-disable-next-line no-empty-pattern
  context: async ({}, use) => {
    const dir = await mkdtemp(join(tmpdir(), "littletusk-shots-"));
    const context = await chromium.launchPersistentContext(dir, {
      channel: "chromium",
      headless: true,
      viewport: { width: 1280, height: 800 },
      deviceScaleFactor: 2,
      args: [`--disable-extensions-except=${dist}`, `--load-extension=${dist}`],
    });
    await use(context);
    await context.close();
    await rm(dir, { recursive: true, force: true });
  },
});

const CLOSE = "@find:✕";
type Clip = { x: number; y: number; width: number; height: number };

async function shot(page: Page, name: string, clip?: Clip) {
  await mkdir(out, { recursive: true });
  const path = join(out, name);
  await page.screenshot({ path, clip, animations: "disabled", caret: "hide" });
  expect((await stat(path)).size, `${name} is small enough`).toBeLessThan(MAX_BYTES);
}

/** The page must not scroll sideways. */
async function noSideScroll(page: Page) {
  const w = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, inner: window.innerWidth }));
  expect(w.scroll, `no horizontal overflow (${w.scroll} > ${w.inner})`).toBeLessThanOrEqual(w.inner);
}

/** The shop page without the newsletter box, for scenes that are not about it. */
async function openShopQuiet(page: Page, demoUrl: string) {
  await page.addInitScript(() => window.addEventListener("DOMContentLoaded", () => document.getElementById("nl")?.remove()));
  await page.goto(`${demoUrl}/shop.html`);
  await expect(page.locator("button.tusk")).toBeVisible();
}

/** Open the chat, say something, wait for `done`, close the chat again. */
async function ask(tusk: Tusk, page: Page, text: string, done: Locator, keepOpen = false) {
  await tusk.openChat(page);
  await tusk.say(page, text);
  await expect(done).toBeVisible({ timeout: 20_000 });
  if (!keepOpen) await page.locator(".panel:not([hidden]) .x").click();
}

const settle = (page: Page, ms = 1200) => page.waitForTimeout(ms); // Tusk walks for 0.6 s

test.beforeEach(async ({ tusk }) => {
  await tusk.configure({ monthlyLimit: 10, currency: "EUR" });
});

test("01 Tusk on the page", async ({ context, demoUrl }) => {
  const page = await context.newPage();
  await openShopQuiet(page, demoUrl);
  await settle(page);
  await shot(page, "01-tusk-on-page.png");
});

test("02 a click on Tusk opens the chat", async ({ context, demoUrl }) => {
  const page = await context.newPage();
  await openShopQuiet(page, demoUrl);
  await page.locator("button.tusk").click();
  await expect(page.frameLocator(".compose-frame").locator("#t")).toBeVisible();
  await settle(page, 600);
  await shot(page, "02-chat-open.png");
});

test("03 pointing at the tiny cross", async ({ context, demoUrl, tusk }) => {
  await tusk.script([
    { tools: [{ name: "read_page" }] },
    { tools: [{ name: "point_at", args: { id: CLOSE, say: "This box is just an ad. The little ✕ I've lit up closes it." } }] },
    { text: "The little ✕ in the corner of the box closes it." },
  ]);
  const page = await context.newPage();
  await page.goto(`${demoUrl}/shop.html`);
  await expect(page.locator("#nl.open")).toBeVisible();
  await ask(tusk, page, "this box won't close", page.locator(".chip", { hasText: "Pointed at" }));
  await expect(page.locator(".hl")).toBeVisible();
  await settle(page, 1500);
  await shot(page, "03-pointing.png");
});

const CHAT_SCRIPT = [
  { tools: [{ name: "read_page" }] },
  { tools: [{ name: "point_at", args: { id: CLOSE, say: "This box is just an ad. The little ✕ I've lit up closes it." } }] },
  { tools: [{ name: "offer_to_do_it", args: { text: "Shall I do it for you?" } }] },
  { tools: [{ name: "click", args: { id: CLOSE } }] },
  { text: "Done, the box is closed. The shop is all yours." },
];

test("04 chat with the list of actions + 13 narrow", async ({ context, demoUrl, tusk }) => {
  await tusk.script(CHAT_SCRIPT);
  const page = await context.newPage();
  await page.goto(`${demoUrl}/shop.html`);
  await expect(page.locator("#nl.open")).toBeVisible();
  await tusk.openChat(page);
  await tusk.say(page, "the box on this page won't close");
  const offer = page.locator(".q", { hasText: "Shall I do it for you?" });
  await expect(offer).toBeVisible({ timeout: 20_000 });
  await offer.locator(".btn.yes").click();
  await expect(page.locator(".msg.tusk", { hasText: "Done, the box is closed" })).toBeVisible({ timeout: 20_000 });
  await expect(page.locator(".chip", { hasText: "Closed the popup" })).toBeVisible();
  await expect(page.locator("#nl.open")).toHaveCount(0);
  await settle(page);
  await noSideScroll(page);
  await shot(page, "04-chat-actions.png", { x: 400, y: 0, width: 880, height: 800 });

  // the same conversation in a phone-sized window
  await page.setViewportSize({ width: 360, height: 740 });
  await settle(page);
  await expect(page.locator(".panel:not([hidden])")).toBeVisible();
  await noSideScroll(page);
  const box = await page.locator(".panel:not([hidden])").boundingBox();
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual(360);
  await shot(page, "13-narrow.png");
});

test("05 spotlight", async ({ context, demoUrl, tusk }) => {
  await tusk.script([
    { tools: [{ name: "read_page" }] },
    { tools: [{ name: "spotlight", args: { id: "@find:textbox \"Zählerstand", say: "Type the number from your meter here. It is the row of digits on the front." } }] },
    { text: "Type the digits from your meter into the lit-up box." },
  ]);
  const page = await context.newPage();
  await page.goto(`${demoUrl}/form.html`);
  await ask(tusk, page, "I need to send my electricity reading", page.locator(".chip", { hasText: "Pointed at" }));
  await expect(page.locator(".dim")).toBeVisible();
  await settle(page, 1500);
  await shot(page, "05-spotlight.png");
});

test("06 confirmation before buying", async ({ context, demoUrl, tusk }) => {
  await tusk.configure({ mode: "look-after", monthlyLimit: 10, currency: "EUR" });
  await tusk.script([
    { tools: [{ name: "read_page" }] },
    { tools: [{ name: "ask_confirmation", args: { question: "Shall I buy the garden chair “Linde” for 39,90 EUR? I can't undo this." } }] },
    { text: "Okay." },
  ]);
  const page = await context.newPage();
  await openShopQuiet(page, demoUrl);
  await ask(tusk, page, "please buy the chair", page.locator(".q"), true);
  await page.reload(); // chat closed, the question is still waiting: Tusk asks out loud
  await expect(page.locator(".bubble .btn.yes")).toBeVisible({ timeout: 15_000 });
  await settle(page);
  await shot(page, "06-confirm.png");
});

test("07 look after me, cookie banner", async ({ context, demoUrl, tusk }) => {
  await tusk.configure({ mode: "look-after", monthlyLimit: 10, currency: "EUR" });
  const page = await context.newPage();
  await page.goto(`${demoUrl}/cookies.html`);
  await expect(page.locator(".bubble .btn.yes")).toBeVisible({ timeout: 10_000 });
  await settle(page, 1500);
  await shot(page, "07-look-after-cookies.png");
});

test("14 look after me, a scam email", async ({ context, demoUrl, tusk }) => {
  await tusk.configure({ mode: "look-after", monthlyLimit: 10, currency: "EUR" });
  const page = await context.newPage();
  await page.goto(`${demoUrl}/webmail.html`);
  await expect(page.locator(".bubble .btn.yes")).toBeVisible({ timeout: 10_000 });
  await settle(page, 1500);
  await shot(page, "14-scam-warning.png");
});

test("08 a secret field: the person types it", async ({ context, demoUrl, tusk }) => {
  await tusk.script([
    { tools: [{ name: "read_page" }] },
    { tools: [{ name: "ask_person_to_type", args: { id: "@find:Kundenkennwort", say: "This is your password. Please type it yourself, I never see it." } }] },
    { text: "I have marked the password box for you." },
  ]);
  const page = await context.newPage();
  await page.goto(`${demoUrl}/form.html`);
  await ask(tusk, page, "please log me in", page.locator(".chip", { hasText: "Asked you to type" }));
  await expect(page.locator(".ask-frame")).toBeVisible();
  await settle(page, 1500);
  await shot(page, "08-secret-field.png");
});

test("09 settings", async ({ context, demoUrl }) => {
  const page = await context.newPage();
  await openShopQuiet(page, demoUrl);
  await page.locator("button.tusk").click();
  await page.locator(".head-btn", { hasText: "Settings" }).click();
  await expect(page.locator(".panel:not([hidden])")).toBeVisible();
  await settle(page, 600);
  // everything in the settings popover is visible without scrolling
  const fits = await page.evaluate(() => {
    const set = document.querySelector("[data-littletusk=overlay]")!.shadowRoot!.querySelector(".panel:not([hidden]) .set") as HTMLElement;
    return set.scrollHeight - set.clientHeight;
  });
  expect(fits, "settings need no scrolling at 800px height").toBeLessThanOrEqual(0);
  await shot(page, "09-settings.png", { x: 480, y: 0, width: 800, height: 800 });
});

test("10 Spanish: the same scene in another language", async ({ context, demoUrl, tusk }) => {
  await tusk.configure({ language: "es", monthlyLimit: 10, currency: "EUR" });
  await tusk.script([
    { tools: [{ name: "read_page" }] },
    { tools: [{ name: "point_at", args: { id: CLOSE, say: "Esta ventana es solo publicidad. La crucecita que he iluminado la cierra." } }] },
    { tools: [{ name: "offer_to_do_it", args: { text: "¿Lo hago por usted?" } }] },
    { tools: [{ name: "click", args: { id: CLOSE } }] },
    { text: "Listo, la ventana está cerrada. La tienda es toda suya." },
  ]);
  const page = await context.newPage();
  await page.goto(`${demoUrl}/shop.html`);
  await expect(page.locator("#nl.open")).toBeVisible();
  await tusk.openChat(page);
  await tusk.say(page, "esta ventana no se cierra");
  const offer = page.locator(".q", { hasText: "¿Lo hago por usted?" });
  await expect(offer).toBeVisible({ timeout: 20_000 });
  await offer.locator(".btn.yes").click();
  await expect(page.locator(".msg.tusk", { hasText: "Listo" })).toBeVisible({ timeout: 20_000 });
  await settle(page);
  await shot(page, "10-languages.png", { x: 400, y: 0, width: 880, height: 800 });
});

test("11 family settings page", async ({ context, extensionId, tusk }) => {
  await tusk.configure({ provider: "anthropic", model: "claude-haiku-5-5", strongModel: "claude-sonnet-5-5", apiKey: "sk-ant-example-0000", monthlyLimit: 10, name: "Ayşe" });
  const page = await context.newPage();
  await page.setViewportSize({ width: 760, height: 900 });
  await page.goto(`chrome-extension://${extensionId}/pages/setup.html`);
  await expect(page.locator("#form")).toBeVisible();
  await noSideScroll(page);
  await mkdir(out, { recursive: true });
  const path = join(out, "11-family-settings.png");
  await page.screenshot({ path, fullPage: true });
  expect((await stat(path)).size).toBeLessThan(MAX_BYTES);
});

test("12 setup link", async ({ context, extensionId }) => {
  const cfg = { v: 1, provider: "anthropic", apiKey: "sk-ant-example-a1b2", language: "en", mode: "look-after", monthlyLimit: 10, currency: "EUR", name: "Ayşe" };
  const fragment = "#lt=" + Buffer.from(JSON.stringify(cfg)).toString("base64url");
  const types: Record<string, string> = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml" };
  const server = createServer(async (req, res) => {
    const p = normalize(decodeURIComponent((req.url ?? "/").split("?")[0])).replace(/^(\.\.[/\\])+/, "");
    try {
      const body = await readFile(join(root, p));
      res.writeHead(200, { "content-type": types[p.slice(p.lastIndexOf("."))] ?? "application/octet-stream" });
      res.end(body);
    } catch { res.writeHead(404).end("not found"); }
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  try {
    const page = await context.newPage();
    await page.setViewportSize({ width: 800, height: 560 });
    await page.goto(`http://127.0.0.1:${(server.address() as AddressInfo).port}/site/setup.html${fragment}`);
    await page.waitForURL(new RegExp(`^chrome-extension://${extensionId}/pages/setup\\.html`), { timeout: 10_000 });
    await expect(page.locator("#app")).toHaveAttribute("data-view", "confirm");
    await noSideScroll(page);
    await shot(page, "12-setup-link.png", { x: 0, y: 0, width: 800, height: 560 });
  } finally {
    server.closeAllConnections();
    await new Promise((r) => server.close(r));
  }
});
