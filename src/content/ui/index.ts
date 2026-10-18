// On-page overlay: the floating baby elephant "Tusk", its menu, chat, settings and target marks.
// Everything lives in one closed shadow root so page CSS cannot touch it.
import type { ChatItem, ChatView, Language, Mode, Settings } from "../../shared/protocol";
import { LANGUAGE_NAMES, t, type I18nKey } from "../../shared/i18n";
import { CSS } from "./styles";

export { playground } from "./playground";

type PublicSettings = Omit<Settings, "apiKey">;

export interface OverlayCallbacks {
  onSend(text: string): void;
  onAnswer(itemId: string, yes: boolean): void;
  onMicStart(): void;
  onMicStop(): void;
  onNewTopic(): void;
  onSettingsChange(patch: Partial<Pick<Settings, "language" | "mode" | "speakAnswers">>): void;
  onTuck(scope: "site" | "hour"): void;
  onOpenFamilySettings(): void;
  onAcceptOverlayHelp(overlayId: string): void;
}

export interface OverlayController {
  setView(view: ChatView): void;
  setSettings(s: PublicSettings): void;
  setMic(level: number, listening: boolean): void;
  say(text: string): void;
  pointAt(el: Element, say: string): void;
  spotlight(el: Element, say: string): void;
  askType(el: Element, say: string): void;
  offerOverlayHelp(overlayId: string, el: Element, text: string): void;
  clear(): void;
  destroy(): void;
}

// Approved character art (assets/tusk.svg and assets/tusk-pointing.svg), inlined.
const REST_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 135" aria-hidden="true" focusable="false">
  <ellipse cx="22" cy="55" rx="20" ry="22" fill="#c9d3dc"/>
  <ellipse cx="98" cy="55" rx="20" ry="22" fill="#c9d3dc"/>
  <circle cx="60" cy="58" r="36" fill="#b7c4cf"/>
  <path d="M45 82 q-9 5 -7 14 q8 -1 11 -11 z" fill="#fbf6e9" stroke="#e3d9bd" stroke-width="1"/>
  <path d="M75 82 q9 5 7 14 q-8 -1 -11 -11 z" fill="#fbf6e9" stroke="#e3d9bd" stroke-width="1"/>
  <path d="M60 80 C 47 90, 73 102, 60 114 C 54 120, 62 126, 68 124" stroke="#b7c4cf" stroke-width="12" fill="none" stroke-linecap="round"/>
  <circle cx="47" cy="52" r="3" fill="#2b2b2b"/>
  <circle cx="73" cy="52" r="3" fill="#2b2b2b"/>
  <circle cx="40" cy="64" r="5" fill="#f4b6b6" opacity=".7"/>
  <circle cx="80" cy="64" r="5" fill="#f4b6b6" opacity=".7"/>
</svg>`;
const POINT_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 135 135" aria-hidden="true" focusable="false">
  <ellipse cx="22" cy="55" rx="20" ry="22" fill="#c9d3dc"/>
  <ellipse cx="98" cy="55" rx="20" ry="22" fill="#c9d3dc"/>
  <circle cx="60" cy="58" r="36" fill="#b7c4cf"/>
  <path d="M45 82 q-9 5 -7 14 q8 -1 11 -11 z" fill="#fbf6e9" stroke="#e3d9bd" stroke-width="1"/>
  <path d="M72 80 q10 3 10 13 q-8 0 -12 -9 z" fill="#fbf6e9" stroke="#e3d9bd" stroke-width="1"/>
  <path d="M60 80 C 72 92, 84 74, 100 84 C 110 90, 120 80, 128 82" stroke="#b7c4cf" stroke-width="12" fill="none" stroke-linecap="round"/>
  <circle cx="50" cy="52" r="3" fill="#2b2b2b"/>
  <circle cx="76" cy="52" r="3" fill="#2b2b2b"/>
  <circle cx="42" cy="64" r="5" fill="#f4b6b6" opacity=".7"/>
  <circle cx="82" cy="64" r="5" fill="#f4b6b6" opacity=".7"/>
</svg>`;

const S = 72; // Tusk box size in px
const GAP = 12;
const MARGIN = 16;

interface Rect { l: number; t: number; r: number; b: number }
type Panel = null | "menu" | "chat" | "settings";
type Bubble = {
  text: string;
  src: "say" | "point" | "chat" | "question" | "offer";
  buttons?: { yes: () => void; no: () => void };
};
type Mark = { el: Element; style: "point" | "spot" | "ask"; cont?: Rect | null };

function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  cls?: string,
  attrs?: Record<string, string>,
  ...kids: (Node | string)[]
): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (attrs) for (const k in attrs) e.setAttribute(k, attrs[k]);
  for (const k of kids) e.append(k);
  return e;
}
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const hit = (a: Rect, b: Rect) => a.l < b.r && a.r > b.l && a.t < b.b && a.b > b.t;

export function mountOverlay(cb: OverlayCallbacks, initial: PublicSettings): OverlayController {
  let settings: PublicSettings = { ...initial };
  let view: ChatView | null = null;
  let panel: Panel = null;
  let home: { x: number; y: number } | null = null;
  let mark: Mark | null = null;
  let tuskTarget: { x: number; y: number; flip: boolean } | null = null;
  let bubble: Bubble | null = null;
  let bubbleTimer: ReturnType<typeof setTimeout> | undefined;
  let listening = false;
  let phase = 0;
  let rafId = 0;
  let lastMarkKey = "";
  let viewSeen = false;
  let lastTuskKey = "";
  let shownQuestion = "";
  let destroyed = false;
  const localAnswers = new Map<string, "yes" | "no">();
  const binds: Array<() => void> = [];
  const lang = (): Language => settings.language;
  const bind = (fn: () => void) => { binds.push(fn); fn(); };
  const label = (el: HTMLElement, key: I18nKey, attr?: string) =>
    bind(() => { const s = t(lang(), key); if (attr) el.setAttribute(attr, s); else el.textContent = s; });

  // ---------- DOM skeleton ----------
  const host = document.createElement("div");
  host.setAttribute("data-littletusk", "overlay");
  const root = host.attachShadow({ mode: __E2E__ ? "open" : "closed" }); // open only in test builds, so Playwright can reach it
  const style = document.createElement("style");
  style.textContent = CSS;
  const layer = h("div", "layer");
  root.append(style, layer);

  const dim = h("div", "dim"); dim.hidden = true;
  const hl = h("div", "hl"); hl.hidden = true;
  const askFrame = h("div", "ask-frame"); askFrame.hidden = true;

  const tusk = h("button", "tusk", { type: "button", "aria-haspopup": "menu" });
  const flipEl = h("div", "flip");
  const breathe = h("div", "breathe");
  const rest = h("div", "pose-rest"); rest.innerHTML = REST_SVG;
  const point = h("div", "pose-point"); point.innerHTML = POINT_SVG;
  breathe.append(rest, point); flipEl.append(breathe); tusk.append(flipEl);
  bind(() => tusk.setAttribute("aria-label", t(lang(), "tuskName") + ": " + t(lang(), "menuLabel")));

  const bubbleEl = h("div", "bubble", { role: "status" }); bubbleEl.hidden = true;

  // listening bubble
  const listenEl = h("div", "listen", { role: "status" }); listenEl.hidden = true;
  const waveBars = Array.from({ length: 7 }, () => h("i"));
  const listenTxt = h("div"); const listenHint = h("div", "hint");
  listenEl.append(listenTxt, h("div", "wave", undefined, ...waveBars), listenHint);
  label(listenTxt, "listening"); label(listenHint, "tapToStop");

  // menu
  const menu = h("div", "menu", { role: "menu" }); menu.hidden = true;
  const menuItem = (icon: string, key: I18nKey, fn: () => void) => {
    const lbl = h("span", "lbl");
    label(lbl, key);
    const b = h("button", "", { type: "button", role: "menuitem" }, lbl, h("span", "circ", { "aria-hidden": "true" }, icon));
    b.addEventListener("click", fn);
    return b;
  };
  menu.append(
    menuItem("💬", "chat", () => setPanel("chat")),
    menuItem("🎤", "speak", () => { setPanel(null); toggleMic(); }),
    menuItem("⚙️", "settings", () => setPanel("settings")),
  );

  // chat panel
  const chatEl = h("div", "panel"); chatEl.hidden = true;
  chatEl.setAttribute("role", "dialog");
  const chatTitle = h("h2"); label(chatTitle, "tuskName");
  const chatClose = h("button", "x", { type: "button" }, "✕");
  label(chatClose, "close", "aria-label");
  chatClose.addEventListener("click", () => setPanel(null));
  const list = h("div", "list", { "aria-live": "polite" });
  const input = h("input", "", { type: "text", autocomplete: "off", enterkeyhint: "send" });
  label(input, "typeShort", "placeholder"); label(input, "typeHere", "aria-label");
  const sendBtn = h("button", "btn yes send", { type: "button" });
  label(sendBtn, "send");
  const micBtn = h("button", "mic", { type: "button" }, "🎤");
  bind(() => micBtn.setAttribute("aria-label", t(lang(), listening ? "micStop" : "micStart")));
  const foot = h("div", "foot");
  chatEl.append(
    h("div", "head", undefined, chatTitle, chatClose),
    list,
    h("div", "compose", undefined, input, micBtn, sendBtn),
    foot,
  );
  const send = () => {
    const text = input.value.trim();
    if (!text) return;
    input.value = "";
    cb.onSend(text);
  };
  sendBtn.addEventListener("click", send);
  input.addEventListener("keydown", (e) => { if (e.key === "Enter" && !e.isComposing) { e.preventDefault(); send(); } });
  micBtn.addEventListener("click", () => toggleMic());

  // settings panel
  const setEl = h("div", "panel"); setEl.hidden = true;
  setEl.setAttribute("role", "dialog");
  const setTitle = h("h2"); label(setTitle, "settings");
  const setClose = h("button", "x", { type: "button" }, "✕");
  label(setClose, "close", "aria-label");
  setClose.addEventListener("click", () => setPanel(null));
  const langSel = h("select");
  (Object.keys(LANGUAGE_NAMES) as Language[]).forEach((l) => langSel.append(h("option", "", { value: l }, LANGUAGE_NAMES[l])));
  langSel.addEventListener("change", () => changeSettings({ language: langSel.value as Language }));
  const langLabelTxt = h("span"); label(langLabelTxt, "language");
  const modeLabelTxt = h("span", "", { style: "font-weight:600" }); label(modeLabelTxt, "mode");
  const modeCard = (m: Mode, nameKey: I18nKey, descKey: I18nKey) => {
    const name = h("b"); const desc = h("span");
    label(name, nameKey); label(desc, descKey);
    const b = h("button", "modecard", { type: "button", role: "radio" }, name, desc);
    b.dataset.mode = m;
    b.addEventListener("click", () => changeSettings({ mode: m }));
    return b;
  };
  const modeCards = [modeCard("show", "modeShow", "modeShowDesc"), modeCard("look-after", "modeLook", "modeLookDesc")];
  const speakChk = h("input", "", { type: "checkbox" });
  const speakTxt = h("span"); label(speakTxt, "readAloud");
  speakChk.addEventListener("change", () => changeSettings({ speakAnswers: speakChk.checked }));
  const act = (key: I18nKey, fn: () => void) => {
    const b = h("button", "act", { type: "button" }); label(b, key);
    b.addEventListener("click", fn);
    return b;
  };
  const tuckAndHide = (scope: "site" | "hour") => { setPanel(null); cb.onTuck(scope); host.style.display = "none"; };
  setEl.append(
    h("div", "head", undefined, setTitle, setClose),
    h("div", "set", undefined,
      h("label", "f", undefined, langLabelTxt, langSel),
      h("div", "modes", { role: "radiogroup" }, modeLabelTxt, ...modeCards),
      h("label", "toggle", undefined, speakChk, speakTxt),
      act("newTopic", () => { setPanel(null); cb.onNewTopic(); }),
      act("hideSite", () => tuckAndHide("site")),
      act("hideHour", () => tuckAndHide("hour")),
      act("familySettings", () => { setPanel(null); cb.onOpenFamilySettings(); }),
    ),
  );

  layer.append(dim, hl, askFrame, bubbleEl, listenEl, menu, chatEl, setEl, tusk);

  // keep keystrokes and Escape inside the overlay away from the page
  for (const ev of ["keydown", "keyup", "keypress"] as const) {
    layer.addEventListener(ev, (e) => {
      if (ev === "keydown" && (e as KeyboardEvent).key === "Escape") closeTransient();
      e.stopPropagation();
    });
  }

  // ---------- settings ----------
  function changeSettings(patch: Partial<Pick<Settings, "language" | "mode" | "speakAnswers">>) {
    settings = { ...settings, ...patch };
    applySettings();
    cb.onSettingsChange(patch);
  }
  function applySettings() {
    binds.forEach((f) => f());
    langSel.value = settings.language;
    speakChk.checked = settings.speakAnswers;
    modeCards.forEach((c) => c.setAttribute("aria-checked", String(c.dataset.mode === settings.mode)));
    renderChat();
    renderBubble();
    layout();
  }

  // ---------- panels ----------
  function setPanel(p: Panel) {
    panel = p;
    menu.hidden = p !== "menu";
    chatEl.hidden = p !== "chat";
    setEl.hidden = p !== "settings";
    tusk.setAttribute("aria-expanded", String(p === "menu"));
    if (p === "chat") {
      if (bubble && (bubble.src === "chat" || bubble.src === "question" || bubble.src === "say")) hideBubble();
      renderChat();
      scrollDown();
      input.focus({ preventScroll: true }); // the person just asked for the chat
    }
    layout();
  }
  function closeTransient() {
    if (panel === "menu" || panel === "settings") setPanel(null);
  }
  document.addEventListener("keydown", onDocKey);
  function onDocKey(e: KeyboardEvent) { if (e.key === "Escape") closeTransient(); }
  document.addEventListener("pointerdown", onDocPointer, true);
  function onDocPointer(e: Event) {
    if (!e.composedPath().includes(host)) closeTransient();
  }

  function toggleMic() {
    if (listening) { listening = false; cb.onMicStop(); }
    else { listening = true; cb.onMicStart(); }
    applyMic();
  }
  function applyMic() {
    micBtn.classList.toggle("on", listening);
    micBtn.setAttribute("aria-label", t(lang(), listening ? "micStop" : "micStart"));
    listenEl.hidden = !listening;
    layout();
  }

  // ---------- chat rendering ----------
  const rendered = new Map<string, { sig: string; el: HTMLElement }>();
  const thinking = h("div", "think"); label(thinking, "thinking");
  const greet = h("div", "msg tusk"); label(greet, "greeting");

  function answer(id: string, yes: boolean) {
    if (localAnswers.has(id)) return;
    localAnswers.set(id, yes ? "yes" : "no");
    cb.onAnswer(id, yes);
    if (bubble?.src === "question" || bubble?.src === "offer") hideBubble();
    renderChat();
  }
  const answeredOf = (it: ChatItem): "yes" | "no" | undefined =>
    it.kind === "confirm" || it.kind === "offer" ? it.answered ?? localAnswers.get(it.id) : undefined;

  function buttonsRow(id: string, answered: "yes" | "no" | undefined, cls: string): HTMLElement {
    const yes = h("button", "btn yes", { type: "button" }); yes.textContent = t(lang(), "yes");
    const no = h("button", "btn no", { type: "button" }); no.textContent = t(lang(), "no");
    if (answered) {
      yes.disabled = no.disabled = true;
      (answered === "yes" ? yes : no).classList.add("chosen");
    } else {
      yes.addEventListener("click", () => answer(id, true));
      no.addEventListener("click", () => answer(id, false));
    }
    return h("div", cls, undefined, yes, no);
  }

  function buildItem(it: ChatItem): HTMLElement {
    switch (it.kind) {
      case "user": return h("div", "msg user", undefined, it.text);
      case "tusk": return h("div", "msg tusk", undefined, it.text);
      case "action": {
        const ic = it.state === "running" ? "⏳" : it.state === "done" ? "✅" : "⚠️";
        return h("div", "chip", undefined, h("span", "ic", { "aria-hidden": "true" }, ic), it.text);
      }
      case "notice": return h("div", "notice", { role: "note" }, it.text);
      case "confirm":
      case "offer": {
        const a = answeredOf(it);
        const box = h("div", "q", undefined, h("div", "qt", undefined, it.kind === "confirm" ? it.question : it.text));
        box.append(buttonsRow(it.id, a, "btns"));
        if (a) box.append(h("div", "res", undefined, t(lang(), a === "yes" ? "answeredYes" : "answeredNo")));
        return box;
      }
    }
  }

  function renderChat() {
    const items = view?.items ?? [];
    const seen = new Set<string>();
    const nodes: HTMLElement[] = [];
    if (items.length === 0) nodes.push(greet);
    for (const it of items) {
      seen.add(it.id);
      const sig = JSON.stringify([it, answeredOf(it), lang()]);
      let r = rendered.get(it.id);
      if (!r || r.sig !== sig) { r = { sig, el: buildItem(it) }; rendered.set(it.id, r); }
      nodes.push(r.el);
    }
    for (const k of [...rendered.keys()]) if (!seen.has(k)) rendered.delete(k);
    if (view?.busy) nodes.push(thinking);
    list.replaceChildren(...nodes);
    if (view) {
      const { month, limit, currency } = view.spend;
      const spent = month.toFixed(2);
      foot.textContent = limit > 0
        ? t(lang(), "spend", { spent, limit: limit.toFixed(2), currency })
        : t(lang(), "spendNoLimit", { spent, currency });
    }
  }
  const scrollDown = () => { list.scrollTop = list.scrollHeight; };

  // ---------- bubbles ----------
  function hideBubble() {
    clearTimeout(bubbleTimer);
    bubble = null;
    renderBubble();
    layout();
  }
  function showBubble(b: Bubble, ttl = 0) {
    clearTimeout(bubbleTimer);
    bubble = b;
    renderBubble();
    layout();
    if (ttl) bubbleTimer = setTimeout(() => { if (bubble === b) hideBubble(); }, ttl);
  }
  function renderBubble() {
    bubbleEl.hidden = !bubble;
    if (!bubble) { bubbleEl.replaceChildren(); return; }
    const b = bubble;
    const kids: HTMLElement[] = [h("div", "txt", undefined, b.text)];
    if (b.buttons) {
      const yes = h("button", "btn yes", { type: "button" }); yes.textContent = t(lang(), "yes");
      const no = h("button", "btn no", { type: "button" }); no.textContent = t(lang(), "no");
      yes.addEventListener("click", (e) => { e.stopPropagation(); b.buttons!.yes(); });
      no.addEventListener("click", (e) => { e.stopPropagation(); b.buttons!.no(); });
      kids.push(h("div", "btns", undefined, yes, no));
    }
    bubbleEl.replaceChildren(...kids);
  }
  bubbleEl.addEventListener("click", () => { if (bubble && !bubble.buttons) hideBubble(); });

  // ---------- geometry ----------
  const vw = () => document.documentElement.clientWidth || window.innerWidth;
  const vh = () => window.innerHeight;
  function put(el: HTMLElement, x: number, y: number) { el.style.left = `${Math.round(x)}px`; el.style.top = `${Math.round(y)}px`; }
  function boxRect(el: Element): Rect {
    const r = el.getBoundingClientRect();
    return { l: r.left, t: r.top, r: r.right, b: r.bottom };
  }

  function tuskPos(): { x: number; y: number } {
    if (tuskTarget) return tuskTarget;
    const p = home ?? { x: vw() - S - MARGIN, y: vh() - S - MARGIN };
    return { x: clamp(p.x, 4, Math.max(4, vw() - S - 4)), y: clamp(p.y, 4, Math.max(4, vh() - S - 4)) };
  }

  /** Anchored box (chat, settings): above or below Tusk, on Tusk's side of the screen. */
  function placePanel(el: HTMLElement, wantW: number, wantH: number) {
    const p = tuskPos();
    const w = Math.min(wantW, vw() - 16);
    const above = p.y > vh() / 2;
    let avail = above ? p.y - 8 - 8 : vh() - (p.y + S + 8) - 8;
    let top: number;
    if (avail < 260) { avail = vh() - 16; top = 8; } // not enough room: use the full height
    else top = above ? p.y - 8 - Math.min(wantH, avail) : p.y + S + 8;
    const hgt = Math.min(wantH, avail);
    const onRight = p.x + S / 2 > vw() / 2;
    el.style.width = `${w}px`;
    el.style.height = `${hgt}px`;
    put(el, clamp(onRight ? p.x + S - w : p.x, 8, Math.max(8, vw() - w - 8)), top);
  }

  function placeBubbleLike(el: HTMLElement, avoid: Rect[], prefer: "up" | "side" | "away-left" | "away-right" = "up", soft: Rect[] = []) {
    if (el.hidden) return;
    const p = tuskPos();
    const w = el.offsetWidth || 260, hh = el.offsetHeight || 60, g = 10;
    const cx = p.x + S / 2 - w / 2, cy = p.y + S / 2 - hh / 2;
    const cand: Array<[number, number]> = [
      [cx, p.y - hh - g], [cx, p.y + S + g], [p.x - w - g, cy], [p.x + S + g, cy],
    ];
    // Tusk stands beside the target: a bubble above or below Tusk, lined up on the far side, stays off the target.
    if (prefer === "away-left") cand.unshift(cand[2], [p.x + S - w, p.y - hh - g], [p.x + S - w, p.y + S + g]);
    if (prefer === "away-right") cand.unshift(cand[3], [p.x, p.y - hh - g], [p.x, p.y + S + g]);
    const fix = ([x, y]: [number, number]) => [clamp(x, 8, Math.max(8, vw() - w - 8)), clamp(y, 8, Math.max(8, vh() - hh - 8))] as [number, number];
    let chosen: [number, number] | null = null;
    const tr = { l: p.x, t: p.y, r: p.x + S, b: p.y + S };
    // First try to stay clear of the popup or form around the target too; if nothing fits, only keep clear of the target.
    // Last resort: keep clear of Tusk at least, so Tusk never sits on its own bubble's buttons.
    for (const list of [avoid.concat(soft), avoid, []]) {
      for (const c of cand) {
        const [x, y] = fix(c);
        const r = { l: x, t: y, r: x + w, b: y + hh };
        if (!list.some((a) => hit(a, r)) && !hit(tr, r)) { chosen = [x, y]; break; }
      }
      if (chosen) break;
    }
    const [x, y] = chosen ?? fix(cand[0]);
    put(el, x, y);
  }

  function layout() {
    if (destroyed) return;
    const p = tuskPos();
    put(tusk, p.x, p.y);
    const pointing = !!tuskTarget;
    tusk.classList.toggle("pointing", pointing);
    flipEl.classList.toggle("left", pointing && tuskTarget!.flip);

    const avoid: Rect[] = [];
    let markRect: Rect | null = null;
    if (mark && mark.el.isConnected) {
      markRect = boxRect(mark.el);
      const pad = 4;
      const box = mark.style === "ask" ? askFrame : hl;
      const other = mark.style === "ask" ? hl : askFrame;
      other.hidden = true;
      const visible = markRect.r > markRect.l && markRect.b > markRect.t;
      box.hidden = !visible;
      if (visible) {
        Object.assign(box.style, {
          left: `${markRect.l - pad}px`, top: `${markRect.t - pad}px`,
          width: `${markRect.r - markRect.l + pad * 2}px`, height: `${markRect.b - markRect.t + pad * 2}px`,
        });
        avoid.push({ l: markRect.l - pad - 6, t: markRect.t - pad - 6, r: markRect.r + pad + 6, b: markRect.b + pad + 6 });
      }
      dim.hidden = mark.style !== "spot" || !visible;
      if (!dim.hidden) {
        const sp = 8;
        Object.assign(dim.style, {
          left: `${markRect.l - sp}px`, top: `${markRect.t - sp}px`,
          width: `${markRect.r - markRect.l + sp * 2}px`, height: `${markRect.b - markRect.t + sp * 2}px`,
        });
      }
    } else {
      hl.hidden = askFrame.hidden = dim.hidden = true;
    }

    // panels
    if (!chatEl.hidden) placePanel(chatEl, 380, 540);
    if (!setEl.hidden) placePanel(setEl, 340, 660);
    if (!menu.hidden) {
      const onRight = p.x + S / 2 > vw() / 2;
      menu.classList.toggle("left-side", !onRight);
      const w = menu.offsetWidth || 200, hh = menu.offsetHeight || 210;
      put(menu, clamp(onRight ? p.x - w - 8 : p.x + S + 8, 8, Math.max(8, vw() - w - 8)), clamp(p.y + S - hh, 8, Math.max(8, vh() - hh - 8)));
    }
    const panelBox = !chatEl.hidden ? boxRect(chatEl) : !setEl.hidden ? boxRect(setEl) : !menu.hidden ? boxRect(menu) : null;
    if (panelBox) avoid.push(panelBox);

    let prefer: "up" | "away-left" | "away-right" = "up";
    if (markRect) {
      const mcx = (markRect.l + markRect.r) / 2, mcy = (markRect.t + markRect.b) / 2;
      if (Math.abs(mcx - (p.x + S / 2)) > Math.abs(mcy - (p.y + S / 2))) prefer = mcx > p.x ? "away-left" : "away-right";
    }
    placeBubbleLike(bubbleEl, avoid, prefer, mark?.cont ? [mark.cont] : []);
    placeBubbleLike(listenEl, avoid);
  }

  /** Where Tusk should stand to point at a rect: beside it, never on top of it. */
  function standNear(r: Rect, cont: Rect | null = null): { x: number; y: number; flip: boolean } {
    const W = vw(), H = vh();
    const cx = (r.l + r.r) / 2, cy = (r.t + r.b) / 2;
    const pad = 10;
    const sides = [
      { x: r.l - pad - S - GAP, y: cy - S / 2, flip: false }, // Tusk on the left, points right
      { x: r.r + pad + GAP, y: cy - S / 2, flip: true },
      { x: cx - S / 2, y: r.b + pad + GAP, flip: cx < W / 2 ? false : true },
      { x: cx - S / 2, y: r.t - pad - GAP - S, flip: cx < W / 2 ? false : true },
    ];
    const fits = (c: { x: number; y: number }) => c.x >= 4 && c.y >= 4 && c.x + S <= W - 4 && c.y + S <= H - 4;
    // Prefer a spot outside the box the target sits in (a popup, a form), so Tusk does not cover its neighbours.
    const clear = (c: { x: number; y: number }) => !cont || !hit(cont, { l: c.x, t: c.y, r: c.x + S, b: c.y + S });
    const c = sides.find((x) => fits(x) && clear(x)) ?? sides.find(fits) ?? sides[0];
    return {
      x: clamp(c.x, 4, Math.max(4, W - S - 4)),
      y: clamp(c.y, 4, Math.max(4, H - S - 4)),
      flip: c.flip,
    };
  }

  /** The nearest bigger box around the target (popup, form), unless that is most of the page. */
  function containerRect(el: Element): Rect | null {
    const a = el.getBoundingClientRect();
    const area = a.width * a.height;
    for (let p = el.parentElement; p && p !== document.body && p !== document.documentElement; p = p.parentElement) {
      const r = p.getBoundingClientRect();
      const pa = r.width * r.height;
      if (pa > vw() * vh() * 0.6) return null;
      if (pa > area * 2.2) return { l: r.left, t: r.top, r: r.right, b: r.bottom };
    }
    return null;
  }

  function track() {
    rafId = 0;
    if (destroyed || !mark) return;
    const r = boxRect(mark.el);
    if (!mark.el.isConnected || r.r <= r.l || r.b <= r.t) { ctrl.clear(); return; } // the target went away (popup closed)
    {
      const cont = containerRect(mark.el);
      const key = `${r.l},${r.t},${r.r},${r.b},${vw()},${vh()}`;
      if (key !== lastMarkKey) {
        lastMarkKey = key;
        tuskTarget = standNear(r, cont);
        mark.cont = cont;
        layout();
      }
    }
    if (typeof requestAnimationFrame === "function") rafId = requestAnimationFrame(track);
  }

  function startMark(el: Element, st: Mark["style"], text: string, src: Bubble["src"], buttons?: Bubble["buttons"]) {
    setPanelIfMenu();
    mark = { el, style: st };
    lastMarkKey = "";
    try {
      const r = el.getBoundingClientRect();
      const inView = r.top >= 0 && r.bottom <= vh() && r.left >= 0 && r.right <= vw();
      if (!inView && typeof el.scrollIntoView === "function") el.scrollIntoView({ behavior: "smooth", block: "center", inline: "nearest" });
    } catch { /* detached element */ }
    const cont = containerRect(el);
    mark.cont = cont;
    tuskTarget = standNear(boxRect(el), cont);
    showBubble({ text, src, buttons });
    if (!rafId && typeof requestAnimationFrame === "function") rafId = requestAnimationFrame(track);
  }
  function setPanelIfMenu() { if (panel === "menu" || panel === "settings") setPanel(null); }

  // ---------- dragging ----------
  let drag: { sx: number; sy: number; ox: number; oy: number; moved: boolean; id: number } | null = null;
  let suppressClick = false;
  tusk.addEventListener("pointerdown", (e) => {
    if (e.button !== 0) return;
    const p = tuskPos();
    drag = { sx: e.clientX, sy: e.clientY, ox: p.x, oy: p.y, moved: false, id: e.pointerId };
    try { tusk.setPointerCapture(e.pointerId); } catch { /* not capturable */ }
  });
  tusk.addEventListener("pointermove", (e) => {
    if (!drag) return;
    const dx = e.clientX - drag.sx, dy = e.clientY - drag.sy;
    if (!drag.moved && Math.hypot(dx, dy) < 6) return;
    if (!drag.moved) { drag.moved = true; tusk.classList.add("dragging"); }
    tuskTarget = null; // dragging takes Tusk away from any target
    home = { x: drag.ox + dx, y: drag.oy + dy };
    layout();
  });
  const endDrag = () => {
    if (!drag) return;
    if (drag.moved) { suppressClick = true; setTimeout(() => (suppressClick = false), 0); }
    drag = null;
    tusk.classList.remove("dragging");
  };
  tusk.addEventListener("pointerup", endDrag);
  tusk.addEventListener("pointercancel", endDrag);
  tusk.addEventListener("click", () => {
    if (suppressClick) return;
    if (panel === null) setPanel("menu");
    else setPanel(null);
  });
  window.addEventListener("resize", onResize);
  function onResize() { lastMarkKey = ""; layout(); }

  // ---------- controller ----------
  function popNewTusk(v: ChatView) {
    // Tusk's replies and notices (no key, budget, microphone) pop up as a bubble when the chat is closed.
    const lastTusk = [...v.items].reverse().find((i): i is Extract<ChatItem, { kind: "tusk" | "notice" }> => i.kind === "tusk" || i.kind === "notice");
    const key = lastTusk ? `${lastTusk.id}:${lastTusk.text}` : "";
    const changed = key !== lastTuskKey;
    lastTuskKey = key;
    const pending = [...v.items].reverse().find((i) => (i.kind === "confirm" || i.kind === "offer") && !answeredOf(i));
    if (panel !== "chat" && pending && pending.id !== shownQuestion && (pending.kind === "confirm" || pending.kind === "offer")) {
      shownQuestion = pending.id;
      const id = pending.id;
      showBubble({
        text: pending.kind === "confirm" ? pending.question : pending.text,
        src: "question",
        buttons: { yes: () => answer(id, true), no: () => answer(id, false) },
      });
      return;
    }
    if (!pending && bubble?.src === "question") hideBubble();
    if (changed && lastTusk && lastTusk.text && viewSeen && panel !== "chat" && !(bubble && bubble.src !== "chat" && bubble.src !== "say")) {
      showBubble({ text: lastTusk.text, src: "chat" }, 15000);
    }
  }

  const ctrl: OverlayController = {
    setView(v) {
      view = v;
      renderChat();
      if (panel === "chat") scrollDown();
      popNewTusk(v);
      viewSeen = true;
    },
    setSettings(s) { settings = { ...s }; applySettings(); },
    setMic(level, l) {
      listening = l;
      phase += 1;
      waveBars.forEach((b, i) => {
        const amp = 0.35 + 0.65 * Math.abs(Math.sin(phase * 0.9 + i * 0.8));
        b.style.height = `${Math.round(8 + clamp(level, 0, 1) * 36 * amp)}px`;
      });
      applyMic();
    },
    say(text) { showBubble({ text, src: "say" }, 12000); },
    pointAt(el, say) { startMark(el, "point", say, "point"); },
    spotlight(el, say) { startMark(el, "spot", say, "point"); },
    askType(el, say) { startMark(el, "ask", say, "point"); },
    offerOverlayHelp(overlayId, el, text) {
      startMark(el, "point", text, "offer", {
        yes: () => { ctrl.clear(); cb.onAcceptOverlayHelp(overlayId); },
        no: () => ctrl.clear(),
      });
    },
    clear() {
      mark = null; tuskTarget = null; lastMarkKey = "";
      if (rafId && typeof cancelAnimationFrame === "function") cancelAnimationFrame(rafId);
      rafId = 0;
      if (bubble && (bubble.src === "point" || bubble.src === "offer")) { clearTimeout(bubbleTimer); bubble = null; renderBubble(); }
      layout();
    },
    destroy() {
      destroyed = true;
      clearTimeout(bubbleTimer);
      if (rafId && typeof cancelAnimationFrame === "function") cancelAnimationFrame(rafId);
      document.removeEventListener("keydown", onDocKey);
      document.removeEventListener("pointerdown", onDocPointer, true);
      window.removeEventListener("resize", onResize);
      host.remove();
    },
  };

  applySettings();
  document.documentElement.append(host);
  layout();
  return ctrl;
}
