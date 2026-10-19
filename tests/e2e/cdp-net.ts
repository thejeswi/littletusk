// Network spy for extension contexts that Playwright does not expose (the offscreen document, where the agent
// calls the model provider, and its workers). Talks to Chrome's DevTools port with a minimal flat-session client.
// Usage: test.use({ extraArgs: [`--remote-debugging-port=${cdpPort}`] }), then `await spyExtension(cdpPort, opts)`.
import { createServer } from "node:net";
import type { AddressInfo } from "node:net";

export async function freePort(): Promise<number> {
  const s = createServer();
  await new Promise<void>((r) => s.listen(0, "127.0.0.1", r));
  const port = (s.address() as AddressInfo).port;
  await new Promise((r) => s.close(r));
  return port;
}

export interface Seen { url: string; method: string; headers: Record<string, string>; body: string; target: string }
export interface Spy {
  /** Every request made by an extension target (offscreen document, service worker, their workers). */
  requests: Seen[];
  /** URLs of the extension targets the spy is watching (the offscreen document, the service worker, their workers). */
  watching(): string[];
  close(): void;
}
export interface Fulfil { status: number; headers: Record<string, string>; body: string }

export async function spyExtension(port: number, opts: { intercept?: { urlPrefix: string; respond: (n: number) => Fulfil } } = {}): Promise<Spy> {
  let wsUrl = "";
  for (let i = 0; i < 50 && !wsUrl; i++) {
    try { wsUrl = ((await (await fetch(`http://127.0.0.1:${port}/json/version`)).json()) as { webSocketDebuggerUrl: string }).webSocketDebuggerUrl; }
    catch { await new Promise((r) => setTimeout(r, 100)); }
  }
  if (!wsUrl) throw new Error("no DevTools port");
  const ws = new WebSocket(wsUrl);
  await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
  let id = 0;
  const waiting = new Map<number, (v: any) => void>();
  const attached = new Set<string>();
  const requests: Seen[] = [];
  let intercepted = 0;
  const send = (method: string, params: object = {}, sessionId?: string) =>
    new Promise<any>((resolve) => { const n = ++id; waiting.set(n, resolve); ws.send(JSON.stringify({ id: n, method, params, sessionId })); });
  const targets = new Map<string, string>(); // sessionId -> url

  ws.onmessage = async (ev) => {
    const msg = JSON.parse(String(ev.data));
    if (msg.id && waiting.has(msg.id)) { waiting.get(msg.id)!(msg.result); waiting.delete(msg.id); return; }
    if (msg.method === "Target.attachedToTarget") {
      const { sessionId, targetInfo } = msg.params;
      targets.set(sessionId, targetInfo.url);
      if (!targetInfo.url.startsWith("chrome-extension://")) return void send("Runtime.runIfWaitingForDebugger", {}, sessionId);
      await send("Network.enable", {}, sessionId);
      if (opts.intercept) await send("Fetch.enable", { patterns: [{ urlPattern: opts.intercept.urlPrefix + "*" }] }, sessionId);
      await send("Target.setAutoAttach", { autoAttach: true, waitForDebuggerOnStart: true, flatten: true }, sessionId); // workers
      await send("Runtime.runIfWaitingForDebugger", {}, sessionId);
    } else if (msg.method === "Network.requestWillBeSent") {
      const r = msg.params.request;
      requests.push({ url: r.url, method: r.method, headers: r.headers, body: r.postData ?? "", target: targets.get(msg.sessionId) ?? "" });
    } else if (msg.method === "Fetch.requestPaused" && opts.intercept) {
      const r = msg.params.request;
      if (!requests.some((x) => x.url === r.url && x.body === (r.postData ?? "") && x.method === r.method)) requests.push({ url: r.url, method: r.method, headers: r.headers, body: r.postData ?? "", target: targets.get(msg.sessionId) ?? "" });
      const f = opts.intercept.respond(++intercepted);
      await send("Fetch.fulfillRequest", {
        requestId: msg.params.requestId, responseCode: f.status,
        responseHeaders: Object.entries(f.headers).map(([name, value]) => ({ name, value })),
        body: Buffer.from(f.body).toString("base64"),
      }, msg.sessionId);
    }
  };
  // Attach to extension targets as they appear (the offscreen document is created by the service worker).
  const attach = async () => {
    const res = await send("Target.getTargets");
    for (const t of res?.targetInfos ?? []) {
      if (!t.url.startsWith("chrome-extension://") || attached.has(t.targetId)) continue;
      attached.add(t.targetId);
      await send("Target.attachToTarget", { targetId: t.targetId, flatten: true });
    }
  };
  await attach();
  const timer = setInterval(() => void attach().catch(() => undefined), 300);
  return { requests, watching: () => [...targets.values()], close: () => { clearInterval(timer); ws.close(); } };
}
