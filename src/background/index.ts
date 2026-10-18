// Service worker: the message router. It keeps one offscreen document (the agent) alive, forwards messages
// between content scripts and the agent, runs page commands in tabs, speaks with chrome.tts and watches settings.
import type { ChatView, FromAgent, FromContent, Language, PageCommand, PageResult, Settings, ToAgent, ToContent } from "../shared/protocol";
import { isWebUrl } from "../shared/protocol";
import { loadSettings, publicSettings, saveSettings } from "../shared/settings";
import { SETTINGS_KEY } from "../shared/protocol";

const OFFSCREEN_PATH = "pages/offscreen.html";
const OFFSCREEN_URL = chrome.runtime.getURL(OFFSCREEN_PATH);
const PAGE_TIMEOUT_MS = 15_000;
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

// ---------- the offscreen document ----------

let creating: Promise<void> | undefined;

export async function ensureOffscreen(): Promise<void> {
  // Test builds: the storage specs open the database themselves, so the agent must stay away from it.
  if (__E2E__ && (await chrome.storage.local.get("__no_offscreen")).__no_offscreen) return;
  const existing = await chrome.runtime.getContexts({ contextTypes: ["OFFSCREEN_DOCUMENT" as chrome.runtime.ContextType], documentUrls: [OFFSCREEN_URL] });
  if (existing.length) return;
  if (!creating) {
    creating = chrome.offscreen
      .createDocument({
        url: OFFSCREEN_PATH,
        reasons: ["WORKERS" as chrome.offscreen.Reason, "USER_MEDIA" as chrome.offscreen.Reason],
        justification: "Runs Tusk's agent and its local database, and listens to the microphone when the person speaks.",
      })
      .catch((e) => {
        // A concurrent creation (another wake-up of this worker) is fine.
        if (!String(e?.message ?? e).includes("Only a single offscreen")) throw e;
      })
      .finally(() => {
        creating = undefined;
      });
  }
  await creating;
}

/** Forward a message to the agent. Retries briefly while the offscreen document starts. */
async function relay(msg: ToAgent): Promise<unknown> {
  await ensureOffscreen();
  for (let i = 0; ; i++) {
    try {
      return await chrome.runtime.sendMessage({ ...msg, relayed: true });
    } catch (e) {
      if (i >= 20 || !/Receiving end does not exist|Could not establish connection/.test(String((e as Error)?.message ?? e))) throw e;
      await sleep(250);
    }
  }
}

// ---------- tabs ----------

const READ_ONLY_OPS = new Set<PageCommand["op"]>(["snapshot", "describe", "point", "spotlight", "clear", "ask-type", "scroll"]);
const NOT_READY = /Receiving end does not exist|Could not establish connection/;
const PORT_CLOSED = /message port closed|port closed before a response/i;

async function injectContentScript(tabId: number): Promise<void> {
  try {
    await chrome.scripting.executeScript({ target: { tabId }, files: ["content.js"] });
  } catch {
    /* a page we may not touch (chrome://, the web store) */
  }
}

export async function pageCommand(tabId: number, cmd: PageCommand): Promise<PageResult> {
  const deadline = Date.now() + PAGE_TIMEOUT_MS;
  let tries = 0;
  let injected = false;
  const timeout: PageResult = { ok: false, error: "TAB_NOT_RESPONDING" };
  while (Date.now() < deadline) {
    try {
      const msg: ToContent = { to: "content", type: "page", cmd };
      const r = await Promise.race([chrome.tabs.sendMessage(tabId, msg) as Promise<PageResult | undefined>, sleep(Math.max(0, deadline - Date.now())).then(() => timeout)]);
      if (r) return r;
    } catch (e) {
      const text = String((e as Error)?.message ?? e);
      if (PORT_CLOSED.test(text) && !READ_ONLY_OPS.has(cmd.op)) {
        // The page probably navigated because of this very action: do not run it twice.
        return { ok: true, text: "The page changed while doing that (it probably moved on to a new page). Read the page again." };
      }
      if (!NOT_READY.test(text) && !PORT_CLOSED.test(text)) return { ok: false, error: `TAB_NOT_RESPONDING: ${text}` };
    }
    tries++;
    if (!injected && tries >= 3) {
      injected = true;
      await injectContentScript(tabId);
    }
    await sleep(400);
  }
  return timeout;
}

async function openUrl(tabId: number, url: string): Promise<PageResult> {
  if (!isWebUrl(url)) return { ok: false, error: "NOT_ALLOWED: only web addresses (http or https) can be opened." };
  try {
    await chrome.tabs.update(tabId, { url });
  } catch (e) {
    return { ok: false, error: `TAB_NOT_RESPONDING: ${String((e as Error)?.message ?? e)}` };
  }
  await new Promise<void>((resolve) => {
    const done = () => {
      chrome.tabs.onUpdated.removeListener(listener);
      resolve();
    };
    const listener = (id: number, info: { status?: string }) => {
      if (id === tabId && info.status === "complete") done();
    };
    chrome.tabs.onUpdated.addListener(listener);
    setTimeout(done, 10_000);
  });
  return { ok: true, text: `Opened ${url}. Read the page to see it.` };
}

async function toAllTabs(msg: ToContent): Promise<void> {
  const tabs = await chrome.tabs.query({});
  await Promise.all(tabs.filter((t) => t.id !== undefined).map((t) => chrome.tabs.sendMessage(t.id!, msg).catch(() => undefined)));
}

// ---------- speech ----------

const TTS_LANG: Record<Language, string> = { en: "en-US", de: "de-DE", es: "es-ES", "en-IN": "en-IN" };

async function speak(text: string, lang: Language): Promise<void> {
  const want = TTS_LANG[lang] ?? "en-US";
  const base = want.slice(0, 2).toLowerCase();
  let voiceName: string | undefined;
  try {
    const voices = await chrome.tts.getVoices();
    const fits = voices.filter((v) => (v.lang ?? "").toLowerCase().startsWith(base));
    const exact = fits.filter((v) => (v.lang ?? "").toLowerCase() === want.toLowerCase());
    const pool = exact.length ? exact : fits;
    voiceName = (pool.find((v) => !v.remote) ?? pool[0])?.voiceName;
  } catch {
    /* default voice */
  }
  chrome.tts.speak(text, { lang: want, voiceName, rate: 0.95 });
}

// ---------- settings ----------

async function patchSettings(patch: unknown): Promise<void> {
  const p = (patch ?? {}) as Record<string, unknown>;
  const next: Partial<Settings> = {};
  if (p.language === "en" || p.language === "de" || p.language === "es" || p.language === "en-IN") next.language = p.language;
  if (p.mode === "show" || p.mode === "look-after") next.mode = p.mode;
  if (typeof p.speakAnswers === "boolean") next.speakAnswers = p.speakAnswers;
  if (Object.keys(next).length) await saveSettings(next);
}

async function tuck(scope: unknown, tabUrl: string | undefined): Promise<void> {
  const s = await loadSettings();
  if (scope === "hour") await saveSettings({ tuckedUntil: Date.now() + 3600_000 });
  else if (scope === "site" && tabUrl) {
    try {
      await saveSettings({ tuckedSites: { ...s.tuckedSites, [new URL(tabUrl).hostname]: 8.64e15 } });
    } catch {
      /* no host */
    }
  }
}

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "local" || !changes[SETTINGS_KEY]) return;
  void (async () => {
    const s = await loadSettings();
    await toAllTabs({ to: "content", type: "settings", settings: publicSettings(s) });
    const msg: ToAgent = { to: "agent", type: "settings-changed" };
    await relay(msg).catch(() => undefined);
  })();
});

// ---------- routing ----------

type SwMessage = FromAgent | FromContent;

/** Only the offscreen document may use these. */
const AGENT_ONLY = new Set(["page", "broadcast-view", "speak", "mic-level", "open-url", "get-settings", "e2e-get", "e2e-set"]);

function fromOffscreen(sender: chrome.runtime.MessageSender): boolean {
  return !sender.tab && sender.url === OFFSCREEN_URL;
}

async function handleSw(msg: SwMessage, sender: chrome.runtime.MessageSender): Promise<unknown> {
  if (AGENT_ONLY.has(msg.type) && !fromOffscreen(sender)) return undefined;
  switch (msg.type) {
    case "get-public-settings":
      return publicSettings(await loadSettings());
    case "patch-settings":
      return void (await patchSettings(msg.patch));
    case "tuck":
      return void (await tuck(msg.scope, sender.tab?.url));
    case "open-setup":
      return void (await chrome.tabs.create({ url: chrome.runtime.getURL("pages/setup.html") }));
    case "get-settings":
      return loadSettings();
    case "page":
      return pageCommand(msg.tabId, msg.cmd);
    case "open-url":
      return openUrl(msg.tabId, msg.url);
    case "broadcast-view":
      return void (await toAllTabs({ to: "content", type: "view", view: msg.view as ChatView }));
    case "speak":
      return void (await speak(msg.text, msg.lang));
    case "open-mic-permission":
      return void (await chrome.windows.create({
        url: chrome.runtime.getURL("pages/setup.html#mic"), type: "popup", width: 520, height: 460, focused: true,
      }));
    case "mic-level":
      return void (await toAllTabs({ to: "content", type: "mic", level: msg.level, listening: msg.listening, phase: msg.phase, progress: msg.progress }));
    case "e2e-get":
      if (__E2E__) return { value: (await chrome.storage.local.get(msg.key))[msg.key] };
      return undefined;
    case "e2e-set":
      if (__E2E__) await chrome.storage.local.set({ [msg.key]: msg.value });
      return undefined;
  }
}

chrome.runtime.onMessage.addListener((msg: unknown, sender, sendResponse) => {
  const m = msg as { to?: string; type?: string; relayed?: boolean; tabId?: number } | undefined;
  if (!m || typeof m !== "object") return false;
  if (m.to === "agent") {
    if (m.relayed) return false; // that one is for the offscreen document
    const out = { ...m, tabId: sender.tab?.id ?? m.tabId } as unknown as ToAgent;
    relay(out).then(sendResponse, () => sendResponse(undefined));
    return true;
  }
  if (m.to === "sw") {
    handleSw(m as SwMessage, sender).then(sendResponse, (e) => {
      console.warn("[littletusk] sw", e);
      sendResponse(undefined);
    });
    return true;
  }
  return false;
});

// Wake the agent whenever the worker starts: an interrupted run continues.
void ensureOffscreen().catch((e) => console.warn("[littletusk] offscreen", e));
chrome.runtime.onStartup.addListener(() => void ensureOffscreen());
chrome.runtime.onInstalled.addListener(() => void ensureOffscreen());
console.log("[littletusk] service worker started");

// The toolbar icon always brings Tusk back: hiding must never be a dead end for the person.
chrome.action.onClicked.addListener(() => {
  void saveSettings({ tuckedUntil: 0, tuckedSites: {} });
});
