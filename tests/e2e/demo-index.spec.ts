import { readdirSync } from "node:fs";
import { join } from "node:path";
import { test, expect } from "./fixtures";

const DEMO_DIR = join(import.meta.dirname, "..", "..", "demo");

test("the demo index links every demo page, and every link opens a page with Tusk on it", async ({ context, demoUrl }) => {
  const page = await context.newPage();
  await page.goto(`${demoUrl}/index.html`);
  const hrefs = await page.locator("main a").evaluateAll((as) => as.map((a) => a.getAttribute("href")!));
  const linkedHere = new Set(hrefs.filter((h) => !h.startsWith("../")));
  const onDisk = readdirSync(DEMO_DIR).filter((f) => f.endsWith(".html") && f !== "index.html");
  expect([...linkedHere].sort(), "every page in demo/ is linked from demo/index.html").toEqual(onDisk.sort());

  for (const href of linkedHere) {
    const p = await context.newPage();
    const res = await p.goto(`${demoUrl}/${href}`);
    expect(res?.status(), href).toBe(200);
    await expect(p.locator("button.tusk"), `${href} shows Tusk`).toBeVisible({ timeout: 10_000 });
    await p.close();
  }
});
