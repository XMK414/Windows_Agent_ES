import type { ChatProvider, ChatRequest, ModelInfo, StreamChunk } from "./provider-adapter.interface.js";
import type { SecretsVault } from "../security/secrets-vault.js";
import { streamOpenAICompatible } from "./openai-compatible.js";

const OPENROUTER_BASE = "https://openrouter.ai/api/v1";

/**
 * Drives any model on OpenRouter (OpenAI, Google, Meta, Mistral, DeepSeek,
 * xAI, and many more) through OpenRouter's OpenAI-compatible chat-completions
 * API — same ChatProvider contract as the Anthropic and Google adapters, so
 * the chat panes, round table, and Board of Directors can seat an OpenRouter
 * model exactly like a first-party one. A single vault key ("openrouter_api_key")
 * unlocks the whole catalogue.
 */
export class OpenRouterAdapter implements ChatProvider {
  readonly id = "openrouter";
  readonly requiresApiKey = true;

  constructor(private readonly vault: SecretsVault) {}

  private async apiKey(): Promise<string> {
    const key = await this.vault.get("openrouter_api_key");
    if (!key) {
      throw new Error("OpenRouter API key not configured — add it via the secrets vault, not a .env file");
    }
    return key;
  }

  /**
   * A curated shortlist for the model selector. OpenRouter exposes hundreds of
   * models; the UI also lets the user type any other OpenRouter model id, so
   * this is a convenience list of common picks, not an exhaustive catalogue.
   */
  async listModels(): Promise<ModelInfo[]> {
    return [
      { id: "openai/gpt-4o", label: "OpenAI GPT-4o", contextWindow: 128_000 },
      { id: "openai/gpt-4o-mini", label: "OpenAI GPT-4o mini", contextWindow: 128_000 },
      { id: "openai/o1", label: "OpenAI o1", contextWindow: 200_000 },
      { id: "anthropic/claude-3.7-sonnet", label: "Claude 3.7 Sonnet (via OpenRouter)", contextWindow: 200_000 },
      { id: "google/gemini-2.5-pro", label: "Gemini 2.5 Pro (via OpenRouter)", contextWindow: 1_000_000 },
      { id: "meta-llama/llama-3.3-70b-instruct", label: "Llama 3.3 70B", contextWindow: 131_000 },
      { id: "deepseek/deepseek-chat", label: "DeepSeek V3", contextWindow: 64_000 },
      { id: "mistralai/mistral-large", label: "Mistral Large", contextWindow: 128_000 },
      { id: "x-ai/grok-2", label: "xAI Grok 2", contextWindow: 131_000 },
    ];
  }

  async *send(req: ChatRequest): AsyncIterable<StreamChunk> {
    try {
      const apiKey = await this.apiKey();
      yield* streamOpenAICompatible({
        baseUrl: OPENROUTER_BASE,
        apiKey,
        req,
        extraHeaders: {
          // Optional OpenRouter attribution headers — identify this app in
          // OpenRouter's dashboard without leaking anything sensitive.
          "HTTP-Referer": "https://github.com/XMK414/Windows_Agent_ES",
          "X-Title": "Windows Agent ES",
        },
      });
    } catch (err) {
      yield { type: "error", error: err instanceof Error ? err.message : String(err) };
    }
  }
}
