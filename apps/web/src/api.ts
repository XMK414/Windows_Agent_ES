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
