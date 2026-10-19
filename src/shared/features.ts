// Features that can be switched off while they are not ready for people to use.
// __SPEECH__ is set at build time: on in production, and in the speech end-to-end variant
// (LITTLETUSK_SPEECH=1). The ordinary test build keeps it off, so the no-speech path stays covered.
export const FEATURES = {
  /** Speaking to Tusk (microphone + on-device browser recognizer or local Whisper). */
  speechInput: typeof __SPEECH__ !== "undefined" ? __SPEECH__ : true,
} as const;
