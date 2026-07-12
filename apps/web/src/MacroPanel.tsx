import { useEffect, useState } from "react";
import {
  listLibrary,
  runMacro,
  listProjects,
  listContextSets,
  listContextSetTemplates,
  createContextSet,
  updateContextSet,
  activateContextSet,
  deleteContextSet,
  type LibraryListItem,
  type Project,
  type ContextSet,
  type ContextSetTemplate,
} from "./api";
import { ModelPicker } from "./ModelPicker";

const FIELDS: { key: keyof ContextSet; label: string; placeholder: string }[] = [
  { key: "prompt", label: "Prompt", placeholder: "System prompt / persona for this setup" },
  { key: "rules", label: "Rules", placeholder: "- Things the agent should always do" },
  { key: "restraints", label: "Restraints", placeholder: "- Things the agent must never do" },
  { key: "plan_md", label: "plan.md", placeholder: "# Plan\n\n## Goal\n" },
  { key: "notes", label: "Notes", placeholder: "Free notes" },
];

function ContextSets() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [scope, setScope] = useState<string>(""); // "" = global
  const [sets, setSets] = useState<ContextSet[]>([]);
  const [templates, setTemplates] = useState<ContextSetTemplate[]>([]);
  const [selected, setSelected] = useState<ContextSet | null>(null);
  const [newName, setNewName] = useState("");
  const [templateName, setTemplateName] = useState("Blank");
  const [saved, setSaved] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function refresh() {
    try {
      setSets(await listContextSets(scope || undefined));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  useEffect(() => {
    listProjects().then(setProjects).catch(() => {});
    listContextSetTemplates().then(setTemplates).catch(() => {});
  }, []);
  useEffect(() => {
    refresh();
    setSelected(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scope]);

  async function create() {
    if (!newName.trim()) return;
    setError(null);
    try {
      const tpl = templates.find((t) => t.name === templateName);
      const set = await createContextSet({
        name: newName.trim(),
        projectId: scope || null,
        prompt: tpl?.prompt,
        rules: tpl?.rules,
        restraints: tpl?.restraints,
        plan_md: tpl?.plan_md,
        notes: tpl?.notes,
      });
      setNewName("");
      await refresh();
      setSelected(set);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  async function save() {
    if (!selected) return;
    setError(null);
    try {
      const updated = await updateContextSet(selected.id, {
        name: selected.name,
        prompt: selected.prompt,
        rules: selected.rules,
        restraints: selected.restraints,
        plan_md: selected.plan_md,
        notes: selected.notes,
      });
      setSelected(updated);
      await refresh();
      setSaved("Saved");
      setTimeout(() => setSaved(null), 1500);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  async function activate(id: string) {
    await activateContextSet(id);
    refresh();
  }

  async function remove(id: string) {
    await deleteContextSet(id);
    if (selected?.id === id) setSelected(null);
    refresh();
  }

  return (
    <div className="glass-card">
      <h3>Context sets</h3>
      <p style={{ fontSize: 12, opacity: 0.6, marginTop: -4 }}>
        Named, swappable bundles of prompt · rules · restraints · plan.md · notes. Scope them to a project and swap which
        one is active. Start from a template.
      </p>

      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginBottom: 10 }}>
        <label style={{ fontSize: 12, display: "flex", alignItems: "center", gap: 4 }}>
          Scope
          <select className="waes-select" value={scope} onChange={(e) => setScope(e.target.value)}>
            <option value="">Global</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
        <select className="waes-select" value={templateName} onChange={(e) => setTemplateName(e.target.value)}>
          {templates.map((t) => (
            <option key={t.name} value={t.name}>
              {t.name}
            </option>
          ))}
        </select>
        <input className="waes-input" placeholder="New set name" value={newName} onChange={(e) => setNewName(e.target.value)} style={{ width: 160 }} />
        <button className="waes-button" onClick={create}>
          Create
        </button>
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 10 }}>
        {sets.map((s) => (
          <span
            key={s.id}
            className="waes-badge"
            style={{ cursor: "pointer", outline: selected?.id === s.id ? "1px solid var(--waes-accent, #88f)" : undefined }}
            onClick={() => setSelected(s)}
          >
            {s.active ? "★ " : ""}
            {s.name}
            {s.project_id === null ? " (global)" : ""}
          </span>
        ))}
        {sets.length === 0 && <span style={{ fontSize: 12, opacity: 0.5 }}>No sets in this scope yet.</span>}
      </div>

      {selected && (
        <div style={{ borderTop: "1px solid var(--waes-glass-border)", paddingTop: 10 }}>
          <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 8, flexWrap: "wrap" }}>
            <input className="waes-input" value={selected.name} onChange={(e) => setSelected({ ...selected, name: e.target.value })} style={{ width: 200 }} />
            <button className="waes-button" onClick={() => activate(selected.id)}>
              {selected.active ? "Active" : "Make active"}
            </button>
            <button className="waes-button" onClick={save}>
              Save
            </button>
            <button className="waes-button" onClick={() => remove(selected.id)}>
              Delete
            </button>
            {saved && <span style={{ fontSize: 12, opacity: 0.7 }}>{saved}</span>}
          </div>
          {FIELDS.map((f) => (
            <div key={f.key} style={{ marginBottom: 8 }}>
              <div style={{ fontSize: 11, opacity: 0.7, marginBottom: 2 }}>{f.label}</div>
              <textarea
                className="waes-input"
                placeholder={f.placeholder}
                value={(selected[f.key] as string) ?? ""}
                onChange={(e) => setSelected({ ...selected, [f.key]: e.target.value })}
                style={{ width: "100%", height: f.key === "plan_md" ? 120 : 60 }}
              />
            </div>
          ))}
        </div>
      )}
      {error && <div style={{ color: "#ffb2a3", fontSize: 12 }}>{error}</div>}
    </div>
  );
}

function PromptRunner() {
  const [prompts, setPrompts] = useState<LibraryListItem[]>([]);
  const [adapterId, setAdapterId] = useState("anthropic-api");
  const [model, setModel] = useState("claude-sonnet-5");
  const [output, setOutput] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    listLibrary("")
      .then((items) => setPrompts(items.filter((i) => i.type === "prompt")))
      .catch(() => {});
  }, []);

  async function run(ref: string) {
    setBusy(ref);
    setOutput((o) => ({ ...o, [ref]: "" }));
    try {
      const res = await runMacro(ref, adapterId, model);
      setOutput((o) => ({ ...o, [ref]: res.text }));
    } catch (err) {
      setOutput((o) => ({ ...o, [ref]: `Error: ${err instanceof Error ? err.message : String(err)}` }));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="glass-card">
      <h3>Run a saved prompt</h3>
      <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
        <ModelPicker adapterId={adapterId} model={model} onChange={(p) => {
          if (p.adapterId !== undefined) setAdapterId(p.adapterId);
          if (p.model !== undefined) setModel(p.model);
        }} />
      </div>
      {prompts.map((p) => (
        <div key={p.ref} style={{ borderTop: "1px solid var(--waes-glass-border)", padding: "8px 0" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <b>{p.name}</b> <span className="waes-badge">{p.ref}</span>
            </div>
            <button className="waes-button" onClick={() => run(p.ref)} disabled={busy === p.ref}>
              {busy === p.ref ? "Running..." : "Run"}
            </button>
          </div>
          {output[p.ref] && (
            <pre style={{ fontSize: 12, whiteSpace: "pre-wrap", background: "rgba(0,0,0,0.3)", padding: 8, borderRadius: 8, marginTop: 8 }}>{output[p.ref]}</pre>
          )}
        </div>
      ))}
      {prompts.length === 0 && <div style={{ fontSize: 12, opacity: 0.5 }}>No prompts in the library yet.</div>}
    </div>
  );
}

export function MacroPanel() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16, maxWidth: 820, width: "100%" }}>
      <ContextSets />
      <PromptRunner />
    </div>
  );
}
