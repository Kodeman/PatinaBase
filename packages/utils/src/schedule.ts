/**
 * The Document · Schedule — R100 pure scheduling resolver ("the Spine").
 *
 * R100: "Dates are never stored as primary truth on unanchored entries — they
 * are computed by ONE pure resolver: chain in; dates, slack, and conflicts out.
 * Nothing else in the app computes time."
 *
 * `resolveSchedule` is that resolver. It is pure, dependency-free, browser-safe,
 * and TOTAL: it never throws — malformed data degrades to conflicts + fallbacks.
 * It reads NO clock (`today` is injected; there is no `Date.now()`) and imports
 * nothing, so it is trivially unit-pinnable, like `proposal-visibility.ts`.
 *
 * A React hook (built elsewhere) maps `project_phases` / `schedule_milestones`
 * rows to the input types below and calls this once; the render is a projection.
 *
 * ─── Ruled semantics (the test matrix pins each) ────────────────────────────
 *  1. Effective duration = durationDays ?? (durationWeeks != null ? ×7 : null).
 *  2. Date math = UTC epoch-day integer arithmetic on 'YYYY-MM-DD' strings, via
 *     a pure days↔civil algorithm — never a timezone-sensitive Date, never a clock.
 *  3. Graph from followsPhaseId. Cycles (incl. self-links) are detected
 *     iteratively; each cycle emits ONE chain_cycle and its members fall through
 *     to legacy/unresolved. A link to a phase outside the set emits orphan_link
 *     and that phase becomes a chain root.
 *  4. Anchors pin the START and never move: anchored.start = anchorDate,
 *     end = start + duration (or legacy targetEndDate when there is no duration).
 *  5. Forward pass: root.start = own anchor ?? projectStartDate ?? own legacy
 *     startDate; follower.start = predecessor.end (contiguous, same-day handoff).
 *  6. Backward pass: an anchored phase whose upstream has no forward origin
 *     derives predecessors backward (pred.end = downstream.start,
 *     pred.start = pred.end − pred.duration) recursively up the chain.
 *  7. Anchor holding: a forward arrival that differs from the anchor gives slack
 *     (arrival earlier) or a chain_does_not_fit conflict with overrunDays
 *     (arrival later). The anchor holds; upstream keeps its computed dates so the
 *     UI can draw the collision; downstream flows from the anchor.
 *  8. Overlap is legal: an UNANCHORED phase whose computed start precedes a
 *     main-lane phase's end — or whose stored lane is 'thread' — resolves
 *     lane:'thread'. No error, no snap-back. (Determinism: phases are packed
 *     onto 'main' in output order; an overlapping later UNANCHORED phase is
 *     promoted to 'thread'.) An ANCHORED phase is NEVER overlap-promoted: it
 *     holds the main line so a chain_does_not_fit collision stays visible.
 *     That single main-lane overlap is the honest conflict signal, not a bug —
 *     the ONE exception to the packer's non-overlapping main-lane invariant.
 *  9. Legacy fallback: no effective duration + no anchor + no resolvable link ⇒
 *     stored startDate/targetEndDate as-is (source:'legacy-dates'). Chain order is
 *     NEVER inferred from sortOrder. Nothing at all ⇒ source:'unresolved' + an
 *     unresolvable conflict.
 * 10. Milestone date = anchorDate ?? (phaseEnd != null ? phaseEnd + (offsetDays
 *     ?? 0) : null); anchored milestones hold. A milestone landing strictly after
 *     a downstream anchored entry contributes past_anchor.
 * 11. Slack: an ANCHORED phase's slackDays = the float absorbed at ITS OWN pin
 *     — the gap between the chain arriving at it and its pinned start (this is
 *     what the spine meta renders: "holds Sep 21 with N days slack"). An
 *     UNANCHORED phase's slackDays = the min float across the anchors reachable
 *     downstream of it. Either is null when no binding anchor absorbs the phase's
 *     float (a root anchor, an overrun, or no downstream anchor at all).
 *     Top-level = min across anchors; negative slack is a conflict, never a
 *     negative number (omit it).
 * 12. Output ordering is deterministic: phases by start asc (nulls last), then
 *     sortOrder, then id; milestones by date asc (nulls last), then sortOrder, id.
 * 13. Empty inputs ⇒ empty outputs. The function is total.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Pinned public contract (EXACT — downstream code is built against these names)
// ─────────────────────────────────────────────────────────────────────────────

export type PhaseLane = 'main' | 'thread';
export type MilestoneKind = 'signoff' | 'decision' | 'delivery' | 'event';
export type MilestoneStatus = 'upcoming' | 'due' | 'signed' | 'slipped';
export type PhaseStatus = 'pending' | 'in_progress' | 'active' | 'completed' | 'delayed';

export interface SchedulePhaseInput {
  id: string;
  name: string;
  durationDays: number | null; // authoritative when non-null
  durationWeeks: number | null; // legacy fallback (×7)
  followsPhaseId: string | null;
  anchorDate: string | null; // 'YYYY-MM-DD' — pins phase START; anchors never move
  lane: PhaseLane;
  startDate: string | null; // legacy stored dates
  targetEndDate: string | null;
  sortOrder: number;
  status: PhaseStatus;
}

export interface ScheduleMilestoneInput {
  id: string;
  phaseId: string;
  name: string;
  kind: MilestoneKind;
  offsetDays: number | null; // relative to phase END; negative = before; null = at end
  anchorDate: string | null; // anchored milestones hold (do not ride the phase)
  status: MilestoneStatus;
  sortOrder: number;
}

export interface ResolveScheduleOptions {
  projectStartDate?: string | null; // forward-compute origin (signature/project start)
  today: string; // injected clock — NEVER read Date.now()
}

export type ScheduleConflictKind =
  | 'past_anchor'
  | 'chain_does_not_fit'
  | 'chain_cycle'
  | 'orphan_link'
  | 'unresolvable';

export interface ScheduleConflict {
  kind: ScheduleConflictKind;
  phaseId?: string;
  milestoneId?: string;
  anchorId?: string; // the anchored entry that holds
  overrunDays?: number; // for past_anchor / chain_does_not_fit
  message: string; // one honest sentence
}

export interface ResolvedPhase {
  id: string;
  start: string | null; // 'YYYY-MM-DD'
  end: string | null;
  lane: PhaseLane; // input lane; UNANCHORED phases promoted to 'thread' on overlap (an anchored phase never is)
  anchored: boolean;
  source: 'chain' | 'anchor' | 'legacy-dates' | 'unresolved';
  slackDays: number | null; // anchored: own absorbed float; unanchored: min float to a downstream anchor; null if none
}

export interface ResolvedMilestone {
  id: string;
  phaseId: string;
  date: string | null;
  anchored: boolean;
  derivedStatus: MilestoneStatus; // stored status, except 'upcoming' → 'due' when date ≤ today; 'signed' never flips
}

export interface ResolvedSchedule {
  phases: ResolvedPhase[];
  milestones: ResolvedMilestone[];
  conflicts: ScheduleConflict[];
  slackDays: number | null; // min slack across anchors; null when no anchors
}

// ─────────────────────────────────────────────────────────────────────────────
// Date math — UTC epoch-day arithmetic, pure and clock-free (no Date, no TZ)
// (Howard Hinnant's days-from-civil algorithm; integer math throughout.)
// ─────────────────────────────────────────────────────────────────────────────

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

function daysFromCivil(y: number, m: number, d: number): number {
  const yy = y - (m <= 2 ? 1 : 0);
  const era = Math.floor((yy >= 0 ? yy : yy - 399) / 400);
  const yoe = yy - era * 400; // [0, 399]
  const doy = Math.floor((153 * (m + (m > 2 ? -3 : 9)) + 2) / 5) + d - 1; // [0, 365]
  const doe = yoe * 365 + Math.floor(yoe / 4) - Math.floor(yoe / 100) + doy; // [0, 146096]
  return era * 146097 + doe - 719468;
}

function civilFromDays(z: number): [number, number, number] {
  const zz = z + 719468;
  const era = Math.floor((zz >= 0 ? zz : zz - 146096) / 146097);
  const doe = zz - era * 146097; // [0, 146096]
  const yoe = Math.floor((doe - Math.floor(doe / 1460) + Math.floor(doe / 36524) - Math.floor(doe / 146096)) / 365); // [0, 399]
  const y = yoe + era * 400;
  const doy = doe - (365 * yoe + Math.floor(yoe / 4) - Math.floor(yoe / 100)); // [0, 365]
  const mp = Math.floor((5 * doy + 2) / 153); // [0, 11]
  const d = doy - Math.floor((153 * mp + 2) / 5) + 1; // [1, 31]
  const m = mp + (mp < 10 ? 3 : -9); // [1, 12]
  return [y + (m <= 2 ? 1 : 0), m, d];
}

/** Parse a strict 'YYYY-MM-DD' string to an epoch-day integer, or null if malformed. */
function parseDate(s: string | null | undefined): number | null {
  if (typeof s !== 'string') return null;
  const m = DATE_RE.exec(s);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  const epoch = daysFromCivil(y, mo, d);
  // Round-trip so impossible civil dates (e.g. 2026-02-30) are rejected.
  const [ry, rm, rd] = civilFromDays(epoch);
  if (ry !== y || rm !== mo || rd !== d) return null;
  return epoch;
}

function pad(n: number, width: number): string {
  let s = String(n);
  while (s.length < width) s = '0' + s;
  return s;
}

/** Format an epoch-day integer back to 'YYYY-MM-DD'. */
function formatDate(epoch: number | null): string | null {
  if (epoch == null) return null;
  const [y, m, d] = civilFromDays(epoch);
  return `${pad(y, 4)}-${pad(m, 2)}-${pad(d, 2)}`;
}

/**
 * ADDITIVE export (Slice 02): the resolver's own day math, exposed so other
 * pure lib code (the Rule's date→x scale) can turn an ISO date into an
 * integer epoch day WITHOUT a second date-math implementation — R100's "ONE
 * date-math impl" rule applies here too. A thin delegation to the same
 * `parseDate` this file already uses internally; behavior is identical
 * (strict 'YYYY-MM-DD', round-trip-rejects impossible calendar dates like
 * 2026-02-30, null for anything malformed/null/undefined). Does not change
 * `parseDate` or any existing export.
 */
export function epochDayFromISO(iso: string | null | undefined): number | null {
  return parseDate(iso);
}

/**
 * ADDITIVE export (Slice 04): the INVERSE of `epochDayFromISO` — turn an
 * integer epoch day back into a strict 'YYYY-MM-DD' string, via the resolver's
 * own civil date math (R100's "ONE date-math impl" — never a timezone-sensitive
 * `Date`, never a clock). A thin wrapper over the private `formatDate` this file
 * already uses internally; behavior is identical. `null`/`undefined`/non-finite
 * → `null`. A non-integer input is rounded to the nearest whole day first (day
 * math is integer-only), so it composes cleanly with `xToEpochDay`'s day-snapped
 * output. Lets other pure lib code (the Rule's x→date inverse scale, the
 * ripple's projected-date arithmetic) render a date from epoch-day integers
 * WITHOUT a second date-math implementation. Does not change `formatDate` or any
 * existing export.
 */
export function isoFromEpochDay(epoch: number | null | undefined): string | null {
  if (epoch == null || !Number.isFinite(epoch)) return null;
  return formatDate(Math.round(epoch));
}

/** Effective duration in days (semantic 1); null when neither is a finite number. */
function effectiveDuration(p: SchedulePhaseInput): number | null {
  const d = p.durationDays;
  if (d != null && Number.isFinite(d)) return d;
  const w = p.durationWeeks;
  if (w != null && Number.isFinite(w)) return w * 7;
  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Internal resolution model
// ─────────────────────────────────────────────────────────────────────────────

interface Node {
  input: SchedulePhaseInput;
  anchorEpoch: number | null;
  startDateEpoch: number | null;
  targetEndEpoch: number | null;
  dur: number | null;
  predId: string | null; // valid, in-set predecessor (null for roots / orphan-roots / self-links)
  isOrphan: boolean;
  onCycle: boolean;
}

type ResolveVia = 'forward' | 'backward' | 'legacy' | 'unresolved';

interface Resolved {
  start: number | null;
  end: number | null;
  source: ResolvedPhase['source'] | null;
  via: ResolveVia | null;
}

function ascNullsLast(a: number | null, b: number | null): number {
  if (a == null && b == null) return 0;
  if (a == null) return 1;
  if (b == null) return -1;
  return a - b;
}

function cmpId(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

const CONFLICT_RANK: Record<ScheduleConflictKind, number> = {
  orphan_link: 0,
  chain_cycle: 1,
  chain_does_not_fit: 2,
  past_anchor: 3,
  unresolvable: 4,
};

// ─────────────────────────────────────────────────────────────────────────────
// The resolver
// ─────────────────────────────────────────────────────────────────────────────

export function resolveSchedule(
  phases: SchedulePhaseInput[],
  milestones: ScheduleMilestoneInput[],
  options: ResolveScheduleOptions,
): ResolvedSchedule {
  const conflicts: ScheduleConflict[] = [];

  // Guard against non-array inputs (totality).
  const phaseList: SchedulePhaseInput[] = Array.isArray(phases) ? phases.filter((p) => p && typeof p.id === 'string') : [];
  const milestoneList: ScheduleMilestoneInput[] = Array.isArray(milestones)
    ? milestones.filter((m) => m && typeof m.id === 'string')
    : [];

  if (phaseList.length === 0 && milestoneList.length === 0) {
    return { phases: [], milestones: [], conflicts: [], slackDays: null };
  }

  const projectStartEpoch = parseDate(options?.projectStartDate ?? null);
  const todayEpoch = parseDate(options?.today);

  // ── Build the node graph, flag orphan links ──────────────────────────────
  const nodes = new Map<string, Node>();
  for (const p of phaseList) {
    // Last write wins on duplicate ids (defensive; DB has a unique key).
    nodes.set(p.id, {
      input: p,
      anchorEpoch: parseDate(p.anchorDate),
      startDateEpoch: parseDate(p.startDate),
      targetEndEpoch: parseDate(p.targetEndDate),
      dur: effectiveDuration(p),
      predId: null,
      isOrphan: false,
      onCycle: false,
    });
  }

  for (const n of nodes.values()) {
    const raw = n.input.followsPhaseId;
    if (raw == null) continue; // root
    if (raw === n.input.id) {
      // Self-link — DB-blocked, but handle defensively as a cycle.
      n.predId = raw;
    } else if (nodes.has(raw)) {
      n.predId = raw;
    } else {
      n.isOrphan = true; // link points outside the set → treated as a root
    }
  }

  const ids = Array.from(nodes.keys()).sort(cmpId); // deterministic iteration order

  for (const id of ids) {
    if (nodes.get(id)!.isOrphan) {
      conflicts.push({
        kind: 'orphan_link',
        phaseId: id,
        message: `Phase "${id}" follows a phase that is not in this schedule; treating it as a starting point.`,
      });
    }
  }

  // ── Cycle detection (iterative; bounded) ─────────────────────────────────
  const onCycle = new Set<string>();
  {
    const classified = new Set<string>();
    for (const start of ids) {
      if (classified.has(start)) continue;
      const path: string[] = [];
      const inPath = new Set<string>();
      let cur: string | null = start;
      while (cur != null && !classified.has(cur)) {
        if (inPath.has(cur)) {
          const from = path.indexOf(cur);
          for (let i = from; i < path.length; i++) onCycle.add(path[i]);
          break;
        }
        inPath.add(cur);
        path.push(cur);
        cur = nodes.get(cur)!.predId;
      }
      for (const p of path) classified.add(p);
    }
  }
  for (const id of onCycle) nodes.get(id)!.onCycle = true;

  // One chain_cycle conflict per distinct cycle (represented by its smallest id).
  {
    const seen = new Set<string>();
    for (const id of ids) {
      if (!onCycle.has(id) || seen.has(id)) continue;
      const members: string[] = [];
      let c: string | null = id;
      while (c != null && !members.includes(c)) {
        members.push(c);
        seen.add(c);
        c = nodes.get(c)!.predId;
        if (c != null && !onCycle.has(c)) break;
      }
      const rep = members.slice().sort(cmpId)[0];
      conflicts.push({
        kind: 'chain_cycle',
        phaseId: rep,
        message: `Phases ${members.slice().sort(cmpId).join(', ')} form a scheduling cycle; their dates cannot be derived from the chain.`,
      });
    }
  }

  // ── Forward pass (memoized) ──────────────────────────────────────────────
  const res = new Map<string, Resolved>();
  const resolving = new Set<string>();

  const forward = (id: string): Resolved => {
    const cached = res.get(id);
    if (cached) return cached;
    if (resolving.has(id)) return { start: null, end: null, source: null, via: null }; // reentrancy guard
    resolving.add(id);

    const n = nodes.get(id)!;
    let out: Resolved;

    if (n.onCycle) {
      out = { start: null, end: null, source: null, via: null };
    } else if (n.anchorEpoch != null) {
      const start = n.anchorEpoch;
      const end = n.dur != null ? start + n.dur : n.targetEndEpoch;
      out = { start, end, source: 'anchor', via: 'forward' };
    } else if (n.predId != null) {
      const pr = forward(n.predId);
      if (pr.start != null && pr.end != null) {
        const start = pr.end; // contiguous same-day handoff
        const end = n.dur != null ? start + n.dur : start;
        out = { start, end, source: 'chain', via: 'forward' };
      } else {
        out = { start: null, end: null, source: null, via: null };
      }
    } else {
      // Root (or orphan-root): a forward origin is only useful with a duration.
      const origin = projectStartEpoch != null ? projectStartEpoch : n.startDateEpoch;
      if (origin != null && n.dur != null) {
        out = { start: origin, end: origin + n.dur, source: 'chain', via: 'forward' };
      } else {
        out = { start: null, end: null, source: null, via: null };
      }
    }

    resolving.delete(id);
    res.set(id, out);
    return out;
  };

  for (const id of ids) forward(id);

  // ── Backward pass: anchored phases pull unresolved predecessors backward ──
  for (const id of ids) {
    const n = nodes.get(id)!;
    if (n.anchorEpoch == null) continue;
    let cur = id;
    let curStart = res.get(id)!.start; // = anchorEpoch
    while (curStart != null) {
      const p = nodes.get(cur)!.predId;
      if (p == null) break;
      const pn = nodes.get(p)!;
      if (pn.onCycle) break;
      const pr = res.get(p)!;
      if (pr.start != null) break; // a forward origin exists upstream — forward wins
      const predEnd = curStart;
      const predStart = pn.dur != null ? predEnd - pn.dur : predEnd;
      res.set(p, { start: predStart, end: predEnd, source: 'chain', via: 'backward' });
      cur = p;
      curStart = predStart;
    }
  }

  // ── Legacy / unresolved fallback for anything still without dates ─────────
  for (const id of ids) {
    const r = res.get(id)!;
    if (r.start != null || r.source != null) continue;
    const n = nodes.get(id)!;
    if (n.startDateEpoch != null || n.targetEndEpoch != null) {
      res.set(id, { start: n.startDateEpoch, end: n.targetEndEpoch, source: 'legacy-dates', via: 'legacy' });
    } else {
      res.set(id, { start: null, end: null, source: 'unresolved', via: 'unresolved' });
      conflicts.push({
        kind: 'unresolvable',
        phaseId: id,
        message: `Phase "${id}" has no duration, anchor, resolvable link, or stored dates; it cannot be placed on the schedule.`,
      });
    }
  }

  // ── Followers map (for downstream-anchor reachability) ───────────────────
  const followers = new Map<string, string[]>();
  for (const id of ids) {
    const p = nodes.get(id)!.predId;
    if (p != null && p !== id && nodes.has(p)) {
      (followers.get(p) ?? followers.set(p, []).get(p)!).push(id);
    }
  }

  // ── Anchor holding: slack (positive gap) vs chain_does_not_fit (negative) ─
  const anchorSlack = new Map<string, number>(); // per-anchor absorbed float (≥ 0)
  for (const id of ids) {
    const n = nodes.get(id)!;
    if (n.anchorEpoch == null || n.predId == null) continue;
    const pr = res.get(n.predId)!;
    if (pr.via !== 'forward' || pr.end == null) continue; // only an independent forward arrival counts
    const gap = n.anchorEpoch - pr.end; // + ⇒ room, − ⇒ overrun
    if (gap < 0) {
      conflicts.push({
        kind: 'chain_does_not_fit',
        phaseId: id,
        anchorId: id,
        overrunDays: -gap,
        message: `The chain arriving at anchored phase "${id}" overruns its pinned start by ${-gap} day(s).`,
      });
    } else {
      anchorSlack.set(id, gap);
    }
  }

  // Nearest binding downstream-anchor slack for each phase (min across reachable anchors).
  const dsSlackMemo = new Map<string, number | null>();
  const dsSlackVisiting = new Set<string>();
  const downstreamSlack = (id: string): number | null => {
    const cached = dsSlackMemo.get(id);
    if (cached !== undefined) return cached;
    if (dsSlackVisiting.has(id)) return null;
    dsSlackVisiting.add(id);
    let best: number | null = null;
    for (const f of followers.get(id) ?? []) {
      if (anchorSlack.has(f)) {
        const s = anchorSlack.get(f)!;
        best = best == null ? s : Math.min(best, s);
      }
      const sub = downstreamSlack(f);
      if (sub != null) best = best == null ? sub : Math.min(best, sub);
    }
    dsSlackVisiting.delete(id);
    dsSlackMemo.set(id, best);
    return best;
  };

  // Downstream anchored phases (id + pinned start) for each phase — for past_anchor.
  const dsAnchorsMemo = new Map<string, Array<{ id: string; start: number }>>();
  const downstreamAnchors = (id: string): Array<{ id: string; start: number }> => {
    const cached = dsAnchorsMemo.get(id);
    if (cached) return cached;
    dsAnchorsMemo.set(id, []); // seed to break cycles
    const acc: Array<{ id: string; start: number }> = [];
    const seen = new Set<string>();
    const walk = (from: string) => {
      for (const f of followers.get(from) ?? []) {
        if (seen.has(f)) continue;
        seen.add(f);
        const fn = nodes.get(f)!;
        const fr = res.get(f)!;
        if (fn.anchorEpoch != null && fr.start != null) acc.push({ id: f, start: fr.start });
        walk(f);
      }
    };
    walk(id);
    dsAnchorsMemo.set(id, acc);
    return acc;
  };

  // ── Top-level slack: min absorbed float across anchors, else null ────────
  let topSlack: number | null = null;
  for (const v of anchorSlack.values()) topSlack = topSlack == null ? v : Math.min(topSlack, v);

  // ── Lane assignment (greedy main-lane packing in output order) ───────────
  const laneMap = new Map<string, PhaseLane>();
  const phaseOrder = ids
    .slice()
    .sort(
      (a, b) =>
        ascNullsLast(res.get(a)!.start, res.get(b)!.start) ||
        nodes.get(a)!.input.sortOrder - nodes.get(b)!.input.sortOrder ||
        cmpId(a, b),
    );
  {
    let mainEnd: number | null = null;
    for (const id of phaseOrder) {
      const n = nodes.get(id)!;
      const r = res.get(id)!;
      const inputLane = n.input.lane;
      if (r.start == null) {
        laneMap.set(id, inputLane === 'thread' ? 'thread' : 'main');
        continue;
      }
      if (inputLane === 'thread') {
        laneMap.set(id, 'thread'); // stored thread — never packed onto main
        continue;
      }
      // Anchored phases HOLD the main line: they are NEVER overlap-promoted to
      // the thread lane. When an upstream chain overruns an anchored install,
      // the anchor's pinned start sits earlier than the running main-lane end;
      // demoting the anchor (or letting the overrunner keep main so the anchor's
      // collision vanishes) would hide exactly the chain_does_not_fit signal the
      // spine exists to show. So the anchor stays on main and its overlap with
      // the upstream phase remains visible. This is the ONE sanctioned exception
      // to "the main lane never overlaps": only an anchor collision produces a
      // visible main-lane overlap, and that overlap IS the honest signal.
      // Unanchored overlap promotion is unchanged (R100: overlap is legal).
      const isAnchored = n.anchorEpoch != null;
      if (!isAnchored && mainEnd != null && r.start < mainEnd) {
        laneMap.set(id, 'thread'); // unanchored phase overlaps main → promote
      } else {
        laneMap.set(id, 'main');
        const e = r.end != null ? r.end : r.start;
        if (mainEnd == null || e > mainEnd) mainEnd = e;
      }
    }
  }

  // ── Milestones ───────────────────────────────────────────────────────────
  const resolvedMilestones: ResolvedMilestone[] = milestoneList.map((m) => {
    const anchorEpoch = parseDate(m.anchorDate);
    const phaseRes = res.get(m.phaseId);
    let dateEpoch: number | null;
    let anchored: boolean;
    if (anchorEpoch != null) {
      dateEpoch = anchorEpoch;
      anchored = true;
    } else if (phaseRes && phaseRes.end != null) {
      dateEpoch = phaseRes.end + (m.offsetDays != null && Number.isFinite(m.offsetDays) ? m.offsetDays : 0);
      anchored = false;
    } else {
      dateEpoch = null;
      anchored = false;
    }

    let derivedStatus: MilestoneStatus = m.status;
    if (m.status === 'upcoming' && dateEpoch != null && todayEpoch != null && dateEpoch <= todayEpoch) {
      derivedStatus = 'due';
    }

    // past_anchor: a milestone landing strictly after a downstream anchored entry.
    if (dateEpoch != null && nodes.has(m.phaseId)) {
      let violated: { id: string; start: number } | null = null;
      for (const a of downstreamAnchors(m.phaseId)) {
        if (a.start < dateEpoch) {
          // Nearest one it overshot = the latest anchor still before the milestone.
          if (violated == null || a.start > violated.start) violated = a;
        }
      }
      if (violated != null) {
        conflicts.push({
          kind: 'past_anchor',
          milestoneId: m.id,
          anchorId: violated.id,
          overrunDays: dateEpoch - violated.start,
          message: `Milestone "${m.id}" lands ${dateEpoch - violated.start} day(s) after the anchored phase "${violated.id}".`,
        });
      }
    }

    return { id: m.id, phaseId: m.phaseId, date: formatDate(dateEpoch), anchored, derivedStatus };
  });

  // ── Assemble + deterministic ordering ────────────────────────────────────
  const resolvedPhases: ResolvedPhase[] = phaseOrder.map((id) => {
    const n = nodes.get(id)!;
    const r = res.get(id)!;
    // Slack attribution (semantic 11). An ANCHORED phase renders its OWN
    // absorbed float — the slack of the chain segment ARRIVING at its pin
    // (anchorSlack.get(id)); this is the value the spine meta reads ("holds
    // Sep 21 with N days slack"). `downstreamSlack` walks a phase's FOLLOWERS,
    // so it would return null for the anchor itself — the exact mis-attribution
    // the walk found. An UNANCHORED phase inherits the min float across the
    // anchors reachable downstream of it (downstreamSlack). Either resolves to
    // null when no binding anchor absorbs float: a root anchor (no arriving
    // chain), an overrun (a chain_does_not_fit conflict, never a slack entry),
    // or an unanchored phase with no downstream anchor.
    const slackDays =
      n.anchorEpoch != null ? (anchorSlack.has(id) ? anchorSlack.get(id)! : null) : downstreamSlack(id);
    return {
      id,
      start: formatDate(r.start),
      end: formatDate(r.end),
      lane: laneMap.get(id) ?? (n.input.lane === 'thread' ? 'thread' : 'main'),
      anchored: n.anchorEpoch != null,
      source: r.source ?? 'unresolved',
      slackDays,
    };
  });

  resolvedMilestones.sort((a, b) => {
    const am = milestoneList.find((x) => x.id === a.id)!;
    const bm = milestoneList.find((x) => x.id === b.id)!;
    return ascNullsLast(parseDate(a.date), parseDate(b.date)) || am.sortOrder - bm.sortOrder || cmpId(a.id, b.id);
  });

  conflicts.sort(
    (a, b) =>
      CONFLICT_RANK[a.kind] - CONFLICT_RANK[b.kind] ||
      cmpId(a.phaseId ?? '', b.phaseId ?? '') ||
      cmpId(a.milestoneId ?? '', b.milestoneId ?? '') ||
      cmpId(a.anchorId ?? '', b.anchorId ?? ''),
  );

  return { phases: resolvedPhases, milestones: resolvedMilestones, conflicts, slackDays: topSlack };
}
