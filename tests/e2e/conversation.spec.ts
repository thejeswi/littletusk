import { test, expect, speechBuild } from "./fixtures";

test.skip(!speechBuild, "Speaking to Tusk is off in this build (npm run e2e:speech builds the speech variant).");

// E1 + F1: the microphone badge starts a hands-free conversation. The scripted microphone in the test
// build speaks the lines in "__speech_queue" and stops by itself, like a person pausing.
test("@speech the microphone badge starts a hands-free conversation with captions", async ({ context, demoUrl, tusk }) => {
  await tusk.configure();
  await tusk.set("__speech_fake", true);
  await tusk.set("__speech_queue", ["x", "where do I log in"]); // the first is junk and must be dropped
  await tusk.set("__speech_text", "");
  await tusk.set("__speech_auto", true);
  await tusk.script([{ text: "Hello! I am here to help." }]);

  const page = await context.newPage();
  await page.goto(`${demoUrl}/blank.html`);
  const badge = page.locator("button.talk");
  await expect(badge).toBeVisible();
  await expect(badge).toHaveAttribute("aria-label", "Speak with Tusk");
  await badge.click();

  const caps = page.locator(".caps");
  await expect(caps).toBeVisible();
  await expect(badge).toHaveClass(/on/);
  await expect(badge).toHaveAttribute("aria-label", "Stop talking");

  // A one-character transcript is dropped instead of being sent.
  await expect(page.locator(".panel .list")).toContainText("didn't catch", { timeout: 15_000 });
  await expect(page.locator(".panel .list .msg.user")).toHaveCount(0);

  // The next sentence is understood, answered, and shown as captions.
  await expect(caps).toContainText("You:", { timeout: 15_000 });
  await expect(caps).toContainText("where do I log in", { timeout: 15_000 });
  await expect(caps).toContainText("Tusk:", { timeout: 25_000 });
  await expect(caps).toContainText("Hello! I am here to help.", { timeout: 25_000 });

  await caps.locator(".btn.stop").click();
  await expect(caps).toBeHidden();
  await expect(badge).not.toHaveClass(/on/);
});

test("@speech New chat ends a spoken conversation", async ({ context, demoUrl, tusk }) => {
  await tusk.configure();
  await tusk.set("__speech_fake", true);
  await tusk.set("__speech_queue", []);
  await tusk.set("__speech_text", "");
  await tusk.set("__speech_auto", true);
  const page = await context.newPage();
  await page.goto(`${demoUrl}/blank.html`);
  await page.locator("button.talk").click();
  await expect(page.locator(".caps")).toBeVisible();
  await page.locator("button.tusk").click();
  await page.locator(".head-btn", { hasText: "New chat" }).click();
  await expect(page.locator(".caps")).toBeHidden();
});
