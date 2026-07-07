import { GoogleGenerativeAI } from "@google/generative-ai";
import type { SecretsVault } from "../security/secrets-vault.js";

/**
 * Embeddings ride the Google API (text-embedding-004) since that key is
 * already part of this app's provider setup and Anthropic doesn't offer a
 * public embeddings endpoint. Falls back to keyword search (see
 * memory/embedding-index.ts) when no Google key is configured, so this is
 * additive, not a hard requirement.
 */
export async function embedText(vault: SecretsVault, text: string): Promise<number[]> {
  const apiKey = await vault.get("google_api_key");
  if (!apiKey) {
    throw new Error("Google API key not configured — embeddings require it even if you're chatting through Anthropic");
  }
  const client = new GoogleGenerativeAI(apiKey);
  const model = client.getGenerativeModel({ model: "text-embedding-004" });
  const result = await model.embedContent(text.slice(0, 20_000));
  return result.embedding.values;
}

export function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}
