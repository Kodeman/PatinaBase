/**
 * Schedule RIPPLE derivation (Slice 04 — R100 "Editing: the ripple"). Pure
 * planning logic that sits in front of the one time engine (`resolveSchedule`,
 * `@patina/utils`) — mirrors `schedule-compose-derivation.ts`'s conventions
 * (React-free, dependency-light, TOTAL: malformed input degrades, never throws).
 *
 * R100: "Every time edit previews before it takes … then a confirm strip states
 * the change in one honest sentence — what moved, what follows, what holds, the
 * slack delta, any conflicts — with Commit and Esc · Revert. Nothing moves
 * silently, ever." This module is that preview's brain: it runs the resolver
 * TWICE (the committed schedule, and the committed schedule with ONE pending
 * edit applied), diffs the two resolutions, and reduces the diff to (a) the ghost
 * layer's raw moves and (b) the confirm strip's one honest sentence.
 *
 * It writes nothing and reimplements no time math — `resolveSchedule` stays the
 * only engine (R100), and the only date arithmetic is the resolver's own
 * `epochDayFromISO`/`isoFromEpochDay`, reused, never duplicated.
 *
 * Two exports:
 *   - `rippleDiff` — the twice-resolve diff (phase moves, milestone moves,
 *     follower count, held anchors, slack delta, conflicts, anchor-violation).
 *   - `rippleSentence` — the confirm strip's clauses + the standalone "plain"
 *     sentence (the Slice-05 revision-reason default).
 */

import {
  resolveSchedule,
  epochDayFromISO,
  isoFromEpochDay,
  type SchedulePhaseInput,
  type ScheduleMilestoneInput,
  type ScheduleConflict,
} from '@patina/utils';

// ═══════════════════════════════════════════════════════════════════════════
// Pinned contract
// ═══════════════════════════════════════════════════════════════════════════

/**
 * The four time edits the ripple previews. Each carries exactly the fields the
 * commit path (Slice 04 §T5 `commit_schedule_edit`) needs — nothing more:
 *   - `phase-duration` — a boundary drag / an inline duration field: set the
 *     phase's effective duration to `durationDays` (days become authoritative).
 *   - `phase-anchor` — typing a hard date / dragging a start onto a day: pin the
 *     phase's START to `anchorDate` (it becomes an anchored entry).
 *   - `milestone-offset` — a diamond dragged along the line: set the milestone's
 *     offset from its host phase's END to `offsetDays` (and unpin it — a slid
 *     milestone rides the phase again). `phaseId` is the host phase.
 *   - `milestone-anchor` — pin a milestone to a hard date and clear its offset
 *     (the exact mirror of milestone-offset clearing the anchor).
 */
export type RipplePendingEdit =
  | { kind: 'phase-duration'; phaseId: string; durationDays: number }
  | { kind: 'phase-anchor'; phaseId: string; anchorDate: string }
  | { kind: 'milestone-offset'; milestoneId: string; phaseId: string; offsetDays: number }
  | { kind: 'milestone-anchor'; milestoneId: string; anchorDate: string };

/** One phase's before→after in the ripple. `holds` = anchored && !moved (an
 *  anchor that kept its ground while the edit rippled around it). */
export interface RipplePhaseChange {
  phaseId: string;
  name: string;
  fromStart: string | null;
  toStart: string | null;
  fromEnd: string | null;
  toEnd: string | null;
  moved: boolean;
  anchored: boolean;
  holds: boolean;
}

/** One milestone's before→after date in the ripple (it rode its phase, was
 *  dragged, or held its own anchor). */
export interface RippleMilestoneMove {
  milestoneId: string;
  phaseId: string;
  name: string;
  fromDate: string | null;
  toDate: string | null;
  moved: boolean;
  anchored: boolean;
}

/** An anchor that held: its name and the pinned date it held (for "X holds Jul 29"). */
export interface RippleHeldAnchor {
  phaseId: string;
  name: string;
  date: string | null;
}

/**
 * The full ripple diff — everything the ghost layer and the confirm strip read.
 * `rippleSize` counts every entity that moved (phases + milestones, INCLUDING
 * the edited one); `followerCount` counts only the OTHER phases that moved
 * (rippleSize's phase share minus the directly-edited phase). `slackBefore`/
 * `slackAfter` are sourced from the EDITED PHASE's own per-phase `slackDays`
 * for phase edits — its chain's binding-anchor float; the top-level
 * min-across-all-anchors would suppress the clause in multi-anchor projects —
 * and from the top-level `slackDays` for milestone slides (the host phase
 * never moves). `slackDelta` is
 * `slackAfter − slackBefore` only when BOTH are numbers (a numeric delta across
 * a null boundary — a newly-created or wholly-removed anchor — is meaningless,
 * so it is `null`; the sentence still shows both endpoints honestly).
 * `anchorViolation` is the commit gate: any `chain_does_not_fit` or `past_anchor`
 * in the PENDING resolution means the edit cannot commit (Slice 04 §T9/§T10).
 */
export interface RippleDiff {
  edit: RipplePendingEdit;
  editedName: string;
  phaseChanges: RipplePhaseChange[];
  milestoneMoves: RippleMilestoneMove[];
  followerCount: number;
  heldAnchors: RippleHeldAnchor[];
  slackBefore: number | null;
  slackAfter: number | null;
  slackDelta: number | null;
  conflicts: ScheduleConflict[];
  anchorViolation: boolean;
  rippleSize: number;
  /** phase-duration only — the effective new duration minus the committed
   *  effective duration (weeks×7 when days were null). `null` for the other
   *  two kinds. Carries the lead's `±Nd` without re-reading the inputs. */
  durationDelta: number | null;
}

/** The confirm strip's parts. Each clause is `null` when it has nothing honest
 *  to say (no followers, no held anchor, no slack change, no violation). `plain`
 *  is the whole thing as one standalone sentence — the confirm strip's aria-live
 *  text AND the Slice-05 revision-reason default. */
export interface RippleSentence {
  lead: string;
  followClause: string | null;
  holdClause: string | null;
  slackClause: string | null;
  conflictClause: string | null;
  plain: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// Local helpers — self-contained, pure, TZ-free (no import from app format.ts;
// keeps this lib as clock-free and browser-safe as the resolver it fronts)
// ═══════════════════════════════════════════════════════════════════════════

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const MINUS = '−'; // U+2212 MINUS SIGN — the brand's typographic minus (not a hyphen)
const EM_DASH = '—'; // U+2014 EM DASH — the confirm strip's clause separator / null placeholder

/** 'YYYY-MM-DD' → 'Jul 29' (month short + day numeric, no leading zero). Parses
 *  the string directly — no `Date`, no `Intl`, no timezone. A null/malformed
 *  date renders an em-dash so a sentence never shows 'NaN' or 'Invalid Date'. */
function fmtDay(iso: string | null): string {
  if (!iso) return EM_DASH;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return EM_DASH;
  const monthIdx = Number(m[2]) - 1;
  const day = Number(m[3]);
  if (monthIdx < 0 || monthIdx > 11) return EM_DASH;
  return `${MONTHS[monthIdx]} ${day}`;
}

/** A signed day-delta as `+5d` / `−3d` (U+2212 minus, the brand's typographic
 *  minus — matches R100's `+5d` entry grammar). */
function fmtDelta(n: number): string {
  return `${n < 0 ? MINUS : '+'}${Math.abs(n)}d`;
}

/** The resolver's effective-duration rule (semantic 1), re-expressed locally:
 *  durationDays when a finite number, else durationWeeks×7, else null. */
function effectiveDuration(p: SchedulePhaseInput): number | null {
  if (p.durationDays != null && Number.isFinite(p.durationDays)) return p.durationDays;
  if (p.durationWeeks != null && Number.isFinite(p.durationWeeks)) return p.durationWeeks * 7;
  return null;
}

// ═══════════════════════════════════════════════════════════════════════════
// rippleDiff — resolve twice, diff
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Resolve the committed schedule and the committed-plus-one-edit schedule, then
 * diff them. Passive planning only (R100 stands: `resolveSchedule` is the only
 * engine, this never persists anything) — the twin of `composePreview` for
 * edits instead of adds.
 *
 * TOTAL: an edit naming an unknown phase/milestone id degrades to a no-op edit
 * (the pending schedule equals the committed one; nothing moves; `editedName`
 * falls back to the raw id) rather than throwing. `nameById` is the resolved
 * schedule's own id→name lookup; when it returns nothing, the committed inputs'
 * `name`, then the id itself, are used.
 */
export function rippleDiff(
  committedPhases: readonly SchedulePhaseInput[],
  committedMilestones: readonly ScheduleMilestoneInput[],
  edit: RipplePendingEdit,
  nameById: (id: string) => string | null | undefined,
  today: string,
): RippleDiff {
  const phases = Array.isArray(committedPhases)
    ? committedPhases.filter((p): p is SchedulePhaseInput => p != null && typeof p.id === 'string')
    : [];
  const milestones = Array.isArray(committedMilestones)
    ? committedMilestones.filter((m): m is ScheduleMilestoneInput => m != null && typeof m.id === 'string')
    : [];

  // ── Name resolution: nameById → committed input name → the raw id ──────────
  const phaseNameById = new Map<string, string>();
  for (const p of phases) if (typeof p.name === 'string' && p.name !== '') phaseNameById.set(p.id, p.name);
  const milestoneNameById = new Map<string, string>();
  for (const m of milestones) if (typeof m.name === 'string' && m.name !== '') milestoneNameById.set(m.id, m.name);
  const nameOf = (id: string): string => {
    const fromCb = typeof nameById === 'function' ? nameById(id) : undefined;
    if (fromCb != null && fromCb !== '') return fromCb;
    return phaseNameById.get(id) ?? milestoneNameById.get(id) ?? id;
  };

  // ── Apply the one pending edit to a clone (unknown id ⇒ no-op clone) ───────
  const editedPhaseId = edit && typeof edit === 'object' && 'phaseId' in edit ? edit.phaseId : '';
  let pendingPhases = phases;
  let pendingMilestones = milestones;

  if (edit && typeof edit === 'object') {
    if (edit.kind === 'phase-duration') {
      pendingPhases = phases.map((p) => (p.id === edit.phaseId ? { ...p, durationDays: edit.durationDays } : p));
    } else if (edit.kind === 'phase-anchor') {
      pendingPhases = phases.map((p) => (p.id === edit.phaseId ? { ...p, anchorDate: edit.anchorDate } : p));
    } else if (edit.kind === 'milestone-offset') {
      pendingMilestones = milestones.map((m) =>
        m.id === edit.milestoneId ? { ...m, phaseId: edit.phaseId, offsetDays: edit.offsetDays, anchorDate: null } : m,
      );
    } else if (edit.kind === 'milestone-anchor') {
      pendingMilestones = milestones.map((m) =>
        m.id === edit.milestoneId ? { ...m, anchorDate: edit.anchorDate, offsetDays: null } : m,
      );
    }
  }

  // ── Resolve twice ─────────────────────────────────────────────────────────
  const before = resolveSchedule(phases, milestones, { today });
  const after = resolveSchedule(pendingPhases, pendingMilestones, { today });

  const beforePhase = new Map(before.phases.map((p) => [p.id, p]));
  const beforeMs = new Map(before.milestones.map((m) => [m.id, m]));

  // ── durationDelta (phase-duration only) ───────────────────────────────────
  // Baseline = the committed EFFECTIVE duration (days, else weeks×7). A
  // legacy-dated phase (no duration fields at all) baselines against its
  // RESOLVED committed span — end − start from the before resolution — so the
  // ±Nd lead is honest about how much the edit actually changed the phase.
  // Only a phase with no resolvable dates at all falls back to 0 (the lead
  // then reads the full new duration, the only honest number left). Unknown
  // edited id keeps null (the no-op degrade).
  let durationDelta: number | null = null;
  if (edit && typeof edit === 'object' && edit.kind === 'phase-duration') {
    const committed = phases.find((p) => p.id === edit.phaseId);
    if (committed) {
      let baseline = effectiveDuration(committed);
      if (baseline == null) {
        const pre = beforePhase.get(edit.phaseId);
        const s = epochDayFromISO(pre?.start ?? null);
        const e = epochDayFromISO(pre?.end ?? null);
        if (s != null && e != null) baseline = e - s;
      }
      durationDelta = edit.durationDays - (baseline ?? 0);
    }
  }

  // ── Phase changes (iterate the pending order — deterministic, start-sorted) ─
  const phaseChanges: RipplePhaseChange[] = after.phases.map((post) => {
    const pre = beforePhase.get(post.id);
    const fromStart = pre?.start ?? null;
    const fromEnd = pre?.end ?? null;
    const moved = fromStart !== post.start || fromEnd !== post.end;
    const anchored = post.anchored;
    return {
      phaseId: post.id,
      name: nameOf(post.id),
      fromStart,
      toStart: post.start,
      fromEnd,
      toEnd: post.end,
      moved,
      anchored,
      holds: anchored && !moved,
    };
  });

  // ── Milestone moves (pending order — deterministic, date-sorted) ───────────
  const milestoneMoves: RippleMilestoneMove[] = after.milestones.map((post) => {
    const pre = beforeMs.get(post.id);
    const fromDate = pre?.date ?? null;
    return {
      milestoneId: post.id,
      phaseId: post.phaseId,
      name: nameOf(post.id),
      fromDate,
      toDate: post.date,
      moved: fromDate !== post.date,
      anchored: post.anchored,
    };
  });

  const heldAnchors: RippleHeldAnchor[] = phaseChanges
    .filter((pc) => pc.holds)
    .map((pc) => ({ phaseId: pc.phaseId, name: pc.name, date: pc.toStart }));

  const followerCount = phaseChanges.filter((pc) => pc.moved && pc.phaseId !== editedPhaseId).length;
  const rippleSize = phaseChanges.filter((pc) => pc.moved).length + milestoneMoves.filter((mm) => mm.moved).length;

  // ── Slack sourcing ─────────────────────────────────────────────────────────
  // A PHASE edit reads the EDITED PHASE's own per-phase slackDays in each
  // resolution — its chain's binding-anchor float (unanchored: min float to a
  // downstream anchor; anchored: the float absorbed at its own pin). The
  // top-level slackDays is the min across ALL anchors, which in a multi-anchor
  // project suppresses or misattributes the clause (edit chain A 10→5 while
  // chain B holds the global min at 3 → top-level reads 3→3 and says nothing).
  // A MILESTONE slide keeps top-level: its host phase never moves, so no
  // chain's float changes and the global number is the honest one. Unknown
  // edited id falls back to top-level (totality).
  let slackBefore = before.slackDays;
  let slackAfter = after.slackDays;
  if (edit && typeof edit === 'object' && (edit.kind === 'phase-duration' || edit.kind === 'phase-anchor')) {
    const pre = beforePhase.get(edit.phaseId);
    const post = after.phases.find((p) => p.id === edit.phaseId);
    if (pre && post) {
      slackBefore = pre.slackDays;
      slackAfter = post.slackDays;
    }
  }
  const slackDelta = slackBefore != null && slackAfter != null ? slackAfter - slackBefore : null;

  const conflicts = after.conflicts;
  const anchorViolation = conflicts.some((c) => c.kind === 'chain_does_not_fit' || c.kind === 'past_anchor');

  const editedName =
    edit && (edit.kind === 'milestone-offset' || edit.kind === 'milestone-anchor')
      ? nameOf(edit.milestoneId)
      : nameOf(editedPhaseId);

  return {
    edit,
    editedName,
    phaseChanges,
    milestoneMoves,
    followerCount,
    heldAnchors,
    slackBefore,
    slackAfter,
    slackDelta,
    conflicts,
    anchorViolation,
    rippleSize,
    durationDelta,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// rippleSentence — the confirm strip's one honest sentence
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Turn a `RippleDiff` into the confirm strip's clauses and its standalone
 * `plain` sentence. Template (R100 / prototype slide 8 confirm strip):
 *
 *   lead                                  ← what changed, by kind:
 *     phase-duration    "{name} +5d"      ← the duration delta
 *     phase-anchor      "{name} anchored Sep 21"
 *     milestone-offset  "{name} → Oct 11" ← the resolved new date
 *   followClause  "{n} phase(s) follow"   ← the ripple's other movers
 *   holdClause    "{anchor} holds Sep 21" ← every anchor that kept its ground
 *   slackClause   "slack 14 → 9 days"     ← only when the slack actually changed
 *   conflictClause (terracotta)           ← the first anchor violation, if any:
 *     "{what} projects {date} — {n} days past {anchor}"
 *
 *   plain = "{lead}. {clauses joined by ' · '}."  (or just "{lead}." when the
 *   edit is inert — a plain, standalone, honest sentence).
 *
 * TOTAL: reads only the diff; a missing name/date renders a fallback ('—'),
 * never a throw.
 */
export function rippleSentence(diff: RippleDiff): RippleSentence {
  const lead = buildLead(diff);
  const followClause = buildFollowClause(diff.followerCount);
  const holdClause = buildHoldClause(diff.heldAnchors);
  const slackClause = buildSlackClause(diff.slackBefore, diff.slackAfter);
  const conflictClause = buildConflictClause(diff);

  const clauses = [followClause, holdClause, slackClause, conflictClause].filter(
    (c): c is string => c != null && c !== '',
  );
  const plain = clauses.length > 0 ? `${lead}. ${clauses.join(' · ')}.` : `${lead}.`;

  return { lead, followClause, holdClause, slackClause, conflictClause, plain };
}

function buildLead(diff: RippleDiff): string {
  const { edit, editedName } = diff;
  switch (edit.kind) {
    case 'phase-duration':
      return `${editedName} ${fmtDelta(diff.durationDelta ?? 0)}`;
    case 'phase-anchor':
      return `${editedName} anchored ${fmtDay(edit.anchorDate)}`;
    case 'milestone-offset': {
      const move = diff.milestoneMoves.find((m) => m.milestoneId === edit.milestoneId);
      return `${editedName} → ${fmtDay(move?.toDate ?? null)}`;
    }
    case 'milestone-anchor':
      return `${editedName} anchored ${fmtDay(edit.anchorDate)}`;
    default:
      return editedName;
  }
}

function buildFollowClause(followerCount: number): string | null {
  if (followerCount <= 0) return null;
  return `${followerCount} phase${followerCount === 1 ? '' : 's'} follow${followerCount === 1 ? 's' : ''}`;
}

function buildHoldClause(heldAnchors: RippleHeldAnchor[]): string | null {
  if (heldAnchors.length === 0) return null;
  return heldAnchors.map((a) => `${a.name} holds ${fmtDay(a.date)}`).join(' · ');
}

function buildSlackClause(slackBefore: number | null, slackAfter: number | null): string | null {
  // Only when the slack actually changed — an unchanged anchor's float is
  // already carried by the hold clause; repeating "14 → 14" is noise. A change
  // across a null boundary (a newly-created or removed anchor) still shows both
  // endpoints honestly ('—' for the null side).
  if (slackBefore === slackAfter) return null;
  const s = (n: number | null) => (n == null ? EM_DASH : String(n));
  // The unit reads off the landing number: "slack 4 → 1 day", "slack 11 → 6 days".
  return `slack ${s(slackBefore)} → ${s(slackAfter)} day${slackAfter === 1 ? '' : 's'}`;
}

function buildConflictClause(diff: RippleDiff): string | null {
  // The first violation in resolver order (chain_does_not_fit before past_anchor).
  const c = diff.conflicts.find((x) => x.kind === 'chain_does_not_fit' || x.kind === 'past_anchor');
  if (!c) return null;
  const overrun = c.overrunDays ?? 0;
  const days = `${overrun} day${overrun === 1 ? '' : 's'}`;

  if (c.kind === 'past_anchor') {
    const move = diff.milestoneMoves.find((m) => m.milestoneId === c.milestoneId);
    const what = move?.name ?? c.milestoneId ?? EM_DASH;
    const anchorName = diff.phaseChanges.find((p) => p.phaseId === c.anchorId)?.name ?? c.anchorId ?? EM_DASH;
    return `${what} projects ${fmtDay(move?.toDate ?? null)} ${EM_DASH} ${days} past ${anchorName}`;
  }

  // chain_does_not_fit: the anchor holds; the chain projects past it. The
  // projected arrival = the anchor's pinned start + the overrun (reuses the
  // resolver's own date math via epochDayFromISO/isoFromEpochDay — never a
  // second impl).
  const anchor = diff.phaseChanges.find((p) => p.phaseId === c.anchorId);
  const anchorName = anchor?.name ?? c.anchorId ?? EM_DASH;
  const base = epochDayFromISO(anchor?.toStart ?? null);
  const projectedIso = base != null ? isoFromEpochDay(base + overrun) : null;
  return `The chain projects ${fmtDay(projectedIso)} ${EM_DASH} ${days} past ${anchorName}`;
}
