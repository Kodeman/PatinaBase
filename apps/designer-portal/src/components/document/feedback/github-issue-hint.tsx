'use client';

/**
 * What a bug report's GitHub issue looks like in the ledger and the detail view.
 *
 * A bug row is written before the issue exists: migration 00557's trigger hands
 * the row to the feedback-github-issue edge function, which writes back either
 * an issue number/url or a reason. `invoke_edge_function` is fire-and-forget, so
 * a crash can leave a row with neither — hence the timeout below, after which
 * the row stops claiming to be in flight and says so plainly.
 */

import type { Feedback } from '@patina/supabase';

/** How often the ledger re-reads while an issue is still in flight. */
export const ISSUE_POLL_MS = 10_000;
/** After this long with neither url nor error, stop waiting and say so. */
export const ISSUE_TIMEOUT_MS = 5 * 60 * 1000;

function isBug(note: Feedback): boolean {
  return note.report_kind === 'bug';
}

function unresolved(note: Feedback): boolean {
  return !note.github_issue_url && !note.github_issue_error;
}

/** A bug of the current user's, filed within the timeout, still unresolved. */
export function awaitingIssue(note: Feedback, userId?: string): boolean {
  if (!isBug(note) || !unresolved(note)) return false;
  if (userId && note.created_by !== userId) return false;
  return Date.now() - new Date(note.created_at).getTime() < ISSUE_TIMEOUT_MS;
}

export function GithubHint({ note }: { note: Feedback }) {
  if (note.github_issue_url) {
    return (
      <a
        href={note.github_issue_url}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-block font-mono text-[11px] text-[var(--color-clay-ink)] underline"
      >
        GitHub #{note.github_issue_number} ↗
      </a>
    );
  }
  if (note.github_issue_error) {
    return (
      <p className="font-mono text-[11px] text-[var(--color-terracotta-ink)]">
        Issue not filed — {note.github_issue_error}
      </p>
    );
  }
  if (!isBug(note)) return null;
  if (awaitingIssue(note)) {
    return (
      <p className="font-mono text-[11px] text-[var(--color-aged-oak)]">
        Filing the issue…
      </p>
    );
  }
  return (
    <p className="font-mono text-[11px] text-[var(--color-terracotta-ink)]">
      Issue not filed yet.
    </p>
  );
}
