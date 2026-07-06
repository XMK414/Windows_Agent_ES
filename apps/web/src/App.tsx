import { useState } from "react";
import { setInstallToken, setSecret, getStatus } from "./api";
import { ChatPane } from "./ChatPane";

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

export default function App() {
  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100vh" }}>
      <SettingsBar />
      <div style={{ flex: 1, display: "grid", gridTemplateColumns: "1fr 1fr", gridTemplateRows: "1fr 1fr", gap: 8, padding: 8 }}>
        <ChatPane paneId="claude-1" provider="anthropic-api" label="Claude #1" />
        <ChatPane paneId="claude-2" provider="anthropic-api" label="Claude #2" />
        <ChatPane paneId="claude-3" provider="anthropic-api" label="Claude #3" />
        <ChatPane paneId="gemini-1" provider="google-api" label="Gemini" />
      </div>
    </div>
  );
}
