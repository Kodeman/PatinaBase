'use client';

import { useCallback, useId, useRef, useState } from 'react';

import {
  useConfirmProjectApprovalReview,
  useCreateDecisionComment,
  useDecisionComments,
  useDecisionRealtime,
  useRespondProjectApproval,
  type DecisionComment,
  type ProjectApprovalOutcome,
  type ProjectApprovalReview,
} from '@patina/supabase';

import { ScoredAction } from '@/components/making/scored-action';
import { moneyInWords } from '@/components/making/standing-sentence';
import { useAuth } from '@/hooks/use-auth';
import { isClientActionableProjectApproval } from '@/lib/client-attention';
import { parseSourceDate } from '@/lib/threshold/derive';

/* ── THE DOORSTEP ASK ────────────────────────────────────────────────────────
   A phase approval stands on the doorstep because it carries no room, and it
   is answered where it stands. `/decisions/[id]` used to be the destination;
   its ceremony — the frozen edition, the review confirmation, the three
   outcomes, the discussion that never submits one — is here now, whole, with
   the same hooks and the same payloads, so the two surfaces cannot disagree
   about what was recorded.

   The discussion's guarantee is the old page's own sentence, kept word for
   word: a comment is a comment. Only the three acts answer the gate.
   ────────────────────────────────────────────────────────────────────────── */

const LONG_MONTH_DAY = new Intl.DateTimeFormat('en-US', { month: 'long', day: 'numeric' });
const DAY_MONTH = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'long' });
const LETTER_DATE = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'long',
  hour: 'numeric',
  minute: '2-digit',
});

/** Codex's three outcomes, in the house's words. The values are load-bearing. */
const OUTCOME_ACTS: Array<{
  outcome: ProjectApprovalOutcome;
  actionKey: string;
  label: string;
  loadingLabel: string;
  variant: 'primary' | 'secondary' | 'tertiary';
}> = [
  {
    outcome: 'approved',
    actionKey: 'approve_project_approval',
    label: 'Approve',
    loadingLabel: 'Approving',
    variant: 'primary',
  },
  {
    outcome: 'needs_discussion',
    actionKey: 'question_project_approval',
    label: 'Ask a question',
    loadingLabel: 'Holding',
    variant: 'secondary',
  },
  {
    outcome: 'changes_requested',
    actionKey: 'decline_project_approval',
    label: 'Decline',
    loadingLabel: 'Declining',
    variant: 'tertiary',
  },
];

const STAMP_WORD: Record<ProjectApprovalOutcome, string> = {
  approved: 'Approved',
  changes_requested: 'Declined',
  needs_discussion: 'Held',
};

function moneyDelta(cents: number): string {
  return `${cents > 0 ? '+' : '−'}${moneyInWords(Math.abs(cents))}`;
}

function dayDelta(days: number): string {
  const whole = Math.abs(days);
  return `${days > 0 ? '+' : '−'}${whole} ${whole === 1 ? 'day' : 'days'}`;
}

/**
 * The asks that stand on the doorstep, and stay standing once they are
 * answered here.
 *
 * `isClientActionableProjectApproval` stops being true the moment an outcome
 * is recorded, so filtering on it alone would take the ask off the doorstep
 * at the same instant its stamp was written. `onAnswered` is what the ask
 * calls when its own act returns; an ask answered elsewhere, or before the
 * client arrived, never appears.
 */
export function useDoorstepApprovals(approvals: ProjectApprovalReview[]): {
  asks: ProjectApprovalReview[];
  onAnswered: (decisionId: string) => void;
} {
  const [answeredHere, setAnsweredHere] = useState<string[]>([]);
  const onAnswered = useCallback((decisionId: string) => {
    setAnsweredHere((was) => (was.includes(decisionId) ? was : [...was, decisionId]));
  }, []);

  return {
    asks: approvals.filter(
      (approval) =>
        isClientActionableProjectApproval(approval) ||
        answeredHere.includes(approval.decisionId),
    ),
    onAnswered,
  };
}

function Discussion({ decisionId }: { decisionId: string }) {
  const { user } = useAuth();
  const comments = useDecisionComments(decisionId);
  const createComment = useCreateDecisionComment();
  const [draft, setDraft] = useState('');
  const [postFailed, setPostFailed] = useState(false);
  useDecisionRealtime(decisionId);

  const fieldId = useId().replace(/:/g, '');
  const written = (comments.data ?? []) as DecisionComment[];

  function post() {
    const body = draft.trim();
    if (!body) return;
    setPostFailed(false);
    createComment.mutate(
      { decisionId, body },
      {
        onSuccess: () => {
          setDraft('');
          setPostFailed(false);
        },
        onError: () => setPostFailed(true),
      },
    );
  }

  return (
    <div className="mt-6" data-testid="approval-discussion">
      <p className="font-mono text-[11px] uppercase leading-[1.5] tracking-[0.14em] text-[var(--text-muted)]">
        The discussion
      </p>
      <p className="mt-1.5 max-w-[52ch] text-[15px] leading-[1.62] text-[var(--text-body)]">
        Comments help you and your designer discuss the work. They never submit or change an
        approval outcome.
      </p>

      {written.length > 0 && (
        <ul className="mt-3.5 max-w-[58ch] divide-y divide-[var(--border-subtle)] border-t border-[var(--border-subtle)]">
          {written.map((comment) => (
            <li key={comment.id} className="py-3">
              <p className="font-mono text-[11px] uppercase tracking-[0.1em] text-[var(--text-muted)]">
                {user && comment.author_id === user.id ? 'You' : 'The studio'}
                {' · '}
                {LETTER_DATE.format(new Date(comment.created_at))}
              </p>
              <p className="mt-1 whitespace-pre-wrap break-words text-[15px] leading-[1.62] text-[var(--text-primary)]">
                {comment.body}
              </p>
            </li>
          ))}
        </ul>
      )}

      {user && (
        <div className="mt-4 max-w-[58ch]">
          <label
            className="block font-mono text-[11px] uppercase tracking-[0.13em] text-[var(--text-muted)]"
            htmlFor={`approval-comment-${fieldId}`}
          >
            Add to the discussion
          </label>
          <textarea
            id={`approval-comment-${fieldId}`}
            data-testid="approval-comment-field"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            rows={3}
            className="mt-1.5 w-full resize-none border-0 border-b border-current bg-transparent px-0.5 py-1 font-heading text-[1.05rem] text-[var(--text-primary)]"
          />
          <div className="mt-2">
            <ScoredAction
              actionKey="post_approval_comment"
              regionKey="doorstep"
              surfaceKey="the_threshold"
              variant="secondary"
              loading={createComment.isPending}
              loadingLabel="Posting"
              disabled={draft.trim().length === 0}
              onClick={post}
            >
              Post
            </ScoredAction>
          </div>
          {postFailed && (
            <p role="alert" className="mt-2 text-[15px] leading-normal text-[var(--color-error)]">
              The comment could not be posted. Your draft is still here; try again.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

export interface ApprovalAskProps {
  approval: ProjectApprovalReview;
  /** Told the decision id once an outcome is recorded from this ask. */
  onAnswered?: (decisionId: string) => void;
}

export function ApprovalAsk({ approval, onAnswered }: ApprovalAskProps) {
  const confirmReview = useConfirmProjectApprovalReview();
  const respond = useRespondProjectApproval();
  const [justAnswered, setJustAnswered] = useState<{
    outcome: ProjectApprovalOutcome;
    at: Date;
  } | null>(null);
  // Which act is in flight: one mutation serves all three, so without this
  // every act would wear the pending label at once.
  const [answering, setAnswering] = useState<ProjectApprovalOutcome | null>(null);
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef(false);

  const due = parseSourceDate(approval.dueAt);
  const reviewComplete = approval.completedReviewCount >= approval.requiredReviewCount;
  const canConfirm =
    approval.lifecycleStatus === 'draft' &&
    !reviewComplete &&
    approval.authorityRevision !== null;
  const canRespond =
    approval.lifecycleStatus === 'pending' &&
    approval.disposition === 'active' &&
    reviewComplete &&
    approval.outcome === null;

  // The stamp is written the moment the act returns, and it survives the
  // refetch that follows: the recorded outcome takes over from the local one.
  const recordedOutcome = approval.outcome ?? justAnswered?.outcome ?? null;
  const stampedAt =
    parseSourceDate(approval.respondedAt) ??
    justAnswered?.at ??
    parseSourceDate(approval.updatedAt);

  async function confirmExactEdition() {
    if (inFlight.current || !canConfirm || approval.authorityRevision === null) return;
    inFlight.current = true;
    setError(null);
    try {
      await confirmReview.mutateAsync({
        projectId: approval.projectId,
        decisionId: approval.decisionId,
        authorityRevision: approval.authorityRevision,
        artifactChecksum: approval.artifactChecksum,
        idempotencyKey: crypto.randomUUID(),
      });
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : 'The artifact changed or the review could not be confirmed. Refresh and review it again.',
      );
    } finally {
      inFlight.current = false;
    }
  }

  async function answer(outcome: ProjectApprovalOutcome) {
    if (inFlight.current || !canRespond) return;
    inFlight.current = true;
    setAnswering(outcome);
    setError(null);
    try {
      await respond.mutateAsync({
        projectId: approval.projectId,
        decisionId: approval.decisionId,
        outcome,
        expectedUpdatedAt: approval.updatedAt,
        idempotencyKey: crypto.randomUUID(),
      });
      setJustAnswered({ outcome, at: new Date() });
      onAnswered?.(approval.decisionId);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : 'This approval changed while it was open. Refresh before responding.',
      );
    } finally {
      inFlight.current = false;
      setAnswering(null);
    }
  }

  // Absence is silence: a delta of nothing is not a fact worth a row.
  const impact: Array<{ label: string; value: string }> = [];
  if (approval.costCentsDelta)
    impact.push({ label: 'Cost', value: moneyDelta(approval.costCentsDelta) });
  if (approval.scheduleDaysDelta)
    impact.push({ label: 'Schedule', value: dayDelta(approval.scheduleDaysDelta) });
  if (approval.leadTimeDaysDelta)
    impact.push({ label: 'Lead time', value: dayDelta(approval.leadTimeDaysDelta) });

  return (
    <section
      id={`approval-${approval.decisionId}`}
      data-threshold-unit="doorstep-approval"
      {...(recordedOutcome ? {} : { 'data-never-dim': '' })}
      data-testid="doorstep-approval"
      aria-labelledby={`approval-gate-${approval.decisionId}`}
      className="relative mt-8 border-t border-[var(--border-subtle)] pb-8 text-[var(--text-primary)]"
    >
      <p className="pt-2.5 font-mono text-[11px] uppercase tracking-[0.12em] text-[var(--text-muted)]">
        {recordedOutcome
          ? 'A gate · answered'
          : approval.lifecycleStatus === 'draft'
            ? 'A gate · your review is required'
            : 'A gate · your response is required'}
      </p>
      <h2
        id={`approval-gate-${approval.decisionId}`}
        className="font-heading mt-1.5 text-[1.35rem] font-medium tracking-[-0.012em]"
      >
        {approval.question}
      </h2>
      <p className="mt-2 max-w-[52ch] text-[15px] leading-relaxed text-[var(--text-body)]">
        {`${approval.artifactTitle} · Edition ${approval.artifactVersion}`}
        {due ? ` · Due ${LONG_MONTH_DAY.format(due)}` : ''}
      </p>
      <p className="mt-1.5 max-w-[52ch] text-[15px] leading-[1.62] text-[var(--text-body)]">
        {`Edition ${approval.artifactVersion} is what you answer, exactly as it stands.`}
      </p>

      {approval.context && (
        <p
          data-testid="approval-rationale"
          className="mt-3 max-w-[52ch] whitespace-pre-wrap break-words text-[15px] leading-[1.62] text-[var(--text-body)]"
        >
          {approval.context}
        </p>
      )}

      {impact.length > 0 && (
        <dl
          data-testid="approval-impact"
          className="mt-4 flex max-w-[52ch] flex-wrap gap-x-10 gap-y-2"
        >
          {impact.map((row) => (
            <div key={row.label}>
              <dt className="font-mono text-[11px] uppercase tracking-[0.12em] text-[var(--text-muted)]">
                {row.label}
              </dt>
              <dd className="mt-0.5 text-[15px] leading-normal">{row.value}</dd>
            </div>
          ))}
        </dl>
      )}

      {recordedOutcome && (
        <p className="mt-4">
          <span
            data-testid="approval-stamp"
            className="inline-block max-w-[38ch] -rotate-[1.1deg] border border-current px-2.5 pb-1 pt-1.5 font-mono text-[11px] uppercase leading-relaxed tracking-[0.1em] text-[var(--color-mocha)]"
          >
            {`${STAMP_WORD[recordedOutcome]}${stampedAt ? ` ${DAY_MONTH.format(stampedAt)}` : ''}`}
            <span className="block font-normal normal-case tracking-[0.04em]">
              {`${approval.artifactTitle} · Edition ${approval.artifactVersion}`}
            </span>
          </span>
        </p>
      )}

      {canConfirm && (
        <div className="mt-4">
          <p className="max-w-[52ch] text-[15px] leading-[1.62] text-[var(--text-body)]">
            {`${approval.completedReviewCount} of ${approval.requiredReviewCount} required reviews confirmed.`}
          </p>
          <div className="mt-2.5">
            <ScoredAction
              actionKey="confirm_project_approval_review"
              regionKey="doorstep"
              surfaceKey="the_threshold"
              variant="primary"
              loading={confirmReview.isPending}
              loadingLabel="Confirming"
              onClick={confirmExactEdition}
            >
              Review exact edition
            </ScoredAction>
          </div>
        </div>
      )}

      {canRespond && !justAnswered && (
        <div className="mt-4 flex flex-wrap items-center gap-x-6" data-testid="approval-acts">
          {OUTCOME_ACTS.map((act) => (
            <ScoredAction
              key={act.outcome}
              actionKey={act.actionKey}
              regionKey="doorstep"
              surfaceKey="the_threshold"
              variant={act.variant}
              loading={answering === act.outcome}
              loadingLabel={act.loadingLabel}
              onClick={() => answer(act.outcome)}
            >
              {act.label}
            </ScoredAction>
          ))}
        </div>
      )}

      {error && (
        <p role="alert" className="mt-3 text-[15px] leading-normal text-[var(--color-error)]">
          {error}
        </p>
      )}

      <Discussion decisionId={approval.decisionId} />
    </section>
  );
}
