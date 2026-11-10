export const NOVA_SPEECH_RATE = 1.16;

// Web Speech exposes names and locales, but no gender metadata.
export function selectNovaVoice(
  voices: SpeechSynthesisVoice[],
  language: "en-IN" | "hi-IN",
) {
  const prefix = language === "hi-IN" ? "hi" : "en";
  const candidates = voices.filter((v) =>
    v.lang.toLowerCase().startsWith(prefix),
  );
  const feminine =
    /female|veena|samantha|karen|tessa|moira|victoria|ava\b|serena|susan|zira|jenny|aria|sonia|heera|kalpana|swara|lekha|sangeeta|neerja/i;
  const score = (voice: SpeechSynthesisVoice) =>
    (feminine.test(voice.name) ? 100 : 0) +
    (voice.lang.toLowerCase() === language.toLowerCase() ? 30 : 0) +
    (voice.localService ? 5 : 0);
  return candidates.slice().sort((a, b) => score(b) - score(a))[0];
}
export function configureNovaSpeech(
  utterance: SpeechSynthesisUtterance,
  language: "en-IN" | "hi-IN",
  voices: SpeechSynthesisVoice[],
) {
  utterance.lang = language;
  utterance.rate = NOVA_SPEECH_RATE;
  utterance.pitch = 1.04;
  const selected = selectNovaVoice(voices, language);
  if (selected) utterance.voice = selected;
}
