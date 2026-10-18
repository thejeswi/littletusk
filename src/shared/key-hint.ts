// A quick, offline check that a key looks like it belongs to the chosen provider. It cannot prove a
// key works (only the provider can), but it catches the common slip of pasting one provider's key
// while another provider is selected.
export function guessProvider(key: string): string | null {
  const k = key.trim();
  if (k.startsWith("sk-ant-")) return "anthropic";
  if (k.startsWith("sk-or-")) return "openrouter";
  if (k.startsWith("AIza")) return "google";
  if (/^sk-[0-9a-f]{32}$/.test(k)) return "deepseek";
  if (/^sk-(proj-|svcacct-)?[A-Za-z0-9_-]{20,}$/.test(k)) return "openai";
  return null;
}

/** The provider the key seems to be for, when that differs from the selected one; otherwise null. */
export function keyMismatch(selected: string, key: string): string | null {
  const g = guessProvider(key);
  return g && g !== selected ? g : null;
}
