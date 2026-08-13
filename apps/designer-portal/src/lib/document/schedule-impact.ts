/**
 * R110 — "Hardening is disclosed at consent." A ceremony may harden a schedule
 * anchor only if it STATES that anchor's effect before the act is confirmed.
 * This module is that statement's brain: the prospective ripple, computed from
 * the same pure derivation the confirm strip uses (`rippleDiff` /
 * `rippleSentence`), with no provider and no React.
 *
 * When the effect cannot be computed — the project has no chain yet, the target
 * is not in the chain, or the chain does not resolve — the ceremony still runs;
 * it simply says so, and the server writes a proposal instead of an anchor
 * (I130's downgrade, enforced in `_commit_schedule_edit_authorized`).
 *
 * The `ScheduleDisclosedImpact` object is what the RPC's `p_disclosed_impact`
 * carries. `sentence` is load-bearing: 00475 stamps it into the revision's
 * reason, so the ledger records what was said.
 */

import type { ScheduleMilestoneInput, SchedulePhaseInput } from '@patina/utils';
import {
  rippleDiff,
  rippleSentence,
  type RipplePendingEdit,
} from './schedule-ripple-derivation';

/** The one honest line a ceremony shows when it cannot compute its effect. */
export const IMPACT_UNCOMPUTABLE_LINE =
  'The schedule effect cannot be computed here — this act proposes a date rather than setting one.';

/** The payload handed to a ceremony RPC's `p_disclosed_impact`. */
export interface ScheduleDisclosedImpact {
  sentence: string;
  kind: RipplePendingEdit['kind'];
  anchorDate: string;
  followerCount: number;
  heldAnchorCount: number;
  conflictCount: number;
}

export type ScheduleImpact =
  | { computable: true; sentence: string; disclosure: ScheduleDisclosedImpact }
  | { computable: false; line: string };

const UNCOMPUTABLE: ScheduleImpact = { computable: false, line: IMPACT_UNCOMPUTABLE_LINE };

/**
 * Compute the prospective ripple for one anchor edit. Total: any missing or
 * unresolvable input degrades to the uncomputable answer, never a throw.
 */
export function deriveScheduleImpact(
  phases: readonly SchedulePhaseInput[] | null | undefined,
  milestones: readonly ScheduleMilestoneInput[] | null | undefined,
  edit: RipplePendingEdit | null | undefined,
  today: string,
): ScheduleImpact {
  if (!edit) return UNCOMPUTABLE;
  const phaseList = Array.isArray(phases) ? phases : [];
  const milestoneList = Array.isArray(milestones) ? milestones : [];
  if (phaseList.length === 0) return UNCOMPUTABLE;

  if (edit.kind === 'phase-anchor') {
    if (!phaseList.some((p) => p?.id === edit.phaseId)) return UNCOMPUTABLE;
  } else if (edit.kind === 'milestone-anchor') {
    if (!milestoneList.some((m) => m?.id === edit.milestoneId)) return UNCOMPUTABLE;
  } else {
    // Only anchor edits are ceremony-shaped; nothing else states an impact.
    return UNCOMPUTABLE;
  }

  let diff;
  try {
    diff = rippleDiff(phaseList, milestoneList, edit, () => null, today);
  } catch {
    return UNCOMPUTABLE;
  }
  // A chain that will not resolve has no honest effect to state.
  if (diff.conflicts.some((c) => c.kind === 'chain_cycle')) return UNCOMPUTABLE;

  const anchored =
    edit.kind === 'phase-anchor'
      ? diff.phaseChanges.find((p) => p.phaseId === edit.phaseId)?.toStart
      : diff.milestoneMoves.find((m) => m.milestoneId === edit.milestoneId)?.toDate;
  if (!anchored) return UNCOMPUTABLE;

  const sentence = rippleSentence(diff).plain;
  return {
    computable: true,
    sentence,
    disclosure: {
      sentence,
      kind: edit.kind,
      anchorDate: edit.anchorDate,
      followerCount: diff.followerCount,
      heldAnchorCount: diff.heldAnchors.length,
      conflictCount: diff.conflicts.length,
    },
  };
}
