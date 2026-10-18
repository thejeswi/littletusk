// Placeholder agent host. The workers are referenced here so that Vite bundles them as module workers.
export function startWorkers() {
  const sqlite = new Worker(new URL("../storage/sqlite.worker.ts", import.meta.url), { type: "module" });
  const whisper = new Worker(new URL("../speech/whisper.worker.ts", import.meta.url), { type: "module" });
  return { sqlite, whisper };
}
console.log("[littletusk] offscreen document loaded");
