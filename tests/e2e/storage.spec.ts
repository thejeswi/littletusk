import { test, expect } from "./fixtures";

// The agent owns the database (only one owner at a time), so these specs switch it off first.
async function agentOff(context: any) {
  let [sw] = context.serviceWorkers();
  if (!sw) sw = await context.waitForEvent("serviceworker");
  await sw.evaluate(() => chrome.storage.local.set({ __no_offscreen: true }));
  // The service worker may still be starting the agent's document: close it until it stays gone.
  let quiet = 0;
  for (let i = 0; i < 30 && quiet < 3; i++) {
    const open = await sw.evaluate(async () => {
      const found = (await chrome.runtime.getContexts({ contextTypes: ["OFFSCREEN_DOCUMENT" as any] })).length > 0;
      if (found) await chrome.offscreen.closeDocument();
      return found;
    });
    quiet = open ? 0 : quiet + 1;
    await new Promise((r) => setTimeout(r, 300));
  }
}

async function run(context: any, extensionId: string, mode: string) {
  await agentOff(context);
  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/pages/storage-selftest.html?mode=${mode}`);
  await expect(page.locator("#out[data-state]")).toBeVisible({ timeout: 120_000 });
  const state = await page.locator("#out").getAttribute("data-state");
  const data = JSON.parse((await page.locator("#out").textContent())!);
  await page.close();
  return { state, data };
}

test("pi-durable storage conformance passes on OPFS sqlite", async ({ context, extensionId }) => {
  test.setTimeout(180_000);
  const { state, data } = await run(context, extensionId, "conformance");
  expect(state, JSON.stringify(data)).toBe("done");
  expect(data.failed).toEqual([]);
  expect(data.total).toBeGreaterThan(10);
  expect(data.passed).toBe(data.total);
});

test("a conversation persists across a page reload", async ({ context, extensionId }) => {
  const w = await run(context, extensionId, "write");
  expect(w.state, JSON.stringify(w.data)).toBe("done");
  expect(w.data.entryCount).toBeGreaterThan(0);
  expect(w.data.answer).toContain("Hello from the faux elephant");
  const r = await run(context, extensionId, "read");
  expect(r.state, JSON.stringify(r.data)).toBe("done");
  expect(r.data.entryCount).toBe(w.data.entryCount);
  await run(context, extensionId, "cleanup");
});
