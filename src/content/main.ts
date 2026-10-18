// Content script: the overlay (Tusk) and the page tools, wired to the service worker.
import type { ChatView, FromContent, OverlayInfo, PageCommand, PageResult, Settings, ToAgent, ToContent } from "../shared/protocol";
import { DEFAULT_SETTINGS } from "../shared/protocol";
import { publicSettings } from "../shared/settings";
import { t, type I18nKey } from "../shared/i18n";
import { handleSetupLink } from "./setup-link";
import { createPageTools } from "./page";
import { looksIrreversible } from "./page/safety";
import { mountOverlay, playground, type OverlayController } from "./ui";

type PublicSettings = Omit<Settings, "apiKey">;

const g = globalThis as unknown as { __littletusk?: boolean };

function main() {
  if (handleSetupLink(location)) return;
  if (window.top !== window || g.__littletusk) return;
  g.__littletusk = true;
  document.documentElement.setAttribute("data-littletusk", "ready");

  const tools = createPageTools(document, window);
  const isPlayground = !!document.querySelector('meta[name="littletusk-playground"]');
  let settings: PublicSettings | null = null;
  let ctrl: OverlayController | null = null;
  let stopWatch: (() => void) | null = null;
  let tuckTimer: ReturnType<typeof setTimeout> | undefined;
  const offered = new Map<string, OverlayInfo>();

  const send = <T = unknown>(msg: ToAgent | FromContent): Promise<T | undefined> => {
    try {
      return chrome.runtime.sendMessage(msg).then((r) => r as T, () => undefined);
    } catch {
      return Promise.resolve(undefined); // the extension was reloaded: this page needs a refresh
    }
  };

  const tuckedUntil = (s: PublicSettings): number => Math.max(s.tuckedUntil || 0, s.tuckedSites?.[location.hostname] || 0);
  const visible = (s: PublicSettings) => tuckedUntil(s) <= Date.now();

  // ---------- look after me: local, no model call until the person accepts ----------

  const OFFER_KEY: Record<OverlayInfo["kind"], I18nKey> = {
    "cookie-banner": "offerCookie",
    newsletter: "offerNewsletter",
    ad: "offerAd",
    modal: "offerPopup",
    other: "offerGeneric",
  };

  async function acceptHelp(overlayId: string) {
    const o = offered.get(overlayId);
    if (!o || !settings) return;
    const lang = settings.language;
    if (o.closeId) {
      const d = tools.describe(o.closeId);
      if (d && !d.irreversible && !looksIrreversible(d.name)) {
        const r = await tools.run({ op: "click", id: o.closeId }, { confirmed: false });
        if (r.ok) {
          void send({ to: "agent", type: "log-action", text: t(lang, "actClosed") });
          return;
        }
      }
    }
    void send({ to: "agent", type: "overlay-help", overlay: o, url: location.href });
  }

  function startWatching() {
    if (stopWatch || !ctrl) return;
    stopWatch = tools.watchOverlays((o) => {
      const el = tools.element(o.id);
      if (!el || !ctrl || !settings) return;
      offered.set(o.id, o);
      ctrl.offerOverlayHelp(o.id, el, t(settings.language, OFFER_KEY[o.kind] ?? "offerGeneric"));
    });
  }
  function stopWatching() {
    stopWatch?.();
    stopWatch = null;
  }

  // ---------- mount / unmount ----------

  function mount(s: PublicSettings) {
    ctrl = mountOverlay(
      {
        onSend: (text) => void send({ to: "agent", type: "user-input", text, via: "chat" }),
        onAnswer: (itemId, yes) => void send({ to: "agent", type: "answer", itemId, yes }),
        onMicStart: () => void send({ to: "agent", type: "mic-start" }),
        onMicStop: () => void send({ to: "agent", type: "mic-stop" }),
        onNewTopic: () => void send({ to: "agent", type: "new-topic" }),
        onSettingsChange: (patch) => void send({ to: "sw", type: "patch-settings", patch }),
        onTuck: (scope) => void send({ to: "sw", type: "tuck", scope }),
        onOpenFamilySettings: () => void send({ to: "sw", type: "open-setup" }),
        onAcceptOverlayHelp: (id) => void acceptHelp(id),
      },
      s,
    );
    if (isPlayground) {
      playground(ctrl);
      return;
    }
    // Show the chat again after a navigation or reload.
    void send<{ view: ChatView }>({ to: "agent", type: "get-view" }).then((r) => r?.view && ctrl?.setView(r.view));
  }

  function unmount() {
    stopWatching();
    ctrl?.destroy();
    ctrl = null;
  }

  function apply(s: PublicSettings) {
    settings = s;
    clearTimeout(tuckTimer);
    if (visible(s)) {
      if (!ctrl) mount(s);
      else ctrl.setSettings(s);
      if (!isPlayground && s.mode === "look-after") startWatching();
      else stopWatching();
    } else {
      unmount();
      const wait = tuckedUntil(s) - Date.now();
      if (wait < 2 ** 30) tuckTimer = setTimeout(() => settings && apply(settings), wait + 50);
    }
  }

  // ---------- commands from the agent ----------

  const notFound = (id: string): PageResult => ({ ok: false, error: `NOT_FOUND: no element [${id}] on this page now. Read the page again.` });

  async function onPage(cmd: PageCommand): Promise<PageResult> {
    switch (cmd.op) {
      case "point":
      case "spotlight":
      case "ask-type": {
        const el = tools.element(cmd.id);
        if (!el) return notFound(cmd.id);
        if (!ctrl) return { ok: false, error: "TUSK_HIDDEN: the person has tucked Tusk away on this site." };
        if (cmd.op === "point") ctrl.pointAt(el, cmd.say);
        else if (cmd.op === "spotlight") ctrl.spotlight(el, cmd.say);
        else ctrl.askType(el, cmd.say);
        const d = tools.describe(cmd.id) ?? undefined;
        const verb = cmd.op === "point" ? "Pointed at" : cmd.op === "spotlight" ? "Put a spotlight on" : "Marked";
        return { ok: true, element: d, text: `${verb} [${cmd.id}]${d ? ` "${d.name}"` : ""}.` };
      }
      case "clear":
        ctrl?.clear();
        return { ok: true, text: "Cleared." };
      default:
        // `confirmed` comes only from the agent's own confirmation state, never from the model.
        return tools.run(cmd, { confirmed: cmd.op !== "snapshot" && cmd.op !== "describe" && cmd.op !== "scroll" && cmd.op !== "back" && cmd.confirmed === true });
    }
  }

  chrome.runtime.onMessage.addListener((msg: ToContent | undefined, _sender, sendResponse) => {
    if (!msg || msg.to !== "content") return false;
    switch (msg.type) {
      case "view":
        ctrl?.setView(msg.view);
        return false;
      case "settings":
        apply(msg.settings);
        return false;
      case "mic":
        ctrl?.setMic(msg.level, msg.listening);
        return false;
      case "page":
        onPage(msg.cmd).then(sendResponse, (e) => sendResponse({ ok: false, error: `ERROR: ${String((e as Error)?.message ?? e)}` }));
        return true;
    }
    return false;
  });

  const first = async () => (await send<PublicSettings>({ to: "sw", type: "get-public-settings" })) ?? (await send<PublicSettings>({ to: "sw", type: "get-public-settings" }));
  // Without an answer (the extension was just reloaded) Tusk still shows, with the defaults.
  void first().then((s) => apply(s ?? publicSettings(DEFAULT_SETTINGS)));
}

main();
console.log("[littletusk] content script running");
