// Copies the manifest, assets, icons and the .wasm runtime files into dist/ (no CDN loading of code).
const out = process.argv[2] ?? "dist";
import { cpSync, copyFileSync, mkdirSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { transformManifest } from "./manifest-transform.mjs";
mkdirSync(out + "/wasm", { recursive: true });
const e2e = out.includes("e2e");
const manifest = transformManifest(JSON.parse(readFileSync("manifest.json", "utf8")), { e2e });
writeFileSync(out + "/manifest.json", JSON.stringify(manifest, null, 2) + "\n");
cpSync("assets", out + "/assets", { recursive: true });
cpSync("assets/icons", out + "/icons", { recursive: true });
const copies = [
  ["node_modules/@sqlite.org/sqlite-wasm/dist/sqlite3.wasm", out + "/wasm/sqlite3.wasm"],
  ["node_modules/@sqlite.org/sqlite-wasm/dist/sqlite3-opfs-async-proxy.js", out + "/wasm/sqlite3-opfs-async-proxy.js"],
  ["node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.wasm", out + "/wasm/ort-wasm-simd-threaded.wasm"],
  ["node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.mjs", out + "/wasm/ort-wasm-simd-threaded.mjs"],
  ["node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.jsep.wasm", out + "/wasm/ort-wasm-simd-threaded.jsep.wasm"],
  ["node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.jsep.mjs", out + "/wasm/ort-wasm-simd-threaded.jsep.mjs"],
];
for (const [from, to] of copies) {
  if (!existsSync(from)) throw new Error("missing " + from);
  copyFileSync(from, to);
}

// Vite also emits onnxruntime's jsep .wasm (~21 MB) into chunks/ because the library names it as a default
// location. It is never loaded: the Whisper worker sets onnx.wasm.wasmPaths to the extension's wasm/ folder
// (src/speech/whisper.worker.ts), and the copies in wasm/ are the ones used. Remove the dead copy.
import { readdirSync, rmSync } from "node:fs";
if (existsSync(out + "/chunks")) {
  for (const f of readdirSync(out + "/chunks")) if (/^ort-wasm-.*\.wasm$/.test(f)) rmSync(out + "/chunks/" + f);
}
