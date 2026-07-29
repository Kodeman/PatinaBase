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

import { useEffect, useMemo, useState } from 'react';
import { useCommitScheduleEdit } from '@patina/supabase';
import { rippleSentence } from '@/lib/document/schedule-ripple-derivation';
import { scheduleEvents } from '@/lib/analytics/schedule-events';
import { useRippleSession } from './schedule-ripple-context';
import { DocumentAction, DocumentActionGroup } from '../document-action';

export interface ScheduleConfirmStripProps {
  projectId: string;
}

export function ScheduleConfirmStrip({ projectId }: ScheduleConfirmStripProps) {
  const { session, diff, clear } = useRippleSession();
  const commit = useCommitScheduleEdit();

  // The ripple's one honest sentence — memoized so the reason field can follow
  // `plain` across drag frames without recomputing it twice. null when no diff.
  const sentence = useMemo(
    () => (diff != null ? rippleSentence(diff) : null),
    [diff],
  );

  // The editable revision reason (R100 "Memory") — a quiet DM-mono echo of the
  // sentence. Prefilled with `sentence.plain` and kept in sync with it WHILE the
  // designer hasn't typed (the sentence changes as a drag updates the preview);
  // the first keystroke marks it dirty and it stops following. Commit sends this
  // value as the revision's reason (00326's cut). State PERSISTS across the
  // strip's null renders (it stays mounted, returning null between sessions), so
  // an ended session (commit success or Esc·Revert) resets it to "following."
  const [reason, setReason] = useState('');
  const [reasonDirty, setReasonDirty] = useState(false);

  useEffect(() => {
    if (!reasonDirty && sentence != null) setReason(sentence.plain);
  }, [sentence, reasonDirty]);

  useEffect(() => {
    if (session == null) {
      setReasonDirty(false);
      setReason('');
    }
  }, [session]);

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
      if (
        typeof document !== 'undefined' &&
        document.querySelector('[role="dialog"]')
      )
        return;
      e.stopPropagation();
      clear();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [session, clear, commit.isPending]);

  if (session == null || diff == null || sentence == null) return null;

  // The non-conflict clauses ride the charcoal ink; the conflict clause is inked
  // terracotta separately (it never joins this list).
  const clauses = [
    sentence.followClause,
    sentence.holdClause,
    sentence.slackClause,
  ].filter((c): c is string => c != null && c !== '');

  const handleCommit = () => {
    // Re-guard: the button is disabled on a violation, but a force-enabled
    // button (or a stray keyboard activation) must still write nothing.
    if (diff.anchorViolation) return;
    commit.mutate(
      // The designer's edited reason; falls back to the sentence when blanked so
      // the ledger never records an empty revision.
      {
        projectId,
        edits: [session.edit],
        reason: reason.trim() || sentence.plain,
      },
      {
        onSuccess: (newRevisionV) => {
          scheduleEvents.scheduleEditCommitted({
            project_id: projectId,
            surface: session.origin,
            edit_kind: session.edit.kind,
            ripple_size: diff.rippleSize,
            conflict_count: diff.conflicts.length,
          });
          // R100 "Memory" — the numbered revision 00326 just cut. `newRevisionV`
          // is useCommitScheduleEdit's now-numeric return (the RPC's new `v`).
          scheduleEvents.scheduleRevisionCut({
            project_id: projectId,
            v: newRevisionV,
            trigger: 'edit',
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
        {/* The editable revision reason (R100 "Memory") — a quiet DM-mono echo
            of the sentence, prefilled + re-synced until the designer types. Its
            value is what the commit writes to the revision ledger. */}
        <input
          type="text"
          value={reason}
          onChange={(e) => {
            setReason(e.target.value);
            setReasonDirty(true);
          }}
          disabled={commit.isPending}
          aria-label="Revision reason"
          placeholder="Reason for this revision"
          className="mt-1 w-full max-w-[32rem] border-b border-[var(--color-pearl)] bg-transparent py-0.5 font-mono text-[0.62rem] tracking-[0.02em] text-[var(--color-charcoal)] placeholder:text-[var(--text-muted)] focus:border-[var(--color-clay)] focus:outline-none disabled:opacity-50"
        />
        {commit.isError && (
          <p className="mt-1 font-mono text-[0.58rem] uppercase tracking-[0.06em] text-[var(--color-terracotta)]">
            Commit failed — nothing was saved; your preview is kept
          </p>
        )}
      </div>

      <DocumentActionGroup
        surfaceKey="schedule"
        regionKey="ripple-confirmation"
        className="shrink-0"
      >
        {/* Disabled while the commit is on the wire — same reason as the Esc
            guard above: mid-flight, a revert can no longer restore the prior
            state (the write completes regardless). */}
        <DocumentAction
          actionKey="revert-schedule-change"
          variant="tertiary"
          onClick={clear}
          disabled={commit.isPending}
        >
          Esc · Revert
        </DocumentAction>
        <DocumentAction
          actionKey="commit-schedule-change"
          variant="primary"
          onClick={handleCommit}
          disabled={commitDisabled}
          loading={commit.isPending}
          loadingLabel="Committing…"
        >
          Commit the change
        </DocumentAction>
      </DocumentActionGroup>
    </div>
  );
}
