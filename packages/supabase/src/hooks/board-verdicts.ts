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
  /** Null on a guest-link reaction, which attributes to the share instead. */
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

/** A signed-in client, or the guest link a reaction arrived on (00546). */
function verdictAuthor(feedback: BoardVerdictProjection): string | null {
  if (feedback.client_id) return `client:${feedback.client_id}`;
  if (feedback.guest_share_id) return `share:${feedback.guest_share_id}`;
  return null;
}

/**
 * Count the current verdict for each author on each pin. item_feedback keeps an
 * append-only history, so counting every visible row would inflate cover
 * totals after a client changes their mind. The nested rows have already been
 * RLS-filtered by PostgREST; this fold only chooses each anchor/author's latest
 * entry and never broadens access.
 */
export function summarizeBoardVerdicts(
  items: BoardItemVerdictProjection[],
): BoardVerdictCounts {
  const counts = emptyBoardVerdictCounts();

  for (const item of items) {
    const latestByAuthor = new Map<string, BoardVerdictProjection>();
    for (const feedback of item.verdicts ?? []) {
      if (!isVerdict(feedback.verdict)) continue;
      const author = verdictAuthor(feedback);
      if (!author) continue;
      const current = latestByAuthor.get(author);
      if (isLaterVerdict(feedback, current)) {
        latestByAuthor.set(author, feedback);
      }
    }

    for (const feedback of latestByAuthor.values()) {
      counts[feedback.verdict as Verdict] += 1;
      counts.total += 1;
    }
  }

  return counts;
}
