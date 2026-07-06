import { useState } from "react";
import { createThread, sendMessage } from "./api";

interface ModelOption {
  id: string;
  label: string;
}

const MODELS: Record<string, ModelOption[]> = {
  "anthropic-api": [
    { id: "claude-sonnet-5", label: "Claude Sonnet 5" },
    { id: "claude-opus-4-8", label: "Claude Opus 4.8" },
    { id: "claude-haiku-4-5-20251001", label: "Claude Haiku 4.5" },
  ],
  "google-api": [
    { id: "gemini-2.5-pro", label: "Gemini 2.5 Pro" },
    { id: "gemini-2.5-flash", label: "Gemini 2.5 Flash" },
  ],
};

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export function ChatPane({ paneId, provider, label }: { paneId: string; provider: "anthropic-api" | "google-api"; label: string }) {
  const [model, setModel] = useState(MODELS[provider][0].id);
  const [threadId, setThreadId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function ensureThread(): Promise<string> {
    if (threadId) return threadId;
    const id = await createThread(paneId, provider, model);
    setThreadId(id);
    return id;
  }

  async function handleSend() {
    if (!input.trim() || busy) return;
    setError(null);
    setBusy(true);
    const content = input;
    setInput("");
    setMessages((prev) => [...prev, { role: "user", content }]);
    setMessages((prev) => [...prev, { role: "assistant", content: "" }]);

    try {
      const id = await ensureThread();
      for await (const frame of sendMessage(id, content)) {
        if (frame.event === "delta") {
          setMessages((prev) => {
            const next = [...prev];
            next[next.length - 1] = { role: "assistant", content: next[next.length - 1].content + frame.data.text };
            return next;
          });
        } else if (frame.event === "error") {
          setError(frame.data.error);
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  function handleHighlightSave() {
    const selection = window.getSelection()?.toString();
    if (selection) {
      // Phase 2 will POST this to /api/notes; for now surface what would be saved.
      alert(`Would save to Notes:\n\n${selection}`);
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", border: "1px solid #444", borderRadius: 8, padding: 8, height: "100%" }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
        <strong>{label}</strong>
        <select value={model} onChange={(e) => setModel(e.target.value)} disabled={threadId !== null}>
          {MODELS[provider].map((m) => (
            <option key={m.id} value={m.id}>
              {m.label}
            </option>
          ))}
        </select>
      </div>

      <div onMouseUp={handleHighlightSave} style={{ flex: 1, overflowY: "auto", fontSize: 14 }}>
        {messages.map((m, i) => (
          <div key={i} style={{ margin: "6px 0", opacity: m.role === "user" ? 0.8 : 1 }}>
            <b>{m.role === "user" ? "You" : label}:</b> {m.content}
          </div>
        ))}
        {error && <div style={{ color: "#e66" }}>Error: {error}</div>}
      </div>

      <div style={{ display: "flex", gap: 4, marginTop: 8 }}>
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleSend()}
          placeholder="Message..."
          style={{ flex: 1 }}
        />
        <button onClick={handleSend} disabled={busy}>
          Send
        </button>
      </div>
    </div>
  );
}
