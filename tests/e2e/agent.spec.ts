import { test, expect } from "./fixtures";

const CLOSE = "@find:✕";
const popupOpen = (page: import("@playwright/test").Page) => page.locator("#nl.open");

test.describe("Tusk with a scripted model", () => {
  test("a. overlay, menu, chat; points at the close button and does not click it", async ({ context, demoUrl, tusk }) => {
    await tusk.configure();
    await tusk.script([
      { tools: [{ name: "read_page" }] },
      { tools: [{ name: "point_at", args: { id: CLOSE, say: "Here is the small cross." } }] },
      { text: "The small cross in the top corner closes the box." },
    ]);
    const page = await context.newPage();
    await page.goto(`${demoUrl}/shop.html`);
    await expect(page.locator("button.tusk")).toBeVisible();
    await page.locator("button.tusk").click();
    await expect(page.locator(".menu button")).toHaveText([/Chat/, /Speak/, /Settings/]);
    await page.locator(".menu button", { hasText: "Chat" }).click();
    await expect(popupOpen(page)).toBeVisible();
    await tusk.say(page, "the box won't close");
    await expect(page.locator(".msg.user")).toHaveText("the box won't close");
    await expect(page.locator(".msg.tusk", { hasText: "small cross" })).toBeVisible({ timeout: 20_000 });
    await expect(page.locator(".chip", { hasText: "Looked at the page" })).toBeVisible();
    await expect(page.locator(".chip", { hasText: "Pointed at" })).toBeVisible();
    await expect(page.locator(".hl")).toBeVisible();
    await expect(popupOpen(page)).toBeVisible(); // show mode: Tusk only pointed
  });

  test("b. show mode blocks clicking until an offer is accepted", async ({ context, demoUrl, tusk }) => {
    await tusk.configure();
    await tusk.script([
      { tools: [{ name: "read_page" }] },
      { tools: [{ name: "click", args: { id: CLOSE } }] }, // blocked
      { tools: [{ name: "offer_to_do_it", args: { text: "Shall I close it for you?" } }] },
      { tools: [{ name: "click", args: { id: CLOSE } }] },
      { text: "I closed the box." },
    ]);
    const page = await context.newPage();
    await page.goto(`${demoUrl}/shop.html`);
    await expect(popupOpen(page)).toBeVisible();
    await tusk.openChat(page);
    await tusk.say(page, "please help");
    const offer = page.locator(".q", { hasText: "Shall I close it for you?" });
    await expect(offer).toBeVisible({ timeout: 20_000 });
    await expect(popupOpen(page)).toBeVisible(); // the click was blocked
    await offer.locator(".btn.yes").click();
    await expect(page.locator(".msg.tusk", { hasText: "I closed the box." })).toBeVisible({ timeout: 20_000 });
    await expect(popupOpen(page)).toHaveCount(0);
  });

  test("c. an irreversible button needs a yes: No buys nothing", async ({ context, demoUrl, tusk }) => {
    await tusk.configure({ mode: "look-after" });
    await tusk.script([
      { tools: [{ name: "read_page" }] },
      { tools: [{ name: "click", args: { id: "@find:Jetzt kaufen" } }] }, // blocked in code
      { tools: [{ name: "ask_confirmation", args: { question: "Buy the chair for 39,90 EUR?" } }] },
      { text: "Okay, I did not buy anything." },
    ]);
    const page = await context.newPage();
    await page.goto(`${demoUrl}/shop.html`);
    await tusk.openChat(page);
    await tusk.say(page, "buy the chair");
    const q = page.locator(".q", { hasText: "Buy the chair" });
    await expect(q).toBeVisible({ timeout: 20_000 });
    await expect(page.locator("#msg")).toHaveText("");
    await q.locator(".btn.no").click();
    await expect(page.locator(".msg.tusk", { hasText: "did not buy" })).toBeVisible({ timeout: 20_000 });
    await expect(page.locator("#msg")).toHaveText("");
  });

  test("c2. after a Yes the same button works exactly once", async ({ context, demoUrl, tusk }) => {
    await tusk.configure({ mode: "look-after" });
    await tusk.script([
      { tools: [{ name: "read_page" }] },
      { tools: [{ name: "ask_confirmation", args: { question: "Buy the chair for 39,90 EUR?" } }] },
      { tools: [{ name: "click", args: { id: "@find:Jetzt kaufen" } }] },
      { tools: [{ name: "click", args: { id: "@find:Jetzt kaufen" } }] }, // the yes is used up
      { text: "Done." },
    ]);
    const page = await context.newPage();
    await page.goto(`${demoUrl}/shop.html`);
    await page.evaluate(() => {
      (window as any).__buys = 0;
      document.addEventListener("click", (e) => { if ((e.target as HTMLElement).textContent === "Jetzt kaufen") (window as any).__buys++; }, true);
    });
    await tusk.openChat(page);
    await tusk.say(page, "buy the chair");
    const q = page.locator(".q", { hasText: "Buy the chair" });
    await expect(q).toBeVisible({ timeout: 20_000 });
    await q.locator(".btn.yes").click();
    await expect(page.locator(".msg.tusk", { hasText: "Done." })).toBeVisible({ timeout: 20_000 });
    await expect(page.locator("#msg")).toContainText("Danke");
    expect(await page.evaluate(() => (window as any).__buys)).toBe(1);
    // the second click was refused: the yes is used up
    await expect(page.locator(".chip", { hasText: "Clicked" })).toHaveCount(2);
    await expect(page.locator(".chip", { hasText: "⚠️" })).toHaveCount(1);
  });

  test("d. the model cannot type into a password field", async ({ context, demoUrl, tusk }) => {
    await tusk.configure({ mode: "look-after" });
    await tusk.script([
      { tools: [{ name: "read_page" }] },
      { tools: [{ name: "type_text", args: { id: "@find:Kundenkennwort", text: "hunter2" } }] },
      { text: "I cannot type in the password box. Please type it yourself." },
    ]);
    const page = await context.newPage();
    await page.goto(`${demoUrl}/form.html`);
    await tusk.openChat(page);
    await tusk.say(page, "log me in");
    await expect(page.locator(".msg.tusk", { hasText: "cannot type" })).toBeVisible({ timeout: 20_000 });
    expect(await page.locator("input[type=password]").inputValue()).toBe("");
    await expect(page.locator(".chip", { hasText: "Typed into" })).toContainText("⚠️");
  });

  test("e. the conversation survives a page reload and a restart of the offscreen document", async ({ context, demoUrl, tusk }) => {
    await tusk.configure();
    await tusk.script([{ text: "I remember this chat." }]);
    const page = await context.newPage();
    await page.goto(`${demoUrl}/blank.html`);
    await tusk.openChat(page);
    await tusk.say(page, "remember me");
    await expect(page.locator(".msg.tusk", { hasText: "I remember this chat." })).toBeVisible({ timeout: 20_000 });

    await page.reload();
    await tusk.openChat(page);
    await expect(page.locator(".msg.user", { hasText: "remember me" })).toBeVisible({ timeout: 15_000 });
    await expect(page.locator(".msg.tusk", { hasText: "I remember this chat." })).toBeVisible();

    await tusk.sw.evaluate(() => chrome.offscreen.closeDocument());
    await page.waitForTimeout(500);
    await page.reload(); // the page asks for the chat; the service worker starts a new offscreen document
    await tusk.openChat(page);
    await expect(page.locator(".msg.user", { hasText: "remember me" })).toBeVisible({ timeout: 30_000 });
    await expect(page.locator(".msg.tusk", { hasText: "I remember this chat." })).toBeVisible();
  });

  test("f. look after me: offers to close a cookie banner without any model call", async ({ context, demoUrl, tusk }) => {
    await tusk.configure({ mode: "look-after" });
    const page = await context.newPage();
    await page.goto(`${demoUrl}/cookies.html`);
    await page.evaluate(() => {
      (window as any).__clicked = [];
      document.addEventListener("click", (e) => (window as any).__clicked.push((e.target as HTMLElement).id), true);
    });
    const bubble = page.locator(".bubble");
    await expect(bubble).toContainText("cookie", { timeout: 10_000 });
    expect(await tusk.get("__faux_calls")).toBeUndefined();
    await bubble.locator(".btn.yes").click();
    await expect(page.locator("#cb.gone")).toHaveCount(1);
    expect(await page.evaluate(() => (window as any).__clicked)).toContain("nec");
    expect(await tusk.get("__faux_calls")).toBeUndefined();
    await tusk.openChat(page);
    await expect(page.locator(".chip", { hasText: "Closed the popup" })).toBeVisible({ timeout: 10_000 });
  });

  test("g. over the monthly limit: a notice and no model call", async ({ context, demoUrl, tusk }) => {
    await tusk.configure({ monthlyLimit: 1 });
    await tusk.set("__spend_seed", 5);
    await tusk.script([{ text: "You should never see this." }]);
    const page = await context.newPage();
    await page.goto(`${demoUrl}/blank.html`);
    await tusk.openChat(page);
    await tusk.say(page, "hello");
    await expect(page.locator(".notice", { hasText: "monthly limit" })).toBeVisible({ timeout: 15_000 });
    expect(await tusk.get("__faux_calls")).toBeUndefined();
    await expect(page.locator(".msg.tusk", { hasText: "never see this" })).toHaveCount(0);
  });

  test("no key: a plain notice", async ({ context, demoUrl, tusk }) => {
    await tusk.configure({ provider: "anthropic", apiKey: "" });
    const page = await context.newPage();
    await page.goto(`${demoUrl}/blank.html`);
    await tusk.openChat(page);
    await tusk.say(page, "hello");
    await expect(page.locator(".notice", { hasText: "ask your family" })).toBeVisible({ timeout: 15_000 });
  });
});
