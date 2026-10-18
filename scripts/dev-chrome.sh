#!/usr/bin/env bash
# Start a separate Chromium with Little Tusk loaded, for trying it by hand.
#
#   scripts/dev-chrome.sh            build, then launch
#   scripts/dev-chrome.sh --no-build launch the existing dist/
#
# - Uses Playwright's bundled Chromium (branded Google Chrome ignores --load-extension).
# - Keeps its own profile in .chrome-profile/ (git-ignored), so your settings, API key and
#   the downloaded speech model survive restarts. Delete that folder to start fresh.
# - Opens a debugging port (default 9222) so tools can read logs and take screenshots.
# - Serves the repo on http://127.0.0.1:8123 and opens the demo index (/demo/index.html), which links
#   every demo page with what to say; the setup-link page is at /site/setup.html.
# Ctrl+C stops Chromium and the demo server.
set -euo pipefail
cd "$(dirname "$0")/.."

PORT_DEBUG="${LT_DEBUG_PORT:-9222}"
PORT_DEMO="${LT_DEMO_PORT:-8123}"
PROFILE="$PWD/.chrome-profile"

if [[ "${1:-}" != "--no-build" ]]; then
  npm run build
fi

CHROME="$(node -e "import('playwright').then(p => console.log(p.chromium.executablePath()))")"
if [[ ! -x "$CHROME" ]]; then
  echo "Chromium not found. Run: npx playwright install chromium" >&2
  exit 1
fi

EXTRA=()
# Ubuntu 23.10+ blocks the Chromium sandbox for browsers outside /opt (AppArmor).
if [[ "$(cat /proc/sys/kernel/apparmor_restrict_unprivileged_userns 2>/dev/null || echo 0)" == "1" ]]; then
  EXTRA+=(--no-sandbox)
fi

python3 -m http.server "$PORT_DEMO" --bind 127.0.0.1 >/dev/null 2>&1 &
SERVER=$!
trap 'kill $SERVER 2>/dev/null || true' EXIT

echo "Little Tusk: debugging port $PORT_DEBUG, demo index on http://127.0.0.1:$PORT_DEMO/demo/index.html"
"$CHROME" \
  --user-data-dir="$PROFILE" \
  --remote-debugging-port="$PORT_DEBUG" \
  --disable-extensions-except="$PWD/dist" \
  --load-extension="$PWD/dist" \
  --no-first-run --no-default-browser-check \
  "${EXTRA[@]}" \
  "http://127.0.0.1:$PORT_DEMO/demo/index.html" >/dev/null 2>&1 || true
