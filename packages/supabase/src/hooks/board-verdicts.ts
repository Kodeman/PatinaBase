import type { Verdict } from '@patina/utils';

/** Compact per-board read model used by cover cards. */
export interface BoardVerdictCounts {
  approved: number;
  rejected: number;
  comment: number;
  total: number;
}

/** Minimal RLS-filtered feedback projection nested under a board item. */
export interface BoardVerdictProjection {
  id: string;
  /** Null on a guest-link reaction (W2a, 00546); guest_share_id carries it instead. */
  client_id: string | null;
  guest_share_id?: string | null;
  verdict: string;
  created_at: string;
}

/** Minimal item projection needed to fold verdicts into a cover summary. */
export interface BoardItemVerdictProjection {
  verdicts?: BoardVerdictProjection[] | null;
}

export function emptyBoardVerdictCounts(): BoardVerdictCounts {
  return { approved: 0, rejected: 0, comment: 0, total: 0 };
}

function isVerdict(value: string): value is Verdict {
  return value === 'approved' || value === 'rejected' || value === 'comment';
}

function isLaterVerdict(
  candidate: BoardVerdictProjection,
  current: BoardVerdictProjection | undefined,
): boolean {
  if (!current) return true;
  if (candidate.created_at !== current.created_at) {
    return candidate.created_at > current.created_at;
  }
  return candidate.id > current.id;
}

/**
 * A signed-in client, or the guest link a reaction arrived on (W2a, 00546).
 * Null when a row carries neither — such a row is dropped rather than
 * silently pooled under one shared key (an unattributed row is not "the same
 * author" as every other unattributed row).
 */
export function verdictAuthor(feedback: BoardVerdictProjection): string | null {
  if (feedback.client_id) return `client:${feedback.client_id}`;
  if (feedback.guest_share_id) return `share:${feedback.guest_share_id}`;
  return null;
}

/**
 * Fold a list of feedback rows down to each author's single latest verdict.
 * item_feedback keeps an append-only history, so counting every visible row
 * would inflate totals after an author changes their mind. Shared by
 * summarizeBoardVerdicts (per-item counts) and deriveApprovedBoardItemIds
 * (per-item approval) so both apply the exact same precedence rule and the
 * exact same client/guest author key.
 */
export function latestVerdictByAuthor(
  feedback: readonly BoardVerdictProjection[],
): BoardVerdictProjection[] {
  const latestByAuthor = new Map<string, BoardVerdictProjection>();
  for (const entry of feedback) {
    if (!isVerdict(entry.verdict)) continue;
    const author = verdictAuthor(entry);
    if (!author) continue;
    const current = latestByAuthor.get(author);
    if (isLaterVerdict(entry, current)) latestByAuthor.set(author, entry);
  }
  return [...latestByAuthor.values()];
}

/**
 * Count the current verdict for each author on each pin. The nested rows
 * have already been RLS-filtered by PostgREST; this fold only chooses each
 * anchor/author's latest entry and never broadens access.
 */
export function summarizeBoardVerdicts(
  items: BoardItemVerdictProjection[],
): BoardVerdictCounts {
  const counts = emptyBoardVerdictCounts();

  for (const item of items) {
    for (const feedback of latestVerdictByAuthor(item.verdicts ?? [])) {
      counts[feedback.verdict as Verdict] += 1;
      counts.total += 1;
    }
  }

  return counts;
}

/** One board's client-loop status (board-paths W2b, DV10-lite / M5). */
export type BoardReactionStatus = 'awaiting_reaction' | 'reactions_in' | 'approved_pipeline';

/**
 * The board-level reaction-status chip (board-paths W2b #1). Derived purely
 * from data already read for the cover card — no new column, no migration:
 *
 *   - `approved_pipeline` — at least one approved verdict exists, regardless
 *     of current share state (an approval already happened; that outranks
 *     everything else, including a since-revoked share).
 *   - `reactions_in`      — some verdict exists (rejected/comment/approved=0)
 *     but nothing has been approved yet.
 *   - `awaiting_reaction` — the board has an active share and zero verdicts.
 *   - `null`              — never shared, no reactions: the card shows nothing.
 */
export function deriveBoardReactionStatus(input: {
  verdictCounts: BoardVerdictCounts;
  hasActiveShare: boolean;
}): BoardReactionStatus | null {
  if (input.verdictCounts.approved > 0) return 'approved_pipeline';
  if (input.verdictCounts.total > 0) return 'reactions_in';
  if (input.hasActiveShare) return 'awaiting_reaction';
  return null;
}

/** A flat item_feedback row anchored to a board pin — the shape returned by
 * a direct `board_item_id`-scoped read (see useBoardItemFeedbackByBoard). */
export interface BoardItemFeedbackRow {
  id: string;
  board_item_id: string | null;
  /** Null on a guest-link reaction (W2a, 00546); guest_share_id carries it instead. */
  client_id: string | null;
  guest_share_id?: string | null;
  verdict: string;
  created_at: string;
}

/**
 * The set of board_item_ids whose CURRENT verdict (latest per author, same
 * rule as summarizeBoardVerdicts) is 'approved' for at least one author — the
 * population for the "approved pieces -> purchase pipeline" panel (board-paths
 * W2b #2). Rows with no board_item_id (line-anchored feedback) are ignored;
 * rows with neither client_id nor guest_share_id are dropped by
 * latestVerdictByAuthor.
 */
export function deriveApprovedBoardItemIds(
  rows: readonly BoardItemFeedbackRow[],
): Set<string> {
  const rowsByItem = new Map<string, BoardVerdictProjection[]>();
  for (const row of rows) {
    if (!row.board_item_id) continue;
    const list = rowsByItem.get(row.board_item_id) ?? [];
    list.push(row);
    rowsByItem.set(row.board_item_id, list);
  }

  const approved = new Set<string>();
  for (const [boardItemId, itemRows] of rowsByItem) {
    for (const feedback of latestVerdictByAuthor(itemRows)) {
      if (feedback.verdict === 'approved') {
        approved.add(boardItemId);
        break;
      }
    }
  }
  return approved;
}
