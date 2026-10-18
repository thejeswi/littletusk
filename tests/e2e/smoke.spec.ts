import { test, expect } from "./fixtures";

test("service worker starts and the content script runs on a demo page", async ({ context, extensionId, demoUrl }) => {
  expect(extensionId).toMatch(/^[a-p]{32}$/);
  const page = await context.newPage();
  await page.goto(`${demoUrl}/blank.html`);
  await expect(page.locator("html")).toHaveAttribute("data-littletusk", "ready");
});
