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
import { useProjectWorkingBudget } from '@/hooks/use-commercial-client';
import { useAuth } from '@/hooks/use-auth';
import {
  isClientActionableProjectApproval,
  isProjectApprovalAwaitingStudioIssue,
} from '@/lib/client-attention';
import { parseSourceDate } from '@/lib/threshold/derive';

/* ── THE DOORSTEP ASK ────────────────────────────────────────────────────────
   A phase approval stands on the doorstep because it carries no room, and it
   is answered where it stands. `/decisions/[id]` used to be the destination;
   its ceremony — the frozen edition, the review confirmation, the budget the
   edition names, the two-beat outcome, the discussion that never submits one —
   is here now, whole, with the same hooks and the same payloads, so the two
   surfaces cannot disagree about what was recorded.

   The discussion's guarantee, the immutability sentence, the two error
   sentences and each outcome's consequence line are the old page's own words,
   kept byte for byte: a comment is a comment, and an act says what it does
   before it is taken.
   ────────────────────────────────────────────────────────────────────────── */

const LONG_MONTH_DAY = new Intl.DateTimeFormat('en-US', { month: 'long', day: 'numeric' });
const DAY_MONTH = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'long' });
const LETTER_DATE = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'long',
  hour: 'numeric',
  minute: '2-digit',
});

/** The house sentences for a refused act. An RPC's own words never reach the page. */
const CONFIRM_REFUSED =
  'The artifact changed or the review could not be confirmed. Refresh and review it again.';
const RESPOND_REFUSED = 'This approval changed while it was open. Refresh before responding.';

/**
 * Codex's three outcomes, in the house's words. The values are load-bearing,
 * and each consequence line is the old page's own description, verbatim.
 */
const OUTCOME_ACTS: Array<{
  outcome: ProjectApprovalOutcome;
  actionKey: string;
  label: string;
  consequence: string;
  variant: 'primary' | 'secondary' | 'tertiary';
}> = [
  {
    outcome: 'approved',
    actionKey: 'approve_project_approval',
    label: 'Approve',
    consequence: 'Accept this exact artifact and its stated impacts.',
    variant: 'primary',
  },
  {
    outcome: 'needs_discussion',
    actionKey: 'question_project_approval',
    label: 'Ask a question',
    consequence: 'Hold the gate while you and your designer talk it through.',
    variant: 'secondary',
  },
  {
    outcome: 'changes_requested',
    actionKey: 'decline_project_approval',
    label: 'Decline',
    consequence: 'Return this edition for revision and a new approval request.',
    variant: 'tertiary',
  },
];

const STAMP_WORD: Record<ProjectApprovalOutcome, string> = {
  approved: 'Approved',
  changes_requested: 'Declined',
  needs_discussion: 'Held',
};

const STAMP_CLASS =
  'inline-block max-w-[38ch] -rotate-[1.1deg] border border-current px-2.5 pb-1 pt-1.5 font-mono text-[11px] uppercase leading-relaxed tracking-[0.1em] text-[var(--color-mocha)]';
const EYEBROW_CLASS =
  'font-mono text-[11px] uppercase tracking-[0.12em] text-[var(--text-muted)]';
const SECTION_CLASS =
  'relative mt-8 border-t border-[var(--border-subtle)] pb-8 text-[var(--text-primary)]';

function moneyDelta(cents: number): string {
  return `${cents > 0 ? '+' : '−'}${moneyInWords(Math.abs(cents))}`;
}

function dayDelta(days: number): string {
  const whole = Math.abs(days);
  return `${days > 0 ? '+' : '−'}${whole} ${whole === 1 ? 'day' : 'days'}`;
}

/**
 * A refused act reads in the house's words. The cause's own text is a Postgres
 * string, not copy, so it is carried only where a developer is reading.
 */
function refusalSentence(cause: unknown, sentence: string): string {
  if (process.env.NODE_ENV === 'development' && cause instanceof Error && cause.message) {
    return `${sentence} (${cause.message})`;
  }
  return sentence;
}

/**
 * The asks that stand on the doorstep, the ones waiting on the studio, and the
 * receipts of the ones already answered.
 *
 * `isClientActionableProjectApproval` stops being true the moment a review is
 * confirmed or an outcome is recorded, so filtering on it alone would take the
 * ask off the doorstep at the same instant its own act landed. Two states
 * outlive it and are read from the row, not from this visit: a gate whose
 * review is complete and is waiting on the studio to issue it, and a gate that
 * carries a recorded outcome — that one stands as a receipt, so a client who
 * answered last week still finds the record on the page they answered it on.
 */
export function useDoorstepApprovals(approvals: ProjectApprovalReview[]): {
  asks: ProjectApprovalReview[];
  receipts: ProjectApprovalReview[];
  anchoredDecisionIds: string[];
  onAnswered: (decisionId: string) => void;
} {
  const [answeredHere, setAnsweredHere] = useState<string[]>([]);
  const onAnswered = useCallback((decisionId: string) => {
    setAnsweredHere((was) => (was.includes(decisionId) ? was : [...was, decisionId]));
  }, []);

  const asks = approvals.filter(
    (approval) =>
      isClientActionableProjectApproval(approval) ||
      isProjectApprovalAwaitingStudioIssue(approval) ||
      answeredHere.includes(approval.decisionId),
  );
  const receipts = approvals.filter(
    (approval) => approval.outcome !== null && !answeredHere.includes(approval.decisionId),
  );

  return {
    asks,
    receipts,
    anchoredDecisionIds: [...asks, ...receipts].map((approval) => approval.decisionId),
    onAnswered,
  };
}

function BudgetInEdition({ approval }: { approval: ProjectApprovalReview }) {
  const workingBudget = useProjectWorkingBudget(approval.projectId);
  const budget = workingBudget.data;
  // Fail closed: the figures are shown only when the edition on the page and
  // the budget the query returned are provably the same document.
  const matchesArtifact =
    budget?.id === approval.artifactId &&
    budget.version === approval.artifactVersion &&
    budget.checkpoint?.evidenceFingerprint === approval.artifactChecksum;

  return (
    <div className="mt-4 max-w-[52ch]" data-testid="approval-budget">
      <p className={EYEBROW_CLASS}>Budget details</p>
      {workingBudget.isLoading ? (
        <p
          role="status"
          data-testid="approval-budget-loading"
          className="mt-1.5 text-[15px] leading-[1.62] text-[var(--text-muted)]"
        >
          Budget details are loading…
        </p>
      ) : workingBudget.isError || !budget || !matchesArtifact ? (
        <p
          data-testid="approval-budget-unavailable"
          className="mt-1.5 text-[15px] leading-[1.62] text-[var(--text-muted)]"
        >
          Budget details are unavailable for this exact approved edition.
        </p>
      ) : (
        <div data-testid="approval-budget-details">
          <dl className="mt-2 flex flex-wrap gap-x-10 gap-y-2">
            {(
              [
                ['Target', budget.targetTotalCents],
                ['Low', budget.lowTotalCents],
                ['High', budget.highTotalCents],
              ] as Array<[string, number]>
            ).map(([label, cents]) => (
              <div key={label}>
                <dt className={EYEBROW_CLASS}>{label}</dt>
                <dd className="mt-0.5 text-[15px] leading-normal">
                  {moneyInWords(cents, budget.currency)}
                </dd>
              </div>
            ))}
          </dl>
          {budget.lines.length > 0 && (
            <ul className="mt-3 divide-y divide-[var(--border-subtle)] border-t border-[var(--border-subtle)]">
              {budget.lines.map((line, index) => (
                <li key={`${line.roomName}-${line.category}-${index}`} className="py-2.5">
                  <p className="text-[15px] leading-normal">
                    {`${line.roomName} · ${line.category}`}
                  </p>
                  <p className="mt-0.5 font-mono text-[11px] uppercase tracking-[0.1em] text-[var(--text-muted)]">
                    {`Low ${moneyInWords(line.lowCents, budget.currency)} · Target ${moneyInWords(
                      line.targetCents,
                      budget.currency,
                    )} · High ${moneyInWords(line.highCents, budget.currency)}`}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

function Discussion({ decisionId }: { decisionId: string }) {
  const { user } = useAuth();
  const comments = useDecisionComments(decisionId);
  const createComment = useCreateDecisionComment();
  const [draft, setDraft] = useState('');
  const [postFailed, setPostFailed] = useState(false);
  useDecisionRealtime(decisionId);

  const fieldId = useId().replace(/:/g, '');
  const headingId = `approval-discussion-${decisionId}`;
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
    <section className="mt-6" aria-labelledby={headingId} data-testid="approval-discussion">
      <h3 id={headingId} className={`${EYEBROW_CLASS} leading-[1.5]`}>
        The discussion
      </h3>
      <p className="mt-1.5 max-w-[52ch] text-[15px] leading-[1.62] text-[var(--text-body)]">
        Comments help you and your designer discuss the work. They never submit or change an
        approval outcome.
      </p>

      {/* A thread that failed to read is not an empty thread, and the field
          below must not invite a second telling of a question already asked. */}
      {comments.isLoading ? (
        <p
          role="status"
          data-testid="approval-comments-loading"
          className="mt-3.5 text-[15px] leading-normal text-[var(--text-muted)]"
        >
          Loading comments...
        </p>
      ) : comments.isError ? (
        <p
          role="alert"
          data-testid="approval-comments-error"
          className="mt-3.5 text-[15px] leading-normal text-[var(--color-error)]"
        >
          Comments could not be read just now. Refresh to try again.
        </p>
      ) : written.length === 0 ? (
        <p
          data-testid="approval-comments-empty"
          className="mt-3.5 text-[15px] leading-normal text-[var(--text-muted)]"
        >
          No comments yet. Add a note for your designer below.
        </p>
      ) : (
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

      {user && !comments.isLoading && !comments.isError && (
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
    </section>
  );
}

/**
 * The record of a gate answered on an earlier visit. It is not an ask — there
 * is nothing left to do on it — so it stands as its stamp and nothing more.
 */
export function ApprovalReceipt({ approval }: { approval: ProjectApprovalReview }) {
  const outcome = approval.outcome;
  if (!outcome) return null;
  const stampedAt = parseSourceDate(approval.respondedAt);

  return (
    <section
      id={`approval-${approval.decisionId}`}
      data-threshold-unit="doorstep-approval-receipt"
      data-testid="doorstep-approval-receipt"
      className={SECTION_CLASS}
    >
      <p className={`pt-2.5 ${EYEBROW_CLASS}`}>A gate · answered</p>
      <p className="mt-1.5 max-w-[52ch] text-[15px] leading-[1.62] text-[var(--text-body)]">
        {approval.question}
      </p>
      <p className="mt-3">
        <span data-testid="approval-receipt-stamp" className={STAMP_CLASS}>
          {`${STAMP_WORD[outcome]}${stampedAt ? ` ${DAY_MONTH.format(stampedAt)}` : ''}`}
          <span className="block font-normal normal-case tracking-[0.04em]">
            {`${approval.artifactTitle} · Edition ${approval.artifactVersion}`}
          </span>
        </span>
      </p>
    </section>
  );
}

export interface ApprovalAskProps {
  approval: ProjectApprovalReview;
  /** Told the decision id once this ask's own act lands. */
  onAnswered?: (decisionId: string) => void;
  /** Decision ids that carry an `#approval-<id>` anchor on this page. */
  anchoredDecisionIds?: string[];
}

export function ApprovalAsk({
  approval,
  onAnswered,
  anchoredDecisionIds = [],
}: ApprovalAskProps) {
  const confirmReview = useConfirmProjectApprovalReview();
  const respond = useRespondProjectApproval();
  const [justAnswered, setJustAnswered] = useState<{
    outcome: ProjectApprovalOutcome;
    at: Date;
  } | null>(null);
  // The outcome the client has chosen but not yet recorded. An outcome is
  // terminal, so it takes two beats: the act names its consequence, and the
  // client submits it.
  const [chosen, setChosen] = useState<ProjectApprovalOutcome | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef(false);

  const due = parseSourceDate(approval.dueAt);
  const reviewComplete = approval.completedReviewCount >= approval.requiredReviewCount;
  const canConfirm =
    approval.lifecycleStatus === 'draft' &&
    !reviewComplete &&
    approval.authorityRevision !== null;
  const confirmationUnavailable =
    approval.lifecycleStatus === 'draft' &&
    !reviewComplete &&
    approval.authorityRevision === null;
  const awaitingStudioIssue = isProjectApprovalAwaitingStudioIssue(approval);
  const canRespond =
    approval.lifecycleStatus === 'pending' &&
    approval.disposition === 'active' &&
    reviewComplete &&
    approval.outcome === null;

  // The stamp is written the moment the act returns, and it survives the
  // refetch that follows: the recorded outcome takes over from the local one.
  const recordedOutcome = approval.outcome ?? justAnswered?.outcome ?? null;
  // `updatedAt` moves on any later write to the row, so it is never a stand-in
  // for the day the client answered. A stamp with no date is honest; a stamp
  // with the wrong date is not.
  const stampedAt = parseSourceDate(approval.respondedAt) ?? justAnswered?.at ?? null;
  const chosenAct = OUTCOME_ACTS.find((act) => act.outcome === chosen) ?? null;

  const revisions = [
    { id: approval.predecessorDecisionId, label: 'Review previous edition' },
    { id: approval.successorDecisionId, label: 'Review revised edition' },
  ].filter(
    (row): row is { id: string; label: string } =>
      !!row.id && anchoredDecisionIds.includes(row.id),
  );

  async function confirmExactEdition() {
    if (inFlight.current || !canConfirm || approval.authorityRevision === null) return;
    inFlight.current = true;
    setError(null);
    setNotice(null);
    try {
      await confirmReview.mutateAsync({
        projectId: approval.projectId,
        decisionId: approval.decisionId,
        authorityRevision: approval.authorityRevision,
        artifactChecksum: approval.artifactChecksum,
        idempotencyKey: crypto.randomUUID(),
      });
      setNotice('Review confirmed for this exact artifact. Your designer can now issue it.');
      // Without this the refetch takes the ask off the doorstep mid-ceremony:
      // a confirmed draft is no longer client-actionable, and the client would
      // watch the question, the impact and the thread they were reading
      // disappear in answer to their own act.
      onAnswered?.(approval.decisionId);
    } catch (cause) {
      setError(refusalSentence(cause, CONFIRM_REFUSED));
    } finally {
      inFlight.current = false;
    }
  }

  async function submitResponse() {
    if (inFlight.current || !canRespond || !chosen) return;
    inFlight.current = true;
    setError(null);
    setNotice(null);
    try {
      await respond.mutateAsync({
        projectId: approval.projectId,
        decisionId: approval.decisionId,
        outcome: chosen,
        expectedUpdatedAt: approval.updatedAt,
        idempotencyKey: crypto.randomUUID(),
      });
      setJustAnswered({ outcome: chosen, at: new Date() });
      onAnswered?.(approval.decisionId);
    } catch (cause) {
      setError(refusalSentence(cause, RESPOND_REFUSED));
    } finally {
      inFlight.current = false;
    }
  }

  // Absence is silence: a delta of nothing is not a fact worth a row — but an
  // edition that changes nothing at all is a fact the client is agreeing to,
  // and it says so in one line rather than showing a blank.
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
      className={SECTION_CLASS}
    >
      <p className={`pt-2.5 ${EYEBROW_CLASS}`}>
        {recordedOutcome
          ? 'A gate · answered'
          : awaitingStudioIssue
            ? 'A gate · with your studio'
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
      <p
        data-testid="immutability-sentence"
        className="mt-1.5 max-w-[52ch] text-[15px] leading-[1.62] text-[var(--text-body)]"
      >
        {`You are approving edition ${approval.artifactVersion}, exactly as shown.`}
      </p>

      {approval.context && (
        <p
          data-testid="approval-rationale"
          className="mt-3 max-w-[52ch] whitespace-pre-wrap break-words text-[15px] leading-[1.62] text-[var(--text-body)]"
        >
          {approval.context}
        </p>
      )}

      {approval.artifactKind === 'budget_version' && <BudgetInEdition approval={approval} />}

      {impact.length > 0 ? (
        <dl
          data-testid="approval-impact"
          className="mt-4 flex max-w-[52ch] flex-wrap gap-x-10 gap-y-2"
        >
          {impact.map((row) => (
            <div key={row.label}>
              <dt className={EYEBROW_CLASS}>{row.label}</dt>
              <dd className="mt-0.5 text-[15px] leading-normal">{row.value}</dd>
            </div>
          ))}
        </dl>
      ) : (
        <p
          data-testid="approval-no-impact"
          className="mt-4 max-w-[52ch] text-[15px] leading-[1.62] text-[var(--text-body)]"
        >
          No cost, schedule or lead-time change.
        </p>
      )}

      {recordedOutcome && (
        <p className="mt-4">
          <span data-testid="approval-stamp" className={STAMP_CLASS}>
            {`${STAMP_WORD[recordedOutcome]}${stampedAt ? ` ${DAY_MONTH.format(stampedAt)}` : ''}`}
            <span className="block font-normal normal-case tracking-[0.04em]">
              {`${approval.artifactTitle} · Edition ${approval.artifactVersion}`}
            </span>
          </span>
        </p>
      )}

      <div className="mt-4">
        <p
          data-testid="approval-review-count"
          className="max-w-[52ch] text-[15px] leading-[1.62] text-[var(--text-body)]"
        >
          {`${approval.completedReviewCount} of ${approval.requiredReviewCount} required reviews confirmed.`}
        </p>

        {canConfirm && (
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
        )}

        {/* The gate asserts a review it then refuses to accept — say why. */}
        {confirmationUnavailable && (
          <p
            role="alert"
            data-testid="approval-confirmation-unavailable"
            className="mt-2.5 max-w-[52ch] text-[15px] leading-[1.62] text-[var(--color-error)]"
          >
            Review confirmation is temporarily unavailable. The frozen authority revision was
            not supplied.
          </p>
        )}

        {awaitingStudioIssue && (
          <p
            data-testid="approval-awaiting-studio-issue"
            className="mt-2.5 max-w-[52ch] text-[15px] leading-[1.62] text-[var(--text-body)]"
          >
            Review complete. Your designer can now issue this request.
          </p>
        )}
      </div>

      {canRespond && !justAnswered && (
        <div className="mt-4" data-testid="approval-acts">
          <p className="max-w-[52ch] text-[15px] leading-[1.62] text-[var(--text-body)]">
            Choose one outcome. Add questions or notes in Discussion below; comments do not
            submit an outcome.
          </p>

          {chosenAct === null ? (
            <div className="mt-2 flex flex-wrap items-center gap-x-6">
              {OUTCOME_ACTS.map((act) => (
                <ScoredAction
                  key={act.outcome}
                  actionKey={act.actionKey}
                  regionKey="doorstep"
                  surfaceKey="the_threshold"
                  variant={act.variant}
                  onClick={() => setChosen(act.outcome)}
                >
                  {act.label}
                </ScoredAction>
              ))}
            </div>
          ) : (
            <div className="mt-2" data-testid="approval-confirm-outcome">
              <p
                data-testid="approval-consequence"
                className="max-w-[52ch] text-[15px] leading-[1.62] text-[var(--text-body)]"
              >
                {`${chosenAct.label} · ${chosenAct.consequence}`}
              </p>
              <div className="mt-2 flex flex-wrap items-center gap-x-6">
                <ScoredAction
                  actionKey="submit_project_approval_response"
                  regionKey="doorstep"
                  surfaceKey="the_threshold"
                  variant="primary"
                  loading={respond.isPending}
                  loadingLabel="Recording response"
                  onClick={submitResponse}
                >
                  Submit response
                </ScoredAction>
                <ScoredAction
                  actionKey="cancel_project_approval_response"
                  regionKey="doorstep"
                  surfaceKey="the_threshold"
                  variant="tertiary"
                  disabled={respond.isPending}
                  onClick={() => setChosen(null)}
                >
                  Choose another outcome
                </ScoredAction>
              </div>
            </div>
          )}
        </div>
      )}

      {notice && (
        <p
          role="status"
          data-testid="approval-notice"
          className="mt-3 max-w-[52ch] text-[15px] leading-[1.62] text-[var(--text-body)]"
        >
          {notice}
        </p>
      )}

      {error && (
        <p role="alert" className="mt-3 text-[15px] leading-normal text-[var(--color-error)]">
          {error}
        </p>
      )}

      {revisions.length > 0 && (
        <nav
          aria-label="Approval revision history"
          data-testid="approval-revisions"
          className="mt-4"
        >
          <ul className="flex flex-wrap gap-x-6">
            {revisions.map((row) => (
              <li key={row.id}>
                <a
                  href={`#approval-${row.id}`}
                  className="inline-flex min-h-11 items-center text-[15px] leading-normal underline"
                >
                  {row.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>
      )}

      <Discussion decisionId={approval.decisionId} />
    </section>
  );
}
