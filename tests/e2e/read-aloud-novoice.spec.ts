import { test, expect } from "./fixtures";
test("read-aloud with no voice leaves no note and no gap", async ({ context, demoUrl, tusk }) => {
  await tusk.configure({ speakAnswers: true });
  await tusk.script([{ text: "Hello there. How can I help?" }]);
  const page = await context.newPage();
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto(`${demoUrl}/blank.html`);
  await tusk.openChat(page);
  await tusk.say(page, "hello");
  const list = page.locator(".panel .list");
  await expect(list).toContainText("Hello there", { timeout: 20000 });
  await page.waitForTimeout(1500);
  console.log("LIST:\n" + (await list.innerText()));
  await expect(list).not.toContainText("no voice");
  await expect(page.locator(".notice")).toHaveCount(0);
  await page.screenshot({ path: "/tmp/novoice.png" });
});
