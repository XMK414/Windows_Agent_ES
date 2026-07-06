import { useEffect, useState } from "react";
import { createThread, sendMessage, saveNote, listLibrary, type InjectionRef, type LibraryListItem } from "./api";

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
  const [toast, setToast] = useState<string | null>(null);

  const [pendingInjections, setPendingInjections] = useState<InjectionRef[]>([]);
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [mentionResults, setMentionResults] = useState<LibraryListItem[]>([]);

  useEffect(() => {
    if (mentionQuery === null) return;
    let cancelled = false;
    listLibrary(mentionQuery).then((items) => {
      if (!cancelled) setMentionResults(items);
    });
    return () => {
      cancelled = true;
    };
  }, [mentionQuery]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2500);
    return () => clearTimeout(t);
  }, [toast]);

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
    const injections = pendingInjections;
    setInput("");
    setPendingInjections([]);
    setMentionQuery(null);
    setMessages((prev) => [...prev, { role: "user", content }]);
    setMessages((prev) => [...prev, { role: "assistant", content: "" }]);

    try {
      const id = await ensureThread();
      for await (const frame of sendMessage(id, content, injections)) {
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

  function handleInputChange(value: string) {
    setInput(value);
    const match = value.match(/@([\w-]*)$/);
    setMentionQuery(match ? match[1] : null);
  }

  function pickMention(item: LibraryListItem) {
    setInput((prev) => prev.replace(/@([\w-]*)$/, `@${item.ref} `));
    setPendingInjections((prev) => [...prev, { kind: "library", ref: item.ref }]);
    setMentionQuery(null);
  }

  async function handleHighlightSave() {
    const selection = window.getSelection()?.toString();
    if (!selection) return;
    try {
      await saveNote(paneId, selection, threadId ?? undefined, model);
      setToast("Saved to Notes");
    } catch (err) {
      setToast(`Failed to save note: ${err instanceof Error ? err.message : String(err)}`);
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
        {toast && <div style={{ color: "#8c8", fontSize: 12 }}>{toast}</div>}
      </div>

      {pendingInjections.length > 0 && (
        <div style={{ fontSize: 11, opacity: 0.7, marginBottom: 4 }}>
          Injecting: {pendingInjections.map((i) => i.ref).join(", ")}
        </div>
      )}

      <div style={{ position: "relative" }}>
        {mentionQuery !== null && mentionResults.length > 0 && (
          <div
            style={{
              position: "absolute",
              bottom: "100%",
              left: 0,
              right: 0,
              background: "#222",
              border: "1px solid #555",
              borderRadius: 4,
              maxHeight: 160,
              overflowY: "auto",
              zIndex: 10,
            }}
          >
            {mentionResults.map((item) => (
              <div
                key={item.ref}
                onClick={() => pickMention(item)}
                style={{ padding: "4px 8px", cursor: "pointer", fontSize: 12 }}
              >
                <b>{item.type}</b> · {item.name}{" "}
                <span style={{ opacity: 0.6 }}>({item.ref})</span>
              </div>
            ))}
          </div>
        )}

        <div style={{ display: "flex", gap: 4, marginTop: 8 }}>
          <input
            value={input}
            onChange={(e) => handleInputChange(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSend()}
            placeholder="Message... (@ to inject a library item)"
            style={{ flex: 1 }}
          />
          <button onClick={handleSend} disabled={busy}>
            Send
          </button>
        </div>
      </div>
    </div>
  );
}
