import { useEffect, useState } from "react";
import { createJob, listJobs, setJobEnabled, deleteJob, runJobNow, type JobInput } from "./api";

const DEFAULT_JOB: JobInput = {
  name: "",
  cronExpr: "0 9 * * *",
  adapter: "anthropic-api",
  model: "claude-sonnet-5",
  promptRef: "prompt/daily-standup-summary",
  costCapCents: 100,
};

export function JobsPanel() {
  const [jobs, setJobs] = useState<any[]>([]);
  const [form, setForm] = useState<JobInput>(DEFAULT_JOB);
  const [error, setError] = useState<string | null>(null);
  const [runOutput, setRunOutput] = useState<Record<string, string>>({});

  async function refresh() {
    setJobs(await listJobs());
  }
  useEffect(() => {
    refresh();
  }, []);

  async function create() {
    setError(null);
    try {
      await createJob(form);
      setForm({ ...DEFAULT_JOB, name: "" });
      refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  async function runNow(id: string) {
    setRunOutput((o) => ({ ...o, [id]: "Running..." }));
    try {
      const res = await runJobNow(id);
      setRunOutput((o) => ({ ...o, [id]: res.text || "(skipped — cost cap reached, or empty output)" }));
    } catch (err) {
      setRunOutput((o) => ({ ...o, [id]: `Error: ${err instanceof Error ? err.message : String(err)}` }));
    }
    refresh();
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16, maxWidth: 800, width: "100%" }}>
      <div className="glass-card">
        <h3>Scheduled jobs</h3>
        <p style={{ fontSize: 12, opacity: 0.6, marginTop: -4, marginBottom: 10 }}>
          API-key adapters only — jobs never use a web-session login, and each run stops once its cost cap is reached.
        </p>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 8 }}>
          <input className="waes-input" placeholder="Job name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <input className="waes-input" placeholder="cron (e.g. 0 9 * * *)" value={form.cronExpr} onChange={(e) => setForm({ ...form, cronExpr: e.target.value })} style={{ width: 140 }} />
          <select className="waes-select" value={form.adapter} onChange={(e) => setForm({ ...form, adapter: e.target.value })}>
            <option value="anthropic-api">Anthropic</option>
            <option value="google-api">Google</option>
          </select>
          <input className="waes-input" value={form.model} onChange={(e) => setForm({ ...form, model: e.target.value })} style={{ width: 160 }} />
          <input className="waes-input" placeholder="prompt/..." value={form.promptRef} onChange={(e) => setForm({ ...form, promptRef: e.target.value })} style={{ width: 200 }} />
          <label style={{ fontSize: 12, display: "flex", alignItems: "center", gap: 4 }}>
            Cap $
            <input
              className="waes-input"
              type="number"
              style={{ width: 70 }}
              value={form.costCapCents / 100}
              onChange={(e) => setForm({ ...form, costCapCents: Math.round(Number(e.target.value) * 100) })}
            />
          </label>
          <button className="waes-button" onClick={create} disabled={!form.name}>
            Create
          </button>
        </div>
        {error && <div style={{ color: "#ffb2a3", fontSize: 12 }}>{error}</div>}
      </div>

      {jobs.map((j) => (
        <div key={j.id} className="glass-card">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <b>{j.name}</b>{" "}
              <span className="waes-badge">{j.cron}</span>{" "}
              <span className="waes-badge">
                {j.adapter}/{j.model}
              </span>{" "}
              <span className="waes-badge">cap ${(j.cost_cap_cents / 100).toFixed(2)}</span>
              {!j.enabled && <span className="waes-badge warn">disabled</span>}
            </div>
            <div style={{ display: "flex", gap: 6 }}>
              <button className="waes-button" onClick={() => runNow(j.id)}>
                Run now
              </button>
              <button
                className="waes-button"
                onClick={async () => {
                  await setJobEnabled(j.id, !j.enabled);
                  refresh();
                }}
              >
                {j.enabled ? "Disable" : "Enable"}
              </button>
              <button
                className="waes-button"
                onClick={async () => {
                  await deleteJob(j.id);
                  refresh();
                }}
              >
                Delete
              </button>
            </div>
          </div>
          <div style={{ fontSize: 11, opacity: 0.6, marginTop: 4 }}>
            prompt: {j.prompt_ref} · last run: {j.last_run_at ? new Date(j.last_run_at).toLocaleString() : "never"}
          </div>
          {runOutput[j.id] && (
            <pre style={{ fontSize: 12, whiteSpace: "pre-wrap", background: "rgba(0,0,0,0.3)", padding: 8, borderRadius: 8, marginTop: 8 }}>
              {runOutput[j.id]}
            </pre>
          )}
        </div>
      ))}
    </div>
  );
}
