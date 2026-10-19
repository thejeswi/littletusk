import { test, expect, speechBuild } from "./fixtures";

test.skip(!speechBuild, "Speaking to Tusk is off in this build (npm run e2e:speech builds the speech variant).");

// The test build has a scripted microphone (src/speech/faux.ts): no audio, no model download, no network.
test("@speech chat microphone: live words, the two-line hints, and nothing sent until Send", async ({ context, demoUrl, tusk }) => {
  await tusk.configure({ talkToTusk: true });
  await tusk.set("__speech_fake", true);
  await tusk.set("__speech_text", "where do I log in");
  await tusk.set("__speech_partial", "where do I");
  const page = await context.newPage();
  await page.goto(`${demoUrl}/blank.html`);
  await page.locator("button.tusk").click();
  const box = page.frameLocator(".compose-frame");
  const mic = box.locator("#m");
  // The speech engine runs in this frame (an extension page), so it must be allowed the microphone.
  const allow = await page.evaluate(() => {
    const root = (document.querySelector("[data-littletusk=overlay]") as HTMLElement).shadowRoot!;
    return (root.querySelector(".compose-frame") as HTMLIFrameElement).getAttribute("allow");
  });
  expect(allow).toContain("microphone");

  await mic.click();
  await expect(box.locator("#hint")).toBeVisible();
  await expect(box.locator("#h1")).toHaveText("🎤 Listening… your words appear in the box.");
  await expect(box.locator("#h2")).toHaveText("Check them, then press Send.");
  await expect(box.locator("#t")).toHaveValue("where do I");
  await expect(mic).toHaveAttribute("aria-pressed", "true");
  await expect(mic).toHaveText("■");
  // A1: nothing goes out while the person speaks.
  await expect(page.locator(".panel .list .msg.user")).toHaveCount(0);

  await mic.click();
  await expect(box.locator("#t")).toHaveValue("where do I log in");
  await expect(box.locator("#h1")).toHaveText("Is this right? Change it if needed,");
  await expect(box.locator("#h2")).toHaveText("then press Send.");
  await expect(mic).toHaveAttribute("aria-pressed", "false");
  await expect(page.locator(".panel .list .msg.user")).toHaveCount(0);

  await box.locator("#s").click();
  await expect(page.locator(".panel .list .msg.user")).toContainText("where do I log in");
  await expect(box.locator("#t")).toHaveValue("");
  await expect(box.locator("#hint")).toBeHidden();
});

test("@speech Send while still listening stops first, then sends the finished words", async ({ context, demoUrl, tusk }) => {
  await tusk.configure({ talkToTusk: true });
  await tusk.set("__speech_fake", true);
  await tusk.set("__speech_text", "please show me the menu");
  await tusk.set("__speech_partial", "please show");
  const page = await context.newPage();
  await page.goto(`${demoUrl}/blank.html`);
  await page.locator("button.tusk").click();
  const box = page.frameLocator(".compose-frame");
  await box.locator("#m").click();
  await expect(box.locator("#t")).toHaveValue("please show");
  await box.locator("#s").click();
  await expect(page.locator(".panel .list .msg.user")).toContainText("please show me the menu");
});
