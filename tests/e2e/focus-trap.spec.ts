import { test, expect } from "./fixtures";

test("typing to Tusk works on a page whose consent dialog traps focus and swallows keys", async ({ context, demoUrl, tusk }) => {
  await tusk.configure();
  await tusk.script([{ text: "I can read you." }]);
  const page = await context.newPage();
  await page.goto(`${demoUrl}/consent-dialog.html`);
  await page.locator("button.tusk").click();
  const box = page.frameLocator(".compose-frame").locator("#t");
  await box.click(); // a real click, then real key presses, as a person would
  await page.keyboard.type("hello kfm", { delay: 20 });
  await expect(box).toHaveValue("hello kfm");
  await page.keyboard.press("Enter");
  await expect(page.locator(".msg.user")).toHaveText("hello kfm", { timeout: 15_000 });
  await expect(page.locator(".msg.tusk", { hasText: "I can read you." })).toBeVisible({ timeout: 20_000 });
});
