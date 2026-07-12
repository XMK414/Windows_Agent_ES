import { useEffect, useState } from "react";
import { setSecret, getStatus, listMcpConnectors, updateMcpConnector, addMcpConnector, type McpConnector } from "./api";
import { checkVaultPassword, sha256Hex } from "./passwordPolicy";

const PW_HASH_KEY = "waes_vault_pw_hash";

interface KeySlot {
  key: string;
  label: string;
  statusField?: "anthropicConfigured" | "googleConfigured" | "openrouterConfigured";
}

const BUILTIN_SLOTS: KeySlot[] = [
  { key: "anthropic_api_key", label: "Anthropic", statusField: "anthropicConfigured" },
  { key: "google_api_key", label: "Google", statusField: "googleConfigured" },
  { key: "openrouter_api_key", label: "OpenRouter", statusField: "openrouterConfigured" },
];

// Compliant use-cases for ChatGPT via OAuth (from the request): allowed for
// running agents in the Round Table / Board / Hermes, NEVER for building or
// designing a product (non-compete). This list keeps the policy visible.
const OAUTH_COMPLIANT_SCOPES = [
  "Sales pipeline & lead triage",
  "Customer support & retention",
  "Policy monitoring & compliance drafting",
  "Media / YouTube production",
  "EDM archival & content ops",
];

function PasswordGate({ onUnlock }: { onUnlock: () => void }) {
  const [existingHash, setExistingHash] = useState<string | null>(null);
  const [pw, setPw] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setExistingHash(localStorage.getItem(PW_HASH_KEY));
  }, []);

  const isSetup = existingHash === null;
  const check = checkVaultPassword(pw);

  async function submit() {
    setError(null);
    if (isSetup) {
      if (!check.ok) {
        setError(`Password needs: ${check.failures.join(", ")}`);
        return;
      }
      if (pw !== confirm) {
        setError("Passwords don't match.");
        return;
      }
      localStorage.setItem(PW_HASH_KEY, await sha256Hex(pw));
      onUnlock();
    } else {
      if ((await sha256Hex(pw)) === existingHash) onUnlock();
      else setError("Incorrect password.");
    }
  }

  return (
    <div className="glass-card" style={{ maxWidth: 420 }}>
      <h3>{isSetup ? "Set your vault password" : "Unlock the vault"}</h3>
      <p style={{ fontSize: 12, opacity: 0.65 }}>
        {isSetup
          ? "At least 12 characters, with 2+ each of lowercase, uppercase, numbers, and special characters (!@#$%^&*=+)."
          : "Enter your vault password to view and edit keys."}
      </p>
      <input
        className="waes-input"
        type="password"
        placeholder="Vault password"
        value={pw}
        onChange={(e) => setPw(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && !isSetup && submit()}
        style={{ width: "100%", marginBottom: 8 }}
      />
      {isSetup && (
        <>
          <input
            className="waes-input"
            type="password"
            placeholder="Confirm password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            style={{ width: "100%", marginBottom: 8 }}
          />
          {pw.length > 0 && !check.ok && (
            <div style={{ fontSize: 11, opacity: 0.7, marginBottom: 8 }}>Still needs: {check.failures.join(", ")}</div>
          )}
        </>
      )}
      {error && <div style={{ color: "#ffb2a3", fontSize: 12, marginBottom: 8 }}>{error}</div>}
      <button className="waes-button" onClick={submit}>
        {isSetup ? "Set password & unlock" : "Unlock"}
      </button>
    </div>
  );
}

function SecretRow({ slot, configured, onSaved }: { slot: KeySlot; configured: boolean; onSaved: () => void }) {
  const [value, setValue] = useState("");
  const [state, setState] = useState<string | null>(null);

  async function save() {
    setState(null);
    try {
      const res = await setSecret(slot.key, value);
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setState(`Failed: ${data.error ?? res.status}`);
        return;
      }
      setValue("");
      setState("Saved");
      onSaved();
    } catch (err) {
      setState(`Failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  return (
    <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 6, flexWrap: "wrap" }}>
      <div style={{ minWidth: 120, fontSize: 13 }}>
        {slot.label} {configured && <span className="waes-badge">set</span>}
      </div>
      <input className="waes-input" type="password" placeholder={`${slot.label} key`} value={value} onChange={(e) => setValue(e.target.value)} style={{ flex: 1, minWidth: 180 }} />
      <button className="waes-button" onClick={save} disabled={!value}>
        Save
      </button>
      {state && <span style={{ fontSize: 12, opacity: 0.7 }}>{state}</span>}
    </div>
  );
}

export function VaultPanel() {
  const [unlocked, setUnlocked] = useState(false);
  const [status, setStatus] = useState<any>(null);
  const [customSlots, setCustomSlots] = useState<KeySlot[]>([]);
  const [newSlotName, setNewSlotName] = useState("");

  async function refreshStatus() {
    try {
      setStatus(await getStatus());
    } catch {
      setStatus(null);
    }
  }

  useEffect(() => {
    if (unlocked) refreshStatus();
  }, [unlocked]);

  if (!unlocked) return <PasswordGate onUnlock={() => setUnlocked(true)} />;

  function addSlot() {
    const name = newSlotName.trim();
    if (!name) return;
    const key = name.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
    if (!key) return;
    setCustomSlots((s) => [...s, { key, label: name }]);
    setNewSlotName("");
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16, maxWidth: 700, width: "100%" }}>
      <div className="glass-card">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h3>Vault — API keys</h3>
          <button className="waes-button" onClick={() => setUnlocked(false)}>
            Lock
          </button>
        </div>
        <p style={{ fontSize: 12, opacity: 0.6, marginTop: -4 }}>
          Keys are stored in the server-side encrypted vault. This page never displays a saved key back — it only shows
          whether one is set.
        </p>
        {BUILTIN_SLOTS.map((slot) => (
          <SecretRow key={slot.key} slot={slot} configured={Boolean(status?.[slot.statusField ?? ""])} onSaved={refreshStatus} />
        ))}

        <div style={{ fontSize: 12, opacity: 0.7, margin: "12px 0 6px" }}>Additional keys (add your own slots)</div>
        {customSlots.map((slot) => (
          <SecretRow key={slot.key} slot={slot} configured={false} onSaved={refreshStatus} />
        ))}
        <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
          <input className="waes-input" placeholder="New key name (e.g. Groq, ElevenLabs)" value={newSlotName} onChange={(e) => setNewSlotName(e.target.value)} style={{ flex: 1 }} />
          <button className="waes-button" onClick={addSlot}>
            Add slot
          </button>
        </div>
      </div>

      <ChatGptOAuthSection configured={Boolean(status?.chatgptOauthConfigured)} onSaved={refreshStatus} />

      <McpConnectorsSection />
    </div>
  );
}

function McpConnectorsSection() {
  const [connectors, setConnectors] = useState<McpConnector[]>([]);
  const [newName, setNewName] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function refresh() {
    try {
      setConnectors(await listMcpConnectors());
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }
  useEffect(() => {
    refresh();
  }, []);

  async function toggle(c: McpConnector, patch: { locked?: boolean; routed?: boolean }) {
    try {
      const updated = await updateMcpConnector(c.id, patch);
      setConnectors((list) => list.map((x) => (x.id === updated.id ? updated : x)));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  async function add() {
    if (!newName.trim()) return;
    try {
      await addMcpConnector(newName.trim());
      setNewName("");
      refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  const routedCount = connectors.filter((c) => c.routed).length;

  return (
    <div className="glass-card">
      <h3>MCP connectors</h3>
      <p style={{ fontSize: 12, opacity: 0.6, marginTop: -4 }}>
        Locked-in and routed inventory. <b>Locked</b> keeps a connector pinned in the approved set; <b>Routed</b> makes it
        active for use. Unlocking turns routing off. {routedCount} of {connectors.length} routed.
      </p>

      <div style={{ display: "grid", gridTemplateColumns: "1fr auto auto auto", gap: "4px 10px", alignItems: "center", fontSize: 13 }}>
        <div style={{ fontSize: 11, opacity: 0.6 }}>Connector</div>
        <div style={{ fontSize: 11, opacity: 0.6 }}>Status</div>
        <div style={{ fontSize: 11, opacity: 0.6, textAlign: "center" }}>Locked</div>
        <div style={{ fontSize: 11, opacity: 0.6, textAlign: "center" }}>Routed</div>
        {connectors.map((c) => (
          <FragmentRow key={c.id} c={c} onToggle={toggle} />
        ))}
      </div>

      <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
        <input className="waes-input" placeholder="Add a connector by name" value={newName} onChange={(e) => setNewName(e.target.value)} style={{ flex: 1 }} />
        <button className="waes-button" onClick={add}>
          Add
        </button>
      </div>
      {error && <div style={{ color: "#ffb2a3", fontSize: 12, marginTop: 8 }}>{error}</div>}
    </div>
  );
}

function FragmentRow({ c, onToggle }: { c: McpConnector; onToggle: (c: McpConnector, patch: { locked?: boolean; routed?: boolean }) => void }) {
  return (
    <>
      <div style={{ borderTop: "1px solid var(--waes-glass-border)", paddingTop: 6 }}>
        {c.name} <span style={{ opacity: 0.5, fontSize: 11 }}>· {c.type}</span>
      </div>
      <div style={{ borderTop: "1px solid var(--waes-glass-border)", paddingTop: 6 }}>
        <span className="waes-badge">{c.status}</span>
      </div>
      <div style={{ borderTop: "1px solid var(--waes-glass-border)", paddingTop: 6, textAlign: "center" }}>
        <input type="checkbox" checked={Boolean(c.locked)} onChange={(e) => onToggle(c, { locked: e.target.checked })} />
      </div>
      <div style={{ borderTop: "1px solid var(--waes-glass-border)", paddingTop: 6, textAlign: "center" }}>
        <input type="checkbox" checked={Boolean(c.routed)} disabled={!c.locked} onChange={(e) => onToggle(c, { routed: e.target.checked })} />
      </div>
    </>
  );
}

function ChatGptOAuthSection({ configured, onSaved }: { configured: boolean; onSaved: () => void }) {
  const [token, setToken] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [state, setState] = useState<string | null>(null);

  async function save() {
    setState(null);
    if (!token && !baseUrl) return;
    try {
      if (token) {
        const r = await setSecret("chatgpt_oauth_token", token);
        if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error ?? `status ${r.status}`);
      }
      if (baseUrl) {
        const r = await setSecret("chatgpt_oauth_base_url", baseUrl);
        if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error ?? `status ${r.status}`);
      }
      setToken("");
      setState("Saved");
      onSaved();
    } catch (err) {
      setState(`Failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  return (
    <div className="glass-card">
      <h3>OAuth logins — ChatGPT {configured && <span className="waes-badge">set</span>}</h3>
      <p style={{ fontSize: 12, opacity: 0.6, marginTop: -4 }}>
        For running agents only (Round Table, Board, Chat, Hermes) — <b>never</b> for building or designing a product
        (non-compete). The server blocks this credential on the Macros and Jobs surfaces. Compliant use-cases:
      </p>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 8 }}>
        {OAUTH_COMPLIANT_SCOPES.map((s) => (
          <span key={s} className="waes-badge">
            {s}
          </span>
        ))}
      </div>
      <div style={{ fontSize: 11, opacity: 0.6, marginBottom: 8 }}>
        A ChatGPT session token does not authenticate against api.openai.com. Point the endpoint at the URL that accepts
        your credential (your OAuth token endpoint or bridge).
      </div>
      <input
        className="waes-input"
        type="password"
        placeholder="ChatGPT OAuth / session token"
        value={token}
        onChange={(e) => setToken(e.target.value)}
        style={{ width: "100%", marginBottom: 6 }}
      />
      <input
        className="waes-input"
        placeholder="OpenAI-compatible endpoint (e.g. https://your-bridge/v1)"
        value={baseUrl}
        onChange={(e) => setBaseUrl(e.target.value)}
        style={{ width: "100%", marginBottom: 8 }}
      />
      <button className="waes-button" onClick={save} disabled={!token && !baseUrl}>
        Save
      </button>
      {state && <span style={{ fontSize: 12, opacity: 0.7, marginLeft: 8 }}>{state}</span>}
    </div>
  );
}
