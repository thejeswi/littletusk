# Little Tusk: build plan

Spec: `docs/superpowers/specs/2026-10-18-littletusk-design.md`. Shared contracts:
`src/shared/protocol.ts` (change only together with every side that uses it).

Workers do not commit; the coordinator reviews and commits after each task. Workers never add
dependencies on their own (the scaffold installs everything); if one is truly missing, they say so in
their report. Never write absolute paths or the owner's employer name into any file.

## Layout

```
src/shared/        protocol.ts, i18n.ts (strings for en, de, es, en-IN), settings.ts (chrome.storage)
src/content/ui/    the overlay: elephant, menu, chat, bubbles, glow, spotlight, drag, tuck away
src/content/page/  snapshot, element ids, actions, safety checks, overlay detector
src/content/main.ts wires ui + page to runtime messages
src/background/    service worker: router, offscreen lifecycle, tts
src/offscreen/     agent host: harness, little-tusk pi-durable extension, prompts, budget, view mapping
src/storage/       sqlite-wasm OPFS worker + SqliteDatabase adapter
src/speech/        whisper worker (transformers.js), mic capture
src/pages/         setup.html (email-link landing + mic permission), offscreen.html
site/              GitHub Pages: setup.html link maker
demo/              local demo pages (popup shop, cookie banner, form) for tests and screenshots
tests/unit/        vitest (node / jsdom)
tests/e2e/         playwright, chromium with the unpacked extension, faux provider
scripts/           check-clean.sh, screenshots
```

## Tasks

1. **Scaffold** (alone): package.json with exact pins, Vite build to `dist/` (pages + workers as ES
   modules, content script as one IIFE), manifest, `npm run build|test|e2e|typecheck|check-clean`,
   MIT licence, .gitignore, check-clean pre-commit hook, Playwright fixture that launches Chromium with
   `dist/` loaded. Empty entry points that build.
2. **In parallel** after 1, each owning only its folder:
   - 2a storage: SQLite-WASM worker + adapter, pi-durable storage conformance run in a real browser.
   - 2b overlay UI (`src/content/ui`), driven by `ChatView`; i18n strings for its labels.
   - 2c page tools and safety (`src/content/page`), jsdom unit tests.
   - 2d setup + settings + site page (`src/pages/setup*`, `site/`, `src/shared/settings.ts`).
3. **Agent core** (after 2): offscreen harness, tools via the router, prompt sections per language,
   modes and the "Show me how" hook, confirmation flow, stuck detection, budget, look-after proactive
   flow; `src/content/main.ts` wiring; e2e with the faux provider.
4. **Speech** (after 3): whisper worker, mic flow, listening wave, tts.
5. **Demo pages, e2e polish, screenshots, README** (after 4).
