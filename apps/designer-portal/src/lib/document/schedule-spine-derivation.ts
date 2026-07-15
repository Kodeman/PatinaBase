/**
 * Schedule spine derivation — Track ... (R101 the Schedule Spine).
 * Prototype: the-document-schedule-* prototypes (main lane, thread lane, the
 * today rule, the meta line under each phase heading).
 *
 * PURE presentation logic over `resolveSchedule`'s output (@patina/utils) —
 * phase-state classification, per-phase item bucketing (A0.2's dangling/null
 * phase_id rule), the today-line splice index, milestone stamp copy, the
 * phase-heading meta line, and thread-lane hosting. React-free,
 * dependency-free (mirrors coordination-derivation.ts / margin-derivation.ts).
 * The resolver already computed dates/conflicts; these functions only decide
 * how the Spine surfaces present that truth — nothing here recomputes time.
 */

import type { MilestoneStatus } from '@patina/utils';
import { fmtDay } from './format';

// ═══════════════════════════════════════════════════════════════════════════
// phaseState — status → the Spine's three visual states
// ═══════════════════════════════════════════════════════════════════════════

export type SpinePhaseState = 'closed' | 'active' | 'future';

/**
 * completed → closed; in_progress|active → active; pending|delayed|anything
 * else (including null/undefined/unrecognized strings) → future. Total —
 * never throws on a malformed status.
 */
export function phaseState(status: string | null | undefined): SpinePhaseState {
  switch (status) {
    case 'completed':
      return 'closed';
    case 'in_progress':
    case 'active':
      return 'active';
    default:
      return 'future';
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// itemsForPhase — A0.2's dangling/null phase_id → active phase rule
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Open (pending) items for a phase. Items with a null OR dangling phase_id
 * (not present in validPhaseIds) land in the active phase (A0.2's read-time
 * rule) — so a decision raised before phases existed, or against a phase
 * since deleted, still surfaces somewhere live instead of vanishing. When
 * there is no active phase, such items land nowhere (they simply don't match
 * any requested phaseId) rather than throwing.
 */
export function itemsForPhase<T extends { phase_id?: string | null; status: string }>(
  items: T[],
  phaseId: string,
  activePhaseId: string | null,
  validPhaseIds: ReadonlySet<string>,
): T[] {
  return items.filter((item) => {
    if (item.status !== 'pending') return false;
    const raw = item.phase_id ?? null;
    const effectivePhaseId = raw == null || !validPhaseIds.has(raw) ? activePhaseId : raw;
    return effectivePhaseId === phaseId;
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// todayIndex — the today rule's splice index within the main lane
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Splice index for the today rule within the MAIN-lane phase list: after the
 * last main phase whose start ≤ today; if none started, before index 0; if
 * the resolver gave no dates at all, after the active phase (activePhaseIndex
 * + 1); if that index isn't a valid position either, fallback 0. Dates are
 * 'YYYY-MM-DD' strings — lexicographic compare is correct for them. Total —
 * never throws on an empty list or an out-of-range index.
 */
export function todayIndex(
  mainPhases: ReadonlyArray<{ id: string; start: string | null }>,
  today: string,
  activePhaseIndex: number,
): number {
  const hasAnyDate = mainPhases.some((p) => p.start != null);
  if (!hasAnyDate) {
    if (activePhaseIndex >= 0 && activePhaseIndex < mainPhases.length) return activePhaseIndex + 1;
    return 0;
  }

  let idx = 0;
  for (let i = 0; i < mainPhases.length; i++) {
    const start = mainPhases[i].start;
    if (start != null && start <= today) idx = i + 1;
  }
  return idx;
}

// ═══════════════════════════════════════════════════════════════════════════
// milestoneStamp — the right-aligned mono stamp for a milestone row
// ═══════════════════════════════════════════════════════════════════════════

/** Local-midnight day-count between two 'YYYY-MM-DD' strings (later − earlier). */
function daysBetween(earlier: string, later: string): number {
  const asLocalMidnight = (iso: string) => new Date(`${iso}T00:00:00`).getTime();
  return Math.round((asLocalMidnight(later) - asLocalMidnight(earlier)) / 86_400_000);
}

/**
 * Right-aligned mono stamp for a milestone row. A null date is degenerate
 * (never crashes) and renders a dash. `derivedStatus` is the resolver's
 * output (`ResolvedMilestone.derivedStatus`) — 'upcoming' has already been
 * flipped to 'due' by the resolver when it landed on/before today, so this
 * function only decides copy, never re-derives the status itself.
 */
export function milestoneStamp(
  m: { date: string | null; derivedStatus: MilestoneStatus },
  today: string,
): { text: string; late: boolean } {
  if (m.date == null) return { text: '—', late: false };
  const fmtd = fmtDay(m.date);

  switch (m.derivedStatus) {
    case 'signed':
      return { text: `Signed · ${fmtd}`, late: false };
    case 'due': {
      if (m.date < today) {
        const overDays = daysBetween(m.date, today);
        return { text: `Due ${fmtd} · ${overDays} days over`, late: true };
      }
      return { text: `Due ${fmtd}`, late: false };
    }
    case 'upcoming':
      return { text: `Upcoming · ${fmtd}`, late: false };
    case 'slipped':
      return { text: `Slipped · ${fmtd}`, late: true };
    default:
      return { text: '—', late: false };
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// phaseMeta — the DM Mono meta line under a phase heading
// ═══════════════════════════════════════════════════════════════════════════

/** Exact multiples of 7 render as weeks; everything else as days. */
function weeksOrDays(n: number): string {
  return n % 7 === 0 ? `${n / 7}w` : `${n}d`;
}

/** `${fmt(start)} – ${fmt(end)}`, or null (omit the whole segment) if either date is missing. */
function dateRange(start: string | null, end: string | null): string | null {
  if (!start || !end) return null;
  return `${fmtDay(start)} – ${fmtDay(end)}`;
}

/**
 * The DM Mono meta line under a phase heading. Exact copy grammar — segments
 * joined by ' · ', absent segments omitted entirely (never a stray double
 * separator), a fully empty result returns '' so the caller renders nothing:
 *
 *   closed:             `Closed ${fmt(end)}` · `${itemCount} items` (>0) ·
 *                        `${lastSigned.name} signed ${fmt(lastSigned.date)}` (if any)
 *   active:              `${fmt(start)} – ${fmt(end)}` · `${openCount} open` (>0) ·
 *                        `${blockingCount} blocking` (>0)
 *   future, anchored:    `${fmt(start)} – ${fmt(end)}` · `Anchored` · `Holds when upstream moves`
 *   future, unanchored:  `Follows ${predecessorName}` (if known) ·
 *                        `${weeksOrDays(durationDays)}` (if a duration) · `${milestoneCount} milestones` (>0)
 *
 * Dates null → omit that segment; never throws on missing/null input.
 */
export function phaseMeta(input: {
  state: SpinePhaseState;
  start: string | null;
  end: string | null;
  anchored: boolean;
  itemCount: number;
  openCount: number;
  blockingCount: number;
  lastSigned?: { name: string; date: string | null } | null;
  predecessorName?: string | null;
  durationDays?: number | null;
  milestoneCount: number;
}): string {
  const segments: string[] = [];

  switch (input.state) {
    case 'closed': {
      if (input.end) segments.push(`Closed ${fmtDay(input.end)}`);
      if (input.itemCount > 0) {
        segments.push(`${input.itemCount} item${input.itemCount === 1 ? '' : 's'}`);
      }
      if (input.lastSigned && input.lastSigned.date) {
        segments.push(`${input.lastSigned.name} signed ${fmtDay(input.lastSigned.date)}`);
      }
      break;
    }
    case 'active': {
      const range = dateRange(input.start, input.end);
      if (range) segments.push(range);
      if (input.openCount > 0) segments.push(`${input.openCount} open`);
      if (input.blockingCount > 0) segments.push(`${input.blockingCount} blocking`);
      break;
    }
    case 'future': {
      if (input.anchored) {
        const range = dateRange(input.start, input.end);
        if (range) segments.push(range);
        segments.push('Anchored');
        segments.push('Holds when upstream moves');
      } else {
        if (input.predecessorName) segments.push(`Follows ${input.predecessorName}`);
        if (input.durationDays) segments.push(weeksOrDays(input.durationDays));
        if (input.milestoneCount > 0) {
          segments.push(`${input.milestoneCount} milestone${input.milestoneCount === 1 ? '' : 's'}`);
        }
      }
      break;
    }
  }

  return segments.join(' · ');
}

// ═══════════════════════════════════════════════════════════════════════════
// threadsFor — thread-lane phases hosted on the main lane they stitch into
// ═══════════════════════════════════════════════════════════════════════════

/** Nulls-last string-date comparator (matches the resolver's own ordering convention). */
function cmpNullableDate(a: string | null, b: string | null): number {
  if (a == null && b == null) return 0;
  if (a == null) return 1;
  if (b == null) return -1;
  return a < b ? -1 : a > b ? 1 : 0;
}

interface HostCandidate {
  id: string;
  start: string | null;
  end: string | null;
}

function hostFor(
  threadStart: string | null,
  mainPhases: readonly HostCandidate[],
  activePhaseId: string | null,
): string | null {
  if (mainPhases.length === 0) return null;

  if (threadStart != null) {
    // 1 · main phases whose [start, end] contains the thread's start.
    const containing = mainPhases.filter(
      (m) => m.start != null && m.end != null && m.start <= threadStart && threadStart <= m.end,
    );
    if (containing.length > 0) {
      const active = containing.find((m) => m.id === activePhaseId);
      if (active) return active.id;
      const earliest = containing.slice().sort((a, b) => cmpNullableDate(a.start, b.start) || a.id.localeCompare(b.id));
      return earliest[0].id;
    }

    // 2 · the last main phase with start ≤ thread start.
    let best: HostCandidate | null = null;
    for (const m of mainPhases) {
      if (m.start != null && m.start <= threadStart) {
        if (best == null || (best.start != null && m.start > best.start)) best = m;
      }
    }
    if (best) return best.id;
  }

  // 3 · fallback: the first main phase (also covers a thread with no start at all).
  const sorted = mainPhases.slice().sort((a, b) => cmpNullableDate(a.start, b.start) || a.id.localeCompare(b.id));
  return sorted[0].id;
}

/**
 * Thread hosting: map each thread-lane phase to the main-lane phase that
 * hosts its stitch. Rule: the main phase whose [start, end] contains the
 * thread's start (preferring the ACTIVE one when several qualify); else the
 * last main phase with start ≤ thread start; else the first main phase.
 * Returns Map<hostMainPhaseId, threadPhaseId[]>, threads listed in start
 * order (nulls last). Total — no main phases at all yields an empty map;
 * null dates never throw.
 */
export function threadsFor(
  resolved: ReadonlyArray<{ id: string; start: string | null; end: string | null; lane: 'main' | 'thread' }>,
  activePhaseId: string | null,
): Map<string, string[]> {
  const mainPhases = resolved.filter((p) => p.lane === 'main');
  const threadPhases = resolved
    .filter((p) => p.lane === 'thread')
    .slice()
    .sort((a, b) => cmpNullableDate(a.start, b.start) || a.id.localeCompare(b.id));

  const result = new Map<string, string[]>();
  if (mainPhases.length === 0) return result;

  for (const thread of threadPhases) {
    const hostId = hostFor(thread.start, mainPhases, activePhaseId);
    if (hostId == null) continue;
    const arr = result.get(hostId);
    if (arr) arr.push(thread.id);
    else result.set(hostId, [thread.id]);
  }
  return result;
}
