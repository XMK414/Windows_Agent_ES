import { useState } from "react";
import { queryMemory } from "./api";

function sourceLabel(source: string): string {
  const [kind] = source.split(":");
  return kind;
}

export function MemoryPanel() {
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<{ source: string; snippet: string; score: number }[]>([]);
  const [busy, setBusy] = useState(false);

  async function run() {
    if (!q.trim()) return;
    setBusy(true);
    try {
      const res = await queryMemory(q);
      setHits(res.hits);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16, maxWidth: 800, width: "100%" }}>
      <div className="glass-card">
        <h3>Memory query</h3>
        <div style={{ display: "flex", gap: 8 }}>
          <input
            className="waes-input"
            placeholder="Search notes, library, and project files..."
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && run()}
            style={{ flex: 1 }}
          />
          <button className="waes-button" onClick={run} disabled={busy}>
            {busy ? "Searching..." : "Search"}
          </button>
        </div>
      </div>

      {hits.length > 0 && (
        <div className="glass-card">
          {hits.map((h, i) => (
            <div key={i} style={{ borderTop: i > 0 ? "1px solid var(--waes-glass-border)" : undefined, padding: "8px 0" }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12 }}>
                <span className="waes-badge">{sourceLabel(h.source)}</span>
                <span style={{ opacity: 0.6 }}>{h.source}</span>
              </div>
              <div style={{ fontSize: 13, marginTop: 4 }}>{h.snippet}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
