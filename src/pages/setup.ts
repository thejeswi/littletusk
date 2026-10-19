import { type Language, type Mode, type Settings, type VoiceList, type VoiceTest } from "../shared/protocol";
import { FEATURES } from "../shared/features";
import { PROVIDERS, modelsFor, providerInfo } from "../shared/providers";
import { keyMismatch } from "../shared/key-hint";
import { decodeSetupConfig, encodeSetupConfig, loadApiKeys, loadSettings, saveSettings, type SetupConfig } from "../shared/settings";

type UiLang = "en" | "de";
const LINK_BASE = "https://thejeswi.github.io/littletusk/setup.html";

const S = {
  en: {
    language: "Language",
    settingsTitle: "Little Tusk settings",
    confirmTitle: "Set up Little Tusk on this computer?",
    provider: "Provider", key: "Key", language_: "Language", mode: "Mode", limit: "Monthly limit", name: "Name",
    yes: "Yes, set it up", no: "No",
    declined: "Nothing was changed. You can close this tab.",
    done: "Little Tusk is set up.",
    micTitle: "Let Tusk hear you",
    micText: "If you want to talk to Tusk, it needs your permission to use the microphone. Speech is turned into text on this computer and is not sent anywhere.",
    micButton: "Let Tusk hear you",
    micOk: "Done. Tusk can hear you now.",
    micFail: "The microphone was not allowed. You can try again, or change it in the browser's site settings.",
    finish: "All done. You can close this tab.",
    formTitle: "Settings",
    getKey: "Where do I get a key?",
    show: "Show", hide: "Hide",
    everyday: "Everyday model", strong: "Stronger model (for hard tasks)",
    limitLabel: "Monthly spending limit (0 = none)",
    currency: "Currency",
    modeShow: "Show me how", modeLook: "Look after me",
    speak: "Read answers aloud",
    listeningTitle: "Listening",
    listeningOnDevice: "Listening happens on this computer. Nothing leaves it.",
    listenOnline: "Allow the browser's online listener as a backup. The voice is sent to Google.",
    talkToTusk: "Let my child talk to Tusk (microphone in the chat and the badge under Tusk; off by default)",
    readAloudTitle: "Read answers aloud",
    testVoice: "🔊 Test voice",
    voicesTitle: "Voices on this computer",
    voiceHelp: "Missing a voice? Your family can add one in the computer's settings.",
    voiceHelpLink: "How to add a voice",
    prepareListen: "Prepare listening",
    prepareHint: "Downloads Tusk's listening model once, so the first microphone use is quick.",
    prepareProgress: "Getting ready… {pct}",
    prepareDone: "Ready. The first listening will be quick.",
    prepareFail: "Could not get the listening model. Tusk will try again when the microphone is used.",
    voiceHeardOnline: "Did you hear me? Voice: {name} (online).",
    voiceHeardLocal: "Did you hear me? Voice: {name} (on this computer).",
    voiceNone: "This computer has no voice for {language}.",
    voiceNoVoice: "no voice on this computer",
    voiceOnlineTag: "online",
    voiceLocalTag: "on this computer",
    firstName: "The person's first name (optional)",
    keyMismatch: "But this key looks like a {key} key, and the provider is {selected}. Please choose {key} above, or paste a {selected} key.",
    keySaved: "key saved",
    save: "Save", saved: "Saved.", saveBad: "Please check the key and the limit.",
    linkTitle: "Make a setup link",
    linkText: "Build a link that sets up Little Tusk on another computer. Send it by email.",
    makeLink: "Make link", copy: "Copy link", copied: "Copied.",
    linkWarn: "This link contains your key. Use a key with a spending limit, and delete the email after setup.",
    langNames: { en: "English", de: "German", es: "Spanish", "en-IN": "English (India)" } as Record<string, string>,
    modes: { show: "Show me how", "look-after": "Look after me" } as Record<string, string>,
    perM: "per 1M tokens",
  },
  de: {
    language: "Sprache",
    settingsTitle: "Einstellungen für Little Tusk",
    confirmTitle: "Little Tusk auf diesem Computer einrichten?",
    provider: "Anbieter", key: "Schlüssel", language_: "Sprache", mode: "Modus", limit: "Monatslimit", name: "Name",
    yes: "Ja, einrichten", no: "Nein",
    declined: "Es wurde nichts geändert. Sie können diesen Tab schließen.",
    done: "Little Tusk ist eingerichtet.",
    micTitle: "Tusk soll Sie hören",
    micText: "Wenn Sie mit Tusk sprechen möchten, braucht er Ihre Erlaubnis für das Mikrofon. Sprache wird auf diesem Computer in Text umgewandelt und nirgendwohin gesendet.",
    micButton: "Tusk soll mich hören",
    micOk: "Fertig. Tusk kann Sie jetzt hören.",
    micFail: "Das Mikrofon wurde nicht erlaubt. Sie können es noch einmal versuchen oder in den Website-Einstellungen des Browsers ändern.",
    finish: "Alles erledigt. Sie können diesen Tab schließen.",
    formTitle: "Einstellungen",
    getKey: "Wo bekomme ich einen Schlüssel?",
    show: "Zeigen", hide: "Verbergen",
    everyday: "Alltagsmodell", strong: "Stärkeres Modell (für schwierige Aufgaben)",
    limitLabel: "Monatliches Ausgabenlimit (0 = keins)",
    currency: "Währung",
    modeShow: "Zeig mir, wie", modeLook: "Pass auf mich auf",
    speak: "Antworten vorlesen",
    listeningTitle: "Zuhören",
    listeningOnDevice: "Das Zuhören geschieht auf diesem Computer. Nichts verlässt ihn.",
    listenOnline: "Den Online-Zuhörer des Browsers als Ersatz erlauben. Die Stimme wird an Google gesendet.",
    talkToTusk: "Mein Kind darf mit Tusk sprechen (Mikrofon im Chat und der Knopf unter Tusk; standardmäßig aus)",
    readAloudTitle: "Antworten vorlesen",
    testVoice: "🔊 Stimme testen",
    voicesTitle: "Stimmen auf diesem Computer",
    voiceHelp: "Fehlt eine Stimme? Ihre Familie kann sie in den Einstellungen des Computers hinzufügen.",
    voiceHelpLink: "So fügen Sie eine Stimme hinzu",
    prepareListen: "Zuhören vorbereiten",
    prepareHint: "Lädt Tusk's Hör-Modell einmal herunter, damit das erste Mikrofon schnell bereit ist.",
    prepareProgress: "Ich mache mich bereit… {pct}",
    prepareDone: "Fertig. Das erste Zuhören geht schnell.",
    prepareFail: "Das Hör-Modell konnte nicht geladen werden. Tusk versucht es beim Mikrofon erneut.",
    voiceHeardOnline: "Haben Sie mich gehört? Stimme: {name} (online).",
    voiceHeardLocal: "Haben Sie mich gehört? Stimme: {name} (auf diesem Computer).",
    voiceNone: "Dieser Computer hat keine Stimme für {language}.",
    voiceNoVoice: "keine Stimme auf diesem Computer",
    voiceOnlineTag: "online",
    voiceLocalTag: "auf diesem Computer",
    firstName: "Vorname der Person (optional)",
    keyMismatch: "Aber dieser Schlüssel sieht nach {key} aus, eingestellt ist {selected}. Bitte wählen Sie oben {key} oder fügen Sie einen {selected}-Schlüssel ein.",
    keySaved: "Schlüssel gespeichert",
    save: "Speichern", saved: "Gespeichert.", saveBad: "Bitte prüfen Sie den Schlüssel und das Limit.",
    linkTitle: "Einrichtungslink erstellen",
    linkText: "Erstellt einen Link, der Little Tusk auf einem anderen Computer einrichtet. Schicken Sie ihn per E-Mail.",
    makeLink: "Link erstellen", copy: "Link kopieren", copied: "Kopiert.",
    linkWarn: "Dieser Link enthält Ihren Schlüssel. Nutzen Sie einen Schlüssel mit Ausgabenlimit und löschen Sie die E-Mail nach der Einrichtung.",
    langNames: { en: "Englisch", de: "Deutsch", es: "Spanisch", "en-IN": "Englisch (Indien)" } as Record<string, string>,
    modes: { show: "Zeig mir, wie", "look-after": "Pass auf mich auf" } as Record<string, string>,
    perM: "pro 1 Mio. Token",
  },
};

let ui: UiLang = navigator.language.toLowerCase().startsWith("de") ? "de" : "en";
const t = () => S[ui];
const app = document.getElementById("app") as HTMLElement;
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

function maskKey(k: string): string {
  return k.length <= 8 ? "…" : `${k.slice(0, 3)}…${k.slice(-4)}`;
}

type View = "confirm" | "mic" | "done" | "mic-only" | "form" | "declined";
let view: View = "form";
let pending: SetupConfig | null = null;

function render(): void {
  document.documentElement.lang = ui;
  $("title").textContent = view === "form" ? t().settingsTitle : "Little Tusk";
  $("langLabel").textContent = t().language;
  ($("uiLang") as HTMLSelectElement).value = ui;
  app.dataset.view = view;
  if (view === "confirm") renderConfirm();
  else if (view === "mic" || view === "done") renderMic(true);
  else if (view === "mic-only") renderMic(false);
  else if (view === "declined") app.innerHTML = `<section><p>${esc(t().declined)}</p></section>`;
  else void renderForm();
}

function renderConfirm(): void {
  const c = pending!;
  const tr = t();
  const greet = c.name ? `<p>${esc(c.name)}</p>` : "";
  app.innerHTML = `<section><h2>${esc(tr.confirmTitle)}</h2>${greet}
    <dl class="summary" id="summary">
      <dt>${tr.provider}</dt><dd id="s-provider">${esc(providerInfo(c.provider).label)}</dd>
      <dt>${tr.language_}</dt><dd id="s-language">${esc(tr.langNames[c.language])}</dd>
      <dt>${tr.mode}</dt><dd id="s-mode">${esc(tr.modes[c.mode])}</dd>
      <dt>${tr.limit}</dt><dd id="s-limit">${c.monthlyLimit === 0 ? "-" : `${c.monthlyLimit} ${c.currency}`}</dd>
      <dt>${tr.key}</dt><dd id="s-key">${esc(maskKey(c.apiKey))}</dd>
    </dl>
    <div class="buttons"><button id="yes">${tr.yes}</button><button id="no" class="secondary">${tr.no}</button></div></section>`;
  $("yes").onclick = async () => {
    const info = providerInfo(c.provider);
    const patch: Partial<Settings> = {
      provider: c.provider, apiKey: c.apiKey, language: c.language, mode: c.mode,
      monthlyLimit: c.monthlyLimit, currency: c.currency,
      model: c.model ?? info.model, strongModel: c.strongModel ?? info.strongModel,
      setupDone: true,
    };
    if (c.name) (patch as Record<string, unknown>).name = c.name;
    await saveSettings(patch);
    pending = null;
    history.replaceState(null, "", location.pathname); // the key must not stay in the address bar
    view = FEATURES.speechInput ? "mic" : "done"; // no microphone step while speaking to Tusk is off
    render();
  };
  $("no").onclick = () => {
    pending = null;
    history.replaceState(null, "", location.pathname);
    view = "declined";
    render();
  };
}

function micSection(): string {
  if (!FEATURES.speechInput) return "";
  const tr = t();
  return `<section id="mic"><h2>${tr.micTitle}</h2><p>${tr.micText}</p>
    <div class="buttons"><button id="micBtn">${tr.micButton}</button></div><p id="micMsg" role="status"></p></section>`;
}

function wireMic(): void {
  if (!FEATURES.speechInput) return;
  $("micBtn").onclick = async () => {
    const msg = $("micMsg");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach((tk) => tk.stop());
      msg.className = "ok";
      msg.textContent = t().micOk;
      app.dataset.mic = "granted";
      // Tell Tusk, which starts listening; the small permission window closes itself.
      void chrome.runtime.sendMessage({ to: "agent", type: "mic-granted" }).catch(() => undefined);
      if (view === "mic-only") setTimeout(() => window.close(), 1200);
    } catch {
      msg.className = "err";
      msg.textContent = t().micFail;
      app.dataset.mic = "denied";
    }
  };
}

/** C3 and D3: the family's listening choice, Test voice, and one line of voice per language. */
function wireVoiceSettings(): void {
  const tr = t();
  const fill = (s: string, vars: Record<string, string>) => s.replace(/\{(\w+)\}/g, (m, k: string) => vars[k] ?? m);
  const langName = (lang: Language) => tr.langNames[lang] ?? lang;
  const out = $("voiceOut");
  const list = $("voiceList");
  const say = async (lang: Language): Promise<void> => {
    out.className = "";
    out.textContent = "…";
    try {
      const r = (await chrome.runtime.sendMessage({ to: "sw", type: "test-voice", lang })) as VoiceTest | undefined;
      if (!r || "none" in r) {
        out.className = "warn";
        out.textContent = fill(tr.voiceNone, { language: langName(lang) });
      } else {
        out.className = "ok";
        out.textContent = fill(r.voice.online ? tr.voiceHeardOnline : tr.voiceHeardLocal, { name: r.voice.name });
      }
    } catch {
      out.className = "warn";
      out.textContent = fill(tr.voiceNone, { language: langName(lang) });
    }
  };
  $("testVoice").onclick = () => void say($<HTMLSelectElement>("language").value as Language);
  $("prepListen").onclick = async () => {
    const btn = $<HTMLButtonElement>("prepListen");
    const msg = $("prepMsg");
    btn.disabled = true;
    msg.className = "";
    msg.textContent = tr.prepareHint;
    try {
      const { createSpeech } = await import("../speech/index");
      const speech = createSpeech({
        wasmBase: chrome.runtime.getURL("wasm/"),
        onLevel: () => undefined,
        onState: (state, detail) => {
          if (state === "loading") msg.textContent = tr.prepareProgress.replace("{pct}", detail ?? "…");
          else if (state === "idle") { msg.className = "ok"; msg.textContent = tr.prepareDone; }
          else if (state === "error") { msg.className = "err"; msg.textContent = tr.prepareFail; }
        },
      });
      await speech.preload();
      speech.dispose();
    } catch {
      msg.className = "err";
      msg.textContent = tr.prepareFail;
    } finally {
      btn.disabled = false;
    }
  };
  void (async () => {
    try {
      const map = (await chrome.runtime.sendMessage({ to: "sw", type: "list-voices" })) as VoiceList | undefined;
      if (!map) return;
      list.innerHTML = (["en", "de", "es", "en-IN"] as Language[]).map((lang) => {
        const v = map[lang];
        const name = esc(langName(lang));
        return v
          ? `<div><b>${name}:</b> ${esc(v.name)} (${esc(v.online ? tr.voiceOnlineTag : tr.voiceLocalTag)})</div>`
          : `<div><b>${name}:</b> <span class="err">${esc(tr.voiceNoVoice)}</span></div>`;
      }).join("");
    } catch { /* no voices to list */ }
  })();
}

function renderMic(afterSetup: boolean): void {
  app.innerHTML = (afterSetup ? `<section><h2 id="doneMsg">${esc(t().done)}</h2></section>` : "") + micSection() +
    (afterSetup ? `<p>${esc(t().finish)}</p>` : "");
  wireMic();
}

function modelOptions(provider: string, selected: string): string {
  const list = modelsFor(provider);
  const ids = new Set(list.map((m) => m.id));
  const extra = selected && !ids.has(selected) ? `<option value="${esc(selected)}" selected>${esc(selected)}</option>` : "";
  return extra + list.map((m) =>
    `<option value="${esc(m.id)}"${m.id === selected ? " selected" : ""}>${esc(m.name)} (${m.inputPerMillion}/${m.outputPerMillion} USD ${esc(t().perM)})</option>`).join("");
}

async function renderForm(): Promise<void> {
  const s = await loadSettings();
  const saved = await loadApiKeys(); // one key per provider
  const drafts: Record<string, string> = {}; // typed but not saved yet
  const tr = t();
  const opt = (v: string, label: string, sel: boolean) => `<option value="${v}"${sel ? " selected" : ""}>${esc(label)}</option>`;
  app.innerHTML = `<section id="form"><h2>${tr.formTitle}</h2>
    <label class="field">${tr.provider}<select id="provider">${PROVIDERS.map((p) => opt(p.id, p.label + (saved[p.id] ? ` ✓ ${tr.keySaved}` : ""), p.id === s.provider)).join("")}</select></label>
    <div class="field"><label for="key" style="font-weight:600">${tr.key}</label>
      <div class="keyrow"><input id="key" type="password" autocomplete="off" spellcheck="false" value="${esc(saved[s.provider] ?? s.apiKey)}"><button type="button" id="keyToggle" class="secondary">${tr.show}</button></div>
      <small><a id="keyHelp" href="#" target="_blank" rel="noreferrer">${tr.getKey}</a></small></div>
    <label class="field">${tr.everyday}<select id="model"></select></label>
    <label class="field">${tr.strong}<select id="strongModel"></select></label>
    <div class="row"><label class="field">${tr.limitLabel}<input id="limit" type="number" min="0" max="1000" step="1" value="${s.monthlyLimit}"></label>
      <label class="field">${tr.currency}<select id="currency">${opt("EUR", "EUR", s.currency === "EUR")}${opt("USD", "USD", s.currency === "USD")}</select></label></div>
    <div class="row"><label class="field">${tr.language_}<select id="language">${(["en", "de", "es", "en-IN"] as Language[]).map((l) => opt(l, tr.langNames[l], l === s.language)).join("")}</select></label>
      <label class="field">${tr.mode}<select id="mode">${(["show", "look-after"] as Mode[]).map((m) => opt(m, tr.modes[m], m === s.mode)).join("")}</select></label></div>
    <label class="check"><input id="speak" type="checkbox"${s.speakAnswers ? " checked" : ""}>${tr.speak}</label>
    <fieldset class="fam" id="speechSettings">
      <legend>${tr.listeningTitle}</legend>
      <p class="hint">${tr.listeningOnDevice}</p>
      <label class="check"><input id="listenOnline" type="checkbox"${s.listenOnline ? " checked" : ""}>${tr.listenOnline}</label>
      <label class="check"><input id="talkToTusk" type="checkbox"${s.talkToTusk ? " checked" : ""}>${tr.talkToTusk}</label>
      <h3>${tr.readAloudTitle}</h3>
      <div class="buttons"><button type="button" id="testVoice" class="secondary">${tr.testVoice}</button></div>
      <p id="voiceOut" role="status"></p>
      <div id="voiceList" class="hint"></div>
      <p class="hint">${tr.voiceHelp} <a href="https://thejeswi.github.io/littletusk/voices.html" target="_blank" rel="noreferrer">${tr.voiceHelpLink}</a></p>
      <h3>${tr.listeningTitle}</h3>
      <p class="hint">${tr.prepareHint}</p>
      <div class="buttons"><button type="button" id="prepListen" class="secondary">${tr.prepareListen}</button></div>
      <p id="prepMsg" role="status"></p>
    </fieldset>
    <label class="field">${tr.firstName}<input id="name" type="text" maxlength="60" value="${esc((s as Settings & { name?: string }).name ?? "")}"></label>
    <div class="buttons"><button id="save">${tr.save}</button></div><p id="saveMsg" role="status"></p></section>
    <section id="linkSection"><h2>${tr.linkTitle}</h2><p>${tr.linkText}</p>
      <div class="warn">${tr.linkWarn}</div>
      <div class="buttons"><button id="makeLink">${tr.makeLink}</button><button id="copyLink" class="secondary">${tr.copy}</button></div>
      <p id="linkOut" class="linkbox" hidden></p><p id="copyMsg" role="status" class="ok"></p></section>` + micSection();
  wireMic();
  wireVoiceSettings();
  const provider = $<HTMLSelectElement>("provider");
  const fillModels = (model: string, strong: string) => {
    $("model").innerHTML = modelOptions(provider.value, model);
    $("strongModel").innerHTML = modelOptions(provider.value, strong);
    ($("keyHelp") as HTMLAnchorElement).href = providerInfo(provider.value).keyHelpUrl;
  };
  fillModels(s.model, s.strongModel);
  let shown = provider.value; // the provider whose key is in the key box
  provider.onchange = () => {
    const info = providerInfo(provider.value);
    fillModels(info.model, info.strongModel);
    // Each provider has its own key: park what was typed for the last one, show this one's.
    const box = $<HTMLInputElement>("key");
    drafts[shown] = box.value.trim();
    shown = provider.value;
    box.value = drafts[shown] ?? saved[shown] ?? "";
  };
  $("keyToggle").onclick = () => {
    const k = $<HTMLInputElement>("key");
    const show = k.type === "password";
    k.type = show ? "text" : "password";
    $("keyToggle").textContent = show ? t().hide : t().show;
  };
  const read = (): SetupConfig | null => {
    const limit = Number($<HTMLInputElement>("limit").value);
    const cfg = {
      v: 1 as const,
      provider: provider.value,
      apiKey: $<HTMLInputElement>("key").value.trim(),
      model: $<HTMLSelectElement>("model").value,
      strongModel: $<HTMLSelectElement>("strongModel").value,
      language: $<HTMLSelectElement>("language").value as Language,
      mode: $<HTMLSelectElement>("mode").value as Mode,
      monthlyLimit: Number.isFinite(limit) ? limit : -1,
      currency: $<HTMLSelectElement>("currency").value as "EUR" | "USD",
      ...($<HTMLInputElement>("name").value.trim() ? { name: $<HTMLInputElement>("name").value.trim() } : {}),
    };
    return decodeSetupConfig(encodeSetupConfig(cfg)) ? cfg : null; // same validation as the link
  };
  $("save").onclick = async () => {
    const msg = $("saveMsg");
    const c = read();
    if (!c) { msg.className = "err"; msg.textContent = t().saveBad; return; }
    drafts[shown] = c.apiKey;
    const others = Object.fromEntries(Object.entries(drafts).filter(([prov, k]) => prov !== c.provider && k && k !== saved[prov]));
    await saveSettings({
      provider: c.provider, apiKey: c.apiKey, model: c.model!, strongModel: c.strongModel!,
      language: c.language, mode: c.mode, monthlyLimit: c.monthlyLimit, currency: c.currency,
      speakAnswers: $<HTMLInputElement>("speak").checked, listenOnline: $<HTMLInputElement>("listenOnline").checked,
      talkToTusk: $<HTMLInputElement>("talkToTusk").checked,
      packPolicy: "auto", setupDone: true,
      ...(c.name !== undefined ? { name: c.name } : { name: "" }),
    } as Partial<Settings>, others);
    Object.assign(saved, others, c.apiKey ? { [c.provider]: c.apiKey } : {});
    for (const o of Array.from($<HTMLSelectElement>("provider").options)) {
      const label = providerInfo(o.value).label;
      o.textContent = label + (saved[o.value] ? ` ✓ ${t().keySaved}` : "");
    }
    const other = keyMismatch(c.provider, c.apiKey);
    if (other) {
      msg.className = "err";
      msg.textContent = `${t().saved} ${t().keyMismatch.replace("{key}", providerInfo(other).label).replace("{selected}", providerInfo(c.provider).label)}`;
    } else { msg.className = "ok"; msg.textContent = t().saved; }
  };
  let link = "";
  $("makeLink").onclick = () => {
    const c = read();
    const out = $("linkOut");
    if (!c) { out.hidden = false; out.textContent = t().saveBad; return; }
    link = LINK_BASE + encodeSetupConfig(c);
    out.hidden = false; out.textContent = link;
  };
  $("copyLink").onclick = async () => {
    if (!link) $("makeLink").click();
    if (!link) return;
    try { await navigator.clipboard.writeText(link); $("copyMsg").textContent = t().copied; } catch { /* the link is shown and selectable */ }
  };
}

function start(): void {
  $<HTMLImageElement>("tusk").src = chrome.runtime.getURL("assets/tusk.svg");
  $("uiLang").addEventListener("change", (e) => { ui = (e.target as HTMLSelectElement).value as UiLang; render(); });
  if (location.hash === "#mic" && FEATURES.speechInput) {
    // Opened by Tusk in a small window because the microphone was not allowed yet.
    view = "mic-only";
    void loadSettings().then((s) => { if (s.language === "de") ui = "de"; render(); });
  } else if (location.hash.startsWith("#lt=")) {
    const cfg = decodeSetupConfig(location.hash);
    history.replaceState(null, "", location.pathname);
    if (cfg) {
      pending = cfg;
      if (cfg.language === "de") { ui = "de"; }
      view = "confirm";
    }
  }
  render();
  app.dataset.ready = "1";
}

start();
