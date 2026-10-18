import { test, expect } from "./fixtures";
import type { Page } from "@playwright/test";

type Box = { x: number; y: number; width: number; height: number };
const overlaps = (a: Box, b: Box) =>
  a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;

/** The element a real mouse would hit at the centre of `selector` (inside the open e2e shadow root). */
async function hitAtCentre(page: Page, selector: string): Promise<string> {
  return page.evaluate((sel) => {
    const host = [...document.documentElement.children].find((e) => (e as HTMLElement).shadowRoot) as HTMLElement;
    const root = host.shadowRoot!;
    const el = root.querySelector(sel) as HTMLElement;
    const r = el.getBoundingClientRect();
    const at = root.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2) as HTMLElement | null;
    return at === el || el.contains(at) ? "self" : `${at?.tagName}.${at?.className}`;
  }, selector);
}

for (const [name, url, size] of [
  ["shop newsletter popup", "shop.html", { width: 1280, height: 800 }],
  ["shop newsletter popup, narrow", "shop.html", { width: 400, height: 760 }],
  ["cookie banner", "cookies.html", { width: 1280, height: 800 }],
] as const) {
  test(`look after me (${name}): Tusk never covers its own offer, and Yes is clickable`, async ({ context, demoUrl, tusk }) => {
    await tusk.configure({ mode: "look-after" });
    const page = await context.newPage();
    await page.setViewportSize(size);
    await page.goto(`${demoUrl}/${url}`);
    const bubble = page.locator(".bubble");
    await expect(bubble.locator(".btn.yes")).toBeVisible({ timeout: 10_000 });
    await page.waitForTimeout(900); // let Tusk finish walking over

    const tuskBox = (await page.locator("button.tusk").boundingBox())!;
    const bubbleBox = (await bubble.boundingBox())!;
    expect(overlaps(tuskBox, bubbleBox), "Tusk overlaps its bubble").toBe(false);

    // The glow marks the thing that closes the popup, not the whole screen.
    const hl = (await page.locator(".hl").boundingBox())!;
    expect(hl.width * hl.height).toBeLessThan(size.width * size.height * 0.25);

    expect(await hitAtCentre(page, ".bubble .btn.yes")).toBe("self");
    expect(await hitAtCentre(page, ".bubble .btn.no")).toBe("self");
    await bubble.locator(".btn.yes").click({ timeout: 5_000 });
    await expect(bubble).toBeHidden();
  });
}
