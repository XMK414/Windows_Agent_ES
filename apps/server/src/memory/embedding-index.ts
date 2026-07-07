import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import type Database from "better-sqlite3";
import { embedText, cosineSimilarity } from "../adapters/embeddings.js";
import type { SecretsVault } from "../security/secrets-vault.js";
import { scanMemoryCandidates } from "./scan.js";

export interface EmbeddingHit {
  source: string;
  snippet: string;
  score: number;
}

/**
 * Real semantic search over the same vault/library/project content the
 * keyword search covers — same source-citation contract, so the route
 * layer can prefer this and fall back to keyword search transparently
 * when no Google key is configured (embeddings need one; see
 * adapters/embeddings.ts).
 */
export class EmbeddingIndex {
  constructor(
    private readonly db: Database.Database,
    private readonly vault: SecretsVault,
    private readonly dirs: { vaultDir: string; libraryDir: string; projectsDir: string },
  ) {}

  async reindex(): Promise<{ indexed: number; skipped: number; failed: number }> {
    const candidates = scanMemoryCandidates(this.dirs);
    let indexed = 0;
    let skipped = 0;
    let failed = 0;

    for (const candidate of candidates) {
      const content = readFileSync(candidate.path, "utf8");
      const hash = createHash("sha256").update(content).digest("hex");

      const existing = this.db.prepare(`SELECT content_hash FROM memory_embeddings WHERE source = ?`).get(candidate.source) as
        | { content_hash: string }
        | undefined;
      if (existing?.content_hash === hash) {
        skipped++;
        continue;
      }

      try {
        const embedding = await embedText(this.vault, content);
        const snippet = content.slice(0, 240).replace(/\s+/g, " ").trim();
        this.db
          .prepare(
            `INSERT INTO memory_embeddings (source, content_hash, embedding_json, snippet, updated_at)
             VALUES (?, ?, ?, ?, ?)
             ON CONFLICT(source) DO UPDATE SET content_hash = excluded.content_hash, embedding_json = excluded.embedding_json, snippet = excluded.snippet, updated_at = excluded.updated_at`,
          )
          .run(candidate.source, hash, JSON.stringify(embedding), snippet, new Date().toISOString());
        indexed++;
      } catch {
        failed++;
      }
    }

    return { indexed, skipped, failed };
  }

  isAvailable(): boolean {
    const row = this.db.prepare(`SELECT COUNT(*) as count FROM memory_embeddings`).get() as { count: number };
    return row.count > 0;
  }

  async query(q: string, topK = 8): Promise<EmbeddingHit[]> {
    const queryEmbedding = await embedText(this.vault, q);
    const rows = this.db.prepare(`SELECT source, embedding_json, snippet FROM memory_embeddings`).all() as {
      source: string;
      embedding_json: string;
      snippet: string;
    }[];

    const hits = rows.map((row) => ({
      source: row.source,
      snippet: row.snippet,
      score: cosineSimilarity(queryEmbedding, JSON.parse(row.embedding_json)),
    }));

    hits.sort((a, b) => b.score - a.score);
    return hits.slice(0, topK);
  }
}
