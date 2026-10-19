import { defineConfig } from "vite";
import { resolve } from "node:path";

// Content scripts cannot be ES modules: bundle everything into one IIFE (dist/content.js).
export default defineConfig(({ mode }) => ({
  publicDir: false,
  define: { __E2E__: JSON.stringify(mode === "e2e"), __SPEECH__: JSON.stringify(process.env.LITTLETUSK_SPEECH === "1") },
  build: {
    outDir: resolve(import.meta.dirname, mode === "e2e" ? (process.env.LITTLETUSK_SPEECH === "1" ? "dist-e2e-speech" : "dist-e2e") : "dist"),
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
}));
