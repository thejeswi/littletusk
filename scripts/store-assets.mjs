// Makes the Chrome Web Store images in docs/store/assets from docs/screenshots and assets/tusk.svg.
import { chromium } from "@playwright/test";
import { mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const out = join(root, "docs/store/assets");
mkdirSync(out, { recursive: true });

const SHOTS = [
  ["01-tusk-on-page", "store-1-tusk-on-page"],
  ["03-pointing", "store-2-pointing"],
  ["04-chat-actions", "store-3-chat-actions"],
  ["07-look-after-cookies", "store-4-look-after-cookies"],
  ["14-scam-warning", "store-5-scam-warning"],
];
const dataUri = (file, mime) => `data:${mime};base64,${readFileSync(join(root, file)).toString("base64")}`;

function readSize(file) {
  const b = readFileSync(file);
  if (b.toString("latin1", 1, 4) !== "PNG" || b.toString("latin1", 12, 16) !== "IHDR") throw new Error(`${file}: not a PNG`);
  return { w: b.readUInt32BE(16), h: b.readUInt32BE(20), colorType: b[25] };
}
function expect(file, w, h) {
  const s = readSize(file);
  if (s.w !== w || s.h !== h) throw new Error(`${file}: expected ${w}x${h}, got ${s.w}x${s.h}`);
  if (s.colorType === 4 || s.colorType === 6) throw new Error(`${file}: has an alpha channel`);
  const kb = Math.round(statSync(file).size / 1024);
  if (kb >= 1024) throw new Error(`${file}: ${kb} KB is over 1 MB`);
  console.log(`${file.slice(root.length + 1)}: ${s.w}x${s.h}, ${kb} KB, color type ${s.colorType}`);
}

const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });
  for (const [src, name] of SHOTS) {
    const uri = dataUri(`docs/screenshots/${src}.png`, "image/png");
    await page.setContent(`<body style="margin:0;background:#fff"><img id="i" src="${uri}" style="display:block;width:1280px;height:800px"></body>`);
    await page.evaluate(() => document.getElementById("i").decode());
    const file = join(out, `${name}.png`);
    writeFileSync(file, await page.screenshot({ type: "png", omitBackground: false }));
    expect(file, 1280, 800);
  }
  const tile = await browser.newPage({ viewport: { width: 440, height: 280 }, deviceScaleFactor: 1 });
  const tusk = dataUri("assets/tusk.svg", "image/svg+xml");
  await tile.setContent(`<body style="margin:0;width:440px;height:280px;background:#f5f3ee;display:flex;align-items:center;font-family:system-ui,sans-serif;color:#24303a;overflow:hidden">
    <img id="t" src="${tusk}" style="width:140px;height:auto;margin:0 22px 0 28px">
    <div><div style="font-size:42px;font-weight:700;line-height:1.05">Little Tusk</div>
    <div style="font-size:21px;line-height:1.3;margin-top:12px;color:#3d5668">A patient helper<br>for the web</div></div></body>`);
  await tile.evaluate(() => document.getElementById("t").decode());
  const file = join(out, "promo-small-440x280.png");
  writeFileSync(file, await tile.screenshot({ type: "png", omitBackground: false }));
  expect(file, 440, 280);
} finally {
  await browser.close();
}
