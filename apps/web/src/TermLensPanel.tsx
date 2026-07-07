import { useEffect, useState } from "react";
import { runTermLensScan, listScans, getScan, type ScanResult } from "./api";

const RISK_COLOR: Record<string, string> = { low: "#8ce08c", medium: "#ffd28c", high: "#ffb2a3" };

function RiskBadge({ risk }: { risk: string }) {
  return (
    <span className="waes-badge" style={{ borderColor: RISK_COLOR[risk], color: RISK_COLOR[risk] }}>
      {risk}
    </span>
  );
}

export function TermLensPanel() {
  const [text, setText] = useState("");
  const [sourceName, setSourceName] = useState("");
  const [provider, setProvider] = useState("anthropic-api");
  const [model, setModel] = useState("claude-sonnet-5");
  const [result, setResult] = useState<ScanResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [history, setHistory] = useState<any[]>([]);

  async function refreshHistory() {
    setHistory(await listScans());
  }

  useEffect(() => {
    refreshHistory();
  }, []);

  async function scan() {
    if (!text.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const scanResult = await runTermLensScan(text, sourceName || "pasted-text", provider, model);
      setResult(scanResult);
      refreshHistory();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function loadPast(id: string) {
    const scanRow = await getScan(id);
    setResult({ id: scanRow.id, source: scanRow.source, createdAt: scanRow.created_at, ...scanRow.result });
  }

  return (
    <div style={{ display: "flex", gap: 16, maxWidth: 1100, width: "100%" }}>
      <div style={{ flex: 2, display: "flex", flexDirection: "column", gap: 16 }}>
        <div className="glass-card">
          <h3>TermLens Scanner</h3>
          <input
            className="waes-input"
            placeholder="Source name (e.g. Acme ToS)"
            value={sourceName}
            onChange={(e) => setSourceName(e.target.value)}
            style={{ width: "100%", marginBottom: 8 }}
          />
          <textarea
            className="waes-input"
            placeholder="Paste the terms of service / contract text to scan..."
            value={text}
            onChange={(e) => setText(e.target.value)}
            style={{ width: "100%", height: 160, marginBottom: 8, fontFamily: "inherit" }}
          />
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <select className="waes-select" value={provider} onChange={(e) => setProvider(e.target.value)}>
              <option value="anthropic-api">Anthropic</option>
              <option value="google-api">Google</option>
            </select>
            <input className="waes-input" value={model} onChange={(e) => setModel(e.target.value)} style={{ width: 200 }} />
            <button className="waes-button" onClick={scan} disabled={busy}>
              {busy ? "Scanning..." : "Scan"}
            </button>
          </div>
          {error && <div style={{ color: "#ffb2a3", fontSize: 12, marginTop: 8 }}>{error}</div>}
        </div>

        {result && (
          <div className="glass-card">
            <h3>
              {result.source} <RiskBadge risk={result.overallRisk} />
            </h3>
            <p style={{ fontSize: 13, opacity: 0.85 }}>{result.summary}</p>
            {result.clauses.length === 0 && <div style={{ fontSize: 12, opacity: 0.6 }}>No concerning clauses found.</div>}
            {result.clauses.map((c, i) => (
              <div key={i} style={{ borderTop: "1px solid var(--waes-glass-border)", paddingTop: 8, marginTop: 8 }}>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <b>{c.title}</b>
                  <RiskBadge risk={c.risk} />
                </div>
                <div style={{ fontSize: 13, margin: "4px 0" }}>{c.plainEnglish}</div>
                <div style={{ fontSize: 11, opacity: 0.6 }}>{c.why}</div>
                <details style={{ fontSize: 11, opacity: 0.6, marginTop: 4 }}>
                  <summary>Original clause</summary>
                  {c.original}
                </details>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="glass-card" style={{ flex: 1, height: "fit-content" }}>
        <h3>Past scans</h3>
        {history.length === 0 && <div style={{ fontSize: 12, opacity: 0.6 }}>None yet.</div>}
        {history.map((h) => (
          <div
            key={h.id}
            onClick={() => loadPast(h.id)}
            style={{ cursor: "pointer", fontSize: 12, padding: "6px 0", borderBottom: "1px solid var(--waes-glass-border)" }}
          >
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <b>{h.source}</b>
              <RiskBadge risk={h.overall_risk} />
            </div>
            <div style={{ opacity: 0.6 }}>{new Date(h.created_at).toLocaleString()}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
