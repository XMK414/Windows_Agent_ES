import { useEffect, useState } from "react";
import { getCostSummary } from "./api";

export function CostPanel() {
  const [days, setDays] = useState(7);
  const [summary, setSummary] = useState<any>(null);

  useEffect(() => {
    getCostSummary(days).then(setSummary);
  }, [days]);

  if (!summary) return <div className="glass-card">Loading...</div>;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16, maxWidth: 700, width: "100%" }}>
      <div className="glass-card">
        <h3>Cost dashboard</h3>
        <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 10 }}>
          <span style={{ fontSize: 12, opacity: 0.7 }}>Window:</span>
          <select className="waes-select" value={days} onChange={(e) => setDays(Number(e.target.value))}>
            <option value={1}>1 day</option>
            <option value={7}>7 days</option>
            <option value={30}>30 days</option>
          </select>
        </div>
        <div style={{ fontSize: 20 }}>${(summary.total.costCents / 100).toFixed(2)}</div>
        <div style={{ fontSize: 12, opacity: 0.7 }}>{summary.total.calls} calls</div>
      </div>

      <div className="glass-card">
        <h3>By provider / model</h3>
        {summary.byProviderModel.length === 0 && <div style={{ fontSize: 12, opacity: 0.6 }}>No usage yet.</div>}
        {summary.byProviderModel.map((row: any, i: number) => (
          <div key={i} style={{ display: "flex", justifyContent: "space-between", fontSize: 13, padding: "4px 0", borderTop: "1px solid var(--waes-glass-border)" }}>
            <span>
              {row.provider} / {row.model}
            </span>
            <span>
              ${(row.costCents / 100).toFixed(2)} · {row.calls} calls · {row.tokensIn + row.tokensOut} tokens
            </span>
          </div>
        ))}
      </div>

      <div className="glass-card">
        <h3>By day</h3>
        {summary.byDay.length === 0 && <div style={{ fontSize: 12, opacity: 0.6 }}>No usage yet.</div>}
        {summary.byDay.map((row: any) => (
          <div key={row.day} style={{ display: "flex", justifyContent: "space-between", fontSize: 13, padding: "4px 0", borderTop: "1px solid var(--waes-glass-border)" }}>
            <span>{row.day}</span>
            <span>${(row.costCents / 100).toFixed(2)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
