// Checks a built dist/ against what the Chrome Web Store reviews. Usage: node scripts/check-store-ready.mjs [dist]
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { execSync } from "node:child_process";
import { transformManifest } from "./manifest-transform.mjs";

const dist = process.argv[2] ?? "dist";
const problems = [];
const fail = (m) => problems.push(m);

function walk(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)]));
}
const files = walk(dist);
const rel = (f) => relative(dist, f);

// 1. the manifest is the production one
const built = JSON.parse(readFileSync(join(dist, "manifest.json"), "utf8"));
const expected = transformManifest(JSON.parse(readFileSync("manifest.json", "utf8")), { e2e: false });
if (JSON.stringify(built) !== JSON.stringify(expected)) fail("dist/manifest.json is not the production transform of manifest.json (was it built with build:e2e?)");
if (JSON.stringify(built).match(/localhost|127\.0\.0\.1/)) fail("manifest mentions a local address");

// 2. html pulls nothing from other origins
for (const f of files.filter((x) => x.endsWith(".html"))) {
  const html = readFileSync(f, "utf8");
  for (const m of html.matchAll(/<(script|link)\b[^>]*\b(?:src|href)\s*=\s*["']?(https?:)?\/\/[^"'\s>]+/gi)) fail(`${rel(f)}: remote <${m[1]}>: ${m[0].slice(0, 100)}`);
}

// 3. no eval( / new Function( in dist JS, except one judged pattern.
// The only hits are Emscripten's globalThis fallback in the onnxruntime glue (bundled into the Whisper worker
// chunk and copied to wasm/):  typeof globalThis=="object" ? globalThis : Function("return this")()
// Every Chrome that can run this extension (116+) has globalThis, so the Function branch is never taken, and
// under our CSP (no 'unsafe-eval') it could not run anyway. Only that exact snippet is allowed; any other
// eval( or Function( string is a failure. Whisper is used when the browser has no on-device listener.
const Q = "[`\"']";
const EMSCRIPTEN_GLOBAL_FALLBACK = new RegExp(
  `(?:typeof globalThis\\s*==\\s*${Q}object${Q}|${Q}object${Q}\\s*==\\s*typeof globalThis)\\s*\\?\\s*globalThis\\s*:\\s*Function\\(\\s*${Q}return this${Q}\\s*\\)\\(\\)`, "g");
const evalRe = /(?<![\w$.])eval\s*\(|new\s+Function\s*\(|(?<![\w$.])Function\s*\(\s*["'`]/g;
const evalHits = [];
for (const f of files.filter((x) => /\.(m?js|cjs)$/.test(x))) {
  const text = readFileSync(f, "utf8");
  const allowed = (text.match(EMSCRIPTEN_GLOBAL_FALLBACK) ?? []).length;
  const n = (text.replace(EMSCRIPTEN_GLOBAL_FALLBACK, "").match(evalRe) ?? []).length;
  if (allowed) evalHits.push(`${rel(f)}: ${allowed} allowlisted (Emscripten globalThis fallback)`);
  if (n) { evalHits.push(`${rel(f)}: ${n} NOT allowlisted`); fail(`${rel(f)}: eval( or new Function( found (${n})`); }
}

// 4. no sourcemaps
for (const f of files) {
  if (f.endsWith(".map")) fail(`sourcemap file: ${rel(f)}`);
  else if (/\.(m?js|css)$/.test(f) && /sourceMappingURL=/.test(readFileSync(f, "utf8").slice(-300))) fail(`sourceMappingURL comment in ${rel(f)}`);
}

// 5. no big files
const LIMIT = 25 * 1024 * 1024;
for (const f of files) if (statSync(f).size > LIMIT) fail(`over 25 MB: ${rel(f)} (${(statSync(f).size / 1048576).toFixed(1)} MB)`);

// 6. zip size, as the store would receive it
let zipInfo = "zip not available";
try {
  const out = execSync(`cd ${JSON.stringify(dist)} && zip -qr - . | wc -c`, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
  zipInfo = `${(Number(out.trim()) / 1048576).toFixed(2)} MB`;
} catch { /* zip missing: size line says so */ }

console.log(`files: ${files.length}, unzipped ${(files.reduce((a, f) => a + statSync(f).size, 0) / 1048576).toFixed(1)} MB, zip ${zipInfo}`);
console.log(evalHits.length ? "eval/new Function hits:\n  " + evalHits.join("\n  ") : "eval/new Function hits: none");
if (problems.length) {
  console.error("check-store-ready FAILED:\n  " + problems.join("\n  "));
  process.exit(1);
}
console.log("check-store-ready: ok");
