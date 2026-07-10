import { useEffect, useState } from "react";
import {
  createProject,
  listProjects,
  listProjectFiles,
  uploadProjectFile,
  readProjectFile,
  listArtifacts,
  createArtifact,
  runCli,
  listGoals,
  createGoal,
  setGoalStatus,
  createStep,
  setStepStatus,
  getProject,
  updateProject,
  listProjectLog,
  addProjectLog,
  PROJECT_PHASES,
  type Project,
  type ProjectPhase,
  type ProjectLogEntry,
} from "./api";

type SubTab = "overview" | "files" | "artifacts" | "cli" | "goals";
const STATUSES = ["todo", "doing", "blocked", "done"] as const;

const PHASE_LABELS: Record<ProjectPhase, string> = {
  DISCOVERY: "1 · Discovery",
  ARCHITECTURE: "2 · Architecture",
  CONSTRUCTION: "3 · Construction",
  VERIFY_QUALITY: "4 · Verify Quality",
  SHIP: "5 · Ship",
};

function OverviewTab({ projectId }: { projectId: string }) {
  const [project, setProject] = useState<Project | null>(null);
  const [log, setLog] = useState<ProjectLogEntry[]>([]);
  const [description, setDescription] = useState("");
  const [entry, setEntry] = useState("");
  const [saved, setSaved] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function refresh() {
    try {
      const p = await getProject(projectId);
      setProject(p);
      setDescription(p.description ?? "");
      setLog(await listProjectLog(projectId));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }
  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  async function saveDescription() {
    setError(null);
    try {
      await updateProject(projectId, { description });
      setSaved("Description saved");
      setTimeout(() => setSaved(null), 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  async function changePhase(phase: ProjectPhase) {
    setError(null);
    try {
      await updateProject(projectId, { phase });
      setProject((p) => (p ? { ...p, phase } : p));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  async function addEntry() {
    if (!entry.trim()) return;
    setError(null);
    try {
      await addProjectLog(projectId, entry);
      setEntry("");
      setLog(await listProjectLog(projectId));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  if (!project) return <div className="glass-card">{error ? <span style={{ color: "#ffb2a3" }}>{error}</span> : "Loading..."}</div>;

  return (
    <div className="glass-card">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
        <h3 style={{ margin: 0 }}>{project.name}</h3>
        <label style={{ fontSize: 12, display: "flex", alignItems: "center", gap: 6 }}>
          Phase
          <select className="waes-select" value={project.phase ?? "DISCOVERY"} onChange={(e) => changePhase(e.target.value as ProjectPhase)}>
            {PROJECT_PHASES.map((p) => (
              <option key={p} value={p}>
                {PHASE_LABELS[p]}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div style={{ fontSize: 12, opacity: 0.6, marginTop: 4 }}>
        Started {project.started_at ? new Date(project.started_at).toLocaleDateString() : new Date(project.created_at).toLocaleDateString()}
      </div>

      <div style={{ marginTop: 12 }}>
        <div style={{ fontSize: 12, opacity: 0.7, marginBottom: 4 }}>Description</div>
        <textarea className="waes-input" value={description} onChange={(e) => setDescription(e.target.value)} style={{ width: "100%", height: 70 }} placeholder="What is this project?" />
        <button className="waes-button" onClick={saveDescription} style={{ marginTop: 6 }}>
          Save description
        </button>
        {saved && <span style={{ fontSize: 12, opacity: 0.7, marginLeft: 8 }}>{saved}</span>}
      </div>

      <div style={{ marginTop: 16 }}>
        <div style={{ fontSize: 12, opacity: 0.7, marginBottom: 4 }}>Work log</div>
        <div style={{ display: "flex", gap: 8 }}>
          <input className="waes-input" placeholder="What did you do this session?" value={entry} onChange={(e) => setEntry(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addEntry()} style={{ flex: 1 }} />
          <button className="waes-button" onClick={addEntry}>
            Log it
          </button>
        </div>
        {log.map((l) => (
          <div key={l.id} style={{ borderTop: "1px solid var(--waes-glass-border)", padding: "6px 0", fontSize: 13 }}>
            <span style={{ opacity: 0.55, fontSize: 11 }}>{new Date(l.created_at).toLocaleString()}</span>
            <div>{l.entry}</div>
          </div>
        ))}
        {log.length === 0 && <div style={{ fontSize: 12, opacity: 0.5, marginTop: 6 }}>No entries yet.</div>}
      </div>

      {error && <div style={{ color: "#ffb2a3", fontSize: 12, marginTop: 8 }}>{error}</div>}
    </div>
  );
}

function FilesTab({ projectId }: { projectId: string }) {
  const [files, setFiles] = useState<any[]>([]);
  const [relPath, setRelPath] = useState("");
  const [content, setContent] = useState("");
  const [viewed, setViewed] = useState<{ path: string; content: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function refresh() {
    setFiles(await listProjectFiles(projectId));
  }
  useEffect(() => {
    refresh();
  }, [projectId]);

  async function upload() {
    setError(null);
    try {
      await uploadProjectFile(projectId, relPath, content);
      setRelPath("");
      setContent("");
      refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  async function view(path: string) {
    const c = await readProjectFile(projectId, path);
    setViewed({ path, content: c });
  }

  return (
    <div className="glass-card">
      <h3>Files</h3>
      <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
        <input className="waes-input" placeholder="path/to/file.md" value={relPath} onChange={(e) => setRelPath(e.target.value)} />
        <button className="waes-button" onClick={upload}>
          Upload
        </button>
      </div>
      <textarea className="waes-input" placeholder="File content" value={content} onChange={(e) => setContent(e.target.value)} style={{ width: "100%", height: 80, marginBottom: 8 }} />
      {error && <div style={{ color: "#ffb2a3", fontSize: 12 }}>{error}</div>}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 8 }}>
        {files.map((f) => (
          <span key={f.id} className="waes-badge" style={{ cursor: "pointer" }} onClick={() => view(f.rel_path)}>
            {f.rel_path} ({f.size}b)
          </span>
        ))}
      </div>
      {viewed && (
        <pre style={{ marginTop: 8, fontSize: 12, whiteSpace: "pre-wrap", background: "rgba(0,0,0,0.3)", padding: 8, borderRadius: 8 }}>
          {viewed.path}
          {"\n\n"}
          {viewed.content}
        </pre>
      )}
    </div>
  );
}

function ArtifactsTab({ projectId }: { projectId: string }) {
  const [artifacts, setArtifacts] = useState<any[]>([]);
  const [name, setName] = useState("");
  const [content, setContent] = useState("");

  async function refresh() {
    setArtifacts(await listArtifacts(projectId));
  }
  useEffect(() => {
    refresh();
  }, [projectId]);

  async function create() {
    if (!name || !content) return;
    await createArtifact(projectId, name, content, "user");
    setContent("");
    refresh();
  }

  return (
    <div className="glass-card">
      <h3>Artifacts</h3>
      <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
        <input className="waes-input" placeholder="artifact name" value={name} onChange={(e) => setName(e.target.value)} />
        <button className="waes-button" onClick={create}>
          Save new version
        </button>
      </div>
      <textarea className="waes-input" placeholder="content" value={content} onChange={(e) => setContent(e.target.value)} style={{ width: "100%", height: 80, marginBottom: 8 }} />
      {artifacts.map((a) => (
        <div key={a.id} style={{ fontSize: 12, padding: "4px 0", borderTop: "1px solid var(--waes-glass-border)" }}>
          <b>{a.name}</b> v{a.version} · by {a.created_by_pane} · {new Date(a.created_at).toLocaleString()}
        </div>
      ))}
    </div>
  );
}

function CliTab({ projectId }: { projectId: string }) {
  const [cmd, setCmd] = useState("git");
  const [args, setArgs] = useState("status");
  const [result, setResult] = useState<{ exitCode: number | null; stdout: string; stderr: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setError(null);
    try {
      setResult(await runCli(projectId, cmd, args.split(" ").filter(Boolean)));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  return (
    <div className="glass-card">
      <h3>CLI (allowlisted: git, node, npm, claude)</h3>
      <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
        <input className="waes-input" value={cmd} onChange={(e) => setCmd(e.target.value)} style={{ width: 100 }} />
        <input className="waes-input" value={args} onChange={(e) => setArgs(e.target.value)} style={{ flex: 1 }} placeholder="args, space separated" />
        <button className="waes-button" onClick={run}>
          Run
        </button>
      </div>
      {error && <div style={{ color: "#ffb2a3", fontSize: 12 }}>{error}</div>}
      {result && (
        <pre style={{ fontSize: 12, whiteSpace: "pre-wrap", background: "rgba(0,0,0,0.3)", padding: 8, borderRadius: 8 }}>
          exit: {String(result.exitCode)}
          {"\n"}
          {result.stdout}
          {result.stderr}
        </pre>
      )}
    </div>
  );
}

function GoalsTab({ projectId }: { projectId: string }) {
  const [goals, setGoals] = useState<any[]>([]);
  const [title, setTitle] = useState("");

  async function refresh() {
    setGoals(await listGoals(projectId));
  }
  useEffect(() => {
    refresh();
  }, [projectId]);

  async function addGoal() {
    if (!title) return;
    await createGoal(projectId, title);
    setTitle("");
    refresh();
  }

  return (
    <div className="glass-card">
      <h3>Goals</h3>
      <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
        <input className="waes-input" placeholder="New goal" value={title} onChange={(e) => setTitle(e.target.value)} />
        <button className="waes-button" onClick={addGoal}>
          Add
        </button>
      </div>
      {goals.map((g) => (
        <div key={g.id} style={{ borderTop: "1px solid var(--waes-glass-border)", padding: "8px 0" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <b>{g.title}</b>
            <select
              className="waes-select"
              value={g.status}
              onChange={async (e) => {
                await setGoalStatus(g.id, e.target.value);
                refresh();
              }}
            >
              {STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>
          <StepList goal={g} onChange={refresh} />
        </div>
      ))}
    </div>
  );
}

function StepList({ goal, onChange }: { goal: any; onChange: () => void }) {
  const [title, setTitle] = useState("");

  async function addStep() {
    if (!title) return;
    await createStep(goal.id, title);
    setTitle("");
    onChange();
  }

  return (
    <div style={{ marginLeft: 12, marginTop: 6 }}>
      {goal.steps.map((s: any) => (
        <div key={s.id} style={{ display: "flex", justifyContent: "space-between", fontSize: 12, padding: "2px 0" }}>
          <span>{s.title}</span>
          <select
            className="waes-select"
            value={s.status}
            onChange={async (e) => {
              await setStepStatus(s.id, e.target.value);
              onChange();
            }}
          >
            {STATUSES.map((st) => (
              <option key={st} value={st}>
                {st}
              </option>
            ))}
          </select>
        </div>
      ))}
      <div style={{ display: "flex", gap: 6, marginTop: 4 }}>
        <input className="waes-input" placeholder="New step" value={title} onChange={(e) => setTitle(e.target.value)} style={{ fontSize: 12 }} />
        <button className="waes-button" onClick={addStep} style={{ fontSize: 12 }}>
          Add step
        </button>
      </div>
    </div>
  );
}

export function ProjectsPanel() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [newName, setNewName] = useState("");
  const [subTab, setSubTab] = useState<SubTab>("overview");
  const [error, setError] = useState<string | null>(null);

  async function refresh() {
    try {
      const list = await listProjects();
      setProjects(list);
      if (!selected && list.length) setSelected(list[0].id);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }
  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function create() {
    if (!newName) return;
    setError(null);
    try {
      const p = await createProject(newName);
      setNewName("");
      await refresh();
      setSelected(p.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16, maxWidth: 900, width: "100%" }}>
      <div className="glass-card">
        <h3>Projects</h3>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <select className="waes-select" value={selected ?? ""} onChange={(e) => setSelected(e.target.value)}>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          <input className="waes-input" placeholder="New project name" value={newName} onChange={(e) => setNewName(e.target.value)} />
          <button className="waes-button" onClick={create}>
            Create
          </button>
        </div>
        {error && (
          <div style={{ color: "#ffb2a3", fontSize: 12, marginTop: 8 }}>
            {error}
            {error.includes("fetch") && " — the server may not be reachable (check it's running on 127.0.0.1:8787)."}
          </div>
        )}
      </div>

      {selected && (
        <>
          <div className="waes-tabs" style={{ padding: 0 }}>
            {(["overview", "files", "artifacts", "cli", "goals"] as SubTab[]).map((t) => (
              <button key={t} className={`waes-tab${subTab === t ? " active" : ""}`} onClick={() => setSubTab(t)}>
                {t[0].toUpperCase() + t.slice(1)}
              </button>
            ))}
          </div>
          {subTab === "overview" && <OverviewTab projectId={selected} />}
          {subTab === "files" && <FilesTab projectId={selected} />}
          {subTab === "artifacts" && <ArtifactsTab projectId={selected} />}
          {subTab === "cli" && <CliTab projectId={selected} />}
          {subTab === "goals" && <GoalsTab projectId={selected} />}
        </>
      )}
    </div>
  );
}
