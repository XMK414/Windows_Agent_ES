import type { ChatProvider, Message } from "./provider-adapter.interface.js";

/** Drains a provider's stream into a single string — for callers (Board of Directors, TermLens) that need the full response, not incremental deltas. */
export async function collectFull(
  provider: ChatProvider,
  model: string,
  messages: Message[],
  injectedContext: string[],
): Promise<string> {
  const { text } = await collectFullWithUsage(provider, model, messages, injectedContext);
  return text;
}

/** Same as collectFull but also returns token usage — for callers (scheduled jobs) that need to post to the cost ledger. */
export async function collectFullWithUsage(
  provider: ChatProvider,
  model: string,
  messages: Message[],
  injectedContext: string[],
): Promise<{ text: string; usage?: { inputTokens: number; outputTokens: number } }> {
  let text = "";
  let usage: { inputTokens: number; outputTokens: number } | undefined;
  for await (const chunk of provider.send({ threadId: "collect", model, messages, injectedContext })) {
    if (chunk.type === "delta" && chunk.text) text += chunk.text;
    if (chunk.type === "done" && chunk.usage) usage = chunk.usage;
    if (chunk.type === "error") throw new Error(chunk.error);
  }
  return { text, usage };
}
