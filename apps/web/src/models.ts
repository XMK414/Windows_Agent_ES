// Single source of truth for the provider + model pickers shared by the chat
// panes, the round table, and the Board of Directors. Keep the ids in sync with
// each server-side adapter's listModels().

export interface ModelOption {
  id: string;
  label: string;
}

export interface ProviderInfo {
  id: string;
  label: string;
  models: ModelOption[];
  /** OpenRouter exposes hundreds of models, so its picker also allows a typed
   * custom model id in addition to the curated shortlist below. */
  allowCustomModel?: boolean;
}

export const PROVIDERS: ProviderInfo[] = [
  {
    id: "anthropic-api",
    label: "Anthropic",
    models: [
      { id: "claude-sonnet-5", label: "Claude Sonnet 5" },
      { id: "claude-opus-4-8", label: "Claude Opus 4.8" },
      { id: "claude-haiku-4-5-20251001", label: "Claude Haiku 4.5" },
    ],
  },
  {
    id: "google-api",
    label: "Google",
    models: [
      { id: "gemini-2.5-pro", label: "Gemini 2.5 Pro" },
      { id: "gemini-2.5-flash", label: "Gemini 2.5 Flash" },
    ],
  },
  {
    id: "openrouter",
    label: "OpenRouter",
    allowCustomModel: true,
    models: [
      { id: "openai/gpt-4o", label: "OpenAI GPT-4o" },
      { id: "openai/gpt-4o-mini", label: "OpenAI GPT-4o mini" },
      { id: "openai/o1", label: "OpenAI o1" },
      { id: "anthropic/claude-3.7-sonnet", label: "Claude 3.7 Sonnet" },
      { id: "google/gemini-2.5-pro", label: "Gemini 2.5 Pro" },
      { id: "meta-llama/llama-3.3-70b-instruct", label: "Llama 3.3 70B" },
      { id: "deepseek/deepseek-chat", label: "DeepSeek V3" },
      { id: "mistralai/mistral-large", label: "Mistral Large" },
      { id: "x-ai/grok-2", label: "xAI Grok 2" },
    ],
  },
  {
    // ChatGPT via OAuth. Allowed for running/advisory work (Round Table, Board,
    // Chat) but not for building a product — the server blocks it on the
    // macros/jobs surfaces.
    id: "chatgpt-oauth",
    label: "ChatGPT (OAuth)",
    allowCustomModel: true,
    models: [
      { id: "gpt-4o", label: "GPT-4o" },
      { id: "gpt-4o-mini", label: "GPT-4o mini" },
      { id: "o1", label: "o1" },
    ],
  },
];

export const PROVIDER_MAP: Record<string, ProviderInfo> = Object.fromEntries(
  PROVIDERS.map((p) => [p.id, p]),
);

export function providerLabel(id: string): string {
  return PROVIDER_MAP[id]?.label ?? id;
}

export function modelsFor(providerId: string): ModelOption[] {
  return PROVIDER_MAP[providerId]?.models ?? [];
}

export function defaultModelFor(providerId: string): string {
  return modelsFor(providerId)[0]?.id ?? "";
}

/** Sentinel value the model <select> uses to reveal a free-text field for
 * OpenRouter models outside the curated shortlist. */
export const CUSTOM_MODEL = "__custom__";
