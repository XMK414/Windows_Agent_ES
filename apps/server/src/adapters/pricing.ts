/**
 * Rough, approximate per-model pricing (cents per million tokens) so the
 * cost dashboard and job spend caps have real numbers to work with instead
 * of a hardcoded 0. These are estimates for planning/cap purposes, not a
 * substitute for the provider's actual billing — update as pricing changes.
 */
interface Rate {
  inputCentsPerMillion: number;
  outputCentsPerMillion: number;
}

const RATES: Record<string, Rate> = {
  "claude-opus-4-8": { inputCentsPerMillion: 1500, outputCentsPerMillion: 7500 },
  "claude-sonnet-5": { inputCentsPerMillion: 300, outputCentsPerMillion: 1500 },
  "claude-haiku-4-5-20251001": { inputCentsPerMillion: 100, outputCentsPerMillion: 500 },
  "gemini-2.5-pro": { inputCentsPerMillion: 125, outputCentsPerMillion: 500 },
  "gemini-2.5-flash": { inputCentsPerMillion: 30, outputCentsPerMillion: 120 },
  // OpenRouter models (rates approximate, quoted per the upstream provider).
  "openai/gpt-4o": { inputCentsPerMillion: 250, outputCentsPerMillion: 1000 },
  "openai/gpt-4o-mini": { inputCentsPerMillion: 15, outputCentsPerMillion: 60 },
  "openai/o1": { inputCentsPerMillion: 1500, outputCentsPerMillion: 6000 },
  "anthropic/claude-3.7-sonnet": { inputCentsPerMillion: 300, outputCentsPerMillion: 1500 },
  "google/gemini-2.5-pro": { inputCentsPerMillion: 125, outputCentsPerMillion: 500 },
  "meta-llama/llama-3.3-70b-instruct": { inputCentsPerMillion: 12, outputCentsPerMillion: 30 },
  "deepseek/deepseek-chat": { inputCentsPerMillion: 14, outputCentsPerMillion: 28 },
  "mistralai/mistral-large": { inputCentsPerMillion: 200, outputCentsPerMillion: 600 },
  "x-ai/grok-2": { inputCentsPerMillion: 200, outputCentsPerMillion: 1000 },
};

const DEFAULT_RATE: Rate = { inputCentsPerMillion: 300, outputCentsPerMillion: 1500 };

export function estimateCostCents(model: string, inputTokens: number, outputTokens: number): number {
  const rate = RATES[model] ?? DEFAULT_RATE;
  const cents = (inputTokens * rate.inputCentsPerMillion + outputTokens * rate.outputCentsPerMillion) / 1_000_000;
  return Math.round(cents);
}
