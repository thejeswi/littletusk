import { defineConfig } from "@playwright/test";
// Scenario tests (npm run scenarios, npm run scenarios:live). Not part of `npm run e2e`.
const live = process.env.LITTLETUSK_LIVE === "1";
if (live && !process.env.ANTHROPIC_API_KEY && process.env.TEST_WORKER_INDEX === undefined) {
  console.log("Live scenarios skipped: set the environment variable ANTHROPIC_API_KEY (it is never printed). Nothing was run.");
}
export default defineConfig({
  testDir: "tests/scenarios",
  testMatch: "scenarios.spec.ts",
  globalSetup: "./tests/scenarios/global-setup.ts",
  outputDir: "test-results/scenarios-pw",
  timeout: live ? 300_000 : 60_000,
  reporter: "list",
  workers: 1,
});
