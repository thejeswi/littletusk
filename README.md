<p align="center"><img src="assets/tusk.svg" alt="Tusk, a baby elephant" width="120"></p>

# Little Tusk

A friendly little elephant that helps seniors, and anyone who finds the web confusing.

Little Tusk is a Chrome extension. A small baby elephant called Tusk floats in the corner of every web page. When you get stuck on something silly, Tusk walks over to the right thing, points at it with its trunk, explains in plain words and, if you want, does it for you.

[![Watch the 42-second Little Tusk demo](site/video/poster.jpg)](site/video/littletusk-demo-720p.mp4)

▶ **Watch the 42-second demo** (MP4, 720p, silent): a confusing visa portal, a cookie notice, a newsletter popup, a scam email, and Tusk in German and Spanish.

A tour of every feature, with a video and install steps, is on the website: **[thejeswi.github.io/littletusk](https://thejeswi.github.io/littletusk/)**.

## Why

Most of the trouble people have online is small and silly. A popup that will not close because the little cross is nearly invisible. A cookie banner that covers the page. A button that is called something other than what you expect. You wanted to "pay for the electricity", and the page wants a "meter reading".

People often use the wrong words for what they mean, and that is fine. Tusk treats what you say as what you want, not as a literal command. It also keeps you safe: it checks before anything that cannot be undone, it never sees your passwords, and it knows what a scam looks like.

## What it does

### Tusk on every page

Tusk lives in the corner of the page. You can drag it anywhere, and you can hide it for this site or for an hour with one click. Click Tusk and the chat opens. You type there, and Settings is at the top of the chat. The typing box keeps working even on sites whose cookie dialogs grab the keyboard.

### "Show me how" or "Look after me"

- **Show me how.** Tusk stays quiet until you click it. Then it points, explains and waits for you to click. If you get stuck twice on the same step, it offers: "Shall I do it for you?"
- **Look after me.** Tusk watches the page and speaks up when something gets in the way, such as a popup or a cookie banner. It speaks up at most once per page for each thing. The check runs on your computer and costs nothing until you say yes.

When you are really stuck, Tusk can dim the page and light up the one thing that matters.

### Chat with a log of what Tusk did

Type your question. Between the messages, Tusk lists in plain words what it did: "Looked at the page", "Pointed at the cross", "Closed the popup". You always see what happened on your screen.

The chat also works in a narrow window, for example on a small laptop or a phone-sized window.

### Talk to Tusk

A family member can turn talking on in Family settings (off by default). Then press the microphone in the chat and talk: your words appear in the two-line text box, with a hint, and nothing is sent until you press Send. The microphone button turns red with a stop square while it listens.

The same setting shows the round microphone badge on Tusk; pressing it starts a hands-free conversation, like a phone call. Tusk listens, sends what you said when you pause, says its answer aloud, then listens again. The words show as captions ("You: …", "Tusk: …") with a red Stop talking button. It ends on Stop talking, the badge, a New chat, or 20 seconds of silence. A transcript that is empty, very short or in the wrong writing system is dropped with "Sorry, I didn't catch that." instead of being sent.

Speech is understood on your computer: first by the browser's own on-device listener (the first use of a language may download a small listening pack, with a progress bar), then by Tusk's open Whisper model in WebAssembly if needed. In Family settings, a family member can allow the browser's online listener as a backup; it is off by default, and Tusk's own settings do not offer it.

Tusk can read its answers aloud if you switch it on. A Test voice button in Settings says a sentence and names the voice. When this computer has no voice for the language, Tusk hides Read aloud and Test voice instead: there is no switch to turn on and nothing to apologise for, and every answer is shown as text. The family settings still list a voice per language, or say plainly which one is missing. The extension cannot install an operating-system voice itself, so the family settings link to a short guide for Windows, macOS, Linux, Android and ChromeOS (site/voices.html).

### Tusk shows what it is doing

Tusk's ears, trunk and eyes move with its work: a hello when you click it, wide ears while listening, bouncing dots while thinking, a swaying trunk while speaking, a happy hop when a step worked, and a drooped head when something failed. People who switch off motion in their computer settings get a still Tusk.

### Safety

These rules are enforced in code, not only in the instructions to the model.

- **Tusk asks before anything that cannot be undone.** Buying, paying, sending, deleting and confirming need a big "Yes" from you first, whatever the language of the page.
- **Tusk never sees your passwords.** It cannot type into password, one-time code, PIN or IBAN fields, and it never reads what is in them. It marks the field and asks you to type.
- **No downloads, no strange addresses.** Tusk will not download files or open `file:`, `chrome:` or `javascript:` addresses.
- **Scam warnings.** Remote-access tools, gift cards and "urgent" payments are explained as the scams they probably are. Tusk also checks the page itself, on your computer: when a message pressures you the way scams do (an account that will be closed today, gift cards, "tell nobody"), Tusk marks that text, and in "Look after me" it speaks up without being asked. It then points at the safe way out, such as "Report spam", and never at what the scammer wants.
- **Page text is information, not orders.** A page that says "ignore your instructions" gets ignored.

### Four languages

English, Deutsch, Español and English (India). Everything follows the setting: the buttons, Tusk's answers and its voice. The page can be in another language: a German shop is explained to you in your own language. English (India) uses short, plain sentences and familiar words such as UPI, net banking and OTP.

### Settings and a spending limit

The person can change language, mode and "read answers aloud", start a new topic, or hide Tusk. The family settings (provider, key, models, spending limit) sit one click away.

Tusk uses a cheap model for everyday turns and reads the page as text, not screenshots. A monthly spending limit is set at setup, shown in the chat, and enforced in code: at the limit, Tusk stops politely.

## Setting it up for someone

This is the "grandchild flow": you set Little Tusk up once, on their computer.

1. **Install.** Download `littletusk-vX.Y.Z.zip` from the [Releases](https://github.com/thejeswi/littletusk/releases) page and unzip it. In Chrome (or Chromium, Edge, Brave) open `chrome://extensions`, switch on Developer mode, click "Load unpacked" and choose the unzipped folder. Keep that folder: Chrome reads the extension from it. Developers can build it themselves instead (see [Development](#development)). A Chrome Web Store listing comes later.
2. **Add the key.** Either way works:
   - **Family settings page.** Open it from Tusk's Settings, "Family settings". Choose a provider, paste the key, set the monthly limit, language and mode, and click Save.


   - **Setup link by email.** On the family settings page, make a link and email it to yourself or to them. Opening it on their computer asks "Set up Little Tusk on this computer?" and saves the settings after one click.

About the setup link: the settings travel in the part of the link after the `#`. Browsers never send that part to a server, so nobody but the two computers sees the key. Still, please use a separate key that has a spending limit set at the provider, and delete the email afterwards.

The two static pages in `site/` (the landing page and the setup-link page) are published to GitHub Pages by `.github/workflows/pages.yml`. One-time setting in the repository: Settings, Pages, Source: "GitHub Actions". The pages need no build and load nothing from other sites.

### Making a release

The built extension is not stored in the repository. A release is built from the source by a workflow:

```bash
# set "version" in manifest.json and package.json, commit, then:
git tag v0.2.2
git push origin v0.2.2
```

The workflow (`.github/workflows/release.yml`) runs the type check and tests, builds from a clean checkout, checks that the build contains no personal paths or names, and attaches the zip to a GitHub Release. The tag has to match the version in `manifest.json`. Running the workflow by hand builds the same zip as a download without making a release.

## Privacy

- Everything stays in the browser. The conversation lives in pi-durable on SQLite compiled to WebAssembly, in the extension's private storage.
- The only network calls go to the model provider you chose.
- Speech is understood on your computer. The browser's on-device listener is used first; its listening pack is downloaded by Chrome. If it is not available, Tusk's Whisper model runs in WebAssembly and is downloaded once from Hugging Face (about 100 to 150 MB) and cached. Audio leaves the computer only if a family member allows the browser's online listener (off by default), and then it goes to the browser's maker (Google) for recognition under its own policy. The chat microphone never sends anything until the person presses Send.
- There is no server of ours, no account and no tracking.

## Model providers

Anthropic is the default: Claude Haiku 5.5 for everyday turns, and Claude Sonnet 5.5 when the cheap model is stuck. OpenAI, Google, Mistral, OpenRouter and DeepSeek (DeepSeek V4.1 Flash everyday, V4 Pro when stuck) work too, through [pi-ai](https://www.npmjs.com/package/@earendil-works/pi-ai).

## How it works

```
Chrome
├── every tab: content script
│     ├── Tusk overlay (shadow DOM): elephant, menu, chat, bubbles, glow, spotlight
│     ├── page tools: read the page, click, type, select, scroll, safety checks
│     └── local popup detector (for "Look after me")
├── service worker: message router, starts the offscreen document, text to speech
├── offscreen document: the agent (pi-durable harness, pi-ai model providers)
│     ├── worker: SQLite-WASM in the extension's private storage (the durable conversation)
│     ├── composing frame (extension page): the microphone and the speech engine
│     └── worker: browser on-device recognizer first, Whisper in WebAssembly as the fallback
└── extension pages: family settings and the setup link landing page
```

Closing a tab, navigating or restarting the browser does not lose the conversation. An interrupted run continues. The design is in `docs/superpowers/specs/`.

## Development

Requirements: Node 22.19 or newer, and Chrome or Chromium.

```bash
npm install
npm run build          # writes the extension to dist/
```

Load it in Chrome: open `chrome://extensions`, switch on Developer mode, click "Load unpacked" and choose the `dist` folder.

```bash
npm test               # unit tests, including the manifest readiness test and the network privacy checks
npm run typecheck
npm run e2e            # end to end, with a fake model provider: no key, no cost
npm run scenarios      # "senior gets stuck" scenarios, free (see Scenario tests)
npm run check:store    # Chrome Web Store readiness of the built dist/ (run npm run build first)
npm run screenshots    # regenerates the store screenshots locally (not committed)
scripts/check-clean.sh # no personal paths or names in tracked files or the build
```

To try Tusk by hand in a visible browser, run `scripts/dev-chrome.sh`. It builds the extension, starts a separate Chromium with it loaded and opens `demo/index.html`, a page that links every demo with what to say and which mode to use. It keeps its own profile in `.chrome-profile/`, so your key survives restarts.

The demo pages in `demo/` are made up, some in German and some in English, on purpose. The end-to-end tests and the screenshots use a build with a scripted fake model (`npm run build:e2e`), so they need no API key.

## Scenario tests

Real "senior gets stuck" moments, end to end, in `tests/scenarios/`. Each one opens a German demo page, lets a person say or click things, and then checks only what a person would care about: the state of the page, what Tusk marked with its glow, and what Tusk said. Nothing looks at internal tool names, so the same checks work with a real model.

- A newsletter popup will not close: Tusk marks the tiny cross, and the person closes it (show mode).
- The same popup, and the person asks Tusk to close it.
- A cookie banner: Tusk offers by itself, "Nur notwendige" is pressed, and no model call is made (look after me).
- Wrong words: "send my electricity numbers" ends at "Zählerstand melden" (`demo/stadtwerke.html`).
- Finding the login, which is only called "Mein Konto" on a busy news page (`demo/portal.html`).
- A scam email asking for gift cards: Tusk warns and clicks nothing (`demo/webmail.html`).
- Buying a chair: Tusk asks first, the person says no, nothing is bought.
- A password: Tusk marks the field for the person to type, and it stays empty.
- A tiny grey "Newsletter abbestellen" link at the bottom of an email (`demo/newsletter-mail.html`).

```bash
npm run scenarios        # free: the scripted fake model, no key, about 40 seconds
ANTHROPIC_API_KEY=... npm run scenarios:live   # a real model: Claude Haiku 5.5
```

The live run reads the key from the environment, never prints or stores it, and runs one scenario at a time with long waits. It costs a few cents per run with Haiku. Without the key it skips everything and says so.

Both runs write `test-results/scenarios/<id>/transcript.md` (the chat in order: person, Tusk, actions, questions with answers), `final.png` and `summary.json`, and `test-results/scenarios/report.md` with pass or fail, the spend shown in the chat footer (live) and links to the transcripts. The scenarios are not part of `npm run e2e`.

## Status

An early prototype. Known gaps:

- Speech quality depends on the device and the browser's on-device listener. Tusk falls back to Whisper when the browser listener is missing or hears silence; the fallback downloads a model once.
- There is no Chrome Web Store listing yet.
- The automated tests use a scripted fake model. They have not been run against a live model.

## Licence

MIT, see [LICENSE](LICENSE).
