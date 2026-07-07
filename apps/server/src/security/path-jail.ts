import { realpathSync, existsSync } from "node:fs";
import path from "node:path";

export class PathEscapeError extends Error {
  constructor(requested: string, root: string) {
    super(`Path "${requested}" escapes jail root "${root}"`);
    this.name = "PathEscapeError";
  }
}

/**
 * Resolves `requestedPath` against `root` and guarantees the result is
 * inside `root`. Used by every route/adapter/CLI call that touches disk —
 * never build a filesystem path by string concatenation instead.
 */
export function resolveJailedPath(root: string, requestedPath: string): string {
  const absoluteRoot = path.resolve(root);
  const candidate = path.resolve(absoluteRoot, requestedPath);

  if (candidate !== absoluteRoot && !candidate.startsWith(absoluteRoot + path.sep)) {
    throw new PathEscapeError(requestedPath, absoluteRoot);
  }

  // A symlink inside the root can still point outside it, so re-check the
  // real (post-symlink) path whenever the target already exists on disk.
  if (existsSync(candidate)) {
    const real = realpathSync(candidate);
    const realRoot = realpathSync(absoluteRoot);
    if (real !== realRoot && !real.startsWith(realRoot + path.sep)) {
      throw new PathEscapeError(requestedPath, absoluteRoot);
    }
  }

  return candidate;
}
