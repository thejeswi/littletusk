// The chat's typing box. It runs as an extension page inside an iframe in Tusk's chat, so the
// website cannot steal its focus or its key presses, and it sends the message straight to the
// agent through extension messaging: the website can neither read it nor fake it.
import { t } from "../shared/i18n";
import type { Language, ToAgent } from "../shared/protocol";
import { SETTINGS_KEY } from "../shared/protocol";

const form = document.getElementById("f") as HTMLFormElement;
const input = document.getElementById("t") as HTMLInputElement;
const button = document.getElementById("s") as HTMLButtonElement;

function applyLanguage(lang: Language): void {
  document.documentElement.lang = lang;
  input.placeholder = t(lang, "typeShort");
  input.setAttribute("aria-label", t(lang, "typeHere"));
  button.textContent = t(lang, "send");
}

async function loadLanguage(): Promise<void> {
  const stored = (await chrome.storage.local.get(SETTINGS_KEY))[SETTINGS_KEY] as { language?: Language } | undefined;
  applyLanguage(stored?.language ?? "en");
}

form.addEventListener("submit", (e) => {
  e.preventDefault();
  const text = input.value.trim();
  if (!text) return;
  input.value = "";
  const msg: ToAgent = { to: "agent", type: "user-input", text, via: "chat" };
  void chrome.runtime.sendMessage(msg).catch(() => undefined);
});

// When Tusk opens the chat it focuses this frame; hand that on to the text box.
window.addEventListener("focus", () => input.focus({ preventScroll: true }));

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && changes[SETTINGS_KEY]) void loadLanguage();
});

void loadLanguage();
document.body.dataset.ready = "1";
