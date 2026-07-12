import { describe, it, expect } from "vitest";
import { PROJECT_PHASES, isProjectPhase } from "./phases.js";

describe("project phases", () => {
  it("has the five lifecycle phases in order", () => {
    expect(PROJECT_PHASES).toEqual(["DISCOVERY", "ARCHITECTURE", "CONSTRUCTION", "VERIFY_QUALITY", "SHIP"]);
  });

  it("validates phase values", () => {
    expect(isProjectPhase("SHIP")).toBe(true);
    expect(isProjectPhase("discovery")).toBe(false);
    expect(isProjectPhase("NOPE")).toBe(false);
    expect(isProjectPhase(3)).toBe(false);
  });
});
