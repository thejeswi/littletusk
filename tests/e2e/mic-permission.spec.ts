import { test, expect } from "./fixtures";

test("Speak without microphone permission opens the permission window and says why", async ({ context, demoUrl, tusk }) => {
  await tusk.configure();
  const page = await context.newPage();
  await page.goto(`${demoUrl}/blank.html`);
  await page.locator("button.tusk").click();
  const popup = context.waitForEvent("page", { predicate: (p) => p.url().includes("pages/setup.html#mic"), timeout: 30_000 });
  await page.locator(".menu button", { hasText: "Speak" }).click();
  const win = await popup;
  await expect(win.locator("#micBtn")).toBeVisible();
  // The person is told what to do even with the chat closed.
  await expect(page.locator(".bubble")).toContainText("permission", { timeout: 10_000 });
});
