import { spawn } from "node:child_process";
import { resolveJailedPath } from "./path-jail.js";
import type { AuditLog } from "./audit-log.js";

export interface CliResult {
  exitCode: number | null;
  stdout: string;
  stderr: string;
}

export interface CliExecutorOptions {
  allowlist: readonly string[];
  projectRoot: string;
  auditLog: AuditLog;
  actor: string; // e.g. "user" or "agent:claude-2"
  requireConfirmation: (cmd: string, args: string[]) => Promise<boolean>;
}

/**
 * Runs a single allowlisted command with argv-array args (never a shell
 * string) inside a path-jailed cwd. This is the only way the embedded
 * terminal, cron jobs, or an agent's "run this command" suggestion are
 * allowed to touch the OS.
 */
export class CliExecutor {
  constructor(private readonly opts: CliExecutorOptions) {}

  async run(cmd: string, args: string[], relativeCwd: string): Promise<CliResult> {
    if (!this.opts.allowlist.includes(cmd)) {
      throw new Error(`Command "${cmd}" is not in the allowlist`);
    }

    const cwd = resolveJailedPath(this.opts.projectRoot, relativeCwd);

    if (this.opts.actor.startsWith("agent:")) {
      const confirmed = await this.opts.requireConfirmation(cmd, args);
      if (!confirmed) {
        throw new Error("Command execution declined by user");
      }
    }

    // Logged before spawning so a hang or crash still leaves a record that
    // the command was attempted.
    const entryId = await this.opts.auditLog.append({
      action: "cli.run.start",
      actor: this.opts.actor,
      target: cmd,
      detail: { args, cwd },
    });

    return new Promise<CliResult>((resolve, reject) => {
      const child = spawn(cmd, args, { cwd, shell: false });

      let stdout = "";
      let stderr = "";
      child.stdout.on("data", (chunk) => (stdout += chunk));
      child.stderr.on("data", (chunk) => (stderr += chunk));

      child.on("error", async (err) => {
        await this.opts.auditLog.append({
          action: "cli.run.error",
          actor: this.opts.actor,
          target: cmd,
          detail: { entryId, message: err.message },
        });
        reject(err);
      });

      child.on("close", async (exitCode) => {
        await this.opts.auditLog.append({
          action: "cli.run.end",
          actor: this.opts.actor,
          target: cmd,
          detail: { entryId, exitCode, stdoutBytes: stdout.length, stderrBytes: stderr.length },
        });
        resolve({ exitCode, stdout, stderr });
      });
    });
  }
}
