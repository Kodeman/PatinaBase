// Candidate filtering for the daily review-request cron.

/** The statuses that mean a request is already out, or already answered. */
export const BLOCKING_REQUEST_STATUSES = [
  "sent",
  "queued",
  "collected",
] as const;

export interface ReviewRequestRow {
  project_id: string | null;
  request_status: string | null;
}

export interface ClientSuppressionProfile {
  email_suppressed?: boolean | null;
}

/** Projects whose review request is already out (sent/queued) or answered. */
export function projectsWithRequestOut(rows: ReviewRequestRow[]): Set<string> {
  const skip = new Set<string>();
  for (const row of rows) {
    if (!row.project_id || !row.request_status) continue;
    if ((BLOCKING_REQUEST_STATUSES as readonly string[]).includes(row.request_status)) {
      skip.add(row.project_id);
    }
  }
  return skip;
}

/**
 * The exact inverse of the send chokepoint's suppression gate: it suppresses
 * only a recipient who HAS a profile carrying the flag, so reading the flag
 * here is what stops this daily cron re-attempting the same dead address —
 * a client with no profile is never suppressed and is always eligible.
 */
export function isSuppressedRecipient(
  profile: ClientSuppressionProfile | null | undefined,
): boolean {
  return profile?.email_suppressed === true;
}
