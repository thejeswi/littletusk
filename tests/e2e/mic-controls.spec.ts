import { test, expect } from "./fixtures";

// Chromium's fake microphone plays a beep, so there is always something to hear.
test.use({ extraArgs: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream"] });

test("listening bubble: labelled microphone switch turns listening off and on, Stop and send ends it", async ({ context, demoUrl, tusk }) => {
  await tusk.configure();
  const page = await context.newPage();
  await page.goto(`${demoUrl}/blank.html`);
  await page.locator("button.tusk").click();
  await page.locator(".menu button", { hasText: "Speak" }).click();

  const listen = page.locator(".listen");
  await expect(listen.locator(".ltitle")).toHaveText("I'm listening…", { timeout: 15_000 });
  const sw = listen.getByRole("switch");
  await expect(sw).toHaveAttribute("aria-checked", "true");
  await expect(sw).toContainText("Microphone");
  await expect(sw).toContainText("On");
  const stop = listen.getByRole("button", { name: "Stop and send" });
  await expect(stop).toBeVisible();

  await sw.click();
  await expect(sw).toHaveAttribute("aria-checked", "false");
  await expect(sw).toContainText("Off");
  await expect(listen.locator(".ltitle")).toHaveText(/microphone is off/i);
  await page.waitForTimeout(500);
  await expect(listen.locator(".ltitle")).toHaveText(/microphone is off/i); // stays off: no level updates turn it back on

  await sw.click();
  await expect(sw).toHaveAttribute("aria-checked", "true");
  await expect(listen.locator(".ltitle")).toHaveText("I'm listening…");

  await stop.click();
  // The beep counts as sound, so Tusk starts writing it down (the model download is not waited for here).
  await expect(listen.locator(".ltitle")).toHaveText(/writing down/i, { timeout: 10_000 });
});
