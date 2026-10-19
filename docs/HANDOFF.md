# Handoff: speech input, voice check and Tusk's moods (work in progress)

> **Status (2026-10-19):** finished. Speech is on, Tusk's moods are in, and the full suites pass. Merged to `main` and released as **v0.2.0**; this file stays as the record of the work.
> **Follow-up (v0.2.1):** the open question is answered. An offscreen document cannot get microphone permission, so the speech engine now runs in the composing iframe (an extension page). The pack downloads normally in branded Chrome; Chrome for Testing cannot fetch the SODA components.

Branch `wip/speech-and-moods`, 2026-10-19. `main` is stable and released (v0.1.0). This branch holds
unfinished work, stopped mid-way to continue on another machine. Typecheck passed at the stop; the
test suites were NOT run on this branch.

## What was decided

Read `docs/superpowers/specs/2026-10-19-speech-and-moods-design.md` first: the owner's picks
(A1, B3, C3, D3, E1, F1, all moods) and every detail. The approved mockups are in
`docs/superpowers/mockups/` (open them in a browser; they use the brainstorm frame's CSS, so they
look plainer outside it, but the Tusk parts and the mood keyframes in `speech-ui-E-F-and-moods.html`
are complete and are the reference for the animations).

## State of the work

Two workers were stopped in the middle. Expect half-finished edits.

1. **Speech engine** (pluggable listener, voice check backend):
   - New `src/speech/browser.ts`: the browser's own recognizer (Web Speech API, on-device with
     `processLocally`), started but not finished. Check it against the spec before relying on it.
   - Build-time switch for speech in tests: edits in `vite.config.ts`, `vite.content.config.ts`,
     `vitest.config.ts`, `src/env.d.ts`, `src/shared/features.ts`, `package.json`, `.gitignore`
     (a `dist-e2e-speech` output), `tests/e2e/fixtures.ts`, `tests/e2e/mic-*.spec.ts`.
   - Not started or not visible yet: `src/speech/select.ts` (chooseEngine + createSpeechAuto),
     the voice-status / test-voice messages in the service worker, the one-time `noVoice` notice,
     the settings `listenOnline` / `packPolicy`.
   - Open question it was investigating: does SpeechRecognition work inside the extension's
     offscreen document? Probes in `docs/superpowers/probes/` (moved out of the test folders so
     they do not run with the suites). Facts known: on the owner's machine the browser recognizer
     works in a normal page and in an extension page; `SpeechRecognition.install` for en-US took
     about 9 s in branded Chrome; in headless Playwright Chromium the install did not finish in 60 s.
     If the offscreen document does not work, run the recognizer in the compose iframe
     (`src/pages/compose.ts`), which is an extension page.
2. **Moods** (overlay animations): edits in `src/content/ui/index.ts`, `src/content/ui/styles.ts`,
   `src/content/ui/playground.ts`, `demo/ui-playground.html`. Planned API: `setMood(...)`,
   `setSpeaking(on)`, automatic mapping (see spec section G). Unknown how far it got: review the
   diff against `main`.

## Still to do after that

- UI on top of the engine: chat microphone with live words and the two-line hints (A1), progress for
  the pack (B3), the family checkbox for the online listener (C3), Test voice in Tusk's settings and a
  per-language voice list in family settings (D3), the microphone badge on Tusk (E1) and the
  hands-free conversation with captions and "Stop talking" (F1), dropping junk transcripts.
- Switch `FEATURES.speechInput` on, then update `site/privacy.html` and `docs/store/listing.md`
  (speech now on: on-device browser listener or Whisper, family can allow the online listener),
  the README, and regenerate screenshots and store images.
- Run everything: `npm run typecheck`, `npm test`, `npm run e2e`, `npm run scenarios`,
  `npm run check:store`, `scripts/check-clean.sh`; then merge into `main` and tag a new version
  (bump `manifest.json` and `package.json` together; the release workflow checks the tag).

## Conventions that matter here

- Commits are authored by Thejeswi Preetham with the personal email and carry no co-author lines.
- Never mention the owner's employer anywhere; `scripts/check-clean.sh` runs as a pre-commit hook.
- Push with the `ssh://git@github.com/thejeswi/littletusk.git` remote form (a global git rule on
  the owner's machine rewrites other GitHub URLs). GitHub blocks key-shaped strings, even fake
  ones in tests: build test keys at runtime.
- Test builds keep the overlay's shadow root open; production keeps it closed.
