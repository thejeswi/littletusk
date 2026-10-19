import { chromium } from "@playwright/test";
import { cdpEval } from "../../../tests/e2e/cdp-eval.ts";
const dist = process.cwd() + "/dist-e2e-speech";
const browser = await chromium.launch({ channel: "chrome", headless: true, ignoreDefaultArgs: ["--disable-extensions"],
  args: ["--enable-unsafe-extension-debugging", "--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream", "--remote-debugging-port=9334"] });
const ctx = browser.contexts()[0] ?? await browser.newContext();
const cdp = await browser.newBrowserCDPSession();
console.log("load", JSON.stringify(await cdp.send("Extensions.loadUnpacked", { path: dist }).catch((e) => String(e))));
await new Promise((r) => setTimeout(r, 2500));
const expr = `(async () => {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  const r = { avail: await SR.available({ langs: ["en-US"], processLocally: true }) };
  r.install = await Promise.race([SR.install({ langs: ["en-US"], processLocally: true }).then((v) => "resolved " + v, (e) => "threw " + e), new Promise((res) => setTimeout(() => res("timeout 40s"), 40000))]);
  r.avail2 = await SR.available({ langs: ["en-US"], processLocally: true });
  const rec = new SR(); rec.lang = "en-US"; rec.interimResults = true; rec.continuous = true; rec.processLocally = true;
  const log = []; const t0 = Date.now();
  for (const ev of ["start","audiostart","soundstart","speechstart","result","nomatch","error","audioend","end"]) rec.addEventListener(ev, (e) => log.push((Date.now()-t0) + " " + ev + (e.error ? ":" + e.error : "") + (ev==="result" ? " " + JSON.stringify([...e.results].map(x=>x[0].transcript)) : "")));
  rec.start();
  await new Promise((r) => setTimeout(r, 5000));
  rec.stop(); await new Promise((r) => setTimeout(r, 1000));
  r.log = log; return r; })()`;
console.log(JSON.stringify(await cdpEval(9334, "pages/offscreen.html", expr, 30000), null, 1));
await ctx.close();
