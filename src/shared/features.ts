// Features that can be switched off while they are not ready for people to use.
// __SPEECH__ is set at build time (LITTLETUSK_SPEECH=1, used by the speech end-to-end variant); production stays off
// until the speaking UI ships.
export const FEATURES = {
  /** Speaking to Tusk (microphone + on-device browser recognizer or local Whisper). */
  speechInput: typeof __SPEECH__ !== "undefined" ? __SPEECH__ : false,
} as const;
