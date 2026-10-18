// Copies the manifest, assets, icons and the .wasm runtime files into dist/ (no CDN loading of code).
import { cpSync, copyFileSync, mkdirSync, existsSync } from "node:fs";
mkdirSync("dist/wasm", { recursive: true });
copyFileSync("manifest.json", "dist/manifest.json");
cpSync("assets", "dist/assets", { recursive: true });
cpSync("assets/icons", "dist/icons", { recursive: true });
const copies = [
  ["node_modules/@sqlite.org/sqlite-wasm/dist/sqlite3.wasm", "dist/wasm/sqlite3.wasm"],
  ["node_modules/@sqlite.org/sqlite-wasm/dist/sqlite3-opfs-async-proxy.js", "dist/wasm/sqlite3-opfs-async-proxy.js"],
  ["node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.wasm", "dist/wasm/ort-wasm-simd-threaded.wasm"],
  ["node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.mjs", "dist/wasm/ort-wasm-simd-threaded.mjs"],
  ["node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.jsep.wasm", "dist/wasm/ort-wasm-simd-threaded.jsep.wasm"],
  ["node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.jsep.mjs", "dist/wasm/ort-wasm-simd-threaded.jsep.mjs"],
];
for (const [from, to] of copies) {
  if (!existsSync(from)) throw new Error("missing " + from);
  copyFileSync(from, to);
}
