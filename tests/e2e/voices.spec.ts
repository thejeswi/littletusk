import { test, expect } from "./fixtures";

// This computer reports no voice for the language (the test browser has no voices at all): Tusk does not
// offer a "Read aloud" switch or a Test voice button that can only fail, and says nothing about it in the chat.
test("no voice here: Read aloud and Test voice are gone from Tusk's settings", async ({ page, demoUrl, tusk }) => {
  await tusk.configure();
  await page.goto(`${demoUrl}/blank.html`);
  await expect(page.locator("button.tusk")).toBeVisible();
  await page.locator("button.tusk").click();
  await page.locator(".head-btn", { hasText: "Settings" }).click();
  await expect(page.locator(".panel .set")).toBeVisible();
  await expect(page.locator(".speak-row")).toBeHidden();
  await expect(page.locator(".voice-line")).toBeHidden();
});
