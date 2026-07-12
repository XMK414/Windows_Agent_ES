import { describe, it, expect } from "vitest";
import { ROUTINES, routineDurationMin, type BreakCategory } from "./breakContent";

describe("break routines", () => {
  it("has routines in every category, each with timed steps", () => {
    for (const key of Object.keys(ROUTINES) as BreakCategory[]) {
      expect(ROUTINES[key].length).toBeGreaterThan(0);
      for (const routine of ROUTINES[key]) {
        expect(routine.steps.length).toBeGreaterThan(1);
        for (const step of routine.steps) {
          expect(step.text.trim().length).toBeGreaterThan(0);
          expect(step.seconds).toBeGreaterThan(0);
        }
      }
    }
  });

  it("reports a positive whole-minute duration", () => {
    for (const key of Object.keys(ROUTINES) as BreakCategory[]) {
      for (const routine of ROUTINES[key]) {
        expect(routineDurationMin(routine)).toBeGreaterThanOrEqual(1);
      }
    }
  });
});
