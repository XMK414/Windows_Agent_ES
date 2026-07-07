import { useRef, useState } from "react";
import { createRoundtableThread, takeRoundtableTurn, type RoundtableSpeaker } from "./api";

interface Participant {
  id: string;
  label: string;
  kind: "llm" | "user";
  adapterId?: string;
  model?: string;
  personaId?: string;
  enabled: boolean;
}

const DEFAULT_PARTICIPANTS: Participant[] = [
  { id: "claude-1", label: "Claude #1", kind: "llm", adapterId: "anthropic-api", model: "claude-sonnet-5", enabled: true },
  { id: "claude-2", label: "Claude #2", kind: "llm", adapterId: "anthropic-api", model: "claude-opus-4-8", personaId: "persona/skeptical-reviewer", enabled: true },
  { id: "gemini-1", label: "Gemini", kind: "llm", adapterId: "google-api", model: "gemini-2.5-flash", enabled: true },
  { id: "you", label: "You", kind: "user", enabled: true },
];

interface TranscriptEntry {
  speaker: string;
  content: string;
  error?: boolean;
}

export function RoundTablePanel() {
  const [topic, setTopic] = useState("");
  const [threadId, setThreadId] = useState<string | null>(null);
  const [participants, setParticipants] = useState<Participant[]>(DEFAULT_PARTICIPANTS);
  const [transcript, setTranscript] = useState<TranscriptEntry[]>([]);
  const [roundCap, setRoundCap] = useState(4);
  const [running, setRunning] = useState(false);
  const [waitingOnUser, setWaitingOnUser] = useState(false);
  const [userDraft, setUserDraft] = useState("");
  const [busy, setBusy] = useState(false);

  // Refs mirror the state the async loop needs, so the recursive loop never
  // reads a stale closure — React state updates are async, refs aren't.
  const runningRef = useRef(false);
  const turnIndexRef = useRef(0);
  const roundsRef = useRef(0);
  const participantsRef = useRef(participants);
  const threadIdRef = useRef<string | null>(null);
  participantsRef.current = participants;

  function updateParticipant(id: string, patch: Partial<Participant>) {
    setParticipants((ps) => ps.map((p) => (p.id === id ? { ...p, ...patch } : p)));
  }

  function enabledList(): Participant[] {
    return participantsRef.current.filter((p) => p.enabled);
  }

  async function startTable() {
    const id = await createRoundtableThread(topic || undefined);
    setThreadId(id);
    threadIdRef.current = id;
    setTranscript(topic ? [{ speaker: "Topic", content: topic }] : []);
    turnIndexRef.current = 0;
    roundsRef.current = 0;
    runningRef.current = true;
    setRunning(true);
    await advance();
  }

  async function advance() {
    if (!runningRef.current || !threadIdRef.current) return;
    const list = enabledList();
    if (list.length === 0) {
      runningRef.current = false;
      setRunning(false);
      return;
    }
    if (roundsRef.current >= roundCap) {
      runningRef.current = false;
      setRunning(false);
      return;
    }

    const current = list[turnIndexRef.current % list.length];

    if (current.kind === "user") {
      setWaitingOnUser(true);
      return; // paused — resumes via submitUserTurn
    }

    setBusy(true);
    const speaker: RoundtableSpeaker = { kind: "llm", label: current.label, adapterId: current.adapterId, model: current.model, personaId: current.personaId };
    try {
      const result = await takeRoundtableTurn(threadIdRef.current, speaker);
      setTranscript((t) => [...t, { speaker: result.speaker, content: result.content }]);
    } catch (err) {
      setTranscript((t) => [...t, { speaker: current.label, content: err instanceof Error ? err.message : String(err), error: true }]);
    } finally {
      setBusy(false);
    }

    turnIndexRef.current += 1;
    if (turnIndexRef.current % list.length === 0) roundsRef.current += 1;

    if (runningRef.current) await advance();
  }

  async function submitUserTurn() {
    if (!threadIdRef.current || !userDraft.trim()) return;
    const content = userDraft;
    setUserDraft("");
    setWaitingOnUser(false);
    await takeRoundtableTurn(threadIdRef.current, { kind: "user", label: "You" }, content);
    setTranscript((t) => [...t, { speaker: "You", content }]);

    const list = enabledList();
    turnIndexRef.current += 1;
    if (turnIndexRef.current % list.length === 0) roundsRef.current += 1;
    await advance();
  }

  function pause() {
    runningRef.current = false;
    setRunning(false);
  }

  function resume() {
    runningRef.current = true;
    setRunning(true);
    advance();
  }

  function stopAndReset() {
    runningRef.current = false;
    setRunning(false);
    setWaitingOnUser(false);
    setThreadId(null);
    threadIdRef.current = null;
    setTranscript([]);
    turnIndexRef.current = 0;
    roundsRef.current = 0;
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16, maxWidth: 900, width: "100%" }}>
      <div className="glass-card">
        <h3>Round Table</h3>
        <p style={{ fontSize: 12, opacity: 0.6, marginTop: -4, marginBottom: 10 }}>
          One shared discussion — every participant sees everyone else's turns. Toggle any LLM off to mute it, or toggle "You" off to sit out and let the others keep talking.
        </p>

        {participants.map((p) => (
          <div key={p.id} style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 6, fontSize: 13 }}>
            <label style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 140 }}>
              <input type="checkbox" checked={p.enabled} onChange={(e) => updateParticipant(p.id, { enabled: e.target.checked })} disabled={running || waitingOnUser} />
              {p.label}
              {p.kind === "user" && <span className="waes-badge" style={{ marginLeft: 4 }}>{p.enabled ? "in" : "sitting out"}</span>}
            </label>
            {p.kind === "llm" && (
              <>
                <input
                  className="waes-input"
                  value={p.model}
                  onChange={(e) => updateParticipant(p.id, { model: e.target.value })}
                  disabled={running}
                  style={{ width: 180 }}
                />
                <input
                  className="waes-input"
                  placeholder="persona/... (optional)"
                  value={p.personaId ?? ""}
                  onChange={(e) => updateParticipant(p.id, { personaId: e.target.value || undefined })}
                  disabled={running}
                  style={{ width: 200 }}
                />
              </>
            )}
          </div>
        ))}

        <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 10 }}>
          <input className="waes-input" placeholder="Topic to open with (optional)" value={topic} onChange={(e) => setTopic(e.target.value)} disabled={!!threadId} style={{ flex: 1 }} />
          <label style={{ fontSize: 12, display: "flex", alignItems: "center", gap: 4 }}>
            Rounds
            <input className="waes-input" type="number" min={1} max={20} value={roundCap} onChange={(e) => setRoundCap(Number(e.target.value))} style={{ width: 60 }} />
          </label>
          {!threadId && (
            <button className="waes-button" onClick={startTable}>
              Start
            </button>
          )}
          {threadId && running && (
            <button className="waes-button" onClick={pause}>
              Pause
            </button>
          )}
          {threadId && !running && !waitingOnUser && (
            <button className="waes-button" onClick={resume}>
              Resume
            </button>
          )}
          {threadId && (
            <button className="waes-button" onClick={stopAndReset}>
              Reset
            </button>
          )}
        </div>
      </div>

      {threadId && (
        <div className="glass-card">
          {transcript.map((t, i) => (
            <div key={i} style={{ margin: "8px 0", borderTop: i > 0 ? "1px solid var(--waes-glass-border)" : undefined, paddingTop: i > 0 ? 8 : 0 }}>
              <b style={{ color: t.error ? "#ffb2a3" : undefined }}>{t.speaker}:</b>{" "}
              <span style={{ whiteSpace: "pre-wrap" }}>{t.content}</span>
            </div>
          ))}
          {busy && <div style={{ fontSize: 12, opacity: 0.6 }}>Waiting for the next speaker...</div>}

          {waitingOnUser && (
            <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
              <input
                className="waes-input"
                placeholder="Your turn..."
                value={userDraft}
                onChange={(e) => setUserDraft(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && submitUserTurn()}
                style={{ flex: 1 }}
              />
              <button className="waes-button" onClick={submitUserTurn}>
                Send &amp; continue
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
