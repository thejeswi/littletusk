import { mkdir, rm } from "node:fs/promises";
import { resolve } from "node:path";

// Start each run with an empty test-results/scenarios, so the report only lists this run.
export default async function globalSetup() {
  const out = resolve(import.meta.dirname, "../../test-results/scenarios");
  await rm(out, { recursive: true, force: true });
  await mkdir(out, { recursive: true });
}
