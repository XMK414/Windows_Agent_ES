import type { ChatProvider, ChatRequest, ModelInfo, StreamChunk } from "./provider-adapter.interface.js";
import type { SecretsVault } from "../security/secrets-vault.js";
import { streamOpenAICompatible } from "./openai-compatible.js";

const DEFAULT_BASE = "https://api.openai.com/v1";

/**
 * ChatGPT via OAuth. This is deliberately `buildRestricted`: per the OpenAI
 * no-compete policy it may be used to *run* advisory/assistant work (Round
 * Table, Board, Chat, Hermes agents) but never to build or design a product,
 * so the macros and scheduled-job surfaces refuse it.
 *
 * Auth is a stored token used as a Bearer against an OpenAI-compatible endpoint.
 * A ChatGPT session token does NOT authenticate against api.openai.com, so the
 * base URL is configurable (`chatgpt_oauth_base_url`) — point it at the endpoint
 * that actually accepts your credential (an OAuth token endpoint or a bridge).
 */
export class ChatGptOAuthAdapter implements ChatProvider {
  readonly id = "chatgpt-oauth";
  readonly requiresApiKey = true;
  readonly buildRestricted = true;

  constructor(private readonly vault: SecretsVault) {}

  private async token(): Promise<string> {
    const token = await this.vault.get("chatgpt_oauth_token");
    if (!token) {
      throw new Error("ChatGPT OAuth token not configured — add it in the Vault (OAuth logins).");
    }
    return token;
  }

  private async baseUrl(): Promise<string> {
    return (await this.vault.get("chatgpt_oauth_base_url")) || DEFAULT_BASE;
  }

  async listModels(): Promise<ModelInfo[]> {
    return [
      { id: "gpt-4o", label: "GPT-4o", contextWindow: 128_000 },
      { id: "gpt-4o-mini", label: "GPT-4o mini", contextWindow: 128_000 },
      { id: "o1", label: "o1", contextWindow: 200_000 },
    ];
  }

  async *send(req: ChatRequest): AsyncIterable<StreamChunk> {
    try {
      const [token, baseUrl] = await Promise.all([this.token(), this.baseUrl()]);
      yield* streamOpenAICompatible({ baseUrl, apiKey: token, req });
    } catch (err) {
      yield { type: "error", error: err instanceof Error ? err.message : String(err) };
    }
  }
}
