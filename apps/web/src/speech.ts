// Thin wrapper around the Web Speech API (SpeechRecognition + speechSynthesis).
// Both are browser features with no server involvement, and support varies
// (best in Chrome/Edge); every entry point here feature-detects and no-ops
// gracefully rather than throwing when unsupported.

export function isSpeechRecognitionSupported(): boolean {
  return typeof window !== "undefined" && Boolean((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition);
}

export function isSpeechSynthesisSupported(): boolean {
  return typeof window !== "undefined" && "speechSynthesis" in window;
}

export function startListening(onResult: (transcript: string) => void, onEnd: () => void): (() => void) | null {
  const SpeechRecognitionCtor = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
  if (!SpeechRecognitionCtor) return null;

  const recognition = new SpeechRecognitionCtor();
  recognition.continuous = false;
  recognition.interimResults = false;
  recognition.lang = "en-US";

  recognition.onresult = (event: any) => {
    const transcript = Array.from(event.results as ArrayLike<any>)
      .map((r: any) => r[0].transcript)
      .join(" ");
    onResult(transcript);
  };
  recognition.onend = onEnd;
  recognition.start();

  return () => recognition.stop();
}

export interface SpeakOptions {
  /** Preferred system voice name, if available. */
  voiceName?: string;
  rate?: number;
  pitch?: number;
}

export function speak(text: string, opts: SpeakOptions = {}): void {
  if (!isSpeechSynthesisSupported() || !text.trim()) return;
  window.speechSynthesis.cancel(); // don't overlap with a previous utterance
  const utterance = new SpeechSynthesisUtterance(text);
  if (opts.rate != null) utterance.rate = opts.rate;
  if (opts.pitch != null) utterance.pitch = opts.pitch;
  if (opts.voiceName) {
    const match = window.speechSynthesis.getVoices().find((v) => v.name === opts.voiceName);
    if (match) utterance.voice = match;
  }
  window.speechSynthesis.speak(utterance);
}

export function stopSpeaking(): void {
  if (isSpeechSynthesisSupported()) window.speechSynthesis.cancel();
}
