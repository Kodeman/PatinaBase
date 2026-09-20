import type { GateAssertion, GateCase } from "../types.ts";
import { parseFieldMessage } from "../../../_shared/field-parse.ts";
import type { InboundDeps } from "../../../sms-inbound/pipeline.ts";

/**
 * The real parser where the pipeline asks for one. InboundDeps types parseFn's
 * second parameter as `unknown`, which no concretely-typed parser can accept, so
 * the harness narrows those deps back to what parseFieldMessage takes and
 * forwards exactly what the pipeline handed over.
 */
export const realParseFn: NonNullable<InboundDeps["parseFn"]> = (input, deps) =>
  parseFieldMessage(input, isObject(deps) ? deps : {});

/**
 * Read one field off a value the fake types as `unknown` (its rows are
 * Record<string, unknown>), without claiming a shape for the whole value.
 */
export function readField(value: unknown, key: string): unknown {
  return isObject(value) ? value[key] : undefined;
}

/**
 * Name the shape a case reads out of a fake JSON column or RPC payload, after
 * checking it really is an object. One narrowing point instead of a cast at
 * every read.
 */
export function jsonObject<T extends object>(value: unknown, what: string): T {
  if (!isObject(value)) {
    throw new Error(`${what} is not an object: ${JSON.stringify(value)}`);
  }
  return value as T;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

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
