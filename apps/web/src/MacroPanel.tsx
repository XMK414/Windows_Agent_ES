import { useEffect, useState } from "react";
import { listLibrary, runMacro, type LibraryListItem } from "./api";

export function MacroPanel() {
  const [prompts, setPrompts] = useState<LibraryListItem[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [provider, setProvider] = useState("anthropic-api");
  const [model, setModel] = useState("claude-sonnet-5");
  const [output, setOutput] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    listLibrary("").then((items) => {
      const promptItems = items.filter((i) => i.type === "prompt");
      setPrompts(promptItems);
      if (promptItems.length) setSelected(promptItems[0].ref);
    });
  }, []);

  async function run(ref: string) {
    setBusy(ref);
    setOutput((o) => ({ ...o, [ref]: "" }));
    try {
      const res = await runMacro(ref, provider, model);
      setOutput((o) => ({ ...o, [ref]: res.text }));
    } catch (err) {
      setOutput((o) => ({ ...o, [ref]: `Error: ${err instanceof Error ? err.message : String(err)}` }));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16, maxWidth: 800, width: "100%" }}>
      <div className="glass-card">
        <h3>Macros</h3>
        <p style={{ fontSize: 12, opacity: 0.6, marginTop: -4, marginBottom: 10 }}>
          One-click: runs a saved prompt from the library immediately, no thread to manage.
        </p>
        <div style={{ display: "flex", gap: 8 }}>
          <select className="waes-select" value={provider} onChange={(e) => setProvider(e.target.value)}>
            <option value="anthropic-api">Anthropic</option>
            <option value="google-api">Google</option>
          </select>
          <input className="waes-input" value={model} onChange={(e) => setModel(e.target.value)} style={{ width: 200 }} />
        </div>
      </div>

      {prompts.map((p) => (
        <div key={p.ref} className="glass-card">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <b>{p.name}</b> <span className="waes-badge">{p.ref}</span>
              {p.tags.map((t) => (
                <span key={t} className="waes-badge" style={{ marginLeft: 4 }}>
                  {t}
                </span>
              ))}
            </div>
            <button className="waes-button" onClick={() => run(p.ref)} disabled={busy === p.ref}>
              {busy === p.ref ? "Running..." : "Run"}
            </button>
          </div>
          {output[p.ref] && (
            <pre style={{ fontSize: 12, whiteSpace: "pre-wrap", background: "rgba(0,0,0,0.3)", padding: 8, borderRadius: 8, marginTop: 8 }}>
              {output[p.ref]}
            </pre>
          )}
        </div>
      ))}
      {selected === null && prompts.length === 0 && <div className="glass-card">No prompts in the library yet.</div>}
    </div>
  );
}
