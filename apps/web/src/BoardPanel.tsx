import { useState } from "react";
import { runBoard, runBoardVerdict, type BoardAgent, type BoardRunResult, type BoardVerdictResult } from "./api";
import { ModelPicker } from "./ModelPicker";

// Mirrors the server's ADVISOR_ROLES order (board/counsel.ts).
const ADVISOR_ROLES = [
  { label: "The Contrarian", blurb: "Only finds fatal flaws — what kills the project." },
  { label: "First Principles", blurb: "Ignores the question; drills to the smallest true unit." },
  { label: "The Expansionist", blurb: "The non-obvious upside everyone misses." },
  { label: "The Outsider", blurb: "Gets only the raw question — zero context." },
  { label: "The Executioner", blurb: "Only the exact next actionable step." },
];

const DEFAULT_ADVISOR: BoardAgent = { adapterId: "anthropic-api", model: "claude-sonnet-5" };
const DEFAULT_COUNSEL: BoardAgent = { adapterId: "anthropic-api", model: "claude-opus-4-8" };

export function BoardPanel() {
  const [prompt, setPrompt] = useState("");
  const [advisors, setAdvisors] = useState<BoardAgent[]>(ADVISOR_ROLES.map(() => ({ ...DEFAULT_ADVISOR })));
  const [reviewer, setReviewer] = useState<BoardAgent>({ ...DEFAULT_ADVISOR });
  const [counsel, setCounsel] = useState<BoardAgent>({ ...DEFAULT_COUNSEL });

  const [run, setRun] = useState<BoardRunResult | null>(null);
  const [answers, setAnswers] = useState("");
  const [verdict, setVerdict] = useState<BoardVerdictResult | null>(null);

  const [busy, setBusy] = useState<"run" | "verdict" | null>(null);
  const [error, setError] = useState<string | null>(null);

  function setAdvisor(i: number, patch: Partial<BoardAgent>) {
    setAdvisors((a) => a.map((seat, idx) => (idx === i ? { ...seat, ...patch } : seat)));
  }

  async function doRun() {
    if (!prompt.trim()) return;
    setBusy("run");
    setError(null);
    setVerdict(null);
    setRun(null);
    setAnswers("");
    try {
      const res = await runBoard(prompt, advisors, Array(5).fill(reviewer), counsel);
      setRun(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  }

  async function doVerdict() {
    if (!run) return;
    setBusy("verdict");
    setError(null);
    try {
      const res = await runBoardVerdict(run.threadId, answers);
      setVerdict(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16, maxWidth: 860, width: "100%" }}>
      <div className="glass-card">
        <h3>Board of Directors</h3>
        <p style={{ fontSize: 12, opacity: 0.6, marginTop: -4, marginBottom: 10 }}>
          Ten agents: five advisors pressure-test the brief, their answers are anonymised and shuffled to five peer
          reviewers, then the Counsel asks you clarifying questions and delivers one verdict with the only next three
          actionable steps.
        </p>
        <textarea
          className="waes-input"
          placeholder="Put the idea, question, or decision in front of the board..."
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          style={{ width: "100%", height: 80, marginBottom: 12 }}
        />

        <div style={{ fontSize: 12, opacity: 0.7, marginBottom: 4 }}>Advisors</div>
        {ADVISOR_ROLES.map((role, i) => (
          <div key={role.label} style={{ display: "flex", gap: 8, marginBottom: 6, alignItems: "center", flexWrap: "wrap" }}>
            <div style={{ minWidth: 150 }}>
              <div style={{ fontSize: 13, fontWeight: 600 }}>{role.label}</div>
              <div style={{ fontSize: 11, opacity: 0.55 }}>{role.blurb}</div>
            </div>
            <ModelPicker adapterId={advisors[i].adapterId} model={advisors[i].model} onChange={(patch) => setAdvisor(i, patch)} />
          </div>
        ))}

        <div style={{ display: "flex", gap: 16, marginTop: 10, flexWrap: "wrap" }}>
          <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 12 }}>
            <span style={{ opacity: 0.7 }}>Peer reviewers (×5):</span>
            <ModelPicker
              adapterId={reviewer.adapterId}
              model={reviewer.model}
              onChange={(patch) => setReviewer((r) => ({ ...r, ...patch }))}
            />
          </label>
          <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 12 }}>
            <span style={{ opacity: 0.7 }}>Counsel:</span>
            <ModelPicker
              adapterId={counsel.adapterId}
              model={counsel.model}
              onChange={(patch) => setCounsel((c) => ({ ...c, ...patch }))}
            />
          </label>
        </div>

        <button className="waes-button" onClick={doRun} disabled={busy !== null} style={{ marginTop: 12 }}>
          {busy === "run" ? "Convening the board..." : "Convene board"}
        </button>
        {error && <div style={{ color: "#ffb2a3", fontSize: 12, marginTop: 8 }}>{error}</div>}
      </div>

      {run && (
        <div className="glass-card">
          <h3>Advisors</h3>
          {run.advisors.map((a) => (
            <div key={a.roleKey} style={{ borderTop: "1px solid var(--waes-glass-border)", padding: "8px 0", fontSize: 13 }}>
              <b>
                {a.label} {!a.ok && <span className="waes-badge warn">error</span>}
              </b>
              <div style={{ marginTop: 4, whiteSpace: "pre-wrap" }}>{a.content}</div>
            </div>
          ))}

          <h3 style={{ marginTop: 16 }}>Peer review (blind)</h3>
          {run.reviews.map((r) => (
            <div key={r.reviewerIndex} style={{ borderTop: "1px solid var(--waes-glass-border)", padding: "8px 0", fontSize: 13 }}>
              <b>
                Reviewer {r.reviewerIndex + 1} {!r.ok && <span className="waes-badge warn">error</span>}
              </b>
              <div style={{ marginTop: 4, whiteSpace: "pre-wrap" }}>{r.content}</div>
            </div>
          ))}
        </div>
      )}

      {run && !verdict && (
        <div className="glass-card">
          <h3>The Counsel needs a few answers</h3>
          {run.clarifyingQuestions.length > 0 ? (
            <ul style={{ fontSize: 13, marginTop: 4 }}>
              {run.clarifyingQuestions.map((q, i) => (
                <li key={i}>{q}</li>
              ))}
            </ul>
          ) : (
            <div style={{ fontSize: 12, opacity: 0.6 }}>The Counsel had no clarifying questions — add any context you like.</div>
          )}
          <textarea
            className="waes-input"
            placeholder="Answer the questions above (team size, budget, tools, autonomy, time/day, anything else)..."
            value={answers}
            onChange={(e) => setAnswers(e.target.value)}
            style={{ width: "100%", height: 100, marginTop: 8 }}
          />
          <button className="waes-button" onClick={doVerdict} disabled={busy !== null} style={{ marginTop: 8 }}>
            {busy === "verdict" ? "Deliberating..." : "Get the verdict"}
          </button>
        </div>
      )}

      {verdict && (
        <div className="glass-card">
          <h3>Report</h3>
          <div style={{ whiteSpace: "pre-wrap", fontSize: 13 }}>{verdict.report}</div>

          <div className="glass-card" style={{ marginTop: 12, padding: 12, background: "var(--waes-accent-soft, rgba(80,110,255,0.12))" }}>
            <div style={{ fontSize: 11, opacity: 0.7, textTransform: "uppercase", letterSpacing: 0.5 }}>Verdict</div>
            <div style={{ marginTop: 4, fontSize: 15, fontWeight: 600, whiteSpace: "pre-wrap" }}>{verdict.verdict}</div>
          </div>

          <h3 style={{ marginTop: 16 }}>The only next 3 steps</h3>
          {verdict.steps.map((s, i) => (
            <div key={i} style={{ borderTop: "1px solid var(--waes-glass-border)", padding: "8px 0" }}>
              <b>
                {i + 1}. {s.title}
              </b>
              <ul style={{ fontSize: 13, marginTop: 4 }}>
                {s.microActions.map((m, j) => (
                  <li key={j}>{m}</li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
