'use client';

/**
 * Schedule confirm strip — the ripple's one honest sentence + its two verbs
 * (C6 · R100 "Editing: the ripple", Slice 04 T9). Prototype: the Ripple slide's
 * confirm strip — a `border-left:2.5px var(--terracotta)` off-white bar, a bold
 * lead, a terracotta conflict clause, and a right-aligned "Esc · Revert" +
 * "Commit the change".
 *
 * R100: "Every time edit previews before it takes … then a confirm strip states
 * the change in one honest sentence — what moved, what follows, what holds, the
 * slack delta, any conflicts — with Commit and Esc · Revert. Nothing moves
 * silently, ever." This is that strip. It renders ONLY while a ripple session is
 * in flight (`session` + `diff` both present) — outside a session it is null, so
 * a gate-off document is byte-identical (no session ever begins there).
 *
 * It writes nothing itself beyond the one commit: the pending edit is previewed
 * entirely in the pure resolver (schedule-ripple-derivation), and the committed
 * schedule is untouched until Commit fires `commit_schedule_edit` (00325). Esc ·
 * Revert simply clears the session — the revert is free because nothing was ever
 * written (the acceptance's "committed never mutated" proof).
 *
 * Anchor violation is the commit gate: an edit whose pending resolution projects
 * a chain past a held anchor (`diff.anchorViolation`) CANNOT commit — the button
 * is disabled AND the handler re-guards (a force-enabled button still writes
 * nothing). Commit failure keeps the session open with an inline terracotta line
 * (R83 inline idiom — the Document opts out of global toasts); only success
 * clears. Zero shadows (D4): depth is the terracotta rule + value contrast, no
 * modal — the document stays live beneath (D1).
 */

import { useEffect } from 'react';
import { useCommitScheduleEdit } from '@patina/supabase';
import { rippleSentence } from '@/lib/document/schedule-ripple-derivation';
import { scheduleEvents } from '@/lib/analytics/schedule-events';
import { useRippleSession } from './schedule-ripple-context';

export interface ScheduleConfirmStripProps {
  projectId: string;
}

export function ScheduleConfirmStrip({ projectId }: ScheduleConfirmStripProps) {
  const { session, diff, clear } = useRippleSession();
  const commit = useCommitScheduleEdit();

  // Global Esc while a session is active → revert (clear). It must NOT leak to a
  // handler that closes the document, so stopPropagation() blocks the event from
  // reaching window/ancestor listeners (document bubble runs before window's).
  // DocSheet registers the SAME document-keydown pattern and stopPropagations
  // too; because both listen on `document`, stopPropagation alone can't stop the
  // other, so we DEFER to an open sheet: when a DocSheet dialog is mounted, its
  // Esc closes the sheet and the ripple is left untouched (a coincident revert
  // would silently throw away the edit the user is still deciding on).
  useEffect(() => {
    if (session == null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      // No revert while the commit is on the wire: the mutation would complete
      // anyway (telemetry fires, invalidation refetches the persisted change)
      // while the strip pretended nothing happened — Esc must restore the EXACT
      // prior state, and mid-flight it can't. Mirrors the Revert button's
      // disabled state; the strip stays until the mutation settles.
      if (commit.isPending) return;
      if (typeof document !== 'undefined' && document.querySelector('[role="dialog"]')) return;
      e.stopPropagation();
      clear();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [session, clear, commit.isPending]);

  if (session == null || diff == null) return null;

  const sentence = rippleSentence(diff);
  // The non-conflict clauses ride the charcoal ink; the conflict clause is inked
  // terracotta separately (it never joins this list).
  const clauses = [sentence.followClause, sentence.holdClause, sentence.slackClause].filter(
    (c): c is string => c != null && c !== '',
  );

  const handleCommit = () => {
    // Re-guard: the button is disabled on a violation, but a force-enabled
    // button (or a stray keyboard activation) must still write nothing.
    if (diff.anchorViolation) return;
    commit.mutate(
      { projectId, edits: [session.edit], reason: sentence.plain },
      {
        onSuccess: () => {
          scheduleEvents.scheduleEditCommitted({
            project_id: projectId,
            surface: session.origin,
            edit_kind: session.edit.kind,
            ripple_size: diff.rippleSize,
            conflict_count: diff.conflicts.length,
          });
          clear();
        },
        // onError: the session stays (we only clear on success) — the inline
        // terracotta line below surfaces the failure; nothing was committed.
      },
    );
  };

  const commitDisabled = diff.anchorViolation || commit.isPending;

  return (
    <div
      role="region"
      aria-label="Pending schedule change"
      className="mt-3 flex items-center justify-between gap-4 border-l-[2.5px] border-[var(--color-terracotta)] bg-[var(--color-off-white)] px-4 py-2.5"
    >
      <div className="min-w-0">
        {/* The one honest sentence — bold lead, ' · ' joined clauses, the
            conflict clause in terracotta. Aria-hidden: the sr-only live region
            below announces the standalone `plain` sentence verbatim so AT never
            hears the split spans twice. */}
        <p
          aria-hidden
          className="font-body text-[0.82rem] leading-snug text-[var(--color-charcoal)]"
        >
          <strong className="font-semibold">{sentence.lead}</strong>
          {clauses.map((c) => (
            <span key={c} className="text-[var(--text-muted)]">
              {' · '}
              {c}
            </span>
          ))}
          {sentence.conflictClause && (
            <span className="text-[var(--color-terracotta)]">
              {' · '}
              {sentence.conflictClause}
            </span>
          )}
        </p>
        <span className="sr-only" aria-live="polite">
          {sentence.plain}
        </span>
        {commit.isError && (
          <p className="mt-1 font-mono text-[0.58rem] uppercase tracking-[0.06em] text-[var(--color-terracotta)]">
            Commit failed — nothing was saved; your preview is kept
          </p>
        )}
      </div>

      <div className="flex shrink-0 items-center gap-3">
        {/* Disabled while the commit is on the wire — same reason as the Esc
            guard above: mid-flight, a revert can no longer restore the prior
            state (the write completes regardless). */}
        <button
          type="button"
          onClick={clear}
          disabled={commit.isPending}
          className={`font-mono text-[0.58rem] uppercase tracking-[0.06em] text-[var(--text-muted)] ${
            commit.isPending ? 'cursor-not-allowed opacity-50' : 'hover:opacity-80'
          }`}
        >
          Esc · Revert
        </button>
        <button
          type="button"
          onClick={handleCommit}
          disabled={commitDisabled}
          className={`border px-2.5 py-1 font-mono text-[0.58rem] uppercase tracking-[0.06em] ${
            commitDisabled
              ? 'cursor-not-allowed border-[var(--color-pearl)] text-[var(--text-muted)]'
              : 'border-[var(--color-terracotta)] text-[var(--color-terracotta)] hover:bg-[var(--color-terracotta)] hover:text-[var(--color-off-white)]'
          }`}
        >
          Commit the change
        </button>
      </div>
    </div>
  );
}
