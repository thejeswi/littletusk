// Offscreen document: hosts the agent. Only messages relayed by the service worker are accepted.
import type { RelayedToAgent } from "../shared/protocol";
import { TuskAgent } from "./harness";

// Listener first, so a message that arrives while the agent starts waits instead of being lost.
const ready: Promise<TuskAgent> = TuskAgent.start();
ready.catch((e) => console.error("[littletusk] agent failed to start", e));

chrome.runtime.onMessage.addListener((msg: unknown, sender, sendResponse) => {
  const m = msg as Partial<RelayedToAgent> | undefined;
  // A message sent by a content script also reaches this page directly: ignore it, the service worker relays it.
  if (!m || m.to !== "agent" || m.relayed !== true || sender.tab) return false;
  void ready.then(
    (agent) => agent.handle(m as RelayedToAgent).then(sendResponse, (e) => (console.error("[littletusk]", e), sendResponse(undefined))),
    () => sendResponse(undefined),
  );
  return true;
});

addEventListener("pagehide", () => void ready.then((a) => a.close()).catch(() => undefined));
console.log("[littletusk] offscreen document loaded");
