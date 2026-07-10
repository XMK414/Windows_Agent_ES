import { useState } from "react";
import { runBoard, type BoardSeat, type BoardResult } from "./api";
import { ModelPicker } from "./ModelPicker";
import { providerLabel } from "./models";
import { BOARD_ARCHETYPES } from "./boardArchetypes";

const DEFAULT_SEATS: BoardSeat[] = [
  { adapterId: "anthropic-api", model: "claude-sonnet-5", personaId: "persona/skeptical-reviewer" },
  { adapterId: "google-api", model: "gemini-2.5-flash" },
];

export function BoardPanel() {
  const [prompt, setPrompt] = useState("");
  const [seats, setSeats] = useState<BoardSeat[]>(DEFAULT_SEATS);
  const [chairAdapter, setChairAdapter] = useState("anthropic-api");
  const [chairModel, setChairModel] = useState("claude-opus-4-8");
  const [peerReview, setPeerReview] = useState(true);
  const [result, setResult] = useState<BoardResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function updateSeat(i: number, patch: Partial<BoardSeat>) {
    setSeats((s) => s.map((seat, idx) => (idx === i ? { ...seat, ...patch } : seat)));
  }

  function addSeat() {
    setSeats((s) => [...s, { adapterId: "openrouter", model: "openai/gpt-4o" }]);
  }

  function removeSeat(i: number) {
    setSeats((s) => s.filter((_, idx) => idx !== i));
  }

  // Fill the board with the built-in Counsel archetypes (Expansionist, First
  // Principles, Contrarian, Outsider, Executioner), spreading them across the
  // configured providers so no one seat's system prompt is lost.
  function loadArchetypes() {
    setSeats(
      BOARD_ARCHETYPES.map((a) => ({
        adapterId: "anthropic-api",
        model: "claude-sonnet-5",
        label: a.label,
        systemPrompt: a.systemPrompt,
      })),
    );
  }

  async function run() {
    if (!prompt.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const res = await runBoard("board-1", prompt, seats, { adapterId: chairAdapter, model: chairModel }, peerReview);
      setResult(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16, maxWidth: 820, width: "100%" }}>
      <div className="glass-card">
        <h3>Board of Directors</h3>
        <p style={{ fontSize: 12, opacity: 0.6, marginTop: -4, marginBottom: 10 }}>
          A phased advisory board: every seat answers the brief, then (optionally) peer-reviews the panel, and the chair
          synthesises a verdict with one concrete next step. Load the built-in archetypes or build your own panel.
        </p>
        <textarea
          className="waes-input"
          placeholder="Ask the panel a question..."
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          style={{ width: "100%", height: 80, marginBottom: 10 }}
        />

        {seats.map((seat, i) => (
          <div key={i} style={{ display: "flex", gap: 8, marginBottom: 6, flexWrap: "wrap", alignItems: "center" }}>
            <input
              className="waes-input"
              placeholder={`Seat ${i + 1}`}
              value={seat.label ?? ""}
              onChange={(e) => updateSeat(i, { label: e.target.value || undefined })}
              style={{ width: 130 }}
            />
            <ModelPicker adapterId={seat.adapterId} model={seat.model} onChange={(patch) => updateSeat(i, patch)} />
            <input
              className="waes-input"
              placeholder="persona/... (optional)"
              value={seat.personaId ?? ""}
              onChange={(e) => updateSeat(i, { personaId: e.target.value || undefined })}
              style={{ flex: 1, minWidth: 120 }}
            />
            <button className="waes-button" onClick={() => removeSeat(i)}>
              Remove
            </button>
          </div>
        ))}
        <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
          <button className="waes-button" onClick={addSeat}>
            Add seat
          </button>
          <button className="waes-button" onClick={loadArchetypes}>
            Load Counsel archetypes
          </button>
        </div>

        <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 10, flexWrap: "wrap" }}>
          <span style={{ fontSize: 12, opacity: 0.7 }}>Chair:</span>
          <ModelPicker
            adapterId={chairAdapter}
            model={chairModel}
            onChange={(patch) => {
              if (patch.adapterId !== undefined) setChairAdapter(patch.adapterId);
              if (patch.model !== undefined) setChairModel(patch.model);
            }}
          />
          <label style={{ fontSize: 12, display: "flex", alignItems: "center", gap: 4, marginLeft: 8 }}>
            <input type="checkbox" checked={peerReview} onChange={(e) => setPeerReview(e.target.checked)} />
            Peer review round
          </label>
        </div>

        <button className="waes-button" onClick={run} disabled={busy}>
          {busy ? "Running panel..." : "Run"}
        </button>
        {error && <div style={{ color: "#ffb2a3", fontSize: 12, marginTop: 8 }}>{error}</div>}
      </div>

      {result && (
        <div className="glass-card">
          <h3>Board</h3>
          {result.board.map((s, i) => (
            <div key={i} style={{ borderTop: "1px solid var(--waes-glass-border)", padding: "8px 0", fontSize: 13 }}>
              <b>
                {s.label} ({providerLabel(s.adapterId)}/{s.model}
                {s.personaId ? `, ${s.personaId}` : ""}) {!s.ok && <span className="waes-badge warn">error</span>}
              </b>
              <div style={{ marginTop: 4, whiteSpace: "pre-wrap" }}>{s.content}</div>
            </div>
          ))}

          {result.reviews.length > 0 && (
            <>
              <h3 style={{ marginTop: 16 }}>Peer review</h3>
              {result.reviews.map((s, i) => (
                <div key={i} style={{ borderTop: "1px solid var(--waes-glass-border)", padding: "8px 0", fontSize: 13 }}>
                  <b>
                    {s.label} {!s.ok && <span className="waes-badge warn">error</span>}
                  </b>
                  <div style={{ marginTop: 4, whiteSpace: "pre-wrap" }}>{s.content}</div>
                </div>
              ))}
            </>
          )}

          <div style={{ borderTop: "1px solid var(--waes-glass-border)", padding: "8px 0", marginTop: 16 }}>
            <b>Verdict</b>
            <div style={{ marginTop: 4, whiteSpace: "pre-wrap", fontSize: 13 }}>{result.verdict}</div>
          </div>

          {result.nextStep && (
            <div className="glass-card" style={{ marginTop: 12, padding: 12, background: "var(--waes-accent-soft, rgba(80,110,255,0.12))" }}>
              <div style={{ fontSize: 11, opacity: 0.7, textTransform: "uppercase", letterSpacing: 0.5 }}>The only next step</div>
              <div style={{ marginTop: 4, fontSize: 14, fontWeight: 600 }}>{result.nextStep}</div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
