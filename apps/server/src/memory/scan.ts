import { readdirSync, statSync } from "node:fs";
import path from "node:path";

export interface MemoryCandidate {
  path: string;
  source: string;
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

/** Every place memory is scanned (keyword search, embedding reindex) walks the same three roots with the same source-tagging convention. */
export function scanMemoryCandidates(dirs: { vaultDir: string; libraryDir: string; projectsDir: string }): MemoryCandidate[] {
  return [
    ...walkFiles(dirs.vaultDir).map((p) => ({ path: p, source: `note:${path.relative(dirs.vaultDir, p)}` })),
    ...walkFiles(dirs.libraryDir).map((p) => ({ path: p, source: `library:${path.relative(dirs.libraryDir, p)}` })),
    ...walkFiles(dirs.projectsDir).map((p) => ({ path: p, source: `file:${path.relative(dirs.projectsDir, p)}` })),
  ];
}
