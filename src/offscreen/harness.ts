// The agent: one pi-durable conversation per browser profile, wired to the service worker.
import { BACKGROUND_CONTEXT } from "@earendil-works/chord/context";
import { createRegistry, Harness, UsageDoc, type Conversation } from "@earendil-works/pi-durable";
import type { ChatView, FromAgent, PageCommand, PageResult, RelayedToAgent, Settings } from "../shared/protocol";
import { DEFAULT_SETTINGS } from "../shared/protocol";
import { t } from "../shared/i18n";
import { openTuskStorage, type TuskStorage } from "../storage/index";
import { ledgerDelta, monthKey, overLimit, spendNow, totalCost } from "./budget";
import { asksToDoIt, saysStillBroken } from "./gate";
import { createTuskModels, type TuskModels } from "./models";
import { INITIAL_STATE, KIND, LedgerDoc, StateDoc, type TuskState } from "./state";
import { createExtension } from "./tools";
import { buildView, throttle, type ViewValueLike } from "./view";

const ctx = BACKGROUND_CONTEXT;
const IDLE_RESET_MS = 6 * 3600 * 1000;
const BROADCAST_MS = 100;

type SwMessage = FromAgent;
const sendSw = async <T = unknown>(msg: SwMessage): Promise<T | undefined> => {
  try {
    return (await chrome.runtime.sendMessage(msg)) as T | undefined;
  } catch {
    return undefined;
  }
};

/** Test builds only: keep a short log in chrome.storage.local ("__agent_log") that specs can read. */
const elog = (...parts: unknown[]) => {
  if (!__E2E__) return;
  const line = parts.map((p) => (p instanceof Error ? p.stack ?? p.message : typeof p === "string" ? p : JSON.stringify(p))).join(" ");
  void sendSw<{ value: unknown }>({ to: "sw", type: "e2e-get", key: "__agent_log" }).then((r) =>
    sendSw({ to: "sw", type: "e2e-set", key: "__agent_log", value: [...(((r?.value as string[]) ?? []).slice(-40)), line] }),
  );
};

interface SpeechLike {
  start(lang: string): Promise<void>;
  stop(): Promise<string>;
}

export class TuskAgent {
  private settings: Settings = DEFAULT_SETTINGS;
  private harness!: Harness;
  private root!: Conversation;
  private storage!: TuskStorage;
  private tm!: TuskModels;
  private view!: { value: ViewValueLike; subscribe(cb: () => void): unknown; dispose(): void };
  private taskTab = 0;
  private extra = 0;
  private spoken = new Set<string>();
  private spokenInit = false;
  private scripted: { reload(): Promise<void> } | undefined;
  private speech: SpeechLike | undefined;
  private micSubmitted = false;
  private readonly broadcaster = throttle(() => void this.broadcast(), BROADCAST_MS);
  private readonly ledgerSync = throttle(() => void this.syncLedger(), 400);
  private ledgerChain: Promise<void> = Promise.resolve();

  static async start(): Promise<TuskAgent> {
    const a = new TuskAgent();
    await a.init();
    return a;
  }

  // ---------- startup ----------

  private async init() {
    await this.loadSettings();
    this.tm = createTuskModels();
    await this.tm.setKey(this.settings.provider, this.settings.apiKey);
    if (__E2E__) {
      const { installFaux } = await import("./faux");
      this.scripted = installFaux(this.tm.models, {
        get: async (key) => (await sendSw<{ value: unknown }>({ to: "sw", type: "e2e-get", key }))?.value,
        set: async (key, value) => void (await sendSw({ to: "sw", type: "e2e-set", key, value })),
      });
      await this.scripted.reload();
    }
    const registry = createRegistry();
    registry.install(
      createExtension({
        settings: () => this.settings,
        page: (cmd) => this.page(cmd),
        openUrl: (url) => this.openUrl(url),
        extraSpend: () => this.extra,
      }),
    );
    this.storage = await this.openStorage();
    this.harness = await Harness.open(
      this.storage.storage,
      { models: this.tm.models, registry, settings: { retry: { maxRetries: 2 }, toolExecution: "sequential" } },
      ctx,
    );
    this.root = await this.harness.root(ctx, { agent: { model: this.modelRef(false) } });
    const st = await this.readState();
    this.taskTab = st.taskTabId;
    await this.applyModel();
    this.harness.resume();
    const view = await this.root.viewState(ctx);
    this.view = view as unknown as TuskAgent["view"];
    view.subscribe(() => this.broadcaster.call());
    this.harness.subscribeCommits(() => {
      this.broadcaster.call();
      this.ledgerSync.call();
    });
    await this.maybeGreet();
    await this.broadcast();
  }

  /** The previous offscreen document may still hold the database for a moment after a restart. */
  private async openStorage(): Promise<TuskStorage> {
    let last: unknown;
    for (let i = 0; i < 12; i++) {
      try {
        return await openTuskStorage();
      } catch (e) {
        last = e;
        await new Promise((r) => setTimeout(r, 500));
      }
    }
    throw last;
  }

  async close() {
    try {
      this.view?.dispose();
      await this.harness?.close(ctx);
    } catch {
      /* closing */
    }
  }

  // ---------- settings and model ----------

  private async loadSettings() {
    const s = await sendSw<Settings>({ to: "sw", type: "get-settings" });
    if (s) this.settings = { ...DEFAULT_SETTINGS, ...s };
  }

  private modelRef(escalated: boolean) {
    return { provider: this.settings.provider, modelId: escalated ? this.settings.strongModel : this.settings.model };
  }

  private async applyModel() {
    const st = await this.readState();
    const ref = this.modelRef(st.escalated);
    const agent = await this.root.agent(ctx);
    if (agent.model?.provider !== ref.provider || agent.model?.modelId !== ref.modelId) await this.root.configure({ model: ref }, ctx);
  }

  private async settingsChanged() {
    const before = this.settings;
    await this.loadSettings();
    if (before.provider !== this.settings.provider || before.apiKey !== this.settings.apiKey) {
      await this.tm.setKey(this.settings.provider, this.settings.apiKey);
    }
    await this.applyModel();
    await this.maybeGreet();
    this.broadcaster.call();
  }

  private get hasKey(): boolean {
    if (__E2E__ && this.settings.provider === "faux") return true;
    return this.settings.apiKey.trim().length > 0;
  }

  // ---------- state ----------

  private async readState(): Promise<TuskState> {
    return { ...INITIAL_STATE, ...((await this.harness.snapshot(StateDoc, this.root.id, ctx)) ?? {}) } as TuskState;
  }

  private update(fn: (s: TuskState) => void): Promise<void> {
    return this.root.commit(async (tx) => {
      fn(await tx.doc(StateDoc, this.root.id));
    }, ctx);
  }

  private async write(kind: string, data: Record<string, string | boolean>) {
    await this.root.submit({ type: "write", entry: { kind, data } }, ctx);
  }

  private notice(text: string) {
    return this.write(KIND.notice, { text });
  }

  private async maybeGreet() {
    if (!this.settings.setupDone) return;
    const st = await this.readState();
    if (st.greeted) return;
    const name = this.settings.name?.trim();
    const hello = t(this.settings.language, "greeting");
    await this.update((s) => void (s.greeted = true));
    await this.write(KIND.say, { text: name ? `${name}, ${hello.charAt(0).toLowerCase()}${hello.slice(1)}` : hello });
  }

  // ---------- budget ----------

  private async spent(): Promise<number> {
    const [ledger, usage] = await Promise.all([this.harness.snapshot(LedgerDoc, this.root.id, ctx), this.harness.snapshot(UsageDoc, this.root.id, ctx)]);
    return spendNow(ledger, totalCost(usage as any), monthKey(), this.extra);
  }

  /** Move cost that pi.usage reports into this month's ledger. */
  private syncLedger(): Promise<void> {
    this.ledgerChain = this.ledgerChain.then(async () => {
      try {
        const [ledger, usage] = await Promise.all([this.harness.snapshot(LedgerDoc, this.root.id, ctx), this.harness.snapshot(UsageDoc, this.root.id, ctx)]);
        const total = totalCost(usage as any);
        if (ledgerDelta(ledger, total) === 0) return;
        await this.root.commit(async (tx) => {
          const l = await tx.doc(LedgerDoc, this.root.id);
          const m = monthKey();
          l.months[m] = (l.months[m] ?? 0) + Math.max(0, total - l.lastTotal);
          l.lastTotal = total;
        }, ctx);
      } catch (e) {
        console.warn("[littletusk] ledger sync failed", e);
      }
    });
    return this.ledgerChain;
  }

  /** A plain-words reason not to ask the model right now, or undefined. */
  private async preflight(): Promise<string | undefined> {
    if (!this.hasKey) return t(this.settings.language, "noKey");
    if (overLimit(await this.spent(), this.settings.monthlyLimit)) return t(this.settings.language, "budgetReached");
    return undefined;
  }

  // ---------- talking to the browser ----------

  private async page(cmd: PageCommand): Promise<PageResult> {
    if (!this.taskTab) return { ok: false, error: "NO_TAB: I do not know which tab the person is using yet." };
    const r = await sendSw<PageResult>({ to: "sw", type: "page", tabId: this.taskTab, cmd, reqId: crypto.randomUUID() });
    return r ?? { ok: false, error: "TAB_NOT_RESPONDING" };
  }

  private async openUrl(url: string): Promise<PageResult> {
    if (!this.taskTab) return { ok: false, error: "NO_TAB: I do not know which tab the person is using yet." };
    const r = await sendSw<PageResult>({ to: "sw", type: "open-url", tabId: this.taskTab, url, reqId: crypto.randomUUID() });
    return r ?? { ok: false, error: "TAB_NOT_RESPONDING" };
  }

  // ---------- the chat the overlay shows ----------

  async buildChatView(): Promise<ChatView> {
    const st = await this.readState();
    return buildView({
      value: this.view?.value,
      lang: this.settings.language,
      spend: await this.spent(),
      limit: this.settings.monthlyLimit,
      currency: this.settings.currency,
      taskTabId: st.taskTabId,
    });
  }

  private async broadcast() {
    try {
      const view = await this.buildChatView();
      void sendSw({ to: "sw", type: "broadcast-view", view });
      const finished = view.items.filter((i) => i.kind === "tusk" && !i.streaming) as { id: string; text: string }[];
      if (!this.spokenInit) {
        finished.forEach((i) => this.spoken.add(i.id));
        this.spokenInit = true;
        return;
      }
      for (const i of finished) {
        if (this.spoken.has(i.id)) continue;
        this.spoken.add(i.id);
        if (this.settings.speakAnswers) void sendSw({ to: "sw", type: "speak", text: i.text, lang: this.settings.language });
      }
    } catch (e) {
      console.warn("[littletusk] broadcast failed", e);
    }
  }

  // ---------- inputs ----------

  /** Entry point for every relayed message. */
  async handle(msg: RelayedToAgent): Promise<unknown> {
    elog("handle", msg.type);
    switch (msg.type) {
      case "get-view":
        return { view: await this.buildChatView() };
      case "user-input":
        return void (await this.userInput(msg.text, msg.tabId, msg.via));
      case "answer":
        return void (await this.answer(msg.itemId, msg.yes));
      case "new-topic":
        return void (await this.newTopic());
      case "settings-changed":
        return void (await this.settingsChanged());
      case "mic-start":
        return void (await this.micStart(msg.tabId));
      case "mic-stop":
        return void (await this.micStop());
      case "overlay-help": {
        // The person accepted help with a popup that has no obvious close button.
        if (msg.tabId) await this.update((s) => void (s.taskTabId = msg.tabId!));
        this.taskTab = msg.tabId ?? this.taskTab;
        await this.update((s) => void (s.doIt = true));
        const what = msg.overlay.summary ? ` It says: "${msg.overlay.summary.slice(0, 120)}"` : "";
        return void (await this.userInput(`Please help me close the box that is in the way.${what}`, msg.tabId, "chat", true));
      }
      case "log-action":
        return void (await this.write(KIND.action, { text: msg.text }));
    }
  }

  private async userInput(text: string, tabId: number | undefined, via: "chat" | "voice", keepDoIt = false) {
    text = text.trim();
    if (!text) return;
    await this.loadSettings();
    if (__E2E__) {
      await this.scripted?.reload();
      this.extra = Number((await sendSw<{ value: unknown }>({ to: "sw", type: "e2e-get", key: "__spend_seed" }))?.value ?? 0) || 0;
    }
    let st = await this.readState();
    if (st.lastActive && Date.now() - st.lastActive > IDLE_RESET_MS) {
      await this.newTopic();
      st = await this.readState();
    }
    if (tabId) this.taskTab = tabId;
    const still = saysStillBroken(text);
    const stillCount = still ? st.stillCount + 1 : st.stillCount;
    const escalate = !st.escalated && stillCount >= 2;
    await this.update((s) => {
      if (tabId) s.taskTabId = tabId;
      s.lastActive = Date.now();
      s.grantConfirm = false; // a new message withdraws any older yes
      s.stillCount = stillCount;
      s.doIt = keepDoIt || asksToDoIt(text) || (still && s.doIt);
      if (escalate) s.escalated = true;
    });
    if (escalate) await this.applyModel();
    const problem = await this.preflight();
    if (problem) {
      await this.write(KIND.user, { text, via });
      await this.notice(problem);
      return;
    }
    const sub = await this.root.submit({ type: "input", content: text, entry: { kind: KIND.user, data: { text, via } } }, ctx);
    this.watchSubmission(sub);
  }

  private watchSubmission(sub: { wait(c: typeof ctx): Promise<{ status: string; reason?: string }> }) {
    void sub.wait(ctx).then(
      async (settled) => {
        if (settled.status === "unanswered" && settled.reason !== "aborted" && settled.reason !== "withdrawn") {
          console.warn("[littletusk] run ended without an answer:", settled.reason);
          elog("unanswered", settled.reason ?? "");
          const entries = this.view?.value.entries ?? [];
          const lastAssistant = [...entries].reverse().find((e) => e.kind === "pi.assistant");
          if (lastAssistant?.model?.[0]?.stopReason !== "error") await this.notice(t(this.settings.language, "modelError"));
        }
      },
      (e) => (console.warn("[littletusk] wait failed", e), elog("wait failed", e)),
    );
  }

  private async answer(itemId: string, yes: boolean) {
    const entries = this.view.value.entries;
    const item = entries.find((e) => String(e.id) === itemId && (e.kind === KIND.confirm || e.kind === KIND.offer));
    if (!item) return;
    if (entries.some((e) => e.kind === KIND.answer && String(e.data?.itemId) === itemId)) return; // already answered
    await this.loadSettings();
    await this.update((s) => {
      s.lastActive = Date.now();
      if (item.kind === KIND.confirm) s.grantConfirm = yes;
      else if (item.kind === KIND.offer) s.doIt = yes;
    });
    const entry = { kind: KIND.answer, data: { itemId, yes } };
    const problem = await this.preflight();
    if (problem) {
      await this.root.submit({ type: "write", entry }, ctx);
      await this.notice(problem);
      return;
    }
    const content = yes ? "(The person pressed Yes.)" : "(The person pressed No.)";
    const sub = await this.root.submit({ type: "input", content, entry }, ctx);
    this.watchSubmission(sub);
  }

  private async newTopic() {
    await this.update((s) => {
      s.grantConfirm = false;
      s.doIt = false;
      s.failStreak = 0;
      s.stillCount = 0;
      s.escalated = false;
    });
    await this.root.reset(undefined, ctx);
    await this.applyModel();
    this.broadcaster.call();
  }

  // ---------- speech ----------

  private async loadSpeech(): Promise<SpeechLike | undefined> {
    if (this.speech) return this.speech;
    // Optional: the speech module is built by another part. Without it, the mic says so.
    const loader = Object.values(import.meta.glob("../speech/index.ts"))[0];
    if (!loader) return undefined;
    const mod = (await loader()) as { createSpeech(o: unknown): SpeechLike };
    this.speech = mod.createSpeech({
      wasmBase: chrome.runtime.getURL("wasm/"),
      onLevel: (level: number) => void sendSw({ to: "sw", type: "mic-level", level, listening: true }),
      onState: (state: string, detail?: string) => {
        if (state === "listening") void sendSw({ to: "sw", type: "mic-level", level: 0, listening: true });
        else if (state === "idle" || state === "error") {
          void sendSw({ to: "sw", type: "mic-level", level: 0, listening: false });
          if (state === "error") void this.notice(t(this.settings.language, "micError"));
          else if (detail && !this.micSubmitted) {
            this.micSubmitted = true;
            void this.userInput(detail, this.taskTab || undefined, "voice");
          }
        }
      },
    });
    return this.speech;
  }

  private async micStart(tabId?: number) {
    await this.loadSettings();
    if (tabId) this.taskTab = tabId;
    const speech = await this.loadSpeech();
    if (!speech) {
      await this.notice(t(this.settings.language, "micSoon"));
      void sendSw({ to: "sw", type: "mic-level", level: 0, listening: false });
      return;
    }
    this.micSubmitted = false;
    await speech.start(this.settings.language);
  }

  private async micStop() {
    const speech = this.speech;
    if (!speech) {
      void sendSw({ to: "sw", type: "mic-level", level: 0, listening: false });
      return;
    }
    const text = (await speech.stop()).trim();
    void sendSw({ to: "sw", type: "mic-level", level: 0, listening: false });
    if (text && !this.micSubmitted) {
      this.micSubmitted = true;
      await this.userInput(text, this.taskTab || undefined, "voice");
    }
  }
}
