import { defineConfig } from "@playwright/test";
// Feature screenshots for the README (npm run screenshots). Not part of `npm run e2e`.
export default defineConfig({ testDir: "tests/screenshots", timeout: 60000, reporter: "list", workers: 1 });
