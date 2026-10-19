import { test, expect, speechBuild } from "./fixtures";

test.skip(!speechBuild, "Speaking to Tusk is off in this build (npm run e2e:speech builds the speech variant).");

test("@speech Speak without microphone permission opens the permission window and says why", async ({ context, demoUrl, tusk }) => {
  await tusk.configure();
  const page = await context.newPage();
  await page.goto(`${demoUrl}/blank.html`);
  await page.locator("button.tusk").click();
  const popup = context.waitForEvent("page", { predicate: (p) => p.url().includes("pages/setup.html#mic"), timeout: 30_000 });
  await page.locator(".compose .mic").click(); // the microphone button in the chat
  const win = await popup;
  await expect(win.locator("#micBtn")).toBeVisible();
  // The person is told what to do, in the chat they started speaking from.
  await expect(page.locator(".panel .list")).toContainText("permission", { timeout: 10_000 });
});
