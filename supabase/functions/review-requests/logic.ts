// Candidate filtering for the daily review-request cron.
//
// client_reviews carries no jsonb/notes column (00062 and nothing since), so a
// skipped send has nowhere to write a reason except `tags`. A row left at
// 'not_sent' with the skip tag is this function's own record that it already
// tried this project and the client's address is suppressed — without it the
// cron would mint a fresh row and attempt a fresh send every single day.

/** Written by this function only; never a designer-authored review tag. */
export const SUPPRESSED_SKIP_TAG = "email_suppressed";

/** The statuses worth fetching when deciding whether to skip a project. */
export const BLOCKING_REQUEST_STATUSES = [
  "sent",
  "queued",
  "collected",
  "not_sent",
] as const;

export interface ReviewRequestRow {
  project_id: string | null;
  request_status: string | null;
  tags: string[] | null;
}

/**
 * Projects that must not get a review request today: one is already out
 * (sent/queued) or answered (collected), or a previous run found the address
 * suppressed and marked the row not_sent with the skip tag.
 */
export function projectsToSkip(rows: ReviewRequestRow[]): Set<string> {
  const skip = new Set<string>();
  for (const row of rows) {
    if (!row.project_id) continue;
    if (row.request_status === "not_sent") {
      if ((row.tags ?? []).includes(SUPPRESSED_SKIP_TAG)) skip.add(row.project_id);
      continue;
    }
    if (
      row.request_status === "sent" ||
      row.request_status === "queued" ||
      row.request_status === "collected"
    ) {
      skip.add(row.project_id);
    }
  }
  return skip;
}
