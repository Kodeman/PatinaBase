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
  client_id: string;
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
 * Count the current verdict for each client on each pin. item_feedback keeps an
 * append-only history, so counting every visible row would inflate cover
 * totals after a client changes their mind. The nested rows have already been
 * RLS-filtered by PostgREST; this fold only chooses each anchor/client's latest
 * entry and never broadens access.
 */
export function summarizeBoardVerdicts(
  items: BoardItemVerdictProjection[],
): BoardVerdictCounts {
  const counts = emptyBoardVerdictCounts();

  for (const item of items) {
    const latestByClient = new Map<string, BoardVerdictProjection>();
    for (const feedback of item.verdicts ?? []) {
      if (!isVerdict(feedback.verdict)) continue;
      const current = latestByClient.get(feedback.client_id);
      if (isLaterVerdict(feedback, current)) {
        latestByClient.set(feedback.client_id, feedback);
      }
    }

    for (const feedback of latestByClient.values()) {
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
  client_id: string;
  verdict: string;
  created_at: string;
}

/**
 * The set of board_item_ids whose CURRENT verdict (latest per client, same
 * rule as summarizeBoardVerdicts) is 'approved' for at least one client — the
 * population for the "approved pieces -> purchase pipeline" panel (board-paths
 * W2b #2). Rows with no board_item_id (line-anchored feedback) are ignored.
 */
export function deriveApprovedBoardItemIds(
  rows: readonly BoardItemFeedbackRow[],
): Set<string> {
  const latestByItem = new Map<string, Map<string, BoardVerdictProjection>>();
  for (const row of rows) {
    if (!row.board_item_id || !isVerdict(row.verdict)) continue;
    const byClient = latestByItem.get(row.board_item_id) ?? new Map();
    const current = byClient.get(row.client_id);
    if (isLaterVerdict(row, current)) byClient.set(row.client_id, row);
    latestByItem.set(row.board_item_id, byClient);
  }

  const approved = new Set<string>();
  for (const [boardItemId, byClient] of latestByItem) {
    for (const feedback of byClient.values()) {
      if (feedback.verdict === 'approved') {
        approved.add(boardItemId);
        break;
      }
    }
  }
  return approved;
}
