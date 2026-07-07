import { resolveJailedPath } from "../security/path-jail";
import { readFileSync } from "node:fs";

export type TrustLevel = "user" | "human-authored" | "agent-authored" | "web-fetched";

export interface InjectionRef {
  kind: "file" | "note" | "library" | "artifact";
  /** e.g. "projects/acme/notes/kickoff.md" or "persona/skeptical-reviewer" */
  ref: string;
}

export interface ResolvedInjection {
  source: string;
  trust: TrustLevel;
  block: string;
}

export interface LibraryIndex {
  /** Looks up a library item's owner + body by ref (e.g. "persona/skeptical-reviewer"). */
  lookup(ref: string): { owner: "human" | "agent"; body: string } | undefined;
}

/**
 * Turns @mention references into fenced, provenance-tagged blocks. This is
 * the single place untrusted content crosses into a model's context, so it
 * never returns a bare string — every block carries a source and a trust
 * tag the adapter's system prompt is told how to interpret.
 */
export class ContextResolver {
  constructor(
    private readonly projectRoot: string,
    private readonly library: LibraryIndex,
  ) {}

  resolve(refs: InjectionRef[]): ResolvedInjection[] {
    return refs.map((ref) => this.resolveOne(ref));
  }

  private resolveOne(ref: InjectionRef): ResolvedInjection {
    switch (ref.kind) {
      case "file":
      case "artifact": {
        const path = resolveJailedPath(this.projectRoot, ref.ref);
        const content = readFileSync(path, "utf8");
        const trust: TrustLevel = "user";
        return { source: `${ref.kind}:${ref.ref}`, trust, block: fence(ref.kind, ref.ref, trust, content) };
      }
      case "note": {
        const path = resolveJailedPath(this.projectRoot, ref.ref);
        const content = readFileSync(path, "utf8");
        const trust: TrustLevel = "user";
        return { source: `note:${ref.ref}`, trust, block: fence("note", ref.ref, trust, content) };
      }
      case "library": {
        const item = this.library.lookup(ref.ref);
        if (!item) throw new Error(`Unknown library item: ${ref.ref}`);
        const trust: TrustLevel = item.owner === "human" ? "human-authored" : "agent-authored";
        return { source: `library:${ref.ref}`, trust, block: fence("library", ref.ref, trust, item.body) };
      }
    }
  }
}

function fence(kind: string, ref: string, trust: TrustLevel, content: string): string {
  return `<injected-context source="${kind}:${ref}" trust="${trust}">\n${content}\n</injected-context>`;
}
