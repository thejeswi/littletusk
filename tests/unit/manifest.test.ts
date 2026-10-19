// Chrome Web Store readiness of the manifest that ships (the production transform of manifest.json).
import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
// @ts-expect-error plain .mjs script without types
import { transformManifest } from "../../scripts/manifest-transform.mjs";

const source = JSON.parse(readFileSync("manifest.json", "utf8"));
const pkg = JSON.parse(readFileSync("package.json", "utf8"));
const prod = transformManifest(source, { e2e: false }) as Record<string, any>;
const e2e = transformManifest(source, { e2e: true }) as Record<string, any>;

function pngSize(file: string): [number, number] {
  const b = readFileSync(file);
  expect(b.subarray(1, 4).toString()).toBe("PNG");
  expect(b.subarray(12, 16).toString()).toBe("IHDR");
  return [b.readUInt32BE(16), b.readUInt32BE(20)];
}

describe("production manifest", () => {
  it("is manifest v3 with a short name and description", () => {
    expect(prod.manifest_version).toBe(3);
    expect(prod.name.length).toBeLessThanOrEqual(75);
    expect(prod.description.length).toBeLessThanOrEqual(132);
    expect(prod.description.length).toBeGreaterThan(0);
  });
  it("version is semver and equals package.json", () => {
    expect(prod.version).toMatch(/^\d+\.\d+\.\d+$/);
    expect(prod.version).toBe(pkg.version);
  });
  it("asks for exactly the allowed permissions", () => {
    expect([...prod.permissions].sort()).toEqual(["offscreen", "scripting", "storage", "tts"]);
    expect(prod.host_permissions).toEqual(["<all_urls>"]);
    expect(prod.optional_permissions).toBeUndefined();
  });
  it("mentions no local address anywhere", () => {
    const text = JSON.stringify(prod);
    expect(text).not.toMatch(/localhost|127\.0\.0\.1/);
  });
  it("keeps the strict extension-page CSP without eval", () => {
    expect(prod.content_security_policy).toEqual({ extension_pages: "script-src 'self' 'wasm-unsafe-eval'; object-src 'self'" });
    expect(prod.content_security_policy.extension_pages.replace("'wasm-unsafe-eval'", "")).not.toContain("unsafe-eval");
  });
  it("needs Chrome 116 or newer (chrome.runtime.getContexts, offscreen documents)", () => {
    expect(Number(prod.minimum_chrome_version)).toBeGreaterThanOrEqual(116);
  });
  it("has icons whose real pixel size matches their name", () => {
    expect(Object.keys(prod.icons).sort()).toEqual(["128", "16", "32", "48"]);
    for (const [size, path] of Object.entries(prod.icons) as [string, string][]) {
      const file = `assets/${path}`; // post-build copies assets/icons to icons/
      expect(existsSync(file), file).toBe(true);
      expect(pngSize(file)).toEqual([Number(size), Number(size)]);
    }
  });
  it("lists only web-accessible files that exist in the source tree or are build output", () => {
    const buildOutput = (r: string) => r.startsWith("chunks/") || r.startsWith("pages/"); // vite writes these
    const sourceFor = (r: string) => (r.startsWith("assets/") ? r : r.startsWith("pages/") ? "src/" + r.replace(/\.html$/, ".html") : r);
    for (const entry of prod.web_accessible_resources) {
      expect(entry.matches.length).toBeGreaterThan(0);
      for (const r of entry.resources as string[]) {
        if (r.includes("*")) { expect(buildOutput(r), r).toBe(true); continue; }
        expect(existsSync(sourceFor(r)), r).toBe(true);
      }
    }
  });
  it("only exposes the setup page to the real setup site", () => {
    const setup = prod.web_accessible_resources.find((e: any) => e.resources.includes("pages/setup.html"));
    expect(setup.matches).toEqual(["https://thejeswi.github.io/*"]);
  });
});

describe("e2e manifest", () => {
  it("keeps the local setup-page patterns the end-to-end tests need", () => {
    const setup = e2e.web_accessible_resources.find((x: any) => x.resources.includes("pages/setup.html"));
    expect(setup.matches).toContain("http://127.0.0.1/*");
  });
});
