import { useState } from "react";
import { setInstallToken, setSecret, getStatus } from "./api";
import { ChatPane } from "./ChatPane";
import { StackBuilder } from "./StackBuilder";
import { BreakTimer } from "./BreakTimer";
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
    await setSecret("anthropic_api_key", anthropicKey);
    setAnthropicKey("");
    setStatus("Anthropic key stored in the server-side vault.");
  }

  async function saveGoogleKey() {
    await setSecret("google_api_key", googleKey);
    setGoogleKey("");
    setStatus("Google key stored in the server-side vault.");
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

type Tab = "chat" | "stack" | "breaks";

export default function App() {
  const [tab, setTab] = useState<Tab>("chat");

  return (
    <div className="waes-app" style={{ display: "flex", flexDirection: "column", minHeight: "100vh" }}>
      <SettingsBar />
      <div className="waes-tabs">
        {(["chat", "stack", "breaks"] as Tab[]).map((t) => (
          <button key={t} className={`waes-tab${tab === t ? " active" : ""}`} onClick={() => setTab(t)}>
            {t === "chat" ? "Chat" : t === "stack" ? "Stack Builder" : "Break Timer"}
          </button>
        ))}
      </div>
      <div className="waes-panel" style={{ flex: 1, display: "flex" }}>
        {tab === "chat" && <ChatGrid />}
        {tab === "stack" && <StackBuilder />}
        {tab === "breaks" && <BreakTimer />}
      </div>
    </div>
  );
}
