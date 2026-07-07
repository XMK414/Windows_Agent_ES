import { useState } from "react";
import { runBoard, type BoardSeat } from "./api";

const DEFAULT_SEATS: BoardSeat[] = [
  { adapterId: "anthropic-api", model: "claude-sonnet-5", personaId: "persona/skeptical-reviewer" },
  { adapterId: "google-api", model: "gemini-2.5-flash" },
];

export function BoardPanel() {
  const [prompt, setPrompt] = useState("");
  const [seats, setSeats] = useState<BoardSeat[]>(DEFAULT_SEATS);
  const [chairAdapter, setChairAdapter] = useState("anthropic-api");
  const [chairModel, setChairModel] = useState("claude-opus-4-8");
  const [result, setResult] = useState<{ seats: any[]; synthesis: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function updateSeat(i: number, patch: Partial<BoardSeat>) {
    setSeats((s) => s.map((seat, idx) => (idx === i ? { ...seat, ...patch } : seat)));
  }

  function addSeat() {
    setSeats((s) => [...s, { adapterId: "anthropic-api", model: "claude-sonnet-5" }]);
  }

  function removeSeat(i: number) {
    setSeats((s) => s.filter((_, idx) => idx !== i));
  }

  async function run() {
    if (!prompt.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const res = await runBoard("board-1", prompt, seats, { adapterId: chairAdapter, model: chairModel });
      setResult(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16, maxWidth: 800, width: "100%" }}>
      <div className="glass-card">
        <h3>Board of Directors</h3>
        <textarea
          className="waes-input"
          placeholder="Ask the panel a question..."
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          style={{ width: "100%", height: 80, marginBottom: 10 }}
        />

        {seats.map((seat, i) => (
          <div key={i} style={{ display: "flex", gap: 8, marginBottom: 6 }}>
            <select className="waes-select" value={seat.adapterId} onChange={(e) => updateSeat(i, { adapterId: e.target.value })}>
              <option value="anthropic-api">Anthropic</option>
              <option value="google-api">Google</option>
            </select>
            <input className="waes-input" value={seat.model} onChange={(e) => updateSeat(i, { model: e.target.value })} style={{ width: 180 }} />
            <input
              className="waes-input"
              placeholder="persona/... (optional)"
              value={seat.personaId ?? ""}
              onChange={(e) => updateSeat(i, { personaId: e.target.value || undefined })}
              style={{ flex: 1 }}
            />
            <button className="waes-button" onClick={() => removeSeat(i)}>
              Remove
            </button>
          </div>
        ))}
        <button className="waes-button" onClick={addSeat} style={{ marginBottom: 12 }}>
          Add seat
        </button>

        <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 10 }}>
          <span style={{ fontSize: 12, opacity: 0.7 }}>Chair:</span>
          <select className="waes-select" value={chairAdapter} onChange={(e) => setChairAdapter(e.target.value)}>
            <option value="anthropic-api">Anthropic</option>
            <option value="google-api">Google</option>
          </select>
          <input className="waes-input" value={chairModel} onChange={(e) => setChairModel(e.target.value)} style={{ width: 180 }} />
        </div>

        <button className="waes-button" onClick={run} disabled={busy}>
          {busy ? "Running panel..." : "Run"}
        </button>
        {error && <div style={{ color: "#ffb2a3", fontSize: 12, marginTop: 8 }}>{error}</div>}
      </div>

      {result && (
        <div className="glass-card">
          <h3>Panel responses</h3>
          {result.seats.map((s, i) => (
            <div key={i} style={{ borderTop: "1px solid var(--waes-glass-border)", padding: "8px 0", fontSize: 13 }}>
              <b>
                Seat {i + 1} ({s.adapterId}/{s.model}
                {s.personaId ? `, ${s.personaId}` : ""}) {!s.ok && <span className="waes-badge warn">error</span>}
              </b>
              <div style={{ marginTop: 4, whiteSpace: "pre-wrap" }}>{s.content}</div>
            </div>
          ))}
          <div style={{ borderTop: "1px solid var(--waes-glass-border)", padding: "8px 0", marginTop: 8 }}>
            <b>Synthesis</b>
            <div style={{ marginTop: 4, whiteSpace: "pre-wrap", fontSize: 13 }}>{result.synthesis}</div>
          </div>
        </div>
      )}
    </div>
  );
}
