import { readFileSync, readdirSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import path from "node:path";
import matter from "gray-matter";
import type { LibraryIndex } from "../injection/context-resolver.js";

export const LIBRARY_TYPES = ["prompts", "agents", "rules", "skills", "personas"] as const;
export type LibraryType = (typeof LIBRARY_TYPES)[number];

interface LibraryEntry {
  owner: "human" | "agent";
  body: string;
}

export interface LibraryListItem {
  ref: string;
  type: string; // singular, e.g. "persona"
  name: string;
  tags: string[];
  owner: "human" | "agent";
}

/**
 * Scans `library-templates/<type>/*.md` and indexes it by "type/slug" ref
 * (e.g. "persona/skeptical-reviewer"). The markdown file is the source of
 * truth — this is just an in-memory read-through cache for lookups and
 * listing; writes go straight back to the file, then reload the cache.
 */
export class FileLibraryIndex implements LibraryIndex {
  private entries = new Map<string, LibraryEntry>();
  private listItems: LibraryListItem[] = [];

  constructor(private readonly libraryRoot: string) {
    this.reload();
  }

  reload(): void {
    this.entries.clear();
    this.listItems = [];

    for (const type of LIBRARY_TYPES) {
      const dir = path.join(this.libraryRoot, type);
      let files: string[] = [];
      try {
        files = readdirSync(dir).filter((f) => f.endsWith(".md"));
      } catch {
        continue; // library-templates/<type> not present — not fatal
      }

      const singular = type.replace(/s$/, "");
      for (const file of files) {
        const raw = readFileSync(path.join(dir, file), "utf8");
        const { data, content } = matter(raw);
        const slug = file.replace(/\.md$/, "");
        const owner: "human" | "agent" = data.owner === "agent" ? "agent" : "human";
        const ref = `${singular}/${slug}`;

        this.entries.set(ref, { owner, body: content.trim() });
        this.listItems.push({
          ref,
          type: singular,
          name: typeof data.name === "string" ? data.name : slug,
          tags: Array.isArray(data.tags) ? data.tags : [],
          owner,
        });
      }
    }
  }

  lookup(ref: string): LibraryEntry | undefined {
    return this.entries.get(ref);
  }

  list(filter?: { type?: string; query?: string }): LibraryListItem[] {
    return this.listItems.filter((item) => {
      if (filter?.type && item.type !== filter.type) return false;
      if (filter?.query) {
        const q = filter.query.toLowerCase();
        if (!item.name.toLowerCase().includes(q) && !item.tags.some((t) => t.toLowerCase().includes(q))) {
          return false;
        }
      }
      return true;
    });
  }

  /**
   * `actor` distinguishes a human request from an agent-initiated one — an
   * agent may never create or overwrite an `owner: human` item, even by
   * calling this method directly, matching docs/SECURITY.md §8.
   */
  create(
    actor: "human" | "agent",
    type: LibraryType,
    slug: string,
    fields: { name: string; tags: string[]; body: string; owner: "human" | "agent" },
  ): void {
    const singular = type.replace(/s$/, "");
    const ref = `${singular}/${slug}`;
    const existing = this.entries.get(ref);

    if (existing && existing.owner === "human" && actor === "agent") {
      throw new Error(`Refusing agent write to human-owned library item "${ref}"`);
    }
    if (fields.owner === "human" && actor === "agent") {
      throw new Error(`Agents may not create owner:human library items ("${ref}")`);
    }

    const dir = path.join(this.libraryRoot, type);
    mkdirSync(dir, { recursive: true });

    const frontmatter = { type: singular, name: fields.name, tags: fields.tags, owner: fields.owner, version: 1 };
    const file = matter.stringify(fields.body, frontmatter);
    writeFileSync(path.join(dir, `${slug}.md`), file, "utf8");
    this.reload();
  }
}
