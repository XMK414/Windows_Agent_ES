import * as cron from "node-cron";
import { v4 as uuid } from "uuid";
import type Database from "better-sqlite3";
import { writeFileSync, mkdirSync } from "node:fs";
import matter from "gray-matter";
import type { ChatProvider } from "../adapters/provider-adapter.interface.js";
import { collectFullWithUsage } from "../adapters/collect.js";
import { estimateCostCents } from "../adapters/pricing.js";
import type { FileLibraryIndex } from "../library/index.js";
import { resolveJailedPath } from "../security/path-jail.js";
import type { AuditLog } from "../security/audit-log.js";

interface JobRow {
  id: string;
  name: string;
  cron: string;
  adapter: string;
  model: string;
  prompt_ref: string;
  enabled: number;
  cost_cap_cents: number;
}

/**
 * Scheduled jobs are the one surface in this app that runs completely
 * unattended, which is exactly why docs/SECURITY.md restricts them to
 * API-key adapters (never a web-session adapter) and enforces a per-job
 * spend cap *before* dispatch, not just reported after the fact.
 */
export class JobScheduler {
  private tasks = new Map<string, cron.ScheduledTask>();

  constructor(
    private readonly db: Database.Database,
    private readonly providers: Map<string, ChatProvider>,
    private readonly library: FileLibraryIndex,
    private readonly vaultDir: string,
    private readonly auditLog: AuditLog,
  ) {
    mkdirSync(resolveJailedPath(this.vaultDir, "job-runs"), { recursive: true });
  }

  start(): void {
    const rows = this.db.prepare(`SELECT * FROM jobs WHERE enabled = 1`).all() as JobRow[];
    for (const row of rows) this.schedule(row);
  }

  schedule(row: JobRow): void {
    this.unschedule(row.id);
    const task = cron.schedule(row.cron, () => {
      this.runJob(row.id).catch((err) => {
        this.auditLog.append({ action: "job.run.error", actor: "scheduler", target: row.id, detail: { message: String(err) } });
      });
    });
    this.tasks.set(row.id, task);
  }

  unschedule(jobId: string): void {
    this.tasks.get(jobId)?.stop();
    this.tasks.delete(jobId);
  }

  async runJob(jobId: string): Promise<{ text: string }> {
    const job = this.db.prepare(`SELECT * FROM jobs WHERE id = ?`).get(jobId) as JobRow | undefined;
    if (!job) throw new Error(`Unknown job ${jobId}`);

    const provider = this.providers.get(job.adapter);
    if (!provider) throw new Error(`Unknown provider "${job.adapter}"`);
    if (!provider.requiresApiKey) {
      // Belt-and-suspenders: even if a web-session adapter is ever
      // registered under this id, scheduled jobs must never use it.
      throw new Error(`Job "${job.name}" references a non-API-key adapter — refusing to run unattended`);
    }

    const spentCents = this.spendSoFar(job.id);
    if (spentCents >= job.cost_cap_cents) {
      await this.auditLog.append({ action: "job.run.skipped_cost_cap", actor: "scheduler", target: job.id, detail: { spentCents, cap: job.cost_cap_cents } });
      return { text: "" };
    }

    const promptItem = this.library.lookup(job.prompt_ref);
    if (!promptItem) throw new Error(`Unknown prompt "${job.prompt_ref}"`);

    await this.auditLog.append({ action: "job.run.start", actor: "scheduler", target: job.id, detail: { name: job.name } });

    const threadId = uuid();
    const now = new Date().toISOString();
    this.db
      .prepare(`INSERT INTO threads (id, pane_id, provider, model, created_at) VALUES (?, ?, ?, ?, ?)`)
      .run(threadId, `job:${job.id}`, job.adapter, job.model, now);

    const { text, usage } = await collectFullWithUsage(provider, job.model, [{ role: "user", content: promptItem.body }], []);

    if (usage) {
      const costCents = estimateCostCents(job.model, usage.inputTokens, usage.outputTokens);
      this.db
        .prepare(
          `INSERT INTO cost_ledger (id, provider, model, tokens_in, tokens_out, cost_cents, thread_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(uuid(), job.adapter, job.model, usage.inputTokens, usage.outputTokens, costCents, threadId, new Date().toISOString());
    }

    const relPath = `job-runs/${job.id}-${Date.now()}.md`;
    writeFileSync(
      resolveJailedPath(this.vaultDir, relPath),
      matter.stringify(text, { job_id: job.id, job_name: job.name, adapter: job.adapter, model: job.model, ran_at: now }),
      "utf8",
    );

    this.db.prepare(`UPDATE jobs SET last_run_at = ? WHERE id = ?`).run(now, job.id);
    await this.auditLog.append({ action: "job.run.end", actor: "scheduler", target: job.id, detail: { outputBytes: text.length } });

    return { text };
  }

  /** Sums cost across every thread this job has ever run (pane_id `job:<id>`), not just today's — a simple, conservative all-time cap. */
  private spendSoFar(jobId: string): number {
    const row = this.db
      .prepare(
        `SELECT COALESCE(SUM(cost_ledger.cost_cents), 0) as total
         FROM cost_ledger JOIN threads ON threads.id = cost_ledger.thread_id
         WHERE threads.pane_id = ?`,
      )
      .get(`job:${jobId}`) as { total: number };
    return row.total;
  }
}
