import { test, expect } from "./fixtures";

async function run(context: any, extensionId: string, mode: string) {
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
