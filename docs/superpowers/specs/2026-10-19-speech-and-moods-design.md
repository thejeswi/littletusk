# Speaking to Tusk, read-aloud checks, and Tusk's moods: design

Date: 2026-10-19. Status: options chosen by the owner in the browser mockups.

## Decisions (owner's picks)

| Row | Choice |
|---|---|
| A. Speaking in the chat | A1: the chat's microphone fills the text box; the person checks and presses Send |
| B. Listening pack | B3: downloaded on first use, with a progress bar |
| C. Which listener | C3: on this computer by default; only the family can allow the browser's online listener, as a backup |
| D. Read-aloud voice | D3: Test voice in Tusk's settings, a one-time note in the chat when no voice exists, a per-language voice list in family settings |
| E. Conversation button | E1: a round microphone badge on Tusk's lower right |
| F. Conversation | F1: hands-free, like a phone call, with captions |
| G. Moods | all eight, as shown: idle, hello, listening, thinking, speaking, done, sorry, walking |

## A1: the chat microphone

- A microphone button sits in the chat's compose row, next to the text box. Pressing it starts listening; the button turns red with a stop square; pressing again stops.
- Words appear in the text box live. Nothing is sent until the person presses Send.
- Hint under the box while listening (owner's wording, two lines):
  "🎤 Listening… your words appear in the box." / "Check them, then press Send."
- Hint after listening stops (my wording, same style): "Is this right? Change it if needed," / "then press Send."
- The text box lives in the compose iframe (src/pages/compose.*), so the live words and hints go there.

## B3: listening pack

- First use of either microphone in a language without a pack: progress "Getting ready to listen…" with a bar (in the chat hint for A1, in the captions bubble for F1), then listening starts. settings.packPolicy = "auto".

## C3: online listener

- Never on by default. Family settings get a checkbox: "Allow the browser's online listener as a backup. The voice is sent to Google." (settings.listenOnline). Not shown in Tusk's own settings.

## D3: read-aloud voice

- Tusk's settings: a "🔊 Test voice" button next to "Read answers aloud"; after it speaks, a line: "Did you hear me? Voice: <name> (online)" or "(on this computer)", or "This computer has no voice for <language>."
- Chat: the one-time `noVoice` note (engine step).
- Family settings: "Read answers aloud" section with Test voice and one line per language: voice name and whether it is online, or "no voice on this computer".

## E1 + F1: spoken conversation

- A round microphone badge on Tusk's lower right: about 30 px visible, with an invisible hit area of at least 44 px for unsteady hands. Keyboard focusable, aria-label "Speak with Tusk" / "Stop talking".
- Pressing it starts a hands-free conversation: Tusk listens, sends when the person pauses, says its answer aloud, then listens again. The badge is red with a stop square while the conversation is on.
- A captions bubble next to Tusk shows "You: …" and "Tusk: …" and a status line ("Listening…", "Thinking…", "🔊 Speaking… then I listen again."), and a red "■ Stop talking" button.
- While Tusk speaks, listening pauses, so Tusk does not hear itself.
- Ends on Stop talking, on the badge, after 20 seconds of silence, or on New chat.
- If no voice exists for the language, the conversation still works with captions only, and the noVoice note appears once.
- Misheard input: transcripts that are empty, one or two characters, or mostly in a script that does not fit the language (the earlier Whisper gibberish) are dropped with "Sorry, I didn't catch that." instead of being sent. Everything that cannot be undone still needs a yes, enforced in code.
- Hidden when speech input is switched off (FEATURES.speechInput).

## G: moods

- Tusk's SVG is split into parts (body, ears, trunk, eyes, cheeks) plus overlay layers (sound rings, thinking dots, sparkles), animated with CSS only, exactly as in the approved mockup.
- Mapping: idle by default; hello when Tusk is clicked or the chat opens; listening while any microphone is live; thinking while the agent is busy; speaking while read-aloud plays; done briefly after an action that worked (closed a popup, a click, a pointing that was followed); sorry briefly after a failed action or an error notice (never for the person's mistakes); walking while gliding to point.
- prefers-reduced-motion: a still Tusk.
- The pointing pose keeps working with the moods.
