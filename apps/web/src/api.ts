const SERVER_ORIGIN = "http://127.0.0.1:8787";

function getInstallToken(): string {
  return localStorage.getItem("waes_install_token") ?? "";
}

export function setInstallToken(token: string): void {
  localStorage.setItem("waes_install_token", token);
}

function csrfToken(): string {
  let token = localStorage.getItem("waes_csrf_local");
  if (!token) {
    token = crypto.randomUUID();
    localStorage.setItem("waes_csrf_local", token);
  }
  // Mirrors auth-middleware's double-submit check: the same value must
  // appear as both a cookie and a header on state-changing requests.
  document.cookie = `waes_csrf=${token}; SameSite=Strict; path=/`;
  return token;
}

async function request(path: string, init: RequestInit = {}): Promise<Response> {
  const method = (init.method ?? "GET").toUpperCase();
  const headers: Record<string, string> = {
    Authorization: `Bearer ${getInstallToken()}`,
    ...(init.headers as Record<string, string> | undefined),
  };
  if (method !== "GET") {
    headers["x-waes-csrf"] = csrfToken();
    headers["Content-Type"] = "application/json";
  }
  return fetch(`${SERVER_ORIGIN}${path}`, { ...init, headers, credentials: "include" });
}

export async function getStatus() {
  const res = await request("/api/status");
  return res.json();
}

export async function setSecret(key: string, value: string) {
  return request(`/api/secrets/${key}`, { method: "POST", body: JSON.stringify({ value }) });
}

export async function createThread(paneId: string, provider: string, model: string) {
  const res = await request("/api/threads", { method: "POST", body: JSON.stringify({ paneId, provider, model }) });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "failed to create thread");
  return data.id as string;
}

export interface InjectionRef {
  kind: "file" | "note" | "library" | "artifact";
  ref: string;
}

export interface LibraryListItem {
  ref: string;
  type: string;
  name: string;
  tags: string[];
  owner: "human" | "agent";
}

export async function listLibrary(query = ""): Promise<LibraryListItem[]> {
  const res = await request(`/api/library${query ? `?q=${encodeURIComponent(query)}` : ""}`);
  const data = await res.json();
  return data.items ?? [];
}

export async function saveNote(sourcePane: string, excerpt: string, threadId?: string, model?: string) {
  const res = await request("/api/notes", {
    method: "POST",
    body: JSON.stringify({ sourcePane, excerpt, threadId, model, tags: [] }),
  });
  if (!res.ok) throw new Error((await res.json()).error ?? "failed to save note");
  return res.json();
}

/** Streams SSE-style `event:`/`data:` frames from a POST body via fetch's readable stream. */
export async function* sendMessage(
  threadId: string,
  content: string,
  injections: InjectionRef[] = [],
): AsyncGenerator<{ event: string; data: any }> {
  const res = await request(`/api/threads/${threadId}/messages`, {
    method: "POST",
    body: JSON.stringify({ content, injections }),
  });

  if (!res.body) throw new Error("no response body");
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    let sepIndex: number;
    while ((sepIndex = buffer.indexOf("\n\n")) !== -1) {
      const frame = buffer.slice(0, sepIndex);
      buffer = buffer.slice(sepIndex + 2);
      const eventLine = frame.split("\n").find((l) => l.startsWith("event:"));
      const dataLine = frame.split("\n").find((l) => l.startsWith("data:"));
      if (eventLine && dataLine) {
        yield { event: eventLine.slice(6).trim(), data: JSON.parse(dataLine.slice(5).trim()) };
      }
    }
  }
}

export interface ToolInput {
  category: string;
  name: string;
  costType: "free" | "freemium" | "subscription" | "one_time" | "usage_based";
  costAmountCents?: number;
  costPer?: "project" | "month" | "unit";
  termsSummary?: string;
  termsUrl?: string;
  hosting: "self" | "hosted" | "both";
  license?: "open_source" | "proprietary";
  easeOfUse?: number;
  speed?: number;
  quality?: number;
  privacy?: number;
  vendorLockIn?: number;
  integrations?: number;
  support?: number;
  scalability?: number;
  notes?: string;
}

export interface Tool extends ToolInput {
  id: string;
}

export async function createTool(input: ToolInput) {
  const res = await request("/api/tools", { method: "POST", body: JSON.stringify(input) });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "failed to create tool");
  return data.id as string;
}

export async function listTools(category?: string): Promise<Tool[]> {
  const res = await request(`/api/tools${category ? `?category=${encodeURIComponent(category)}` : ""}`);
  const data = await res.json();
  return (data.tools ?? []).map((t: any) => ({
    id: t.id,
    category: t.category,
    name: t.name,
    costType: t.cost_type,
    costAmountCents: t.cost_amount_cents,
    costPer: t.cost_per,
    termsSummary: t.terms_summary,
    termsUrl: t.terms_url,
    hosting: t.hosting,
    license: t.license,
    easeOfUse: t.ease_of_use,
    speed: t.speed,
    quality: t.quality,
    privacy: t.privacy,
    vendorLockIn: t.vendor_lock_in,
    integrations: t.integrations,
    support: t.support,
    scalability: t.scalability,
    notes: t.notes,
  }));
}

export async function listToolCategories(): Promise<string[]> {
  const res = await request("/api/tools/categories");
  return (await res.json()).categories ?? [];
}

export interface StackSummary {
  id: string;
  name: string;
  budgetCents: number | null;
  budgetPeriod: string | null;
  items: any[];
  totals: { monthlyCents: number; oneTimeCents: number };
  overBudget: boolean;
}

export async function createStack(name: string, budgetCents: number | null, budgetPeriod: "project" | "month", items: { toolId: string; category: string }[]): Promise<StackSummary> {
  const res = await request("/api/stacks", { method: "POST", body: JSON.stringify({ name, budgetCents, budgetPeriod, items }) });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "failed to create stack");
  return data;
}

export interface BreakSettings {
  intervalMinutes: number;
  enabled: boolean;
  exerciseTypes: string[];
}

export async function getBreakSettings(): Promise<BreakSettings> {
  const res = await request("/api/breaks/settings");
  return res.json();
}

export async function setBreakSettings(settings: BreakSettings) {
  const res = await request("/api/breaks/settings", { method: "POST", body: JSON.stringify(settings) });
  if (!res.ok) throw new Error((await res.json()).error ?? "failed to save break settings");
  return res.json();
}

// ---- TermLens ----

export interface ScanClause {
  title: string;
  original: string;
  plainEnglish: string;
  risk: "low" | "medium" | "high";
  why: string;
}

export interface ScanResult {
  id: string;
  source: string;
  createdAt: string;
  summary: string;
  overallRisk: "low" | "medium" | "high";
  clauses: ScanClause[];
}

export async function runTermLensScan(text: string, sourceName: string, provider: string, model: string): Promise<ScanResult> {
  const res = await request("/api/termlens/scan", { method: "POST", body: JSON.stringify({ text, sourceName, provider, model }) });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "scan failed");
  return data;
}

export async function listScans(): Promise<any[]> {
  const res = await request("/api/termlens/scans");
  return (await res.json()).scans ?? [];
}

export async function getScan(id: string): Promise<any> {
  const res = await request(`/api/termlens/scans/${id}`);
  return res.json();
}

// ---- Projects / Files / Artifacts / CLI ----

export const PROJECT_PHASES = ["DISCOVERY", "ARCHITECTURE", "CONSTRUCTION", "VERIFY_QUALITY", "SHIP"] as const;
export type ProjectPhase = (typeof PROJECT_PHASES)[number];

export interface Project {
  id: string;
  name: string;
  description?: string | null;
  phase?: ProjectPhase;
  started_at?: string | null;
  created_at: string;
}

export async function createProject(name: string): Promise<Project> {
  const res = await request("/api/projects", { method: "POST", body: JSON.stringify({ name }) });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "failed to create project");
  return data;
}

export async function listProjects(): Promise<Project[]> {
  const res = await request("/api/projects");
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "failed to list projects");
  return data.projects ?? [];
}

export async function getProject(id: string): Promise<Project> {
  const res = await request(`/api/projects/${id}`);
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "failed to load project");
  return data.project;
}

export async function updateProject(id: string, patch: { description?: string; phase?: ProjectPhase }) {
  const res = await request(`/api/projects/${id}`, { method: "PATCH", body: JSON.stringify(patch) });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "failed to update project");
  return data;
}

export interface ProjectLogEntry {
  id: string;
  entry: string;
  created_at: string;
}

export async function listProjectLog(id: string): Promise<ProjectLogEntry[]> {
  const res = await request(`/api/projects/${id}/log`);
  return (await res.json()).entries ?? [];
}

export async function addProjectLog(id: string, entry: string) {
  const res = await request(`/api/projects/${id}/log`, { method: "POST", body: JSON.stringify({ entry }) });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "failed to add log entry");
  return data;
}

// ---- Context sets (Macros) ----

export interface ContextSet {
  id: string;
  project_id: string | null;
  name: string;
  prompt: string;
  rules: string;
  restraints: string;
  plan_md: string;
  notes: string;
  active: number;
  created_at: string;
  updated_at: string;
}

export interface ContextSetTemplate {
  name: string;
  prompt: string;
  rules: string;
  restraints: string;
  plan_md: string;
  notes: string;
}

export async function listContextSets(projectId?: string): Promise<ContextSet[]> {
  const res = await request(`/api/context-sets${projectId ? `?projectId=${encodeURIComponent(projectId)}` : ""}`);
  return (await res.json()).sets ?? [];
}

export async function listContextSetTemplates(): Promise<ContextSetTemplate[]> {
  const res = await request(`/api/context-sets/templates`);
  return (await res.json()).templates ?? [];
}

export async function createContextSet(input: Partial<ContextSet> & { name: string; projectId?: string | null }): Promise<ContextSet> {
  const res = await request(`/api/context-sets`, { method: "POST", body: JSON.stringify(input) });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "failed to create set");
  return data.set;
}

export async function updateContextSet(id: string, patch: Partial<ContextSet>): Promise<ContextSet> {
  const res = await request(`/api/context-sets/${id}`, { method: "PATCH", body: JSON.stringify(patch) });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "failed to update set");
  return data.set;
}

export async function activateContextSet(id: string): Promise<ContextSet> {
  const res = await request(`/api/context-sets/${id}/activate`, { method: "POST" });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "failed to activate set");
  return data.set;
}

export async function deleteContextSet(id: string) {
  return request(`/api/context-sets/${id}`, { method: "DELETE" });
}

export async function listProjectFiles(projectId: string): Promise<any[]> {
  const res = await request(`/api/projects/${projectId}/files`);
  return (await res.json()).files ?? [];
}

export async function uploadProjectFile(projectId: string, relPath: string, content: string) {
  const res = await request(`/api/projects/${projectId}/files`, { method: "POST", body: JSON.stringify({ relPath, content }) });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "failed to upload file");
  return data;
}

export async function readProjectFile(projectId: string, relPath: string): Promise<string> {
  const res = await request(`/api/projects/${projectId}/files/${relPath}`);
  if (!res.ok) throw new Error((await res.json()).error ?? "failed to read file");
  return res.text();
}

export async function listArtifacts(projectId: string): Promise<any[]> {
  const res = await request(`/api/projects/${projectId}/artifacts`);
  return (await res.json()).artifacts ?? [];
}

export async function createArtifact(projectId: string, name: string, content: string, createdByPane: string) {
  const res = await request(`/api/projects/${projectId}/artifacts`, {
    method: "POST",
    body: JSON.stringify({ name, content, createdByPane }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "failed to create artifact");
  return data;
}

export async function runCli(projectId: string, cmd: string, args: string[], cwd = ".") {
  const res = await request(`/api/projects/${projectId}/cli/run`, { method: "POST", body: JSON.stringify({ cmd, args, cwd }) });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "command failed");
  return data as { exitCode: number | null; stdout: string; stderr: string };
}

// ---- Board of Directors ----

export interface BoardAgent {
  adapterId: string;
  model: string;
}

export interface BoardRunResult {
  threadId: string;
  advisors: { roleKey: string; label: string; adapterId: string; model: string; ok: boolean; content: string }[];
  reviews: { reviewerIndex: number; adapterId: string; model: string; ok: boolean; content: string }[];
  clarifyingQuestions: string[];
}

export interface BoardVerdictResult {
  threadId: string;
  report: string;
  verdict: string;
  steps: { title: string; microActions: string[] }[];
}

/** Phase 1–3: advisors → peer review → clarifying questions. */
export async function runBoard(
  prompt: string,
  advisors: BoardAgent[],
  reviewers: BoardAgent[],
  counsel: BoardAgent,
): Promise<BoardRunResult> {
  const res = await request("/api/board/run", { method: "POST", body: JSON.stringify({ prompt, advisors, reviewers, counsel }) });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "board run failed");
  return data as BoardRunResult;
}

/** Phase 4: report + single verdict + next 3 micro-action steps. */
export async function runBoardVerdict(threadId: string, answers: string): Promise<BoardVerdictResult> {
  const res = await request("/api/board/verdict", { method: "POST", body: JSON.stringify({ threadId, answers }) });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "board verdict failed");
  return data as BoardVerdictResult;
}

// ---- Goals / PM ----

export async function createGoal(projectId: string, title: string) {
  const res = await request(`/api/projects/${projectId}/goals`, { method: "POST", body: JSON.stringify({ title }) });
  return res.json();
}

export async function listGoals(projectId: string): Promise<any[]> {
  const res = await request(`/api/projects/${projectId}/goals`);
  return (await res.json()).goals ?? [];
}

export async function setGoalStatus(goalId: string, status: string) {
  return request(`/api/goals/${goalId}`, { method: "PATCH", body: JSON.stringify({ status }) });
}

export async function createStep(goalId: string, title: string) {
  const res = await request(`/api/goals/${goalId}/steps`, { method: "POST", body: JSON.stringify({ title }) });
  return res.json();
}

export async function setStepStatus(stepId: string, status: string) {
  return request(`/api/steps/${stepId}`, { method: "PATCH", body: JSON.stringify({ status }) });
}

// ---- Cost dashboard ----

export async function getCostSummary(days = 7): Promise<any> {
  const res = await request(`/api/cost/summary?days=${days}`);
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? `cost summary failed (${res.status})`);
  return data;
}

// ---- Memory query ----

export async function queryMemory(q: string): Promise<{ query: string; hits: { source: string; snippet: string; score: number }[] }> {
  const res = await request(`/api/memory/query?q=${encodeURIComponent(q)}`);
  return res.json();
}

// ---- Scheduled jobs ----

export interface JobInput {
  name: string;
  cronExpr: string;
  adapter: string;
  model: string;
  promptRef: string;
  costCapCents: number;
}

export async function createJob(input: JobInput) {
  const res = await request("/api/jobs", { method: "POST", body: JSON.stringify(input) });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "failed to create job");
  return data.id as string;
}

export async function listJobs(): Promise<any[]> {
  const res = await request("/api/jobs");
  return (await res.json()).jobs ?? [];
}

export async function setJobEnabled(id: string, enabled: boolean) {
  return request(`/api/jobs/${id}`, { method: "PATCH", body: JSON.stringify({ enabled }) });
}

export async function deleteJob(id: string) {
  return request(`/api/jobs/${id}`, { method: "DELETE" });
}

export async function runJobNow(id: string): Promise<{ text: string }> {
  const res = await request(`/api/jobs/${id}/run-now`, { method: "POST" });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "job run failed");
  return data;
}

// ---- Macros ----

export async function runMacro(promptRef: string, provider: string, model: string, injections: InjectionRef[] = []): Promise<{ text: string }> {
  const res = await request("/api/macros/run", { method: "POST", body: JSON.stringify({ promptRef, provider, model, injections }) });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "macro run failed");
  return data;
}

// ---- Round table ----

export interface RoundtableSpeaker {
  kind: "llm" | "user";
  label: string;
  adapterId?: string;
  model?: string;
  personaId?: string;
}

export async function createRoundtableThread(topic?: string): Promise<string> {
  const res = await request("/api/roundtable/threads", { method: "POST", body: JSON.stringify({ topic }) });
  return (await res.json()).id;
}

export async function takeRoundtableTurn(threadId: string, speaker: RoundtableSpeaker, content?: string): Promise<{ speaker: string; content: string }> {
  const res = await request(`/api/roundtable/threads/${threadId}/turns`, { method: "POST", body: JSON.stringify({ speaker, content }) });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "turn failed");
  return data;
}
