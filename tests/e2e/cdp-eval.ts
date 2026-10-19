// Run JavaScript inside an extension target that Playwright does not expose (the offscreen document),
// through Chrome's DevTools port. Usage: test.use({ extraArgs: [`--remote-debugging-port=${port}`] }).
export async function cdpEval<T = unknown>(port: number, urlPart: string, expression: string, timeoutMs = 20_000): Promise<T> {
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
  ws.onmessage = (ev) => { const m = JSON.parse(String(ev.data)); if (m.id && waiting.has(m.id)) { waiting.get(m.id)!(m); waiting.delete(m.id); } };
  const send = (method: string, params: object = {}, sessionId?: string) =>
    new Promise<any>((resolve) => { const n = ++id; waiting.set(n, resolve); ws.send(JSON.stringify({ id: n, method, params, sessionId })); });
  try {
    const deadline = Date.now() + timeoutMs;
    let target: { targetId: string } | undefined;
    while (!target && Date.now() < deadline) {
      const res = await send("Target.getTargets");
      target = (res.result?.targetInfos ?? []).find((t: { url: string }) => t.url.includes(urlPart));
      if (!target) await new Promise((r) => setTimeout(r, 200));
    }
    if (!target) throw new Error(`no target matching ${urlPart}`);
    const att = await send("Target.attachToTarget", { targetId: target.targetId, flatten: true });
    const sessionId = att.result.sessionId as string;
    const r = await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true, userGesture: true }, sessionId);
    if (r.result?.exceptionDetails) throw new Error(JSON.stringify(r.result.exceptionDetails.exception?.description ?? r.result.exceptionDetails));
    return r.result?.result?.value as T;
  } finally {
    ws.close();
  }
}
