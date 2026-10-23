/**
 * N1 — a need's identity (US-25). One thing the studio owes is one line on
 * every surface, and the key is how two readings of it are known to be the
 * same thing: `${kind}:${recordId}` where the rule names one record (an
 * invoice, a PO, a proposal), `${kind}:project:${projectId}` for an aggregate
 * ("2 decisions overdue"). Read off the need's facts only — never its text,
 * its stamp or the clock — so the same inputs always give the same key.
 */

import type { NeedLine } from './desk-derivation';

export type NeedKey = string;

export function needKeyOf(need: Omit<NeedLine, 'key'>, projectId: string): NeedKey {
  // Approval and the buyer's subsequent Send are different acts on the same PO.
  if (need.releasedOrder) return `${need.kind}:${need.recordId}:released:${need.at}`;
  return need.recordId
    ? `${need.kind}:${need.recordId}`
    : `${need.kind}:project:${projectId}`;
}
