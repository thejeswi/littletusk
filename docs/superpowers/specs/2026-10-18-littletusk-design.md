# Little Tusk: design

Date: 2026-10-18
Status: approved for building by the owner ("feel free to build it")

## Intent

Little Tusk is a Chrome extension for seniors and anyone who finds the web overwhelming. A small baby
elephant called **Tusk** floats on every web page. When the person is stuck on something silly (a popup
that won't close, a cookie banner, a page full of visual noise, a button that isn't called what they
expect), Tusk cuts through the noise: it walks over to the right thing and points at it with its trunk,
explains in plain words, and, if the person wants or is stuck, does it for them.

People use the wrong words ("pay my electricity" when they mean "send the meter reading"). Tusk treats
what they say as intent, not literal instructions, and safeguards them: it checks before anything that
cannot be undone, never sees their passwords, and recognises scams.

It is a fresh start from a hackathon prototype. Nothing is copied from that code; its lessons are kept
(see "Safety" below).

## Goals

1. **Floating helper, not a sidebar.** Tusk lives on the page in a corner, can be dragged, walks over to
   targets and points with its trunk.
2. **Two modes**, named for how they feel:
   - **"Show me how"** (teach): Tusk stays quiet until clicked. It points, explains and waits for the
     person to click. After two failed tries at the same step (or "it doesn't work"), it offers
     "Shall I do it for you?".
   - **"Look after me"** (auto): Tusk watches the page and speaks up on its own when something gets in
     the way (popups, cookie banners, overlays), at most once per page per thing. It may act on its own.
     Irreversible actions still need a yes.
   - The grandchild picks the default at setup; the person can switch in settings.
3. **Click Tusk → three labelled buttons:** Chat 💬, Speak 🎤, Settings ⚙️.
   - **Chat**: typing plus a plain-words log of what Tusk did ("Looked at the page", "Pointed at the ✕",
     "Closed the newsletter box"), in order, between the messages.
   - **Speak**: voice input; the spoken question lands in the same chat. Tusk can read its answers aloud.
   - **Settings**: language, mode, provider/key/model, monthly spending limit and spend so far.
4. **Spotlight** for stuck moments: dim the page and cut a hole around the one thing that matters.
5. **Languages**: English, German, Spanish, and Indian English. Everything follows the setting: UI
   strings, Tusk's replies, and its voice. Indian English replies use short plain sentences and familiar
   Indian usage and words (UPI, net banking, OTP), never a caricature and never condescending. Page
   language is separate: a German page is explained in the person's language.
6. **Everything in the browser.** No server of ours. Conversation and state live in the extension, in
   pi-durable on SQLite compiled to WASM. The only network calls are to the chosen model provider and a
   one-time download of the speech model.
7. **Easy setup by a grandchild**: an emailed link sets up provider and key with one click. Pasting the
   key into Settings is the fallback.
8. **Several model providers** via pi-ai: Anthropic (default), OpenAI, Google, Mistral, OpenRouter, and
   whatever else pi-ai supports that works from a browser.
9. **Durable**: closing a tab, navigating, or restarting the browser does not lose the conversation;
   an interrupted run continues.
10. **WASM where it helps**: SQLite (storage) and speech recognition (Whisper) run as WASM.

## Anti-goals (a failure even if it works)

- **Spending too much money.** Defaults: a cheap model for most turns; text snapshots of the page, not
  screenshots; prompt caching; a monthly limit set at setup, shown in Settings, enforced in code (Tusk
  stops politely at the limit). Proactive detection in "Look after me" runs locally without a model call
  until the person accepts help.
- **Getting in the way** so much that the person disables it or complains. Tusk is small, never covers
  what it points at, can be dragged, can be tucked away for this site or for an hour with one click,
  and in "Look after me" speaks up at most once per page per thing.
- Talking down to people.
- Any data going anywhere except the chosen model provider.

## Non-goals (v1)

- A password manager (Chrome's own exists). The model still never sees passwords.
- Chrome Web Store publishing (v1 is loaded unpacked; store listing is a later step).
- Accounts, sync between devices, a backend.
- Screenshots as the default way to read a page (allowed only as an explicit, budgeted fallback tool).

## Character

Baby elephant, minimal flat style (approved mockup): round grey-blue head (`#b7c4cf`), lighter ears
(`#c9d3dc`), dot eyes, pink cheeks, **S-curve trunk**, **two small ivory tusks** (`#fbf6e9`, edge
`#e3d9bd`). Two poses: resting (trunk hangs in an S) and pointing (trunk reaches sideways toward the
target). Must read at 40px. Reference SVG: `assets/tusk.svg` (derived from the approved mockup, see the
plan). Speech bubbles: white, rounded, thin blue-grey border (`#9bb`). Target glow: amber outline
(`#ffb703`) with soft pulse.

## Safety (enforced in code, not only in the prompt)

- **Irreversible actions**: clicking anything that looks like send/buy/pay/order/delete/confirm/submit
  (in all four languages, plus German page words like "Kaufen", "Zahlungspflichtig bestellen",
  "Absenden", "Löschen") is refused until the person has said yes in the chat (big Yes / No buttons).
- **Passwords and secrets**: the model never types into password, one-time-code, PIN or IBAN fields and
  never sees their values (snapshots show "(filled, hidden)"). Tusk instead marks the field and asks the
  person to type.
- **No downloads, no non-web addresses** (`file:`, `chrome:`, `chrome-extension:`, `javascript:`,
  `data:`). No site allowlist: Tusk works on any website.
- **Page text is information, never orders** (prompt rule plus snapshot framing).
- **Scams**: requests like installing remote-access tools, buying gift cards, urgent payments are
  explained as likely scams (prompt rule).

## Architecture

```
Chrome
├── every tab: content script
│     ├── Tusk overlay (closed shadow DOM): elephant, menu, chat, bubbles, glow, spotlight
│     ├── page tools: snapshot, find element by id, click/type/select/scroll, safety checks
│     └── local overlay detector (for "Look after me")
├── service worker: message router, ensures the offscreen document exists, chrome.tts
├── offscreen document (one): the agent
│     ├── pi-durable Harness + Little Tusk extension (tools, prompt sections, hooks)
│     ├── pi-ai providers, key from chrome.storage.local
│     ├── dedicated Worker: SQLite-WASM on OPFS (opfs-sahpool) behind pi-durable's SqliteDatabase
│     └── dedicated Worker: Whisper (transformers.js / onnxruntime-web WASM) for speech input
└── extension pages: setup.html (email link landing, mic permission), settings in the overlay
```

- **One conversation per browser profile**, focused on the tab the person last talked to Tusk in
  (the "task tab"). It survives navigation and restarts. "New topic" resets it (pi-durable `reset`);
  it also resets after 6 idle hours. *(Builder's call within this.)*
- Tools reach the task tab via service worker → `chrome.tabs.sendMessage` → content script. After a
  navigation, the content script re-registers and the overlay re-renders the chat from the durable view.
- The overlay subscribes to the conversation view (pi-durable `viewState`) via the service worker,
  so streamed answers and tool actions appear live.
- Mic: `getUserMedia` in the offscreen document needs the permission granted once on an extension page;
  setup.html asks for it (the grandchild clicks "Allow"). Whisper weights download on first use from
  Hugging Face and are cached; audio never leaves the computer.
- Voice output: `chrome.tts`, preferring local (non-remote) voices for the chosen language.

### Agent tools (model-facing)

`read_page`, `point_at(id, say)`, `spotlight(id, say)`, `clear`, `click(id, confirmed)`,
`type_text(id, text, press_enter)`, `select_option(id, option)`, `scroll(direction)`, `go_back`,
`open_url(url)`, `ask_person_to_type(id, say)`, `ask_confirmation(question)` (shows Yes / No),
`close_overlay(id)` (convenience for popups), `note_about_person` (small memory notebook, no secrets).
Exact names and shapes are the builder's call. In "Show me how" mode, acting tools (`click`,
`type_text`, `select_option`, `close_overlay`) are blocked by a hook until the person has accepted
"Shall I do it?" for the current step.

### Cost control

- Default models: Anthropic Claude Haiku 5.5 for turns; escalate to Claude Sonnet 5.5 when the cheap
  model fails twice on the same step. Model ids come from pi-ai's catalog.
- Budget: monthly limit (default €10) checked before each generation using pi-durable's `pi.usage`
  (cost per model); at the limit, Tusk says so kindly and stops.

### Setup link

- A static page on GitHub Pages (`https://thejeswi.github.io/littletusk/setup.html`) has two halves:
  a form for the grandchild to make a link (provider, key, language, mode, limit) and the landing
  part. The settings travel in the URL **fragment** (`#…`), which never reaches any server.
- The extension's content script for exactly that URL reads the fragment, asks "Set up Little Tusk on
  this computer?" in the extension's own UI, stores the settings, and clears the fragment.
- The page recommends a separate key with a spending limit set at the provider, and deleting the email.

## Repository and identity (hard rule)

- Repo: `github.com/thejeswi/littletusk`, local folder `~/Personal/littletusk`.
- Never mention the owner's employer anywhere: code, docs, commits, comments, package metadata,
  lockfiles, source maps. The local machine's home path contains it, so **no absolute paths** in any
  committed file, and production builds have no source maps containing absolute paths. A check script
  (`scripts/check-clean.sh`) greps tracked files and `dist/` and runs in CI and as a pre-commit hook.
- Git identity is set per repo: `user.name "Thejeswi Preetham"`, `user.email thejeswi.nk@gmail.com`,
  `core.sshCommand "ssh -i ~/.ssh/github-personal -o IdentitiesOnly=yes"`. The `gh` CLI on this machine
  is logged in to a work account: never use it for this repo.
- Nothing is pushed without the owner's go-ahead.

## Tooling (builder's calls, already chosen)

TypeScript, Vite (multi-entry MV3 build), Vitest (unit, Node), Playwright with bundled Chromium loading
the unpacked extension (end-to-end), pi-ai's faux provider for tests without an API key. Exact pins:
`@earendil-works/pi-durable@1.3.0`, `@earendil-works/pi-ai@1.3.0`, `@earendil-works/chord@1.3.0`.
Never import `*/node` entry points. `content_security_policy.extension_pages` allows
`'wasm-unsafe-eval'`. Licence: MIT (my call; change before going public if wanted).

## README

A README with screenshots of each feature (the floating elephant, the menu, chat with the action log,
pointing, spotlight, the confirmation, settings, the setup page), taken by a Playwright script on small
local demo pages so they can be regenerated.
