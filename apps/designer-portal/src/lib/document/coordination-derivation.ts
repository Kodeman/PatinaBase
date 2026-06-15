/**
 * Coordination derivation — Track 5 (Project Coordination · the ball-in-court).
 * Prototype: `patina-project-coordination-prototype.html` (court bar, court groups,
 * open-item rows, the dependency web in The Work).
 *
 * PURE presentation logic over the widened `client_decisions` (00213:
 * coordination_kind + court + blocks_kind) and the `project_tasks` dependency web
 * (00215: owner / blocked_by_item_id / seq_after_task_id). Dependency-free — no
 * React, no design-system, no stages.ts (the Jest-ESM trap; mirrors
 * margin-derivation.ts). The DB read models (00219 coordination_court_summary /
 * task_blocked_state) are the server truth; these functions let the surfaces
 * compute the same shapes client-side from the items query without a second fetch.
 */

// ═══════════════════════════════════════════════════════════════════════════
// TYPES — the shapes the surfaces read (a subset of the widened row)
// ═══════════════════════════════════════════════════════════════════════════

/** The four ball-in-court tokens (00213 court CHECK). */
export type Court = 'designer' | 'client' | 'gc' | 'vendor';

/** The five workflow shapes (00213 coordination_kind CHECK). */
export type CoordinationKind = 'selection' | 'rfi' | 'submittal' | 'signoff' | 'punch';

/** What downstream work an item gates (00213 blocks_kind CHECK). */
export type BlocksKind = 'none' | 'ffe' | 'task' | 'phase';

/** The live decision statuses an open item can carry (00171). */
export type CoordinationStatus = 'draft' | 'pending' | 'responded' | 'expired';

/**
 * The coordination item shape the surfaces read — the widened client_decisions
 * row, narrowed to the fields the derivations need. (The hook's
 * `CoordinationItem` is the full row; this is structurally assignable to it.)
 */
export interface CoordinationItemLike {
  id: string;
  project_id: string | null;
  title: string;
  coordination_kind: CoordinationKind;
  court: Court;
  blocks_kind: BlocksKind;
  status: CoordinationStatus;
  due_date: string | null;
}

/** A task in the dependency web (00215 columns over project_tasks). */
export interface CoordinationTaskLike {
  id: string;
  title: string;
  status: 'todo' | 'done' | 'blocked';
  blocked_by_item_id: string | null;
  seq_after_task_id: string | null;
}

// ═══════════════════════════════════════════════════════════════════════════
// court ordering — your court first, then the hot/most-loaded courts
// ═══════════════════════════════════════════════════════════════════════════

/** Canonical court display order: the designer's own court leads (the prototype's
 *  "In your court" pill is always first + hot), then client, GC, vendor. */
export const COURT_ORDER: readonly Court[] = ['designer', 'client', 'gc', 'vendor'] as const;

/** An item is OPEN (awaiting a move) when it is pending. draft/responded/expired
 *  are not in anyone's live court for the court bar's counts. */
export function isOpen(item: CoordinationItemLike): boolean {
  return item.status === 'pending';
}

// ═══════════════════════════════════════════════════════════════════════════
// groupByCourt — items bucketed by their current ball-in-court
// ═══════════════════════════════════════════════════════════════════════════

export interface CourtGroup<T extends CoordinationItemLike> {
  court: Court;
  items: T[];
}

/**
 * Group open items by court, in COURT_ORDER (designer first), dropping empty
 * courts. Within a court, the most-urgent-first: a due_date soonest, then items
 * with no date, then by title for stability. Only OPEN (pending) items group —
 * resolved/draft items don't sit in anyone's court.
 */
export function groupByCourt<T extends CoordinationItemLike>(items: T[]): CourtGroup<T>[] {
  const buckets = new Map<Court, T[]>();
  for (const item of items) {
    if (!isOpen(item)) continue;
    const arr = buckets.get(item.court);
    if (arr) arr.push(item);
    else buckets.set(item.court, [item]);
  }

  const groups: CourtGroup<T>[] = [];
  for (const court of COURT_ORDER) {
    const arr = buckets.get(court);
    if (arr && arr.length > 0) {
      arr.sort(sortByDueThenTitle);
      groups.push({ court, items: arr });
    }
  }
  return groups;
}

/** Soonest due first (nulls last), then alphabetical by title for a stable order. */
function sortByDueThenTitle(a: CoordinationItemLike, b: CoordinationItemLike): number {
  const da = a.due_date ? new Date(a.due_date).getTime() : Number.MAX_SAFE_INTEGER;
  const db = b.due_date ? new Date(b.due_date).getTime() : Number.MAX_SAFE_INTEGER;
  if (da !== db) return da - db;
  return a.title.localeCompare(b.title);
}

// ═══════════════════════════════════════════════════════════════════════════
// courtSummary — the court bar's per-court counts (mirrors 00219 view)
// ═══════════════════════════════════════════════════════════════════════════

export interface CourtCount {
  court: Court;
  /** Open (pending) items in this court. */
  open: number;
  /** Of those, how many are overdue (due_date in the past). */
  overdue: number;
  /** The soonest pending due_date in this court (ISO) or null. */
  nextDue: string | null;
}

/**
 * Per-court rollup for the court bar, in COURT_ORDER with the designer's own
 * court first. Every court in COURT_ORDER is returned (even at zero) so the bar
 * can render a stable set of pills; the renderer decides whether to hide empties.
 * The designer court is "hot" when it carries any open item (the prototype's
 * highlighted "In your court · N" pill) — see `isHotCourt`.
 */
export function courtSummary(
  items: CoordinationItemLike[],
  now: Date = new Date(),
): CourtCount[] {
  const nowMs = now.getTime();
  const acc = new Map<Court, { open: number; overdue: number; nextDue: number | null }>();
  for (const court of COURT_ORDER) acc.set(court, { open: 0, overdue: 0, nextDue: null });

  for (const item of items) {
    if (!isOpen(item)) continue;
    const bucket = acc.get(item.court);
    if (!bucket) continue; // unknown court — ignore defensively
    bucket.open += 1;
    if (item.due_date) {
      const dueMs = new Date(item.due_date).getTime();
      if (dueMs < nowMs) bucket.overdue += 1;
      if (bucket.nextDue === null || dueMs < bucket.nextDue) bucket.nextDue = dueMs;
    }
  }

  return COURT_ORDER.map((court) => {
    const b = acc.get(court)!;
    return {
      court,
      open: b.open,
      overdue: b.overdue,
      nextDue: b.nextDue === null ? null : new Date(b.nextDue).toISOString(),
    };
  });
}

/** The designer's own court is "hot" (highlighted pill) when it has open items. */
export function isHotCourt(count: CourtCount): boolean {
  return count.court === 'designer' && count.open > 0;
}

// ═══════════════════════════════════════════════════════════════════════════
// blocksText — the open-item row's "blocks N tasks" line
// ═══════════════════════════════════════════════════════════════════════════

/**
 * The "this is blocking →" line for an open item. Counts the downstream tasks
 * that name this item as `blocked_by_item_id` (the real dependency web), and
 * falls back to the item's own `blocks_kind` when no task rows are wired yet
 * (e.g. an ffe/phase gate, or a freshly-raised item). Resolved items block
 * nothing. Returns null when there's nothing to say (so the row can omit the line).
 */
export function blocksText(
  item: CoordinationItemLike,
  tasks: readonly CoordinationTaskLike[] = [],
): string | null {
  if (!isOpen(item)) return null;

  const blockedTaskCount = tasks.reduce(
    (n, t) => (t.blocked_by_item_id === item.id ? n + 1 : n),
    0,
  );
  if (blockedTaskCount > 0) {
    return `blocks ${blockedTaskCount} task${blockedTaskCount === 1 ? '' : 's'}`;
  }

  switch (item.blocks_kind) {
    case 'ffe':
      return 'blocks an FF&E line';
    case 'task':
      return 'blocks downstream work';
    case 'phase':
      return 'blocks this phase';
    case 'none':
    default:
      return null;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// deriveBlocksKind — the composer's "what does it block?" → blocks_kind (R55)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * The single `blocks_kind` category a composed item carries, from the composer's
 * three independent gate pickers (an item may gate FF&E lines AND tasks AND the
 * phase at once — those links ride the `blockedFfeItemIds` / `blockedTaskIds`
 * arrays — but `blocks_kind` is one descriptor that drives `blocking_status`).
 *
 * Precedence is **ffe > phase > task > none**: gating an FF&E line is the
 * procurement concern that lights the `decision_due` stamp (blocks_kind 'ffe' →
 * blocking_status 'blocks_procurement'), so it wins; a phase gate
 * ('blocks_phase') outranks a plain task gate ('non_blocking'). This mirrors the
 * server's `blockingStatusFor` ladder (use-coordination.ts) so the Desk
 * need-lines and the FF&E stamp read the same truth from either side.
 */
export function deriveBlocksKind(picks: {
  ffe: boolean;
  phase: boolean;
  task: boolean;
}): BlocksKind {
  if (picks.ffe) return 'ffe';
  if (picks.phase) return 'phase';
  if (picks.task) return 'task';
  return 'none';
}

// ═══════════════════════════════════════════════════════════════════════════
// isBlocked — derived effective-blocked per task (mirrors 00219 task_blocked_state)
// ═══════════════════════════════════════════════════════════════════════════

export interface TaskBlockedState {
  /** A coordination blocker exists AND is still pending. */
  byItem: boolean;
  /** This task sequences after a task that is NOT done yet. */
  bySeq: boolean;
  /** Either reason holds — the effective ⊘ state. */
  any: boolean;
  /** The blocking item's id (when blocked by an open item), for opening its sheet. */
  blockingItemId: string | null;
  /** The blocking item's current court (when blocked by an open item). */
  blockingItemCourt: Court | null;
  /** The predecessor task id this one waits on (when sequence-blocked). */
  waitingOnTaskId: string | null;
}

/**
 * Derived effective-blocked for a task — the read-side truth the ⊘ tick reads,
 * the exact shape of the 00219 `task_blocked_state` view. A task is blocked by:
 *   · an open (pending) coordination item it names as `blocked_by_item_id`, AND/OR
 *   · a trade-sequence predecessor (`seq_after_task_id`) that is not yet `done`.
 * Resolving the item or finishing the predecessor recomputes this to unblocked —
 * nothing is stored (project_tasks.status stays todo|done|blocked).
 */
export function isBlocked(
  task: CoordinationTaskLike,
  items: readonly CoordinationItemLike[],
  tasks: readonly CoordinationTaskLike[],
): TaskBlockedState {
  let byItem = false;
  let blockingItemId: string | null = null;
  let blockingItemCourt: Court | null = null;

  if (task.blocked_by_item_id) {
    const blocker = items.find((i) => i.id === task.blocked_by_item_id);
    if (blocker && blocker.status === 'pending') {
      byItem = true;
      blockingItemId = blocker.id;
      blockingItemCourt = blocker.court;
    }
  }

  let bySeq = false;
  let waitingOnTaskId: string | null = null;
  if (task.seq_after_task_id) {
    const pre = tasks.find((t) => t.id === task.seq_after_task_id);
    if (pre && pre.status !== 'done') {
      bySeq = true;
      waitingOnTaskId = pre.id;
    }
  }

  return {
    byItem,
    bySeq,
    any: byItem || bySeq,
    blockingItemId,
    blockingItemCourt,
    waitingOnTaskId,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// dueState — the open-item row's due chip urgency
// ═══════════════════════════════════════════════════════════════════════════

export type DueState = 'soon' | 'ok';

const DAY_MS = 86_400_000;

/**
 * The due chip's urgency, matching the prototype's `due-soon` / `due-ok`. "soon"
 * when the due date is today, in the past, or within the next 2 days (the
 * window where the prototype tints it terracotta); "ok" otherwise. A null/absent
 * due date is "ok" — there's nothing pressing to flag.
 */
export function dueState(due: string | null | undefined, now: Date = new Date()): DueState {
  if (!due) return 'ok';
  const dueMs = parseLocalDate(due).getTime();
  const nowMs = now.getTime();
  // Soon: already due (<= now) or within the 2-day lookahead window.
  return dueMs <= nowMs + 2 * DAY_MS ? 'soon' : 'ok';
}

/** DATE columns arrive as bare `YYYY-MM-DD` — parse as LOCAL midnight so the
 *  threshold never slips a day in negative-offset timezones (matches format.ts). */
function parseLocalDate(iso: string): Date {
  return new Date(/^\d{4}-\d{2}-\d{2}$/.test(iso) ? `${iso}T00:00:00` : iso);
}
