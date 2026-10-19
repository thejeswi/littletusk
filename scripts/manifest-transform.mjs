// Turns the source manifest.json into the one that ships.
//  - Production (dist/, the store build): no localhost match patterns. They exist only so the end-to-end
//    tests can open the setup page from a local server.
//  - e2e (dist-e2e/): keeps them.
// "tabs" is not needed in either build: host_permissions <all_urls> already exposes tab URLs, and we only
// use tabs.query / sendMessage / update / create / onUpdated, none of which need the permission.
const LOCAL = /^https?:\/\/(127\.0\.0\.1|localhost)(:|\/|$)/;

export function transformManifest(manifest, { e2e }) {
  const m = structuredClone(manifest);
  m.permissions = (m.permissions ?? []).filter((p) => p !== "tabs");
  if (!e2e && Array.isArray(m.web_accessible_resources)) {
    m.web_accessible_resources = m.web_accessible_resources
      .map((entry) => ({ ...entry, matches: (entry.matches ?? []).filter((x) => !LOCAL.test(x)) }))
      .filter((entry) => entry.matches.length > 0);
  }
  return m;
}
