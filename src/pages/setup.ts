import { type Language, type Mode, type Settings } from "../shared/protocol";
import { PROVIDERS, modelsFor, providerInfo } from "../shared/providers";
import { decodeSetupConfig, encodeSetupConfig, loadSettings, saveSettings, type SetupConfig } from "../shared/settings";

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
    firstName: "The person's first name (optional)",
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
    firstName: "Vorname der Person (optional)",
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

type View = "confirm" | "mic" | "mic-only" | "form" | "declined";
let view: View = "form";
let pending: SetupConfig | null = null;

function render(): void {
  document.documentElement.lang = ui;
  $("title").textContent = view === "form" ? t().settingsTitle : "Little Tusk";
  $("langLabel").textContent = t().language;
  ($("uiLang") as HTMLSelectElement).value = ui;
  app.dataset.view = view;
  if (view === "confirm") renderConfirm();
  else if (view === "mic") renderMic(true);
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
    view = "mic";
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
  const tr = t();
  return `<section id="mic"><h2>${tr.micTitle}</h2><p>${tr.micText}</p>
    <div class="buttons"><button id="micBtn">${tr.micButton}</button></div><p id="micMsg" role="status"></p></section>`;
}

function wireMic(): void {
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
  const tr = t();
  const opt = (v: string, label: string, sel: boolean) => `<option value="${v}"${sel ? " selected" : ""}>${esc(label)}</option>`;
  app.innerHTML = `<section id="form"><h2>${tr.formTitle}</h2>
    <label class="field">${tr.provider}<select id="provider">${PROVIDERS.map((p) => opt(p.id, p.label, p.id === s.provider)).join("")}</select></label>
    <div class="field"><label for="key" style="font-weight:600">${tr.key}</label>
      <div class="keyrow"><input id="key" type="password" autocomplete="off" spellcheck="false" value="${esc(s.apiKey)}"><button type="button" id="keyToggle" class="secondary">${tr.show}</button></div>
      <small><a id="keyHelp" href="#" target="_blank" rel="noreferrer">${tr.getKey}</a></small></div>
    <label class="field">${tr.everyday}<select id="model"></select></label>
    <label class="field">${tr.strong}<select id="strongModel"></select></label>
    <div class="row"><label class="field">${tr.limitLabel}<input id="limit" type="number" min="0" max="1000" step="1" value="${s.monthlyLimit}"></label>
      <label class="field">${tr.currency}<select id="currency">${opt("EUR", "EUR", s.currency === "EUR")}${opt("USD", "USD", s.currency === "USD")}</select></label></div>
    <div class="row"><label class="field">${tr.language_}<select id="language">${(["en", "de", "es", "en-IN"] as Language[]).map((l) => opt(l, tr.langNames[l], l === s.language)).join("")}</select></label>
      <label class="field">${tr.mode}<select id="mode">${(["show", "look-after"] as Mode[]).map((m) => opt(m, tr.modes[m], m === s.mode)).join("")}</select></label></div>
    <label class="check"><input id="speak" type="checkbox"${s.speakAnswers ? " checked" : ""}>${tr.speak}</label>
    <label class="field">${tr.firstName}<input id="name" type="text" maxlength="60" value="${esc((s as Settings & { name?: string }).name ?? "")}"></label>
    <div class="buttons"><button id="save">${tr.save}</button></div><p id="saveMsg" role="status"></p></section>
    <section id="linkSection"><h2>${tr.linkTitle}</h2><p>${tr.linkText}</p>
      <div class="warn">${tr.linkWarn}</div>
      <div class="buttons"><button id="makeLink">${tr.makeLink}</button><button id="copyLink" class="secondary">${tr.copy}</button></div>
      <p id="linkOut" class="linkbox" hidden></p><p id="copyMsg" role="status" class="ok"></p></section>` + micSection();
  wireMic();
  const provider = $<HTMLSelectElement>("provider");
  const fillModels = (model: string, strong: string) => {
    $("model").innerHTML = modelOptions(provider.value, model);
    $("strongModel").innerHTML = modelOptions(provider.value, strong);
    ($("keyHelp") as HTMLAnchorElement).href = providerInfo(provider.value).keyHelpUrl;
  };
  fillModels(s.model, s.strongModel);
  provider.onchange = () => {
    const info = providerInfo(provider.value);
    fillModels(info.model, info.strongModel);
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
    await saveSettings({
      provider: c.provider, apiKey: c.apiKey, model: c.model!, strongModel: c.strongModel!,
      language: c.language, mode: c.mode, monthlyLimit: c.monthlyLimit, currency: c.currency,
      speakAnswers: $<HTMLInputElement>("speak").checked, setupDone: true,
      ...(c.name !== undefined ? { name: c.name } : { name: "" }),
    } as Partial<Settings>);
    msg.className = "ok"; msg.textContent = t().saved;
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
  if (location.hash === "#mic") {
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
