/**
 * Vault password policy: at least 12 characters, with at least two each of
 * lowercase, uppercase, digits, and the allowed special characters
 * (! @ # $ % ^ & * = +). Shared by the server (enforcement) and mirrored in the
 * web UI (live feedback) so both agree on what "strong enough" means.
 */
export const SPECIAL_CHARS = "!@#$%^&*=+";

export interface PasswordCheck {
  ok: boolean;
  failures: string[];
  counts: { lower: number; upper: number; digit: number; special: number; length: number };
}

export function checkVaultPassword(pw: string): PasswordCheck {
  const lower = (pw.match(/[a-z]/g) ?? []).length;
  const upper = (pw.match(/[A-Z]/g) ?? []).length;
  const digit = (pw.match(/[0-9]/g) ?? []).length;
  const special = (pw.match(/[!@#$%^&*=+]/g) ?? []).length;
  const length = pw.length;

  const failures: string[] = [];
  if (length < 12) failures.push("at least 12 characters");
  if (lower < 2) failures.push("at least 2 lowercase letters");
  if (upper < 2) failures.push("at least 2 uppercase letters");
  if (digit < 2) failures.push("at least 2 numbers");
  if (special < 2) failures.push(`at least 2 special characters (${SPECIAL_CHARS})`);

  return { ok: failures.length === 0, failures, counts: { lower, upper, digit, special, length } };
}
