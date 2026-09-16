import type { GateAssertion, GateCase } from "../types.ts";

export function blockedCase(
  id: string,
  phase: number,
  clauses: string[],
  unblockedBy: string,
): GateCase {
  return {
    id,
    phase,
    clauses,
    skip: { unblockedBy },
    run: async (): Promise<GateAssertion[]> => clauses.map((clause) => ({
      caseId: id,
      clause,
      status: "skip",
      reason: `awaits ${unblockedBy}`,
    })),
  };
}
