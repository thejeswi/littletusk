import { defineConfig } from "vitest/config";

// Default environment is node; a test file opts into jsdom with `// @vitest-environment jsdom`.
export default defineConfig({
  define: { __E2E__: false, __SPEECH__: false },
  test: { include: ["tests/unit/**/*.test.ts"], passWithNoTests: true },
});
