import { test, expect } from "./fixtures";

test("New chat clears the conversation, greets again, and Tusk keeps working", async ({ context, demoUrl, tusk }) => {
  await tusk.configure();
  await tusk.script([{ text: "First answer." }, { text: "Fresh start answer." }]);
  const page = await context.newPage();
  await page.goto(`${demoUrl}/blank.html`);
  await tusk.openChat(page);
  await tusk.say(page, "first question");
  await expect(page.locator(".msg.tusk", { hasText: "First answer." })).toBeVisible({ timeout: 20_000 });

  await page.locator(".head-btn", { hasText: "New chat" }).click();
  await expect(page.locator(".msg.user", { hasText: "first question" })).toHaveCount(0);
  await expect(page.locator(".msg.tusk", { hasText: "First answer." })).toHaveCount(0);
  await expect(page.locator(".msg.tusk", { hasText: "I'm Tusk" })).toBeVisible({ timeout: 10_000 }); // greeted again

  await tusk.say(page, "second question");
  await expect(page.locator(".msg.tusk", { hasText: "Fresh start answer." })).toBeVisible({ timeout: 20_000 });
  await expect(page.locator(".msg.user")).toHaveText(["second question"]);

  // The reset survives a reload: the old chat does not come back.
  await page.reload();
  await tusk.openChat(page);
  await expect(page.locator(".msg.user", { hasText: "first question" })).toHaveCount(0);
  await expect(page.locator(".msg.user", { hasText: "second question" })).toBeVisible({ timeout: 15_000 });
});

test("the chat header fits at phone width with Settings, New chat and Close", async ({ context, demoUrl, tusk }) => {
  await tusk.configure();
  const page = await context.newPage();
  await page.setViewportSize({ width: 340, height: 700 });
  await page.goto(`${demoUrl}/blank.html`);
  await tusk.openChat(page);
  const fits = await page.evaluate(() => {
    const root = (document.querySelector("[data-littletusk=overlay]") as HTMLElement).shadowRoot!;
    const panel = root.querySelector(".panel:not([hidden])") as HTMLElement;
    const pr = panel.getBoundingClientRect();
    const btns = [...panel.querySelectorAll(".head button")].map((b) => b.getBoundingClientRect());
    return { n: btns.length, inside: btns.every((r) => r.left >= pr.left - 1 && r.right <= pr.right + 1), noOverflow: document.documentElement.scrollWidth <= innerWidth };
  });
  expect(fits).toEqual({ n: 3, inside: true, noOverflow: true });
});
