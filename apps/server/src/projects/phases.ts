/** The lifecycle phase a project sits in. Ordered from earliest to shipped. */
export const PROJECT_PHASES = ["DISCOVERY", "ARCHITECTURE", "CONSTRUCTION", "VERIFY_QUALITY", "SHIP"] as const;

export type ProjectPhase = (typeof PROJECT_PHASES)[number];

export function isProjectPhase(v: unknown): v is ProjectPhase {
  return typeof v === "string" && (PROJECT_PHASES as readonly string[]).includes(v);
}
