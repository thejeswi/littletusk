// Features that can be switched off while they are not ready for people to use.
export const FEATURES = {
  /** Speaking to Tusk (microphone + local Whisper). Off until it reliably hears people. */
  speechInput: false,
} as const;
