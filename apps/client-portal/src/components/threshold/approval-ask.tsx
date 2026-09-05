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

import { HoldAction, ScoredAction } from '@/components/threshold/instruments/scored-action';
import {
  SignatureLine,
  signatureIsComplete,
} from '@/components/threshold/instruments/signature-line';
import { Stamp, stampStateForApproval } from '@/components/threshold/instruments/stamp';
import {
  approvalWeighing,
  countInWords,
} from '@/components/threshold/instruments/standing-sentence';
import { useProjectWorkingBudget } from '@/hooks/use-commercial-client';
import { useAuth } from '@/hooks/use-auth';
import {
  isClientActionableProjectApproval,
  isProjectApprovalAwaitingStudioIssue,
} from '@/lib/client-attention';
import { parseSourceDate } from '@/lib/threshold/derive';
import { refusalSentence } from '@/lib/threshold/refusal';

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
 * The note IS the return: an edition sent back with nothing said about it is
 * a designer's dead end. So a note that does not land stops the outcome, and
 * says so without blaming her for it.
 */
const NOTE_REFUSED =
  'The note could not be sent, so the edition was not returned. Your note is still here; try again.';

/**
 * Three doors, one weight. The three outcomes are peers — a house that ranks
 * them has already answered for her — so they carry ONE variant between them;
 * the old primary / secondary / tertiary ranking is retired here (P-16).
 *
 * Each label is a verb and each consequence says what the verb does, so the
 * act is legible before it is taken. The telemetry keys are unchanged and
 * deliberately so: they are the same events the retired detail page emitted,
 * and renaming them would break the series, not the copy.
 */
const OUTCOME_VARIANT = 'secondary' as const;

const OUTCOME_ACTS: Array<{
  outcome: ProjectApprovalOutcome;
  /**
   * The act that WRITES the outcome. Choosing one records nothing, so the
   * outcome's own event belongs on the submit — a client who considers
   * returning an edition and then approves it must not have emitted
   * `decline_project_approval`.
   */
  writeKey: string;
  /** Choosing an outcome to read its consequence: a selection, not a record. */
  selectKey: string;
  label: string;
  consequence: string;
}> = [
  {
    outcome: 'approved',
    writeKey: 'approve_project_approval',
    selectKey: 'consider_approve_project_approval',
    label: 'Approve',
    consequence: 'Accept this exact edition and its stated impacts.',
  },
  {
    outcome: 'changes_requested',
    writeKey: 'decline_project_approval',
    selectKey: 'consider_decline_project_approval',
    label: 'Return',
    consequence: 'Send this edition back for revision and a new approval request.',
  },
  {
    outcome: 'needs_discussion',
    writeKey: 'question_project_approval',
    selectKey: 'consider_question_project_approval',
    label: 'Hold',
    consequence: 'Keep this open while you and your designer talk it through.',
  },
];

const EYEBROW_CLASS =
  'font-mono text-[11px] uppercase tracking-[0.12em] text-[var(--text-muted)]';
const SECTION_CLASS =
  'relative mt-8 border-t border-[var(--border-subtle)] pb-8 text-[var(--text-primary)]';

/**
 * Who a comment that is not the client's own is from. The studio answers as
 * itself: the designer she knows, under the studio's name. An internal
 * reviewer's identity is never a name a client reads, so a thread the studio
 * cannot be resolved for stays "The studio".
 */
function studioHand(
  designerGivenName: string | null | undefined,
  studioName: string | null | undefined,
): string {
  const designer = designerGivenName?.trim();
  const studio = studioName?.trim();
  return designer && studio ? `${designer} · ${studio}` : 'The studio';
}

/** A word that opens a sentence. */
function upperFirst(word: string): string {
  return word.charAt(0).toUpperCase() + word.slice(1);
}

/**
 * The artifact's own figures, to the cent — `formatMoney` from the retired
 * `/decisions/[id]` page, verbatim. The house's prose rounds to whole dollars
 * and is right to; the table of the document the client is being bound to may
 * not, or a target of $48,200.60 reads $48,201 on the edition she approves.
 */
function moneyExact(cents: number, currency: string): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(cents / 100);
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
 * carries a recorded outcome — that one stands as a record in Previously, so a
 * client who answered last week still finds it on the page she answered it on.
 *
 * A gate that is neither open nor answered — withdrawn, or superseded by a
 * later edition — is history too, and stood on no surface at all until it was
 * filed here. It reads as its own word (Withdrawn / Superseded, ahead of any
 * outcome, the precedence `stampStateForApproval` keeps) and carries no act
 * and no revision link: a closed edition is read, not navigated from.
 *
 * `asks` wins over `records` — an id may anchor exactly one element on the
 * page, and the `#approval-<id>` links depend on it.
 */
export function useDoorstepApprovals(approvals: ProjectApprovalReview[]): {
  asks: ProjectApprovalReview[];
  records: ProjectApprovalReview[];
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
  const asked = new Set(asks.map((approval) => approval.decisionId));
  const records = approvals
    .filter(
      (approval) =>
        !asked.has(approval.decisionId) &&
        (approval.outcome !== null || approval.disposition !== 'active'),
    )
    .sort((a, b) => recordedAtOf(b).localeCompare(recordedAtOf(a)));

  return {
    asks,
    records,
    anchoredDecisionIds: [...asks, ...records].map((approval) => approval.decisionId),
    onAnswered,
  };
}

/** When a gate closed, for ordering the record newest first. */
function recordedAtOf(approval: ProjectApprovalReview): string {
  return approval.respondedAt ?? approval.updatedAt ?? approval.createdAt ?? '';
}

/**
 * The designer's one-line why, when the row carries one (P-13). Null on every
 * approval composed before 00569, and a whitespace-only why is no why at all.
 */
function whyOf(approval: ProjectApprovalReview): string | null {
  const why = approval.why;
  return typeof why === 'string' && why.trim().length > 0 ? why.trim() : null;
}

/**
 * The artifact, shown.
 *
 * A plate with a frame around it: the budget itself where the artifact IS a
 * budget, and otherwise the edition named and dated — never an empty box
 * pretending to be a document.
 *
 * There is no picture of a plan issue here, and there cannot be one yet:
 * `_resolve_project_approval_artifact` freezes a plan_issue snapshot as exactly
 * kind/id/version/checksum/title/issuedAt/sheetCount (00463), the immutability
 * guard rejects any artifact row whose snapshot differs from that, and
 * `parseProjectApprovalReview` builds its object field by field so no snapshot
 * reaches this surface at all. A cover preview needs both a widened snapshot
 * and a widened projection; naming the edition is the honest plate until then.
 *
 * The checksum is a maker's mark at the frame's edge: twelve characters, in
 * mono, quiet. It is provenance, the way a stamp on the back of a chair is
 * provenance — not a compliance string, and never presented as something she
 * is meant to check.
 */
function ArtifactPlate({ approval }: { approval: ProjectApprovalReview }) {
  const issued = parseSourceDate(approval.sentAt) ?? parseSourceDate(approval.createdAt);
  const makersMark = approval.artifactChecksum.slice(0, 12);

  return (
    <figure
      data-testid="approval-plate"
      className="relative mt-3 max-w-[52ch] border border-[var(--border-default)] p-3"
    >
      {approval.artifactKind === 'budget_version' ? (
        <BudgetInEdition approval={approval} />
      ) : null}

      <figcaption className="mt-2">
        <p
          data-testid="approval-plate-title"
          className="font-heading text-[1.05rem] leading-[1.45] text-[var(--text-primary)]"
        >
          {approval.artifactTitle}
        </p>
        <p className="mt-0.5 text-[15px] leading-normal text-[var(--text-body)]">
          {`Edition ${approval.artifactVersion}`}
          {issued ? ` · Issued ${LONG_MONTH_DAY.format(issued)}` : ''}
        </p>
      </figcaption>

      <span
        data-testid="approval-makers-mark"
        aria-hidden="true"
        className="absolute bottom-1.5 right-2 font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--text-muted)] opacity-60"
      >
        {makersMark}
      </span>
    </figure>
  );
}

function BudgetInEdition({ approval }: { approval: ProjectApprovalReview }) {
  const workingBudget = useProjectWorkingBudget(approval.projectId);
  const budget = workingBudget.data;
  // The three totals are the budget; the room-by-room breakdown is the reading
  // behind it. On a phone the breakdown buries the act, so it folds — and only
  // there: at reading width the whole of it stands open with no control at all.
  const [breakdownOpen, setBreakdownOpen] = useState(false);
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
                  {moneyExact(cents, budget.currency)}
                </dd>
              </div>
            ))}
          </dl>
          {budget.lines.length > 0 && (
            <div className={breakdownOpen ? 'block' : 'hidden sm:block'}>
            <ul
              id="approval-budget-breakdown"
              data-testid="approval-budget-breakdown"
              className="mt-3 divide-y divide-[var(--border-subtle)] border-t border-[var(--border-subtle)]"
            >
              {budget.lines.map((line, index) => (
                <li key={`${line.roomName}-${line.category}-${index}`} className="py-2.5">
                  <p className="text-[15px] leading-normal">
                    {`${line.roomName} · ${line.category}`}
                  </p>
                  <p className="mt-0.5 font-mono text-[11px] uppercase tracking-[0.1em] text-[var(--text-muted)]">
                    {`Low ${moneyExact(line.lowCents, budget.currency)} · Target ${moneyExact(
                      line.targetCents,
                      budget.currency,
                    )} · High ${moneyExact(line.highCents, budget.currency)}`}
                  </p>
                </li>
              ))}
            </ul>
            </div>
          )}
          {budget.lines.length > 0 && (
            <div className="mt-2 sm:hidden">
              <ScoredAction
                actionKey="read_approval_budget_breakdown"
                regionKey="doorstep"
                surfaceKey="the_threshold"
                variant="tertiary"
                aria-expanded={breakdownOpen}
                aria-controls="approval-budget-breakdown"
                onClick={() => setBreakdownOpen((was) => !was)}
              >
                {breakdownOpen ? 'Close the breakdown' : 'Read the breakdown'}
              </ScoredAction>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * @param readOnly a closed gate's thread. The conversation that explains the
 *   outcome is half the record, so it stays readable — but nothing may be added
 *   to a discussion whose gate has already been answered.
 */
function Discussion({
  decisionId,
  readOnly = false,
  designerGivenName,
  studioName,
  composerRef,
}: {
  decisionId: string;
  readOnly?: boolean;
  designerGivenName?: string | null;
  studioName?: string | null;
  /** Handed the composer itself, so the ask above can put her in it. */
  composerRef?: (node: HTMLTextAreaElement | null) => void;
}) {
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
          className="mt-3.5 border-t border-[var(--border-subtle)] pt-2 text-[15px] leading-normal text-[var(--text-body)]"
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
                {user && comment.author_id === user.id
                  ? 'You'
                  : studioHand(designerGivenName, studioName)}
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

      {!readOnly && user && !comments.isLoading && !comments.isError && (
        <div className="mt-4 max-w-[58ch]">
          <label
            className="block font-mono text-[11px] uppercase tracking-[0.13em] text-[var(--text-muted)]"
            htmlFor={`approval-comment-${fieldId}`}
          >
            Add to the discussion
          </label>
          <textarea
            id={`approval-comment-${fieldId}`}
            ref={composerRef}
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
            <p role="alert" className="mt-2 border-t border-[var(--border-subtle)] pt-2 text-[15px] leading-normal text-[var(--text-body)]">
              The comment could not be posted. Your draft is still here; try again.
            </p>
          )}
        </div>
      )}
    </section>
  );
}

/**
 * The record of a gate that is closed: answered on an earlier visit, withdrawn
 * by the studio, or superseded by a later edition. It is not an ask — nothing
 * on it can be changed — so it carries its stamp, and the discussion that
 * explains it, and no link out of itself.
 *
 * The stamp takes the house's own precedence: `Withdrawn` / `Superseded` stand
 * AHEAD of an outcome (`stampStateForApproval`), so a superseded edition
 * never reads plainly RETURNED beside the live edition that replaced it.
 */
export function ApprovalReceipt({
  approval,
  designerGivenName,
  studioName,
}: {
  approval: ProjectApprovalReview;
  designerGivenName?: string | null;
  studioName?: string | null;
}) {
  const [reading, setReading] = useState(false);
  const closed = approval.outcome !== null || approval.disposition !== 'active';
  const stampedAt = parseSourceDate(approval.respondedAt);
  const headingId = `approval-record-${approval.decisionId}`;
  const threadId = `approval-record-thread-${approval.decisionId}`;
  if (!closed) return null;

  return (
    <section
      id={`approval-${approval.decisionId}`}
      data-threshold-unit="doorstep-approval-receipt"
      data-testid="doorstep-approval-receipt"
      aria-labelledby={headingId}
      className={SECTION_CLASS}
    >
      <p className={`pt-2.5 ${EYEBROW_CLASS}`}>
        {approval.disposition === 'active'
          ? 'Your approval · answered'
          : 'Your approval · closed'}
      </p>
      {/* A heading, so a screen-reader user browsing by heading finds the
          records as well as the asks. */}
      <h3
        id={headingId}
        className="font-heading mt-1.5 max-w-[52ch] text-[1.05rem] font-normal leading-[1.45] text-[var(--text-body)]"
      >
        {approval.question}
      </h3>
      <p className="mt-3">
        <Stamp
          data-testid="approval-receipt-stamp"
          state={stampStateForApproval(approval)}
          since={stampedAt}
          dateLabel={stampedAt ? DAY_MONTH.format(stampedAt) : null}
        >
          {`${approval.artifactTitle} · Edition ${approval.artifactVersion}`}
        </Stamp>
      </p>
      <div className="mt-3">
        <ScoredAction
          actionKey="read_approval_discussion"
          regionKey="previously"
          surfaceKey="the_threshold"
          variant="tertiary"
          aria-expanded={reading}
          aria-controls={reading ? threadId : undefined}
          onClick={() => setReading((was) => !was)}
        >
          {reading ? 'Close the discussion' : 'Read the discussion'}
        </ScoredAction>
      </div>
      {reading && (
        <div id={threadId}>
          <Discussion
            decisionId={approval.decisionId}
            readOnly
            designerGivenName={designerGivenName}
            studioName={studioName}
          />
        </div>
      )}
    </section>
  );
}

/** How many closed gates stand open before the rest are folded away. */
const RECORDS_SHOWN = 3;

/**
 * The approvals already closed, under one heading, newest first — the
 * `History (N)` pile `/decisions` kept, rather than a year of full-width stamps
 * stacked between the ask and the plan key. The pile is not counted at her:
 * how many she has answered is not a thing she is being asked to carry.
 */
export function ApprovalRecords({
  approvals,
  designerGivenName,
  studioName,
}: {
  approvals: ProjectApprovalReview[];
  designerGivenName?: string | null;
  studioName?: string | null;
}) {
  const [all, setAll] = useState(false);
  if (approvals.length === 0) return null;
  const shown = all ? approvals : approvals.slice(0, RECORDS_SHOWN);

  return (
    <section
      data-testid="approval-records"
      aria-labelledby="approval-records-heading"
      className="mt-8 border-t border-[var(--border-default)] pt-3"
    >
      <h2 id="approval-records-heading" className={EYEBROW_CLASS}>
        Earlier approvals
      </h2>
      {shown.map((approval) => (
        <ApprovalReceipt
          key={approval.decisionId}
          approval={approval}
          designerGivenName={designerGivenName}
          studioName={studioName}
        />
      ))}
      {!all && approvals.length > RECORDS_SHOWN && (
        <div className="mt-3">
          <ScoredAction
            actionKey="read_earlier_approval_records"
            regionKey="previously"
            surfaceKey="the_threshold"
            variant="tertiary"
            onClick={() => setAll(true)}
          >
            Read the earlier approvals
          </ScoredAction>
        </div>
      )}
    </section>
  );
}

export interface ApprovalAskProps {
  approval: ProjectApprovalReview;
  /** Told the decision id once this ask's own act lands. */
  onAnswered?: (decisionId: string) => void;
  /** Decision ids that carry an `#approval-<id>` anchor on this page. */
  anchoredDecisionIds?: string[];
  /** The designer the client deals with, by the name she calls him. */
  designerGivenName?: string | null;
  /** The studio's own name, as the doorplate resolves it. */
  studioName?: string | null;
}

export function ApprovalAsk({
  approval,
  onAnswered,
  anchoredDecisionIds = [],
  designerGivenName = null,
  studioName = null,
}: ApprovalAskProps) {
  const confirmReview = useConfirmProjectApprovalReview();
  const respond = useRespondProjectApproval();
  // A returned edition carries its reason into the thread the studio already
  // reads. R10 rules the requirement out of the database on purpose: this is
  // the web's own asymmetry, and iOS's encouraged composer is the other half.
  const changeNoteComment = useCreateDecisionComment();
  const [changeNote, setChangeNote] = useState('');
  // The name she signs the outcome with (R1). The RPC keeps the same
  // two-character floor the signing route does, and refuses a signature that
  // arrives without a consent method — so the two travel together or not at all.
  const [signature, setSignature] = useState('');
  const [justAnswered, setJustAnswered] = useState<{
    outcome: ProjectApprovalOutcome;
    at: Date;
  } | null>(null);
  // The outcome the client has chosen but not yet recorded. An outcome is
  // terminal, so it takes two beats: the act names its consequence, and the
  // client submits it.
  const [chosen, setChosen] = useState<ProjectApprovalOutcome | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  // The discussion composer itself, once it is on the page. Held as state
  // rather than a ref because the act that puts her in it may only be drawn
  // when there is something to put her in.
  const [composer, setComposer] = useState<HTMLTextAreaElement | null>(null);
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef(false);
  // The note that already reached the thread. A refused outcome leaves the note
  // posted and invites her to press Submit again; without this latch the second
  // press says the same thing twice in the designer's thread. Editing the note
  // before retrying makes it a different thing to say, so it is sent.
  const notePosted = useRef<string | null>(null);

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
  /** The designer, named where the copy has room for a name. */
  const designer = designerGivenName?.trim() || null;
  /** His one line about this edition, frozen with it, when the row carries one. */
  const why = whyOf(approval);

  // Words, not a tally: what she is being told is whether her own review is in,
  // and on the rare approval that takes several, how many of them are.
  const reviewStanding =
    approval.requiredReviewCount <= 1
      ? reviewComplete
        ? 'Your review is confirmed.'
        : 'Your review is still needed.'
      : approval.completedReviewCount === 0
        ? `None of ${countInWords(approval.requiredReviewCount)} reviews are confirmed yet.`
        : `${upperFirst(countInWords(approval.completedReviewCount))} of ${countInWords(
            approval.requiredReviewCount,
          )} reviews confirmed.`;

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
    const note = changeNote.trim();
    if (chosen === 'changes_requested' && note.length === 0) return;
    const signedByName = signature.trim();
    if (!signatureIsComplete(signedByName)) return;
    inFlight.current = true;
    setError(null);
    setNotice(null);
    try {
      // The note lands FIRST. An outcome recorded against a note that never
      // arrived would send the edition back saying nothing — and a note that
      // already landed is not sent twice when the outcome is retried.
      if (chosen === 'changes_requested' && notePosted.current !== note) {
        try {
          await changeNoteComment.mutateAsync({ decisionId: approval.decisionId, body: note });
          notePosted.current = note;
        } catch (cause) {
          setError(refusalSentence(cause, NOTE_REFUSED));
          return;
        }
      }
      await respond.mutateAsync({
        projectId: approval.projectId,
        decisionId: approval.decisionId,
        outcome: chosen,
        expectedUpdatedAt: approval.updatedAt,
        idempotencyKey: crypto.randomUUID(),
        // 00570 carries the pair through the wrapper into the columns 00117
        // added. The two travel together: a signature with no method is a
        // check_violation, by design.
        clientSignature: signedByName,
        clientConsentMethod: 'electronic_signature',
      });
      setJustAnswered({ outcome: chosen, at: new Date() });
      onAnswered?.(approval.decisionId);
    } catch (cause) {
      setError(refusalSentence(cause, RESPOND_REFUSED));
    } finally {
      inFlight.current = false;
    }
  }

  // What the edition weighs, spoken once and then printed as figures. The
  // three deltas stand side by side and are never summed (R11), and a delta of
  // zero is said in words rather than left out — she is agreeing to all three.
  //
  // The baseline is read through a cast on purpose. `why` and `viewerRole` are
  // now real fields because 00569 projects them; no migration projects a cost
  // baseline, so typing one on ProjectApprovalReview would promise a field the
  // mapper could only ever set to null. A cost delta beside the figure it moves
  // from is a fact where the delta alone is a fragment, so the composer takes
  // one the moment a projection carries it — and the cast goes with it.
  const weighing = approvalWeighing({
    costCentsDelta: approval.costCentsDelta,
    scheduleDaysDelta: approval.scheduleDaysDelta,
    leadTimeDaysDelta: approval.leadTimeDaysDelta,
    costBaselineCents:
      (approval as { costBaselineCents?: number | null }).costBaselineCents ?? null,
  });

  // `data-never-dim` is spared the Since-Yesterday dim only while something is
  // actually owed on it: a gate she has reviewed and that now waits on the
  // studio owes her nothing, and reads like the other two gates do.
  return (
    <section
      id={`approval-${approval.decisionId}`}
      data-threshold-unit="doorstep-approval"
      {...(recordedOutcome || awaitingStudioIssue ? {} : { 'data-never-dim': '' })}
      data-testid="doorstep-approval"
      aria-labelledby={`approval-gate-${approval.decisionId}`}
      className={SECTION_CLASS}
    >
      <p className={`pt-2.5 ${EYEBROW_CLASS}`}>
        {recordedOutcome
          ? 'Your approval · answered'
          : awaitingStudioIssue
            ? 'Your approval · with your studio'
            : approval.lifecycleStatus === 'draft'
              ? 'Your approval · read the edition first'
              : 'Your approval · your answer is needed'}
      </p>
      <ArtifactPlate approval={approval} />

      {/* The ask is a thing someone said, so it is set as one: a pull-quote on
          a clay rule, in the designer's hand, and signed. No attribution is
          drawn when the house has no name to sign it with. */}
      <blockquote
        data-testid="approval-question"
        className="mt-4 max-w-[52ch] border-l-2 border-[var(--accent-primary)] pl-4"
      >
        <h2
          id={`approval-gate-${approval.decisionId}`}
          className="font-heading text-[1.35rem] font-medium leading-[1.35] tracking-[-0.012em]"
        >
          {approval.question}
        </h2>
        {why && (
          <p
            data-testid="approval-why"
            className="mt-2 whitespace-pre-wrap break-words text-[15px] leading-[1.62] text-[var(--text-body)]"
          >
            {why}
          </p>
        )}
        {designer && (
          <p
            data-testid="approval-attribution"
            className="mt-2 text-[15px] leading-normal text-[var(--text-muted)]"
          >
            {`— ${designer}`}
          </p>
        )}
      </blockquote>

      {due && (
        <p className="mt-3 max-w-[52ch] text-[15px] leading-relaxed text-[var(--text-body)]">
          {`Due ${LONG_MONTH_DAY.format(due)}`}
        </p>
      )}
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

      <div data-testid="approval-impact" className="mt-4 max-w-[52ch]">
        <p
          data-testid="approval-impact-sentence"
          className="text-[15px] leading-[1.62] text-[var(--text-body)]"
        >
          {weighing.sentence}
        </p>
        {weighing.ledger && (
          <p
            data-testid="approval-impact-ledger"
            className="mt-1.5 font-mono text-[11px] uppercase tracking-[0.1em] text-[var(--text-muted)]"
          >
            {weighing.ledger}
          </p>
        )}
      </div>

      {recordedOutcome && (
        <p className="mt-4">
          <Stamp
            data-testid="approval-stamp"
            state={stampStateForApproval({
              disposition: approval.disposition,
              outcome: recordedOutcome,
            })}
            since={stampedAt}
            dateLabel={stampedAt ? DAY_MONTH.format(stampedAt) : null}
          >
            {`${approval.artifactTitle} · Edition ${approval.artifactVersion}`}
          </Stamp>
        </p>
      )}

      <div className="mt-4">
        <p
          data-testid="approval-review-count"
          className="max-w-[52ch] text-[15px] leading-[1.62] text-[var(--text-body)]"
        >
          {reviewStanding}
        </p>

        {canConfirm && (
          <div className="mt-2.5">
            {/* Held, not tapped (R1). The review METHOD is unchanged —
                `portal_clickthrough`, because a hold is still a click-through
                — so no migration rides with this one. */}
            <HoldAction
              actionKey="confirm_project_approval_review"
              regionKey="doorstep"
              surfaceKey="the_threshold"
              variant="primary"
              verb="confirm this exact edition"
              loading={confirmReview.isPending}
              loadingLabel="Confirming"
              onHold={confirmExactEdition}
            >
              Review exact edition
            </HoldAction>
          </div>
        )}

        {/* The gate asserts a review it then refuses to accept — say why. */}
        {confirmationUnavailable && (
          <p
            role="alert"
            data-testid="approval-confirmation-unavailable"
            className="mt-2.5 max-w-[52ch] border-t border-[var(--border-subtle)] pt-2 text-[15px] leading-[1.62] text-[var(--text-body)]"
          >
            Review confirmation is temporarily unavailable. The frozen authority revision was
            not supplied.
          </p>
        )}

        {/* Not a dead end: it says what she did, who has it, and that she is
            free — and no timing, because nothing on this row knows one. The
            act beside it is drawn only once the composer it opens is on the
            page, so it can never be a button that does nothing. */}
        {awaitingStudioIssue && (
          <>
            <p
              data-testid="approval-awaiting-studio-issue"
              className="mt-2.5 max-w-[52ch] text-[15px] leading-[1.62] text-[var(--text-body)]"
            >
              {`You've confirmed edition ${approval.artifactVersion}. ${
                designer ?? 'Your designer'
              } issues it next. Nothing is waiting on you.`}
            </p>
            {composer && (
              <div className="mt-2.5">
                <ScoredAction
                  actionKey="ask_designer_about_approval"
                  regionKey="doorstep"
                  surfaceKey="the_threshold"
                  variant="secondary"
                  onClick={() => composer.focus()}
                >
                  {`Ask ${designer ?? 'your designer'} about this`}
                </ScoredAction>
              </div>
            )}
          </>
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
                  actionKey={act.selectKey}
                  regionKey="doorstep"
                  surfaceKey="the_threshold"
                  variant={OUTCOME_VARIANT}
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
              {/* The change note, required here and nowhere else (R10). It asks
                  for the thing the designer needs rather than reporting that a
                  field is empty: no error state, no red, no "required" — the
                  submit simply is not ready until she has said something. */}
              {chosenAct.outcome === 'changes_requested' && (
                <div className="mt-3 max-w-[52ch]">
                  <label
                    className="block font-mono text-[11px] uppercase tracking-[0.13em] text-[var(--text-muted)]"
                    htmlFor={`approval-change-note-${approval.decisionId}`}
                  >
                    {`Tell ${designer ?? 'your designer'} what to change.`}
                  </label>
                  <textarea
                    id={`approval-change-note-${approval.decisionId}`}
                    data-testid="approval-change-note"
                    value={changeNote}
                    onChange={(event) => setChangeNote(event.target.value)}
                    rows={3}
                    className="mt-1.5 w-full resize-none border-0 border-b border-current bg-transparent px-0.5 py-1 font-heading text-[1.05rem] text-[var(--text-primary)]"
                  />
                  <p
                    data-testid="approval-change-note-help"
                    className="mt-1.5 text-[15px] leading-[1.62] text-[var(--text-body)]"
                  >
                    It goes into the discussion below with your answer.
                  </p>
                </div>
              )}
              {/* The name, on a rule, dated. An outcome against a frozen
                  edition is a terminal act, and R1 asks every one of them for
                  the same two things: a typed legal name and a held gesture. */}
              <div className="mt-3">
                <SignatureLine
                  id={`approval-signature-${approval.decisionId}`}
                  testId="approval-signature"
                  value={signature}
                  onChange={setSignature}
                  disabled={respond.isPending}
                />
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-x-6">
                <HoldAction
                  actionKey={chosenAct.writeKey}
                  regionKey="doorstep"
                  surfaceKey="the_threshold"
                  variant="primary"
                  verb={chosenAct.label.toLowerCase()}
                  loading={respond.isPending || changeNoteComment.isPending}
                  loadingLabel="Recording response"
                  disabled={
                    !signatureIsComplete(signature) ||
                    (chosenAct.outcome === 'changes_requested' &&
                      changeNote.trim().length === 0)
                  }
                  onHold={submitResponse}
                >
                  Submit response
                </HoldAction>
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
          {/* Named on the picker itself: the answer is hers to give, and no
              one else's name is on this page to give it. */}
          <p
            data-testid="approval-who-answers"
            className="mt-3 max-w-[52ch] text-[15px] leading-[1.62] text-[var(--text-muted)]"
          >
            {"You're the one who answers this."}
          </p>
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
        <p role="alert" className="mt-3 border-t border-[var(--border-subtle)] pt-2 text-[15px] leading-normal text-[var(--text-body)]">
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

      <Discussion
        decisionId={approval.decisionId}
        designerGivenName={designerGivenName}
        studioName={studioName}
        composerRef={setComposer}
      />
    </section>
  );
}
