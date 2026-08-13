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

import {
  resolveSchedule,
  type ScheduleMilestoneInput,
  type SchedulePhaseInput,
} from '@patina/utils';
import { formatCalendarDate } from './format';
import {
  rippleDiff,
  rippleSentence,
  type RipplePendingEdit,
} from './schedule-ripple-derivation';

/** The one honest line a ceremony shows when it cannot compute its effect. */
export const IMPACT_UNCOMPUTABLE_LINE =
  'The schedule effect cannot be computed here — this act proposes a date rather than setting one.';

/** While the schedule is being read, nothing is known yet — least of all that
 *  the effect is uncomputable. */
export const IMPACT_READING_LINE = 'Reading the schedule…';

/** A failed read is not evidence about the chain; it is an absent answer. */
export const IMPACT_UNAVAILABLE_LINE =
  'The schedule could not be read, so this act cannot state its effect yet.';

/**
 * An unpin's effect is not "uncomputable" in the generic sense — the ripple's
 * edit vocabulary simply has no unpin shape to ask about. Saying "this act
 * proposes a date rather than setting one" of a removal is false twice over.
 */
export const IMPACT_UNPIN_UNCOMPUTABLE_LINE =
  'The effect of removing this anchor cannot be computed here — the release is proposed rather than applied.';

/** The payload handed to a ceremony RPC's `p_disclosed_impact`. */
export interface ScheduleDisclosedImpact {
  sentence: string;
  kind: RipplePendingEdit['kind'];
  anchorDate: string;
  followerCount: number;
  /**
   * Anchors that HELD AGAINST the proposed move — they absorbed it. Only a
   * move can measure this, so the unpin path leaves it undefined rather than
   * filing a different measurement under the same name.
   */
  heldAnchorCount?: number;
  /** Unpin path only: anchors elsewhere in the chain that the removal leaves
   *  where they are. Not comparable to heldAnchorCount. */
  otherAnchorCount?: number;
  conflictCount: number;
}

/**
 * Five states, deliberately. "Still reading" and "the read failed" are NOT
 * "the effect is uncomputable" — conflating them lets a mistimed click
 * downgrade a hardening that would have succeeded a moment later, and prints a
 * statement of fact about a chain nobody has looked at. And a date that
 * CONTRADICTS one already committed is not an effect at all: 00475 proposes it
 * however well it was disclosed (R109's third class), so a surface that states
 * a ripple there would be describing a move the server will refuse to make.
 */
export type ScheduleImpact =
  | { status: 'computed'; computable: true; sentence: string; disclosure: ScheduleDisclosedImpact }
  | {
      status: 'reading' | 'unavailable' | 'uncomputable' | 'contradicts';
      computable: false;
      line: string;
    };

/** A ceremony may only be confirmed once the schedule has answered. A
 *  contradiction IS an answer — it reports rather than moves. */
export function impactIsSettled(impact: ScheduleImpact): boolean {
  return impact.status !== 'reading' && impact.status !== 'unavailable';
}

/**
 * R109's third class, stated before consent. The act still stands — it records
 * the contradiction — but it will not move the date, so the sheet must not
 * promise that it will.
 */
export function impactContradicts(committedDate: string): ScheduleImpact {
  return {
    status: 'contradicts',
    computable: false,
    line: `This contradicts the anchor committed for ${formatCalendarDate(committedDate)} — confirming reports the contradiction, it does not move the date.`,
  };
}

export const IMPACT_READING: ScheduleImpact = {
  status: 'reading',
  computable: false,
  line: IMPACT_READING_LINE,
};

export const IMPACT_UNAVAILABLE: ScheduleImpact = {
  status: 'unavailable',
  computable: false,
  line: IMPACT_UNAVAILABLE_LINE,
};

const UNCOMPUTABLE: ScheduleImpact = {
  status: 'uncomputable',
  computable: false,
  line: IMPACT_UNCOMPUTABLE_LINE,
};

const UNPIN_UNCOMPUTABLE: ScheduleImpact = {
  status: 'uncomputable',
  computable: false,
  line: IMPACT_UNPIN_UNCOMPUTABLE_LINE,
};

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
    status: 'computed',
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

/**
 * I126 — releasing a confirmed install window unpins the anchor, and that
 * unpinning states its impact like any other movement. The ripple's edit
 * vocabulary has no unpin shape, so this resolves the chain twice directly:
 * once as committed, once with the target's anchor cleared, and reports what
 * moved. Same totality rule as above — anything unresolvable degrades to the
 * uncomputable answer, which downgrades the release to a proposal.
 */
export function deriveUnpinImpact(
  phases: readonly SchedulePhaseInput[] | null | undefined,
  milestones: readonly ScheduleMilestoneInput[] | null | undefined,
  phaseId: string | null | undefined,
  today: string,
): ScheduleImpact {
  if (!phaseId) return UNPIN_UNCOMPUTABLE;
  const phaseList = Array.isArray(phases) ? phases : [];
  const milestoneList = Array.isArray(milestones) ? milestones : [];
  const target = phaseList.find((p) => p?.id === phaseId);
  if (!target || !target.anchorDate) return UNPIN_UNCOMPUTABLE;

  let before;
  let after;
  try {
    before = resolveSchedule(phaseList, milestoneList, { today });
    after = resolveSchedule(
      phaseList.map((p) => (p.id === phaseId ? { ...p, anchorDate: null } : p)),
      milestoneList,
      { today },
    );
  } catch {
    return UNPIN_UNCOMPUTABLE;
  }
  if (after.conflicts.some((c) => c.kind === 'chain_cycle')) return UNPIN_UNCOMPUTABLE;

  const beforeById = new Map(before.phases.map((p) => [p.id, p]));
  const moved = after.phases.filter((p) => {
    const pre = beforeById.get(p.id);
    return pre != null && (pre.start !== p.start || pre.end !== p.end);
  });
  const others = moved.filter((p) => p.id !== phaseId).length;
  // Every OTHER anchored phase the removal leaves standing. Not the same
  // measure as a move's heldAnchors (anchors that absorbed the move), so it
  // travels under its own name.
  const otherAnchors = after.phases.filter(
    (p) => p.anchored && !moved.some((m) => m.id === p.id),
  ).length;

  const name = target.name || 'the phase';
  const sentence =
    others === 0
      ? `Removing the anchor returns ${name} to the chain; nothing else moves.`
      : `Removing the anchor returns ${name} to the chain; ${others} line${others === 1 ? '' : 's'} move with it.`;

  return {
    status: 'computed',
    computable: true,
    sentence,
    disclosure: {
      sentence,
      kind: 'phase-anchor',
      anchorDate: target.anchorDate,
      followerCount: others,
      otherAnchorCount: otherAnchors,
      conflictCount: after.conflicts.length,
    },
  };
}
