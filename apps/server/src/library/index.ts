import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import matter from "gray-matter";
import type { LibraryIndex } from "../injection/context-resolver.js";

interface LibraryEntry {
  owner: "human" | "agent";
  body: string;
}

/**
 * Scans `library-templates/<type>/*.md` and indexes it by "type/slug" ref
 * (e.g. "persona/skeptical-reviewer"). The markdown file is the source of
 * truth — this is just an in-memory read-through cache for lookups.
 */
export class FileLibraryIndex implements LibraryIndex {
  private entries = new Map<string, LibraryEntry>();

  constructor(private readonly libraryRoot: string) {
    this.reload();
  }

  reload(): void {
    this.entries.clear();
    const types = ["prompts", "agents", "rules", "skills", "personas"];

    for (const type of types) {
      const dir = path.join(this.libraryRoot, type);
      let files: string[] = [];
      try {
        files = readdirSync(dir).filter((f) => f.endsWith(".md"));
      } catch {
        continue; // library-templates/<type> not present — not fatal
      }

      for (const file of files) {
        const raw = readFileSync(path.join(dir, file), "utf8");
        const { data, content } = matter(raw);
        const slug = file.replace(/\.md$/, "");
        const singular = type.replace(/s$/, "");
        const owner: "human" | "agent" = data.owner === "agent" ? "agent" : "human";
        this.entries.set(`${singular}/${slug}`, { owner, body: content.trim() });
      }
    }
  }

  lookup(ref: string): LibraryEntry | undefined {
    return this.entries.get(ref);
  }
}
