// Drops misheard transcripts instead of sending them. No browser APIs: unit tested.
import type { Language } from "../shared/protocol";

const DEFAULT_MIN_LETTERS = 3; // one or two characters are almost always a mishearing ("hmm", "ah")

// Letters by script. Everything else (spaces, punctuation, digits) is ignored when judging the script.
const LATIN = /\p{Script=Latin}/u;
const DEVANAGARI = /\p{Script=Devanagari}/u;

/** The main script the letters of `text` are written in, counting letter by letter. */
export function scriptMix(text: string): { latin: number; devanagari: number; other: number } {
  const mix = { latin: 0, devanagari: 0, other: 0 };
  for (const ch of text) {
    if (!/\p{L}/u.test(ch)) continue;
    if (LATIN.test(ch)) mix.latin++;
    else if (DEVANAGARI.test(ch)) mix.devanagari++;
    else mix.other++;
  }
  return mix;
}

/** True when most letters fit the script people write in `lang` (Latin everywhere; Latin or Devanagari for English (India)). */
export function fitsScript(text: string, lang: Language): boolean {
  const mix = scriptMix(text);
  const letters = mix.latin + mix.devanagari + mix.other;
  if (letters === 0) return true; // digits or punctuation only: let the model/person decide
  const fits = lang === "en-IN" ? mix.latin + mix.devanagari : mix.latin;
  return fits * 2 > letters; // "mostly in a script that does not fit" means more than half
}

/** Empty, one or two characters, or mostly in a script that does not fit the language. */
export function isJunkTranscript(text: string, lang: Language, minLetters = DEFAULT_MIN_LETTERS): boolean {
  const t = text.replace(/\s+/g, " ").trim();
  if (!t) return true;
  if ([...t].length <= 2) return true;
  const mix = scriptMix(t);
  if (mix.latin + mix.devanagari + mix.other < minLetters) return true;
  return !fitsScript(t, lang);
}
