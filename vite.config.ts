import { defineConfig } from "vite";
import { resolve } from "node:path";

// Main build: service worker, extension pages and workers as ES modules.
// The content script is built separately (vite.content.config.ts) as one IIFE.
// Workers are bundled by referencing them with
//   new Worker(new URL("../storage/sqlite.worker.ts", import.meta.url), { type: "module" })
// from code that is part of an entry (see src/offscreen/main.ts).
export default defineConfig(({ mode }) => ({
  root: "src",
  // __E2E__ is true only in `vite build --mode e2e` (dist-e2e/), where the faux provider is bundled.
  define: { __E2E__: JSON.stringify(mode === "e2e") },
  base: "./",
  publicDir: false,
  build: {
    outDir: resolve(import.meta.dirname, mode === "e2e" ? "dist-e2e" : "dist"),
    emptyOutDir: true,
    sourcemap: false,
    target: "es2022",
    rollupOptions: {
      input: {
        background: resolve(import.meta.dirname, "src/background/index.ts"),
        offscreen: resolve(import.meta.dirname, "src/pages/offscreen.html"),
        setup: resolve(import.meta.dirname, "src/pages/setup.html"),
        compose: resolve(import.meta.dirname, "src/pages/compose.html"),
        // test-only page (uses the faux provider): only in the e2e build
        ...(mode === "e2e" ? { "storage-selftest": resolve(import.meta.dirname, "src/pages/storage-selftest.html") } : {}),
      },
      output: {
        entryFileNames: (chunk) => (chunk.name === "background" ? "background.js" : "chunks/[name]-[hash].js"),
        chunkFileNames: "chunks/[name]-[hash].js",
        assetFileNames: "chunks/[name]-[hash][extname]",
      },
    },
  },
  worker: { format: "es", rollupOptions: { output: { entryFileNames: "chunks/[name]-[hash].js", chunkFileNames: "chunks/[name]-[hash].js", assetFileNames: "chunks/[name]-[hash][extname]" } } },
}));
