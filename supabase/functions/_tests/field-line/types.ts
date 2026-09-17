export type AssertionStatus = "pass" | "fail" | "skip";

export interface GateAssertion {
  caseId: string;
  clause: string;
  status: AssertionStatus;
  reason: string;
}

export interface GateCase {
  id: string;
  phase: number;
  clauses: string[];
  skip?: { unblockedBy: string };
  run: () => Promise<GateAssertion[]>;
}
