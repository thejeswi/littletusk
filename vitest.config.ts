import { defineConfig } from "vitest/config";

// Default environment is node; a test file opts into jsdom with `// @vitest-environment jsdom`.
export default defineConfig({
  test: { include: ["tests/unit/**/*.test.ts"], passWithNoTests: true },
});
