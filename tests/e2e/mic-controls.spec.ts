import { test, expect } from "./fixtures";

// Chromium's fake microphone plays a beep, so there is always something to hear.
test.use({ extraArgs: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream"] });

test("listening bubble: labelled microphone switch turns listening off and on, Stop and send ends it", async ({ context, demoUrl, tusk }) => {
  await tusk.configure();
  const page = await context.newPage();
  await page.goto(`${demoUrl}/blank.html`);
  await page.locator("button.tusk").click();
  await page.locator(".compose .mic").click(); // the microphone button in the chat

  const listen = page.locator(".listen");
  await expect(listen.locator(".ltitle")).toHaveText("I'm listening…", { timeout: 15_000 });
  const sw = listen.getByRole("switch");
  await expect(sw).toHaveAttribute("aria-checked", "true");
  await expect(sw).toContainText("Microphone");
  await expect(sw).toContainText("On");
  const stop = listen.getByRole("button", { name: "Stop and send" });
  await expect(stop).toBeVisible();
  // Started from the open chat, the listening bubble is on top: a click on Stop lands on Stop.
  const onTop = await page.evaluate(() => {
    const root = (document.querySelector("[data-littletusk=overlay]") as HTMLElement).shadowRoot!;
    for (const sel of [".listen .btn.stop", ".listen .switch"]) {
      const el = root.querySelector(sel) as HTMLElement;
      const r = el.getBoundingClientRect();
      const at = root.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      if (!(at === el || el.contains(at))) return `${sel} covered by ${at?.className}`;
    }
    return "on top";
  });
  expect(onTop).toBe("on top");

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
