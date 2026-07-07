import { useEffect, useRef, useState } from "react";
import { getBreakSettings, setBreakSettings, type BreakSettings } from "./api";

type ExerciseCategory = "breathing" | "neck" | "full-body-scan" | "meditation";

const EXERCISES: Record<ExerciseCategory, { label: string; options: { label: string; minutes?: number }[] }> = {
  breathing: { label: "Breathing", options: [{ label: "Destress" }, { label: "Refresh" }, { label: "Box" }, { label: "Relax" }] },
  neck: { label: "Neck Exercise", options: [{ label: "Unwind" }, { label: "Pain Relief" }, { label: "Loosen Up" }] },
  "full-body-scan": {
    label: "Full Body Scan",
    options: [
      { label: "Body Check", minutes: 8 },
      { label: "Head-to-Toe", minutes: 9 },
      { label: "Deep Awareness", minutes: 12 },
      { label: "Inner Body", minutes: 16 },
    ],
  },
  meditation: { label: "Meditation", options: [{ label: "Quick Reset", minutes: 5 }, { label: "Deep Focus", minutes: 15 }] },
};

function BreakModal({ onDismiss }: { onDismiss: () => void }) {
  const [category, setCategory] = useState<ExerciseCategory | null>(null);
  const [voice, setVoice] = useState<"Emma" | "Alex">("Emma");

  return (
    <div className="waes-modal-backdrop" onClick={onDismiss}>
      <div className="glass-card" style={{ width: 480, maxHeight: "80vh", overflowY: "auto" }} onClick={(e) => e.stopPropagation()}>
        <h3>Time for a break</h3>
        {!category ? (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            {(Object.keys(EXERCISES) as ExerciseCategory[]).map((key) => (
              <button key={key} className="waes-button" style={{ padding: "18px 10px" }} onClick={() => setCategory(key)}>
                {EXERCISES[key].label}
              </button>
            ))}
          </div>
        ) : (
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 10 }}>
              <b>{EXERCISES[category].label}</b>
              <button className="waes-button" onClick={() => setCategory(null)}>
                Back
              </button>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 14 }}>
              {EXERCISES[category].options.map((opt) => (
                <button key={opt.label} className="waes-button" style={{ padding: "14px 10px", textAlign: "left" }}>
                  {opt.label}
                  {opt.minutes && <div style={{ fontSize: 11, opacity: 0.7 }}>{opt.minutes} minutes</div>}
                </button>
              ))}
            </div>
            <div style={{ fontSize: 12, marginBottom: 6, opacity: 0.7 }}>Voice Guide</div>
            <div style={{ display: "flex", gap: 8 }}>
              {(["Emma", "Alex"] as const).map((v) => (
                <button
                  key={v}
                  className="waes-button"
                  style={{ background: voice === v ? "var(--waes-accent-soft)" : undefined }}
                  onClick={() => setVoice(v)}
                >
                  {v}
                </button>
              ))}
            </div>
          </div>
        )}

        <div style={{ marginTop: 16, textAlign: "right" }}>
          <button className="waes-button" onClick={onDismiss}>
            Dismiss
          </button>
        </div>
      </div>
    </div>
  );
}

export function BreakTimer() {
  const [settings, setSettings] = useState<BreakSettings>({ intervalMinutes: 25, enabled: true, exerciseTypes: Object.keys(EXERCISES) });
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [showModal, setShowModal] = useState(false);
  const [saved, setSaved] = useState(false);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    getBreakSettings().then((s) => {
      setSettings(s);
      setSecondsLeft(s.intervalMinutes * 60);
    });
  }, []);

  useEffect(() => {
    if (!settings.enabled) return;
    timerRef.current = window.setInterval(() => {
      setSecondsLeft((s) => {
        if (s <= 1) {
          triggerBreak();
          return settings.intervalMinutes * 60;
        }
        return s - 1;
      });
    }, 1000);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [settings.enabled, settings.intervalMinutes]);

  function triggerBreak() {
    setShowModal(true);
    if ("Notification" in window) {
      if (Notification.permission === "granted") {
        new Notification("Time for a break", { body: "Pick a breathing, neck, body-scan, or meditation break." });
      } else if (Notification.permission !== "denied") {
        Notification.requestPermission();
      }
    }
  }

  async function saveSettings(next: BreakSettings) {
    setSettings(next);
    setSecondsLeft(next.intervalMinutes * 60);
    await setBreakSettings(next);
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  }

  const minutesLeft = Math.floor(secondsLeft / 60);
  const secsLeft = secondsLeft % 60;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16, maxWidth: 500 }}>
      <div className="glass-card">
        <h3>Break reminders</h3>
        <div style={{ fontSize: 32, fontFamily: "monospace", marginBottom: 10 }}>
          {String(minutesLeft).padStart(2, "0")}:{String(secsLeft).padStart(2, "0")}
        </div>

        <label style={{ fontSize: 12, display: "flex", flexDirection: "column", gap: 4, marginBottom: 10 }}>
          Remind me every {settings.intervalMinutes} minutes
          <input
            type="range"
            className="waes-slider"
            min={25}
            max={100}
            step={5}
            value={settings.intervalMinutes}
            onChange={(e) => saveSettings({ ...settings, intervalMinutes: Number(e.target.value) })}
          />
        </label>

        <label style={{ fontSize: 13, display: "flex", alignItems: "center", gap: 6, marginBottom: 10 }}>
          <input type="checkbox" checked={settings.enabled} onChange={(e) => saveSettings({ ...settings, enabled: e.target.checked })} />
          Enabled
        </label>

        <button className="waes-button" onClick={triggerBreak}>
          Take a break now
        </button>
        {saved && <span style={{ marginLeft: 8, fontSize: 12, opacity: 0.7 }}>Saved</span>}
      </div>

      {showModal && <BreakModal onDismiss={() => setShowModal(false)} />}
    </div>
  );
}
