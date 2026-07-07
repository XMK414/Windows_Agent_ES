import type { ChatProvider, Message } from "./provider-adapter.interface.js";

/** Drains a provider's stream into a single string — for callers (Board of Directors, TermLens) that need the full response, not incremental deltas. */
export async function collectFull(
  provider: ChatProvider,
  model: string,
  messages: Message[],
  injectedContext: string[],
): Promise<string> {
  let text = "";
  for await (const chunk of provider.send({ threadId: "collect", model, messages, injectedContext })) {
    if (chunk.type === "delta" && chunk.text) text += chunk.text;
    if (chunk.type === "error") throw new Error(chunk.error);
  }
  return text;
}
