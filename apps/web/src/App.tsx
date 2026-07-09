import { useState } from "react";
import { setInstallToken, setSecret, getStatus } from "./api";
import { ChatPane } from "./ChatPane";
import { StackBuilder } from "./StackBuilder";
import { BreakTimer } from "./BreakTimer";
import { TermLensPanel } from "./TermLensPanel";
import { ProjectsPanel } from "./ProjectsPanel";
import { BoardPanel } from "./BoardPanel";
import { CostPanel } from "./CostPanel";
import { MemoryPanel } from "./MemoryPanel";
import { JobsPanel } from "./JobsPanel";
import { MacroPanel } from "./MacroPanel";
import { RoundTablePanel } from "./RoundTablePanel";
import "./theme.css";

function SettingsBar() {
  const [token, setToken] = useState("");
  const [anthropicKey, setAnthropicKey] = useState("");
  const [googleKey, setGoogleKey] = useState("");
  const [status, setStatus] = useState<string>("");

  function saveToken() {
    setInstallToken(token);
    setStatus("Install token saved locally.");
  }

  async function saveAnthropicKey() {
    try {
      const res = await setSecret("anthropic_api_key", anthropicKey);
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setStatus(`Failed to save Anthropic key: ${data.error ?? res.status}`);
        return;
      }
      setAnthropicKey("");
      setStatus("Anthropic key stored in the server-side vault.");
    } catch (err) {
      setStatus(`Failed to save Anthropic key: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  async function saveGoogleKey() {
    try {
      const res = await setSecret("google_api_key", googleKey);
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setStatus(`Failed to save Google key: ${data.error ?? res.status}`);
        return;
      }
      setGoogleKey("");
      setStatus("Google key stored in the server-side vault.");
    } catch (err) {
      setStatus(`Failed to save Google key: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  async function checkStatus() {
    const s = await getStatus();
    setStatus(`Anthropic configured: ${s.anthropicConfigured} · Google configured: ${s.googleConfigured}`);
  }

  return (
    <div style={{ display: "flex", gap: 8, alignItems: "center", padding: 8, borderBottom: "1px solid #444", flexWrap: "wrap" }}>
      <input placeholder="Install token (from server console)" value={token} onChange={(e) => setToken(e.target.value)} style={{ width: 260 }} />
      <button onClick={saveToken}>Save token</button>
      <input placeholder="Anthropic API key" value={anthropicKey} onChange={(e) => setAnthropicKey(e.target.value)} type="password" />
      <button onClick={saveAnthropicKey}>Set</button>
      <input placeholder="Google API key" value={googleKey} onChange={(e) => setGoogleKey(e.target.value)} type="password" />
      <button onClick={saveGoogleKey}>Set</button>
      <button onClick={checkStatus}>Check status</button>
      <span style={{ fontSize: 12, opacity: 0.8 }}>{status}</span>
    </div>
  );
}

function ChatGrid() {
  return (
    <div style={{ flex: 1, display: "grid", gridTemplateColumns: "1fr 1fr", gridTemplateRows: "1fr 1fr", gap: 8, padding: 8, minHeight: 600 }}>
      <ChatPane paneId="claude-1" provider="anthropic-api" label="Claude #1" />
      <ChatPane paneId="claude-2" provider="anthropic-api" label="Claude #2" />
      <ChatPane paneId="claude-3" provider="anthropic-api" label="Claude #3" />
      <ChatPane paneId="gemini-1" provider="google-api" label="Gemini" />
    </div>
  );
}

type Tab = "chat" | "roundtable" | "stack" | "breaks" | "termlens" | "projects" | "board" | "cost" | "memory" | "jobs" | "macros";

const TAB_LABELS: Record<Tab, string> = {
  chat: "Chat",
  roundtable: "Round Table",
  stack: "Stack Builder",
  breaks: "Break Timer",
  termlens: "TermLens",
  projects: "Projects",
  board: "Board of Directors",
  cost: "Cost",
  memory: "Memory",
  jobs: "Jobs",
  macros: "Macros",
};

export default function App() {
  const [tab, setTab] = useState<Tab>("chat");

  return (
    <div className="waes-app" style={{ display: "flex", flexDirection: "column", minHeight: "100vh" }}>
      <SettingsBar />
      <div className="waes-tabs" style={{ flexWrap: "wrap" }}>
        {(Object.keys(TAB_LABELS) as Tab[]).map((t) => (
          <button key={t} className={`waes-tab${tab === t ? " active" : ""}`} onClick={() => setTab(t)}>
            {TAB_LABELS[t]}
          </button>
        ))}
      </div>
      <div className="waes-panel" style={{ flex: 1, display: "flex" }}>
        {tab === "chat" && <ChatGrid />}
        {tab === "roundtable" && <RoundTablePanel />}
        {tab === "stack" && <StackBuilder />}
        {tab === "breaks" && <BreakTimer />}
        {tab === "termlens" && <TermLensPanel />}
        {tab === "projects" && <ProjectsPanel />}
        {tab === "board" && <BoardPanel />}
        {tab === "cost" && <CostPanel />}
        {tab === "memory" && <MemoryPanel />}
        {tab === "jobs" && <JobsPanel />}
        {tab === "macros" && <MacroPanel />}
      </div>
    </div>
  );
}
