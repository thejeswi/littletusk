import { decodeSetupConfig } from "../shared/settings";

function isSetupPage(loc: Location): boolean {
  if (loc.protocol === "https:" && loc.hostname === "thejeswi.github.io" && loc.pathname === "/littletusk/setup.html") return true;
  // The local copy of the setup page exists for the end-to-end tests only: in the store build the extension
  // does not expose its setup page to localhost, so this branch is compiled out.
  if (!__E2E__) return false;
  return loc.protocol === "http:" && (loc.hostname === "127.0.0.1" || loc.hostname === "localhost") && loc.pathname === "/site/setup.html";
}

/** If this tab is the email setup link with a valid #lt= fragment, move to the extension's setup page. */
export function handleSetupLink(loc: Location): boolean {
  if (!isSetupPage(loc) || !loc.hash.startsWith("#lt=")) return false;
  if (!decodeSetupConfig(loc.hash)) return false;
  const fragment = loc.hash;
  history.replaceState(null, "", loc.pathname + loc.search);
  loc.href = chrome.runtime.getURL("pages/setup.html") + fragment;
  return true;
}
