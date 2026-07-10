// Mirror of the server's password policy (security/password-policy.ts) so the
// vault page can give live feedback. Keep the two in sync.
export const SPECIAL_CHARS = "!@#$%^&*=+";

export interface PasswordCheck {
  ok: boolean;
  failures: string[];
}

export function checkVaultPassword(pw: string): PasswordCheck {
  const lower = (pw.match(/[a-z]/g) ?? []).length;
  const upper = (pw.match(/[A-Z]/g) ?? []).length;
  const digit = (pw.match(/[0-9]/g) ?? []).length;
  const special = (pw.match(/[!@#$%^&*=+]/g) ?? []).length;

  const failures: string[] = [];
  if (pw.length < 12) failures.push("at least 12 characters");
  if (lower < 2) failures.push("2+ lowercase letters");
  if (upper < 2) failures.push("2+ uppercase letters");
  if (digit < 2) failures.push("2+ numbers");
  if (special < 2) failures.push(`2+ special characters (${SPECIAL_CHARS})`);

  return { ok: failures.length === 0, failures };
}

export async function sha256Hex(text: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
