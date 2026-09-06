// Pure, side-effect-free helpers for decision-first-notice.
//
// P-27 — the successor read as one thread. `client_decisions
// .predecessor_decision_id` (00463) already links a revision to the edition it
// replaces, and `supersede_project_approval_decision` (00464) writes the pair
// in one transaction; nothing until now read that link into the letter, so a
// homeowner who had already answered edition 3 received an announcement for
// edition 4 that said nothing about edition 3 at all.
//
// Everything here is evidence-bound: a field that cannot be computed from the
// two frozen artifacts and the predecessor's own answer is simply absent, and
// the renderer omits the sentence that would have carried it.

import type { SupersededEdition } from "../_shared/decision-notify.ts";
import { receiptOutcomeWord } from "../_shared/decision-notify.ts";
import { toOne } from "../_shared/project-approval-notification.ts";

/** The delta columns on one `project_approval_artifacts` row. */
export interface ArtifactDeltas {
  source_version?: number | null;
  artifact_title?: string | null;
  cost_cents_delta?: number | null;
  schedule_days_delta?: number | null;
  lead_time_days_delta?: number | null;
}

export interface PredecessorRow {
  id?: string | null;
  responded_at?: string | null;
  approval_artifact?: ArtifactDeltas | ArtifactDeltas[] | null;
  options?: Array<{ approval_outcome?: string | null; selected?: boolean | null }> | null;
}

/** The difference between two integers, or null when either side is missing. */
function difference(
  successor: number | null | undefined,
  predecessor: number | null | undefined,
): number | null {
  if (typeof successor !== "number" || typeof predecessor !== "number") {
    return null;
  }
  if (!Number.isFinite(successor) || !Number.isFinite(predecessor)) return null;
  return successor - predecessor;
}

/**
 * What the successor's letter may say about the edition it replaces.
 *
 * Returns null when there is no predecessor at all, or when the predecessor
 * carries no artifact to name an edition by — the letter then falls back to the
 * ordinary first notice rather than opening on a thread it cannot describe.
 */
export function resolveSupersededEdition(
  predecessor: PredecessorRow | null | undefined,
  successorArtifact: ArtifactDeltas | null | undefined,
): SupersededEdition | null {
  if (!predecessor) return null;
  const previousArtifact = toOne(predecessor.approval_artifact ?? null);
  const version = previousArtifact?.source_version;
  if (!Number.isInteger(version) || (version ?? 0) <= 0) return null;

  const chosen = (predecessor.options ?? []).find((option) => option?.selected);
  const outcome = predecessor.responded_at
    ? receiptOutcomeWord(chosen?.approval_outcome ?? null)
    : null;

  const edition: SupersededEdition = {
    version: version as number,
    title: previousArtifact?.artifact_title ?? null,
    // An answer date without an answer names nothing; an answer without a date
    // is the same fragment the other way round. Both or neither.
    answeredOn: outcome ? predecessor.responded_at ?? null : null,
    answeredOutcome: outcome,
  };

  const cost = difference(
    successorArtifact?.cost_cents_delta,
    previousArtifact?.cost_cents_delta,
  );
  const schedule = difference(
    successorArtifact?.schedule_days_delta,
    previousArtifact?.schedule_days_delta,
  );
  const lead = difference(
    successorArtifact?.lead_time_days_delta,
    previousArtifact?.lead_time_days_delta,
  );
  if (cost !== null) edition.costCentsDelta = cost;
  if (schedule !== null) edition.scheduleDaysDelta = schedule;
  if (lead !== null) edition.leadTimeDaysDelta = lead;

  return edition;
}
