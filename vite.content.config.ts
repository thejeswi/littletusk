import { defineConfig } from "vite";
import { resolve } from "node:path";

// Content scripts cannot be ES modules: bundle everything into one IIFE (dist/content.js).
export default defineConfig({
  publicDir: false,
  build: {
    outDir: resolve(import.meta.dirname, "dist"),
    emptyOutDir: false,
    sourcemap: false,
    target: "es2022",
    lib: {
      entry: resolve(import.meta.dirname, "src/content/main.ts"),
      formats: ["iife"],
      name: "LittleTuskContent",
      fileName: () => "content.js",
    },
  },
});
