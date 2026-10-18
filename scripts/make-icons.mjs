// Renders assets/tusk.svg to assets/icons/icon{16,32,48,128}.png with Playwright's Chromium.
import { chromium } from "@playwright/test";
import { readFileSync, mkdirSync } from "node:fs";
const svg = readFileSync("assets/tusk.svg", "utf8");
mkdirSync("assets/icons", { recursive: true });
const browser = await chromium.launch();
for (const size of [16, 32, 48, 128]) {
  const page = await browser.newPage({ viewport: { width: size, height: size } });
  await page.setContent(`<style>html,body{margin:0;background:transparent}svg{width:${size}px;height:${size}px;display:block}</style>${svg}`);
  await page.screenshot({ path: `assets/icons/icon${size}.png`, omitBackground: true });
  await page.close();
}
await browser.close();
