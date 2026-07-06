import { createHash } from "node:crypto";
import { appendFileSync, readFileSync, existsSync } from "node:fs";

export interface AuditEntryInput {
  action: string;
  actor: string;
  target: string;
  detail?: unknown;
}

export interface AuditEntry extends AuditEntryInput {
  id: string;
  ts: string;
  prevHash: string;
  hash: string;
}

/**
 * Append-only, hash-chained audit log. Tampering with (or deleting) a past
 * line breaks every subsequent hash, so silent edits are detectable even
 * though this is a local file, not a distributed ledger.
 */
export class AuditLog {
  private lastHash = "genesis";

  constructor(private readonly filePath: string) {
    if (existsSync(filePath)) {
      const lines = readFileSync(filePath, "utf8").trim().split("\n").filter(Boolean);
      if (lines.length > 0) {
        const last: AuditEntry = JSON.parse(lines[lines.length - 1]);
        this.lastHash = last.hash;
      }
    }
  }

  async append(input: AuditEntryInput): Promise<string> {
    const id = crypto.randomUUID();
    const ts = new Date().toISOString();
    const prevHash = this.lastHash;

    const payload = JSON.stringify({ id, ts, prevHash, ...input, detail: redact(input.detail) });
    const hash = createHash("sha256").update(payload).digest("hex");

    const entry: AuditEntry = { id, ts, prevHash, hash, ...input, detail: redact(input.detail) };
    appendFileSync(this.filePath, JSON.stringify(entry) + "\n", { mode: 0o600 });

    this.lastHash = hash;
    return id;
  }

  /** Walks the file and returns false at the first broken link in the chain. */
  verifyChain(): boolean {
    if (!existsSync(this.filePath)) return true;
    const lines = readFileSync(this.filePath, "utf8").trim().split("\n").filter(Boolean);

    let expectedPrev = "genesis";
    for (const line of lines) {
      const entry: AuditEntry = JSON.parse(line);
      if (entry.prevHash !== expectedPrev) return false;

      const { hash, ...rest } = entry;
      const recomputed = createHash("sha256").update(JSON.stringify(rest)).digest("hex");
      if (recomputed !== hash) return false;

      expectedPrev = hash;
    }
    return true;
  }
}

const SECRET_KEY_PATTERN = /key|token|secret|cookie|password/i;

/** Never let a secret sourced from the vault or a session cookie land in the log. */
function redact(detail: unknown): unknown {
  if (detail == null || typeof detail !== "object") return detail;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(detail as Record<string, unknown>)) {
    out[k] = SECRET_KEY_PATTERN.test(k) ? "[redacted]" : v;
  }
  return out;
}
