import { describe, it, expect } from "vitest";
import { checkVaultPassword } from "./password-policy.js";

describe("checkVaultPassword", () => {
  it("accepts a password meeting every rule", () => {
    const res = checkVaultPassword("aaBB11!!ccDD"); // 2+ lower, upper, digit, special; 12 chars
    expect(res.ok).toBe(true);
    expect(res.failures).toEqual([]);
  });

  it("rejects when shorter than 12 characters", () => {
    const res = checkVaultPassword("aB1!aB1!"); // 8 chars
    expect(res.ok).toBe(false);
    expect(res.failures).toContain("at least 12 characters");
  });

  it("requires two of each character class", () => {
    const res = checkVaultPassword("aBcdefghij1!"); // 1 upper, 1 digit, 1 special
    expect(res.ok).toBe(false);
    expect(res.failures).toContain("at least 2 uppercase letters");
    expect(res.failures).toContain("at least 2 numbers");
    expect(res.failures.some((f) => f.startsWith("at least 2 special"))).toBe(true);
  });

  it("counts only the allowed special characters", () => {
    // '(' and ')' are not in the allowed set, so specials stay at 0.
    const res = checkVaultPassword("aaBBccDD11()");
    expect(res.counts.special).toBe(0);
    expect(res.ok).toBe(false);
  });
});
