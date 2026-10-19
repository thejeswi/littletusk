// Web-sized copies of the README screenshots for the website (site/img/*.jpg, 1280 px wide).
// Run after `npm run screenshots` (it is part of that script). Uses Playwright, already installed.
import { chromium } from "playwright";
import { readFileSync, writeFileSync, mkdirSync, statSync } from "node:fs";
import { resolve } from "node:path";

const SHOTS = [
  ["01-tusk-on-page", "tusk-on-page"], ["03-pointing", "pointing"], ["04-chat-actions", "chat-actions"],
  ["07-look-after-cookies", "cookie-offer"], ["14-scam-warning", "scam-warning"], ["06-confirm", "confirm"],
  ["08-secret-field", "password-field"], ["10-languages", "languages"], ["11-family-settings", "family-settings", 1000],
];
const WIDTH = 1280;
mkdirSync("site/img", { recursive: true });
const browser = await chromium.launch({ channel: "chromium", headless: true });
const page = await browser.newPage({ deviceScaleFactor: 1 });
for (const [src, dst, maxHeight] of SHOTS) {
  const data = readFileSync(resolve("docs/screenshots", `${src}.png`)).toString("base64");
  await page.setContent(`<body style="margin:0;background:#fff"><img id="i" src="data:image/png;base64,${data}" style="display:block;width:${WIDTH}px"></body>`);
  const box = await page.locator("#i").boundingBox();
  const height = Math.round(Math.min(box.height, maxHeight ?? Infinity));
  await page.setViewportSize({ width: WIDTH, height });
  const out = `site/img/${dst}.jpg`;
  writeFileSync(out, await page.screenshot({ type: "jpeg", quality: 82, clip: { x: 0, y: 0, width: WIDTH, height } }));
  console.log(`${out}: ${WIDTH}x${height}, ${Math.round(statSync(out).size / 1024)} KB`);
}
await browser.close();
