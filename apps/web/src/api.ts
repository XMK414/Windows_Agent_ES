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
