// Copies the manifest, assets, icons and the .wasm runtime files into dist/ (no CDN loading of code).
const out = process.argv[2] ?? "dist";
import { cpSync, copyFileSync, mkdirSync, existsSync } from "node:fs";
mkdirSync(out + "/wasm", { recursive: true });
copyFileSync("manifest.json", out + "/manifest.json");
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
