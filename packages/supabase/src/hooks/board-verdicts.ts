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
