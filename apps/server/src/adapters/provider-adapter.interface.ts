export type Role = "user" | "assistant" | "system";

export interface Message {
  role: Role;
  content: string;
}

export interface ModelInfo {
  id: string;
  label: string;
  contextWindow: number;
}

export interface ChatRequest {
  threadId: string;
  model: string;
  messages: Message[];
  /** Provenance-tagged context blocks already resolved by the injection
   * resolver — see snippets/server/injection/context-resolver.ts. Adapters
   * append these after the system prompt, never merge them into it. */
  injectedContext: string[];
}

export interface StreamChunk {
  type: "delta" | "done" | "error";
  text?: string;
  usage?: { inputTokens: number; outputTokens: number };
  error?: string;
}

/**
 * Every chat surface (combined 4-pane, both solo windows, Board of
 * Directors seats) talks to providers only through this interface, so the
 * UI and orchestration layer never special-case Anthropic vs. Google vs. a
 * wrapped web session.
 */
export interface ChatProvider {
  readonly id: string; // e.g. "anthropic-api" | "google-api" | "claude-web" | "gemini-web"
  readonly requiresApiKey: boolean;
  listModels(): Promise<ModelInfo[]>;
  send(req: ChatRequest): AsyncIterable<StreamChunk>;
}
