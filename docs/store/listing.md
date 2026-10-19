# Chrome Web Store listing: Little Tusk

Note: the permission justifications below match the production manifest: `storage`, `offscreen`, `scripting`, `tts` and the host permission `<all_urls>`.

## Name

Little Tusk

## Summary (max 132 characters; this one is 117)

A friendly baby elephant that points at the right button, explains in plain words and, if you ask, does the clicking.

## Detailed description

Little Tusk is a patient little helper for the web. It is made for seniors, and for anyone who finds websites confusing.

A small baby elephant called Tusk waits in the corner of every page. When you get stuck on something silly, such as a popup that will not close or a cookie banner that covers the page, Tusk walks over to the right thing, points at it, and explains in plain words what to do. If you want, it does the clicking for you.

You can also talk to Tusk after a family member turns talking on in Family settings (off by default). The chat then shows a microphone beside the text box: your words appear there, you check them and press Send, so nothing goes out by itself. The round badge under Tusk starts a hands-free conversation, like a phone call: Tusk listens, answers aloud, shows the words as captions and then listens again. Speech is understood on your computer by the browser's own listener, with Tusk's open Whisper model as a fallback. Only a family member can allow the browser's online listener as a backup, in Family settings.

Two ways to use it:
- Show me how: Tusk stays quiet until you click it. Then it points, explains and waits for you. If you get stuck twice on the same step, it offers to do it for you.
- Look after me: Tusk watches the page and speaks up when something gets in the way, such as a popup, a cookie banner or a message that looks like a scam. Spotting these happens on your computer.

Safety rules that are built into the code:
- Tusk asks for a clear "Yes" before anything that cannot be undone, such as paying, sending or deleting.
- Tusk never types into or reads password, code, PIN or IBAN fields.
- Tusk does not download files and does not open browser-internal or file addresses.
- Tusk explains scams (gift cards, remote-access tools, "urgent" payments) and points at the safe way out.
- Every action is listed in the chat in plain words, so you always see what happened.

Languages: English, German (Deutsch), Spanish (Español) and English (India).

You bring your own AI key. Little Tusk does not include an AI service. A family member gets an API key from a provider they choose (Anthropic, OpenAI, Google, Mistral, OpenRouter or DeepSeek), pays there with their own spending limit, and enters it in Tusk's Family settings, or sends a setup link. Tusk also has its own monthly spending limit. Requests go straight from the browser to that provider. There are no accounts, no servers of ours, no analytics and no ads. Chat history and settings stay on the computer.

Little Tusk is open source: https://github.com/thejeswi/littletusk

## Category

Accessibility. Tusk's main job is to make websites easier to use for people who struggle with them. Productivity is the fallback if Accessibility feels too narrow for the review.

## Languages (listing and UI)

English (also set as the default), German, Spanish, English (India).

## Single purpose

Little Tusk helps people who find websites confusing: it points out and explains the right thing to click on the page they are on and, when asked, does the step for them.

## Permission justifications

### storage
Saves the person's settings (language, mode, spending limit), the API key they entered, and the monthly spend counter in the extension's private storage on their computer. Nothing is sent to us.

### offscreen
The AI helper (conversation, notes and the chat database) runs in an offscreen document, because a Manifest V3 service worker is stopped by the browser after a short time and cannot keep a conversation, a database and a long request to the AI provider alive. The offscreen document runs only the extension's own packaged code. The microphone is not used there: speech runs in Tusk's composing frame, an extension page, so the browser can ask for microphone permission. The microphone is used only while the person is listening, and the audio is turned into text on the computer.

### scripting
Used to put Tusk's page-side code into tabs that were already open when the extension was installed or updated, so Tusk appears there without the person having to reload each page.

### tts
Lets Tusk read its answers aloud with the browser's text-to-speech voices, in the language the person chose, only when the person switches "Read answers aloud" on (it is off by default), when the person presses Test voice, or during a hands-free conversation. It prefers voices that run on the computer. No audio is recorded. If no local voice exists for the language, Tusk says so once in the chat and uses captions; the browser may use an online voice from its maker, and the privacy policy says so.

### Why the extension needs access to all sites (host permission <all_urls>)
Tusk helps on any website the person is struggling with, so it cannot know in advance which sites it will be needed on. On the page the person is on, it reads the visible text and the names of buttons, links and fields, and it shows its elephant, pointers and highlights. It only sends page content to the AI provider the user chose when the person asks for help or accepts an offer. In "Look after me" mode, spotting popups and scam-like text happens on the computer and sends nothing. Tusk never reads password, code, PIN or IBAN fields. There is deliberately no list of allowed sites, because that would leave people alone on the sites they most need help with.

## Remote code

No, all code ships in the package. When the browser's on-device speech listener is not available, Tusk may download its open Whisper speech model (data, not code) once from Hugging Face and keep it on the computer. The browser's own on-device listening pack is downloaded by Chrome. Neither is remote code, and neither adds scripts to the extension.

## Data usage (Privacy practices tab)

Tick:
- Website content: Tusk reads the text and element names of the page the person asks about and sends them to the chosen AI provider.
- Personal communications: the person's chat messages are sent to the chosen AI provider. What the person says to Tusk becomes a chat message only after they press Send (chat microphone) or when the hands-free conversation sends it; on-device recognition happens on the computer. If the family allows the browser's online listener, the browser sends the audio to its maker (Google) for recognition under Google's own policy.
- Authentication information: the API key the user enters. It is stored locally and sent only to the provider it belongs to, as the login for the requests.

Leave unticked: health information, financial and payment information, personally identifiable information, location, web history, user activity (keystrokes, clicks), because Tusk does not collect them for itself. Tusk does skip password, code, PIN and IBAN fields. Note that ordinary text on a page may contain personal details; if the dashboard reviewer pushes back, tick "Personally identifiable information" to be safe, since page text and filled-in form fields can include a name or address.

Tick all three certifications:
- I do not sell or transfer user data to third parties, outside of the approved use cases.
- I do not use or transfer user data for purposes that are unrelated to the item's single purpose.
- I do not use or transfer user data to determine creditworthiness or for lending purposes.

## URLs

- Privacy policy: https://thejeswi.github.io/littletusk/privacy.html
- Homepage: https://thejeswi.github.io/littletusk/
- Support: https://github.com/thejeswi/littletusk/issues

## Test instructions for the reviewer

1. Install the extension and open any normal website (for example a news site with a cookie banner). A small elephant appears in the bottom right corner.
2. Click the elephant, then Settings, then Family settings.
3. Choose the provider Anthropic (Claude) and paste this key: `<ADD A THROWAWAY KEY WITH A SMALL SPENDING LIMIT HERE>`
4. Set the language to English and save. Close settings.
5. Type "How do I close this popup?" or "What is on this page?" in the chat. Tusk answers and points at the thing it means.
6. Without a key, Tusk only says "Ask your family to set me up." That is expected.
7. Speech (optional, needs a microphone): in Family settings tick "Let my child talk to Tusk" (off by default). Then click the microphone in the chat, speak, and the words appear in the text box; press the badge under Tusk for a hands-free conversation with captions. The first use of a language may download the browser's listening pack. In Family settings, the online listener is off by default and only the family can allow it.

Fill in the real key in the dashboard's test instructions field only. Never commit it to this repository. Revoke the key after the review.

## Trader or non-trader

The owner decides. This is a free, open-source hobby project with no business behind it, which usually means "non-trader". If you declare yourself a trader, the dashboard shows your address and phone number publicly on the listing in the EU. As a non-trader, no address is shown, but EU consumers are told that consumer rights may not apply.

## Pre-submission checklist

- [x] The production manifest lists only storage, offscreen, scripting and tts, plus access to all sites. The `tabs` permission and the test-only localhost patterns are gone (checked by `npm run check:store` and the manifest unit tests). Minimum Chrome version is 116.
- [ ] Version number in manifest.json is the one being uploaded.
- [ ] The release zip is built with `npm run build` and loads cleanly via Load unpacked.
- [ ] Speech is on: the chat microphone and the badge under Tusk appear once a family member turns talking on; Test voice appears when the computer has a voice; the family's online-listener checkbox is present; the privacy policy and the description above match.
- [ ] `npm run check-clean` passes.
- [ ] The privacy policy is live at the URL above (merge and wait for GitHub Pages).
- [ ] Five screenshots (1280x800) and the small promo tile (440x280) are uploaded from docs/store/assets.
- [ ] Summary, description, category, single purpose and all justifications are pasted.
- [ ] Data usage boxes and the three certifications are set as above.
- [ ] Test instructions contain a real throwaway key with a small spending limit (dashboard only).
- [ ] Trader or non-trader choice made.
- [ ] Store listing text matches what the code does (re-read after any change).
