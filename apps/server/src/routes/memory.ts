import type { Express } from "express";
import { readFileSync } from "node:fs";
import { scanMemoryCandidates } from "../memory/scan.js";
import type { EmbeddingIndex } from "../memory/embedding-index.js";

interface SearchHit {
  source: string;
  snippet: string;
  score: number;
}

function scoreAndSnippet(content: string, terms: string[]): { score: number; snippet: string } {
  const lower = content.toLowerCase();
  let score = 0;
  let firstIndex = -1;
  for (const term of terms) {
    let idx = lower.indexOf(term);
    while (idx !== -1) {
      score += 1;
      if (firstIndex === -1) firstIndex = idx;
      idx = lower.indexOf(term, idx + term.length);
    }
  }
  const start = Math.max(0, firstIndex - 80);
  const snippet = content.slice(start, start + 240).replace(/\s+/g, " ").trim();
  return { score, snippet };
}

function keywordSearch(dirs: { vaultDir: string; libraryDir: string; projectsDir: string }, q: string): SearchHit[] {
  const terms = q.toLowerCase().split(/\s+/).filter(Boolean);
  const candidates = scanMemoryCandidates(dirs);

  const hits: SearchHit[] = [];
  for (const candidate of candidates) {
    const content = readFileSync(candidate.path, "utf8");
    const { score, snippet } = scoreAndSnippet(content, terms);
    if (score > 0) hits.push({ source: candidate.source, snippet, score });
  }
  hits.sort((a, b) => b.score - a.score);
  return hits.slice(0, 20);
}

/**
 * Prefers the real embedding index (see memory/embedding-index.ts) and
 * transparently falls back to keyword search when no embeddings have been
 * indexed yet or the Google key needed to embed the query isn't
 * configured — the response's `mode` field tells the UI which one ran.
 */
export function registerMemoryRoutes(
  app: Express,
  deps: { vaultDir: string; projectsDir: string; libraryDir: string; embeddingIndex: EmbeddingIndex },
): void {
  const { vaultDir, projectsDir, libraryDir, embeddingIndex } = deps;
  const dirs = { vaultDir, libraryDir, projectsDir };

  app.get("/api/memory/query", async (req, res) => {
    const q = typeof req.query.q === "string" ? req.query.q.trim() : "";
    if (!q) return res.status(400).json({ error: "q required" });

    if (embeddingIndex.isAvailable()) {
      try {
        const hits = await embeddingIndex.query(q);
        return res.json({ query: q, mode: "embedding", hits });
      } catch {
        // Falls through to keyword search — e.g. the Google key was
        // removed after indexing, or a transient API error.
      }
    }

    res.json({ query: q, mode: "keyword", hits: keywordSearch(dirs, q) });
  });

  app.post("/api/memory/reindex", async (_req, res) => {
    try {
      const result = await embeddingIndex.reindex();
      res.json(result);
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });
}
