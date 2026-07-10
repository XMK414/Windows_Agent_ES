import { describe, it, expect } from "vitest";
import { isBuildRestricted } from "./build-restriction.js";
import type { ChatProvider } from "./provider-adapter.interface.js";

function fake(buildRestricted?: boolean): ChatProvider {
  return {
    id: "x",
    requiresApiKey: true,
    buildRestricted,
    async listModels() {
      return [];
    },
    async *send() {},
  };
}

describe("isBuildRestricted", () => {
  it("is true only when the provider is flagged", () => {
    expect(isBuildRestricted(fake(true))).toBe(true);
    expect(isBuildRestricted(fake(false))).toBe(false);
    expect(isBuildRestricted(fake())).toBe(false);
    expect(isBuildRestricted(undefined)).toBe(false);
  });
});
