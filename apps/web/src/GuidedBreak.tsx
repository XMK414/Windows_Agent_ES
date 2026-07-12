import { useEffect, useRef, useState } from "react";
import { speak, stopSpeaking, isSpeechSynthesisSupported } from "./speech";
import type { Routine } from "./breakContent";

// The two "voice guides" map to different synthesis characters (browsers vary
// in which named voices exist, so we differentiate by pitch/rate as a fallback).
const VOICE_SETTINGS: Record<string, { pitch: number; rate: number }> = {
  Wren: { pitch: 1.15, rate: 0.95 },
  Sage: { pitch: 0.85, rate: 0.9 },
};

export function GuidedBreak({ routine, voice, voiceOn, onDone }: { routine: Routine; voice: string; voiceOn: boolean; onDone: () => void }) {
  const [stepIndex, setStepIndex] = useState(0);
  const [secondsLeft, setSecondsLeft] = useState(routine.steps[0].seconds);
  const [playing, setPlaying] = useState(true);
  const [finished, setFinished] = useState(false);
  const tick = useRef<number | null>(null);

  const step = routine.steps[stepIndex];

  function say(text: string) {
    if (voiceOn && isSpeechSynthesisSupported()) speak(text, VOICE_SETTINGS[voice] ?? {});
  }

  // Speak each step's cue as it becomes active.
  useEffect(() => {
    if (!finished) say(step.text);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stepIndex, finished]);

  useEffect(() => {
    if (!playing || finished) return;
    tick.current = window.setInterval(() => {
      setSecondsLeft((s) => {
        if (s > 1) return s - 1;
        // Step's time is up — advance, or finish on the last step.
        if (stepIndex + 1 >= routine.steps.length) {
          setFinished(true);
          return 0;
        }
        const next = stepIndex + 1;
        setStepIndex(next);
        return routine.steps[next].seconds;
      });
    }, 1000);
    return () => {
      if (tick.current) clearInterval(tick.current);
    };
  }, [playing, finished, stepIndex, routine.steps]);

  useEffect(() => () => stopSpeaking(), []);

  function skip() {
    stopSpeaking();
    if (stepIndex + 1 >= routine.steps.length) {
      setFinished(true);
    } else {
      setStepIndex((i) => i + 1);
      setSecondsLeft(routine.steps[stepIndex + 1].seconds);
    }
  }

  function restart() {
    stopSpeaking();
    setFinished(false);
    setStepIndex(0);
    setSecondsLeft(routine.steps[0].seconds);
    setPlaying(true);
  }

  const progress = ((stepIndex + (step.seconds - secondsLeft) / step.seconds) / routine.steps.length) * 100;

  if (finished) {
    return (
      <div style={{ textAlign: "center", padding: "12px 0" }}>
        <div style={{ fontSize: 15, marginBottom: 12 }}>Break complete — nicely done. 🌿</div>
        <div style={{ display: "flex", gap: 8, justifyContent: "center" }}>
          <button className="waes-button" onClick={restart}>
            Repeat
          </button>
          <button className="waes-button" onClick={onDone}>
            Done
          </button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div style={{ height: 4, background: "rgba(255,255,255,0.1)", borderRadius: 2, marginBottom: 12 }}>
        <div style={{ width: `${progress}%`, height: "100%", background: "var(--waes-accent, #88f)", borderRadius: 2, transition: "width 0.3s" }} />
      </div>

      <div style={{ fontSize: 12, opacity: 0.6, marginBottom: 4 }}>
        {routine.label} · step {stepIndex + 1} of {routine.steps.length}
      </div>
      <div style={{ fontSize: 17, lineHeight: 1.4, minHeight: 60 }}>{step.text}</div>
      <div style={{ fontSize: 40, fontFamily: "monospace", textAlign: "center", margin: "8px 0" }}>{secondsLeft}</div>

      <div style={{ display: "flex", gap: 8, justifyContent: "center" }}>
        <button className="waes-button" onClick={() => setPlaying((p) => !p)}>
          {playing ? "Pause" : "Resume"}
        </button>
        <button className="waes-button" onClick={skip}>
          Skip
        </button>
        <button className="waes-button" onClick={restart}>
          Restart
        </button>
        <button className="waes-button" onClick={onDone}>
          End
        </button>
      </div>
    </div>
  );
}
