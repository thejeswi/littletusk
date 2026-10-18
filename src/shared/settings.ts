import { DEFAULT_SETTINGS, SETTINGS_KEY, type Language, type Mode, type Settings } from "./protocol";

export async function loadSettings(): Promise<Settings> {
  const got = await chrome.storage.local.get(SETTINGS_KEY);
  return { ...DEFAULT_SETTINGS, ...((got[SETTINGS_KEY] as Partial<Settings> | undefined) ?? {}) };
}

export async function saveSettings(patch: Partial<Settings>): Promise<Settings> {
  const next = { ...(await loadSettings()), ...patch };
  await chrome.storage.local.set({ [SETTINGS_KEY]: next });
  return next;
}

/** Calls cb with the new settings whenever they change (in any extension context). Returns an unsubscribe. */
export function onSettingsChanged(cb: (s: Settings) => void): () => void {
  const listener = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
    if (area !== "local" || !changes[SETTINGS_KEY]) return;
    cb({ ...DEFAULT_SETTINGS, ...(changes[SETTINGS_KEY].newValue as Partial<Settings>) });
  };
  chrome.storage.onChanged.addListener(listener);
  return () => chrome.storage.onChanged.removeListener(listener);
}

export function publicSettings(s: Settings): Omit<Settings, "apiKey"> {
  const { apiKey: _apiKey, ...rest } = s;
  return rest;
}

// ---------- Setup link ----------

export interface SetupConfig {
  v: 1;
  provider: string;
  apiKey: string;
  model?: string;
  strongModel?: string;
  language: Language;
  mode: Mode;
  monthlyLimit: number;
  currency: "EUR" | "USD";
  name?: string;
}

const LANGUAGES: Language[] = ["en", "de", "es", "en-IN"];
const MODES: Mode[] = ["show", "look-after"];

function toB64Url(s: string): string {
  const bytes = new TextEncoder().encode(s);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromB64Url(s: string): string {
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(b64 + "=".repeat((4 - (b64.length % 4)) % 4));
  return new TextDecoder("utf-8", { fatal: true }).decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
}

/** Returns the fragment including the leading "#lt=". */
export function encodeSetupConfig(cfg: SetupConfig): string {
  return "#lt=" + toB64Url(JSON.stringify(cfg));
}

const str = (v: unknown, max: number): v is string => typeof v === "string" && v.length <= max;

/** Accepts "#lt=..." or "lt=..." or the bare payload. Returns null on anything odd. */
export function decodeSetupConfig(fragment: string): SetupConfig | null {
  try {
    let f = fragment.startsWith("#") ? fragment.slice(1) : fragment;
    if (f.startsWith("lt=")) f = f.slice(3);
    if (!f || f.length > 4000 || !/^[A-Za-z0-9_-]+$/.test(f)) return null;
    const o = JSON.parse(fromB64Url(f)) as Record<string, unknown>;
    if (!o || typeof o !== "object" || Array.isArray(o) || o.v !== 1) return null;
    if (!str(o.provider, 40) || !/^[a-z0-9-]+$/.test(o.provider)) return null;
    if (!str(o.apiKey, 400) || o.apiKey.length < 8 || /\s/.test(o.apiKey)) return null;
    if (!LANGUAGES.includes(o.language as Language)) return null;
    if (!MODES.includes(o.mode as Mode)) return null;
    if (typeof o.monthlyLimit !== "number" || !Number.isFinite(o.monthlyLimit) || o.monthlyLimit < 0 || o.monthlyLimit > 1000) return null;
    if (o.currency !== "EUR" && o.currency !== "USD") return null;
    const cfg: SetupConfig = {
      v: 1,
      provider: o.provider,
      apiKey: o.apiKey,
      language: o.language as Language,
      mode: o.mode as Mode,
      monthlyLimit: o.monthlyLimit,
      currency: o.currency,
    };
    for (const k of ["model", "strongModel"] as const) {
      if (o[k] !== undefined) {
        if (!str(o[k], 120) || !o[k]) return null;
        cfg[k] = o[k] as string;
      }
    }
    if (o.name !== undefined) {
      if (!str(o.name, 60)) return null;
      if (o.name.trim()) cfg.name = o.name.trim();
    }
    return cfg;
  } catch {
    return null;
  }
}
