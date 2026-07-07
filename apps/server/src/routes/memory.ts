import type { Express } from "express";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

interface SearchHit {
  source: string;
  snippet: string;
  score: number;
}

function walkFiles(root: string): string[] {
  const out: string[] = [];
  function walk(dir: string) {
    let entries: string[] = [];
    try {
      entries = readdirSync(dir);
    } catch {
      return;
    }
    for (const name of entries) {
      const abs = path.join(dir, name);
      if (statSync(abs).isDirectory()) walk(abs);
      else if (name.endsWith(".md")) out.push(abs);
    }
  }
  walk(root);
  return out;
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

/**
 * Keyword-search MVP for the "NotebookLM-style" memory query — retrieves
 * across the Obsidian vault, library, and project files with a source
 * citation on every hit. docs/PLAN.md Phase 5 upgrades this to a real
 * embedding index; the citation-per-hit contract stays the same so the UI
 * doesn't need to change when that lands.
 */
export function registerMemoryRoutes(app: Express, deps: { vaultDir: string; projectsDir: string; libraryDir: string }): void {
  const { vaultDir, projectsDir, libraryDir } = deps;

  app.get("/api/memory/query", (req, res) => {
    const q = typeof req.query.q === "string" ? req.query.q.trim() : "";
    if (!q) return res.status(400).json({ error: "q required" });

    const terms = q.toLowerCase().split(/\s+/).filter(Boolean);
    const candidates = [
      ...walkFiles(vaultDir).map((p) => ({ path: p, source: `note:${path.relative(vaultDir, p)}` })),
      ...walkFiles(libraryDir).map((p) => ({ path: p, source: `library:${path.relative(libraryDir, p)}` })),
      ...walkFiles(projectsDir).map((p) => ({ path: p, source: `file:${path.relative(projectsDir, p)}` })),
    ];

    const hits: SearchHit[] = [];
    for (const candidate of candidates) {
      const content = readFileSync(candidate.path, "utf8");
      const { score, snippet } = scoreAndSnippet(content, terms);
      if (score > 0) hits.push({ source: candidate.source, snippet, score });
    }

    hits.sort((a, b) => b.score - a.score);
    res.json({ query: q, hits: hits.slice(0, 20) });
  });
}
