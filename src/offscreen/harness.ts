// The agent: one pi-durable conversation per browser profile, wired to the service worker.
import { BACKGROUND_CONTEXT } from "@earendil-works/chord/context";
import { createRegistry, Harness, UsageDoc, type Conversation } from "@earendil-works/pi-durable";
import type { ChatItem, ChatView, ConversationPhase, ConversationState, FromAgent, Language, PageCommand, PageResult, RelayedToAgent, Settings, SpeechEvent, SpeechHostCommand, VoiceTest } from "../shared/protocol";
import { DEFAULT_SETTINGS } from "../shared/protocol";
import { LANGUAGE_NAMES, t } from "../shared/i18n";
import { isJunkTranscript } from "../speech/junk";
import { openTuskStorage, type TuskStorage } from "../storage/index";
import { ledgerDelta, monthKey, overLimit, spendNow, totalCost } from "./budget";
import { asksToDoIt, saysStillBroken } from "./gate";
import { createTuskModels, type TuskModels } from "./models";
import { INITIAL_STATE, KIND, LedgerDoc, StateDoc, type TuskState } from "./state";
import { createExtension } from "./tools";
import { buildView, explainModelError, throttle, type ViewValueLike } from "./view";

const ctx = BACKGROUND_CONTEXT;
const IDLE_RESET_MS = 6 * 3600 * 1000;
const BROADCAST_MS = 100;
const conversationSilenceMs = 20_000; // F1: a long silence ends the conversation
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

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
  pause(paused: boolean): void;
  dispose?(): void;
}

interface ConvState {
  active: boolean;
  phase: ConversationPhase;
  you?: string;
  tusk?: string;
  progress?: string;
  lastHeard: number;
  busy: boolean; // a heard sentence is being answered
  watchdog?: ReturnType<typeof setInterval>;
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
  private manualMic = false; // the chat box's microphone is on (A1: words go to the box, never sent by themselves)
  private conv: ConvState = { active: false, phase: "listening", lastHeard: 0, busy: false };
  private readonly speakWaiters = new Map<string, () => void>();
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
        // In a conversation the answer is spoken by the conversation loop, which then listens again.
        if (this.settings.speakAnswers && !this.conv.active) void sendSw({ to: "sw", type: "speak", text: i.text, lang: this.settings.language });
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
      case "mic-pause":
        return void this.speech?.pause(msg.paused);
      case "mic-granted":
        return void (await this.micStart(this.taskTab || undefined));
      case "conversation-start":
        return void (await this.conversationStart(msg.tabId));
      case "conversation-stop":
        return void this.endConversation();
      case "speak-ended":
        return void (() => { const done = this.speakWaiters.get(msg.reqId); this.speakWaiters.delete(msg.reqId); done?.(); })();
      case "speech-event":
        return void this.onSpeechEvent(msg.event);
      case "overlay-help": {
        // The person accepted help with a popup that has no obvious close button.
        if (msg.tabId) await this.update((s) => void (s.taskTabId = msg.tabId!));
        this.taskTab = msg.tabId ?? this.taskTab;
        await this.update((s) => void (s.doIt = true));
        const what = msg.overlay.summary ? ` It says: "${msg.overlay.summary.slice(0, 120)}"` : "";
        return void (await this.userInput(`Please help me close the box that is in the way.${what}`, msg.tabId, "chat", true));
      }
      case "log-action":
        return void (await this.write(KIND.action, { text: msg.text, failed: msg.failed === true }));
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

  private watchSubmission(sub: { wait(c: typeof ctx): Promise<{ status: string; reason?: string; detail?: unknown }> }) {
    void sub.wait(ctx).then(
      async (settled) => {
        if (settled.status === "unanswered" && settled.reason !== "aborted" && settled.reason !== "withdrawn") {
          console.warn("[littletusk] run ended without an answer:", settled.reason);
          elog("unanswered", settled.reason ?? "");
          const lang = this.settings.language;
          const entries = this.view?.value.entries ?? [];
          const last = entries[entries.length - 1];
          const failed = last?.kind === "pi.assistant" ? last.model?.[0] : undefined;
          // pi-durable hands the real reason over as `detail`; a failed answer in the transcript carries its own.
          const detail = String(settled.detail ?? failed?.errorMessage ?? "").replace(/sk-[A-Za-z0-9_-]{8,}/g, "[key]");
          console.warn("[littletusk] model error:", settled.reason, detail);
          if (failed?.stopReason === "error") return; // the chat already shows this failure, explained (view.ts)
          await this.notice(settled.reason === "no_model"
            ? `${t(lang, "errModel")}\n${t(lang, "errDetail", { detail: `${this.settings.provider} / ${this.settings.model}` })}`
            : explainModelError(lang, `${this.settings.provider}: ${detail}`));
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

  /** Start a fresh chat: stop what Tusk is doing, forget this conversation and greet again. */
  private async newTopic() {
    this.endConversation();
    void this.speech?.stop().catch(() => undefined); // end any listening session without sending it
    await this.root.abort(ctx); // an answer in progress, queued messages, a pending question
    await this.update((s) => {
      s.grantConfirm = false;
      s.doIt = false;
      s.failStreak = 0;
      s.stillCount = 0;
      s.escalated = false;
      s.greeted = false;
    });
    await this.root.reset(undefined, ctx);
    await this.applyModel();
    await this.maybeGreet();
    this.broadcaster.call();
  }

  // ---------- speech ----------

  private sendMic(level: number, listening: boolean, phase?: "starting" | "listening" | "paused" | "transcribing", progress?: string, text?: string): void {
    void sendSw({ to: "sw", type: "mic-level", level, listening, phase, progress, text });
  }

  /** The microphone runs in the composing iframe (an extension page); this side sends it commands. */
  private async speechCommand(cmd: SpeechHostCommand): Promise<void> {
    await sendSw({ to: "sw", type: "speech-host", tabId: this.taskTab || undefined, cmd });
  }

  private async loadSpeech(): Promise<SpeechLike | undefined> {
    if (this.speech) return this.speech;
    this.speech = {
      start: async (lang: string) => { await this.speechCommand({ op: "start", lang: lang as Language }); },
      stop: async () => { await this.speechCommand({ op: "stop" }); return ""; },
      pause: (paused: boolean) => { void this.speechCommand({ op: "pause", paused }); },
      dispose: () => { void this.speechCommand({ op: "stop" }); },
    };
    return this.speech;
  }

  /** Levels, live words and state from the composing iframe. */
  private onSpeechEvent(e: SpeechEvent): void {
    if (e.event === "level") {
      if (this.conv.active && e.level > 0.1) this.conv.lastHeard = Date.now();
      this.sendMic(e.level, true, "listening");
    } else if (e.event === "partial") {
      if (this.conv.active) { this.conv.lastHeard = Date.now(); return; } // captions, not the chat box
      this.sendMic(0, true, "listening", undefined, e.text);
    } else {
      this.onSpeechState(e.state, e.detail);
    }
  }

  private onSpeechState(state: string, detail?: string): void {
    const lang = this.settings.language;
    if (state === "listening" || state === "paused") {
      this.sendMic(0, true, state);
      if (this.conv.active) { this.conv.phase = "listening"; this.broadcastConversation(); }
    } else if (state === "transcribing") {
      this.sendMic(0, true, "transcribing", detail);
    } else if (state === "loading") {
      // B3: the listening pack downloads on first use, with a bar.
      this.sendMic(0, true, "starting", detail);
      if (this.conv.active) { this.conv.phase = "starting"; this.conv.progress = detail; this.broadcastConversation(); }
    } else if (state === "idle") {
      const wasManual = this.manualMic;
      this.manualMic = false;
      this.sendMic(0, false, undefined, undefined, detail);
      if (this.conv.active) {
        if (detail) void this.onConversationHeard(detail);
        return; // the 20-second watchdog ends a conversation nobody speaks in
      }
      if (wasManual && !detail) void this.notice(t(lang, "noSpeech"));
      // A1: nothing is sent here. The words stay in the chat's box until the person presses Send.
    } else if (state === "error") {
      this.manualMic = false;
      this.sendMic(0, false);
      if (detail === "MIC_SILENT") void this.notice(t(lang, "micSilent"));
      else if (detail === "MIC_PERMISSION") {
        // An offscreen document cannot show the permission prompt; a small extension window can.
        void this.notice(t(lang, "micAllow"));
        void sendSw({ to: "sw", type: "open-mic-permission" });
      } else void this.notice(t(lang, "micError"));
      if (this.conv.active) this.endConversation();
    }
  }

  private async micStart(tabId?: number) {
    await this.loadSettings();
    if (tabId) this.taskTab = tabId;
    if (this.conv.active) this.endConversation();
    const speech = await this.loadSpeech();
    if (!speech) {
      await this.notice(t(this.settings.language, "micSoon"));
      this.sendMic(0, false);
      return;
    }
    this.manualMic = true;
    // Show the listening state at once: finding a working microphone takes a moment.
    this.sendMic(0, true, "starting");
    await speech.start(this.settings.language);
  }

  private async micStop() {
    const speech = this.speech;
    this.manualMic = false;
    if (!speech) {
      this.sendMic(0, false);
      return;
    }
    // The engine reports the final words as an idle state (see onSpeechState).
    await speech.stop();
  }

  // ---------- hands-free conversation (E1 + F1) ----------

  private conversationState(): ConversationState | null {
    if (!this.conv.active) return null;
    return { on: true, phase: this.conv.phase, you: this.conv.you, tusk: this.conv.tusk, progress: this.conv.progress };
  }

  private broadcastConversation(): void {
    void sendSw({ to: "sw", type: "conversation-state", state: this.conversationState() });
  }

  private async conversationStart(tabId?: number): Promise<void> {
    if (this.conv.active) return;
    await this.loadSettings();
    if (tabId) this.taskTab = tabId;
    const speech = await this.loadSpeech();
    if (!speech) {
      await this.notice(t(this.settings.language, "micSoon"));
      return;
    }
    // A microphone session started from the chat box is replaced by the conversation.
    this.manualMic = false;
    await speech.stop().catch(() => "");
    this.conv = { active: true, phase: "starting", lastHeard: Date.now(), busy: false };
    this.broadcastConversation();
    this.conv.watchdog = setInterval(() => {
      if (!this.conv.active) return;
      if (this.conv.phase === "listening" && Date.now() - this.conv.lastHeard >= conversationSilenceMs) this.endConversation();
    }, 1000);
    await this.listenForConversation();
  }

  private async listenForConversation(): Promise<void> {
    if (!this.conv.active) return;
    this.conv.phase = "starting";
    this.conv.progress = undefined;
    this.conv.lastHeard = Date.now();
    this.broadcastConversation();
    await this.speech?.start(this.settings.language);
  }

  private endConversation(): void {
    if (!this.conv.active) return;
    this.conv.active = false;
    this.conv.busy = false;
    this.conv.phase = "listening";
    if (this.conv.watchdog) clearInterval(this.conv.watchdog);
    this.conv.watchdog = undefined;
    this.sendMic(0, false);
    void this.speech?.stop().catch(() => "");
    this.broadcastConversation();
  }

  /** One thing was heard in a conversation: drop junk, answer it, speak, then listen again. */
  private async onConversationHeard(heardText: string): Promise<void> {
    if (!this.conv.active || this.conv.busy || this.conv.phase !== "listening") return;
    this.conv.busy = true;
    const lang = this.settings.language;
    const heard = heardText.replace(/\s+/g, " ").trim();
    if (isJunkTranscript(heard, lang)) {
      this.conv.busy = false;
      await this.notice(t(lang, "noCatch"));
      if (this.conv.active) await this.listenForConversation();
      return;
    }
    this.conv.you = heard;
    this.conv.phase = "thinking";
    this.broadcastConversation();
    const before = new Set((await this.buildChatView()).items.map((i) => i.id));
    await this.userInput(heard, this.taskTab || undefined, "voice");
    const answer = await this.waitForReply(before);
    if (!this.conv.active) { this.conv.busy = false; return; }
    if (answer) {
      this.conv.tusk = answer;
      this.conv.phase = "speaking";
      this.broadcastConversation();
      await this.speakConversation(answer);
    }
    this.conv.busy = false;
    if (this.conv.active) await this.listenForConversation();
  }

  /** Waits until Tusk's answer (or a notice) has arrived and the run is over. */
  private async waitForReply(before: Set<string>): Promise<string> {
    for (let i = 0; i < 300; i++) {
      if (!this.conv.active) return "";
      await sleep(i === 0 ? 400 : 200);
      const view = await this.buildChatView();
      if (view.busy) continue;
      const fresh = [...view.items].reverse().find((it): it is Extract<ChatItem, { kind: "tusk" | "notice" }> =>
        (it.kind === "tusk" || it.kind === "notice") && !before.has(it.id));
      if (fresh) return fresh.text;
      if (i > 25) return ""; // no answer came (for example, the person was told to set Tusk up)
    }
    return "";
  }

  /** Says one answer aloud in a conversation. Without a voice nothing is said, and the captions stay long enough to read. */
  private async speakConversation(text: string): Promise<void> {
    const lang = this.settings.language;
    const reqId = crypto.randomUUID();
    const ended = new Promise<void>((resolve) => {
      this.speakWaiters.set(reqId, resolve);
      setTimeout(() => { this.speakWaiters.delete(reqId); resolve(); }, 30_000);
    });
    const r = await sendSw<VoiceTest>({ to: "sw", type: "speak", text, lang, reqId });
    if (r && "none" in r) {
      // No voice for this language: no note about it either, because Tusk's settings hide Read aloud
      // when a computer has no voice. Let the person read the captions before listening again.
      await sleep(Math.min(6000, 1500 + text.length * 40));
      this.speakWaiters.delete(reqId);
      return;
    }
    await ended;
  }
}
