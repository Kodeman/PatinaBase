'use client';

import { useCallback, useEffect, useId, useRef, useState } from 'react';

import {
  useConfirmProjectApprovalReview,
  useCreateDecisionComment,
  useDecisionComments,
  useDecisionRealtime,
  useDecisionSnooze,
  useRespondProjectApproval,
  useSetDecisionSnooze,
  type DecisionComment,
  type DecisionSnoozeChoice,
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
import type { WorkingBudgetVersion } from '@/lib/commercial-documents';
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
 * outcome, the precedence `stampStateForApproval` keeps). Nothing on it can be
 * changed; P-27 gives it one act that changes nothing — the way FORWARD, to
 * the edition that replaced it, so a superseded record is not the dead end at
 * the end of the thread.
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
 * The name of the hand that WROTE the why, frozen with the artifact (P-13,
 * ruling 2026-09-05). A studio has more than one designer and this sentence is
 * immutable and client-facing, so it is signed by its author or by nobody —
 * never by whoever happens to hold the project on the day she reads it. Null
 * on every row whose projection predates the name, and rendered verbatim.
 */
function whyAuthorOf(approval: ProjectApprovalReview): string | null {
  const name = approval.whyAuthorName;
  return typeof name === 'string' && name.trim().length > 0 ? name.trim() : null;
}

/* ── THE THREAD ──────────────────────────────────────────────────────────────
   P-27. A superseded approval and the edition that replaced it are one
   conversation, and they used to read as two bare links. The successor opens
   by saying what it follows and what moved since she last answered.

   IT NEVER SAYS UNDONE. A successor is a NEW decision, not a reopening: her
   earlier answer stands on its own record and is not taken back by the
   edition that came after it. So the line is "replaces the edition you
   approved", never "your approval was reversed", and nothing here reaches for
   the words reopened, undone or void.
   ────────────────────────────────────────────────────────────────────────── */

/** What she did last time, in the past tense the outcome words take. */
const OUTCOME_IN_PAST: Record<ProjectApprovalOutcome, string> = {
  approved: 'approved',
  changes_requested: 'returned',
  needs_discussion: 'held',
};

/**
 * "Edition 4 replaces the edition you returned on August 12."
 *
 * Null unless the predecessor is in hand AND carries an answer of hers with a
 * date on it. A predecessor withdrawn before she ever answered is not "the
 * edition you ...", and a sentence that has to guess which verb goes in the
 * blank is a sentence this surface does not write.
 */
export function successionLine(
  edition: number,
  predecessor: Pick<ProjectApprovalReview, 'outcome' | 'respondedAt'> | null | undefined,
): string | null {
  const outcome = predecessor?.outcome;
  if (!outcome) return null;
  const at = parseSourceDate(predecessor?.respondedAt);
  if (!at) return null;
  return `Edition ${edition} replaces the edition you ${OUTCOME_IN_PAST[outcome]} on ${LONG_MONTH_DAY.format(
    at,
  )}.`;
}

/**
 * The single act along the thread, forward first.
 *
 * Only a sibling that is itself anchored on this page is offered — an
 * `#approval-<id>` link to a row the doorstep is not drawing lands nowhere.
 */
export function revisionAct(
  approval: Pick<ProjectApprovalReview, 'predecessorDecisionId' | 'successorDecisionId'>,
  anchoredDecisionIds: readonly string[],
): { id: string; label: string } | null {
  const successor = approval.successorDecisionId;
  if (successor && anchoredDecisionIds.includes(successor)) {
    return { id: successor, label: 'Review revised edition' };
  }
  const predecessor = approval.predecessorDecisionId;
  if (predecessor && anchoredDecisionIds.includes(predecessor)) {
    return { id: predecessor, label: 'Review previous edition' };
  }
  return null;
}

/** The fallback, when the two projections differ in nothing she can read. */
export const NEW_EDITION_ONLY = 'The studio issued a new edition.';

/**
 * What changed between the edition she answered and the one in front of her,
 * computed from the two projections and nothing else.
 *
 * The title/version is one line; the three deltas are the standing sentence's
 * own weighing grammar, run over the DIFFERENCE between the two asks — so
 * "the cost rises by $400" here means this edition asks four hundred dollars
 * more than the last one did, which is the question she actually has.
 *
 * When nothing computable differs it says the studio issued a new edition and
 * no more. Inventing a reason the projection does not carry would be the
 * surface speaking for the designer.
 */
export function whatChangedSince(
  predecessor: ProjectApprovalReview,
  current: ProjectApprovalReview,
): string[] {
  const lines: string[] = [];

  const was = predecessor.artifactTitle.trim();
  const now = current.artifactTitle.trim();
  if (was && now && was !== now) {
    lines.push(`It is titled \u201C${now}\u201D; the one you answered was \u201C${was}\u201D.`);
  }

  const moved = approvalWeighing({
    costCentsDelta: current.costCentsDelta - predecessor.costCentsDelta,
    scheduleDaysDelta: current.scheduleDaysDelta - predecessor.scheduleDaysDelta,
    leadTimeDaysDelta: current.leadTimeDaysDelta - predecessor.leadTimeDaysDelta,
  });
  // An empty ledger is the composer's own word for "all three are zero".
  if (moved.ledger) lines.push(moved.sentence);

  return lines.length > 0 ? lines : [NEW_EDITION_ONLY];
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
/**
 * RULED 2026-09-05, at the Wave 2 walks: **the maker's mark leaves the
 * doorstep.** R6 keeps the twelve-character checksum for the printed Record of
 * Decision only (Wave 3, P-26), so it is not drawn here. It was also the last
 * serious contrast failure on this surface — `--text-muted` at `opacity-60`
 * composites to #938B83 on the page ground, 3.13:1 against a 4.5:1 floor —
 * and it was `aria-hidden`, which made it a string a sighted reader could see
 * and a screen reader could not. The frame stays: the plate is still a plate.
 */
function ArtifactPlate({ approval }: { approval: ProjectApprovalReview }) {
  const issued = parseSourceDate(approval.sentAt) ?? parseSourceDate(approval.createdAt);

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
    </figure>
  );
}

/**
 * Fail closed: a working budget stands for the edition on the page ONLY when
 * its id, its version and its evidence fingerprint all match the frozen
 * artifact. Two readers depend on this — the figures inside the plate, and the
 * cost baseline the weighing sentence speaks (R11) — so the predicate is one
 * function and cannot drift between them.
 */
export function budgetIsTheEdition(
  budget: WorkingBudgetVersion | null | undefined,
  approval: Pick<
    ProjectApprovalReview,
    'artifactId' | 'artifactVersion' | 'artifactChecksum'
  >,
): budget is WorkingBudgetVersion {
  return (
    !!budget &&
    budget.id === approval.artifactId &&
    budget.version === approval.artifactVersion &&
    budget.checkpoint?.evidenceFingerprint === approval.artifactChecksum
  );
}

function BudgetInEdition({ approval }: { approval: ProjectApprovalReview }) {
  const workingBudget = useProjectWorkingBudget(approval.projectId);
  const budget = workingBudget.data;
  // The three totals are the budget; the room-by-room breakdown is the reading
  // behind it. On a phone the breakdown buries the act, so it folds — and only
  // there: at reading width the whole of it stands open with no control at all.
  const [breakdownOpen, setBreakdownOpen] = useState(false);
  const matchesArtifact = budgetIsTheEdition(budget, approval);

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
  artifactTitle,
  artifactVersion,
  readOnly = false,
  designerGivenName,
  studioName,
  composerRef,
}: {
  decisionId: string;
  /**
   * `W2-05`. Thirteen approvals stand on one doorstep, each with a section
   * headed "The discussion", and a landmark that cannot be told from its
   * twelve neighbours is a landmark a screen-reader user cannot navigate by.
   * The edition's own title is what makes this one itself.
   */
  artifactTitle?: string | null;
  /**
   * `W3-04`. The title alone is not enough: a returned edition and the
   * edition that replaced it stand on the same doorstep under the same title,
   * so two landmarks read identically and axe's `landmark-unique` fails on the
   * pair. The edition number is what tells them apart — and where there is no
   * title at all, the decision's own id does.
   */
  artifactVersion?: number | null;
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
  // The heading reads "The discussion" on every one of them, so it cannot be
  // the accessible name. `aria-label` wins over `aria-labelledby`, which is
  // why the heading keeps its id for the eye and gives up naming the landmark.
  //
  // `W3R1-03`: title and edition are NOT enough. Two approvals hanging off one
  // artifact edition is the ordinary case — the fixture's own G1/G2 pair does
  // it — and both landmarks then read identically, which is the axe failure
  // `landmark-unique` names. The decision id is the only thing on the page
  // that is unique per thread, so it closes every name rather than only the
  // untitled one.
  const named = artifactTitle?.trim();
  const subject = named
    ? typeof artifactVersion === 'number'
      ? `${named} · Edition ${artifactVersion}`
      : named
    : null;
  const landmarkName = subject
    ? `Discussion about ${subject} · approval ${decisionId}`
    : `Discussion about approval ${decisionId}`;
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
    <section className="mt-6" aria-label={landmarkName} data-testid="approval-discussion">
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
  anchoredDecisionIds = [],
  designerGivenName,
  studioName,
}: {
  approval: ProjectApprovalReview;
  /**
   * P-27. A closed record whose successor stands on this page keeps ONE act,
   * and it points forward: a superseded edition that says nothing about the
   * edition that replaced it is a dead end at the end of a thread. Nothing
   * else on a closed record can be acted on, and this changes nothing — it
   * moves her along the page she is already standing on.
   */
  anchoredDecisionIds?: readonly string[];
  designerGivenName?: string | null;
  studioName?: string | null;
}) {
  const [reading, setReading] = useState(false);
  const forward = revisionAct(approval, anchoredDecisionIds);
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
      {forward?.label === 'Review revised edition' && (
        <p className="mt-3">
          <a
            data-testid="approval-receipt-forward"
            href={`#approval-${forward.id}`}
            className="inline-flex min-h-11 items-center text-[15px] leading-normal text-[var(--text-body)] underline"
          >
            {forward.label}
          </a>
        </p>
      )}
      {approval.outcome !== null && <KeepACopy decisionId={approval.decisionId} />}
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
            artifactTitle={approval.artifactTitle}
            artifactVersion={approval.artifactVersion}
            readOnly
            designerGivenName={designerGivenName}
            studioName={studioName}
          />
        </div>
      )}
    </section>
  );
}

/**
 * P-26. The keepsake, offered where the mark is — and only once there is a
 * mark to keep. It opens `/decisions/<id>/record` in a new tab rather than
 * navigating: she is standing on a page she may still be reading, and a sheet
 * for the drawer is not a place to send her away to.
 */
function KeepACopy({ decisionId }: { decisionId: string }) {
  return (
    <div className="mt-3">
      <ScoredAction
        actionKey="keep_approval_record"
        regionKey="doorstep"
        surfaceKey="the_threshold"
        variant="tertiary"
        href={`/decisions/${encodeURIComponent(decisionId)}/record`}
        target="_blank"
        rel="noopener noreferrer"
      >
        Keep a copy
      </ScoredAction>
    </div>
  );
}

/* ── P-28 · she sets the pace, on this one approval ──────────────────────────
   Four words under the ask. A snooze moves the REMINDERS and nothing else:
   the approval stays open, the answer stays hers, and the copy says so
   directly rather than leaving her to wonder whether she has just deferred a
   decision.

   NEVER OVER A PAST DUE DATE. The overdue notice is the last thing Patina
   says before it goes quiet and hands the item back to the studio; a snooze
   that could bury it would leave her with nothing at all. So on an approval
   past its date the acts are not drawn, and the surface says why instead of
   offering something it would then refuse.
   ────────────────────────────────────────────────────────────────────────── */

const SNOOZE_ACTS: Array<{
  choice: DecisionSnoozeChoice;
  label: string;
  /** What she is told once it lands. Never a promise about the decision. */
  confirmation: string;
}> = [
  {
    choice: 'tomorrow_morning',
    label: 'Tomorrow morning',
    confirmation: "I'll ask you tomorrow morning.",
  },
  { choice: 'sunday', label: 'Sunday', confirmation: "I'll ask you Sunday." },
  {
    choice: 'when_due',
    label: "When it's due",
    confirmation: "I'll ask you when it's due.",
  },
  {
    choice: 'never',
    label: "Don't remind me",
    confirmation: "I won't remind you again until it's past its date.",
  },
];

/** The house sentence for a snooze that did not land. */
const SNOOZE_REFUSED = 'The reminders could not be set just now. Try again.';

/** What a standing snooze says back, by the choice that made it. */
function snoozeConfirmation(choice: DecisionSnoozeChoice): string | null {
  return SNOOZE_ACTS.find((act) => act.choice === choice)?.confirmation ?? null;
}

function RemindMe({
  approval,
}: {
  approval: Pick<ProjectApprovalReview, 'decisionId' | 'projectId' | 'isOverdue'>;
}) {
  const setSnooze = useSetDecisionSnooze();
  // `W3R1-02`. The write was the only half the web had, so a reload of an
  // approval she had already quieted drew the four acts as though she had
  // never asked — byte-identical to one never snoozed, on the surface whose
  // whole promise is that Patina remembers the pace she set. iOS reads the
  // row back on the way in (`loadSnooze`); this is the same read, and
  // `standingDecisionSnooze` applies the same honesty rule underneath it —
  // a hold that has already lifted is not drawn.
  const standing = useDecisionSnooze(approval.decisionId);
  const [said, setSaid] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef(false);
  // This session's answer wins over the row: it is the newer of the two, and
  // the refetch it triggers has not necessarily landed yet.
  const stood =
    said ??
    (standing.data ? snoozeConfirmation(standing.data.choice) : null);

  if (approval.isOverdue) {
    return (
      <p
        data-testid="approval-snooze-past-due"
        className="mt-4 max-w-[52ch] text-[15px] leading-[1.62] text-[var(--text-body)]"
      >
        This one is past its date, so its notice stands.
      </p>
    );
  }

  async function stand(act: (typeof SNOOZE_ACTS)[number]) {
    if (inFlight.current) return;
    inFlight.current = true;
    setError(null);
    try {
      await setSnooze.mutateAsync({
        projectId: approval.projectId,
        decisionId: approval.decisionId,
        choice: act.choice,
      });
      setSaid(act.confirmation);
    } catch (cause) {
      setError(refusalSentence(cause, SNOOZE_REFUSED));
    } finally {
      inFlight.current = false;
    }
  }

  return (
    <div className="mt-4 max-w-[52ch]" data-testid="approval-snooze">
      <p className={EYEBROW_CLASS}>Remind me</p>
      <div className="mt-1.5 flex flex-wrap items-center gap-x-5">
        {SNOOZE_ACTS.map((act) => (
          <ScoredAction
            key={act.choice}
            actionKey={`snooze_approval_${act.choice}`}
            regionKey="doorstep"
            surfaceKey="the_threshold"
            variant="tertiary"
            loading={setSnooze.isPending}
            loadingLabel="Setting"
            onClick={() => stand(act)}
          >
            {act.label}
          </ScoredAction>
        ))}
      </div>
      <p className="mt-1.5 text-[15px] leading-[1.62] text-[var(--text-body)]">
        Still yours to answer; only the reminders wait.
      </p>
      {stood && (
        <p
          role="status"
          data-testid="approval-snooze-said"
          className="mt-1.5 text-[15px] leading-[1.62] text-[var(--text-body)]"
        >
          {stood}
        </p>
      )}
      {error && (
        <p
          role="alert"
          className="mt-2 border-t border-[var(--border-subtle)] pt-2 text-[15px] leading-normal text-[var(--text-body)]"
        >
          {error}
        </p>
      )}
    </div>
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
/**
 * The decision id the page's address names — `#approval-<id>` — and a way to
 * say she has been put in front of it.
 *
 * `/decisions/<id>` folds onto `#approval-<id>`, and every letter Patina sends
 * about an approval carries that address: a receipt names a closed record, a
 * supersession notice names the successor, which is an OPEN ask. Neither
 * element exists when the browser resolves the fragment — the records fold is
 * still shut and the asks have not rendered — so the browser gives up and
 * leaves her at the top of the page.
 *
 * Both readers of this hook therefore do the scrolling themselves: the fold
 * opens first and then scrolls, and an open ask scrolls to itself.
 */
function useAddressedApproval(): [string | null, () => void] {
  const [seek, setSeek] = useState<string | null>(null);

  useEffect(() => {
    function named() {
      const match = /^#approval-(.+)$/.exec(window.location.hash);
      setSeek(match ? match[1] : null);
    }
    named();
    window.addEventListener('hashchange', named);
    return () => window.removeEventListener('hashchange', named);
  }, []);

  return [seek, useCallback(() => setSeek(null), [])];
}

export function ApprovalRecords({
  approvals,
  anchoredDecisionIds = [],
  designerGivenName,
  studioName,
}: {
  approvals: ProjectApprovalReview[];
  anchoredDecisionIds?: readonly string[];
  designerGivenName?: string | null;
  studioName?: string | null;
}) {
  const [all, setAll] = useState(false);
  const [seek, seekAnswered] = useAddressedApproval();

  /**
   * P-27, and Wave 1's re-map risk #4.
   *
   * The fold opens itself for a named record, and then puts her in front of
   * it — the browser has already given up on the fragment by the time the
   * element exists.
   */
  useEffect(() => {
    if (!seek) return;
    const index = approvals.findIndex((row) => row.decisionId === seek);
    // Not among the records at all: it is an open ask, which mounts its own
    // element and scrolls to itself, or it is not on this house. Either way
    // the fold is not what is hiding it.
    if (index < 0) return;
    if (index >= RECORDS_SHOWN && !all) {
      setAll(true);
      return;
    }
    document.getElementById(`approval-${seek}`)?.scrollIntoView?.();
    seekAnswered();
  }, [all, approvals, seek, seekAnswered]);

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
          anchoredDecisionIds={anchoredDecisionIds}
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
  /**
   * P-27. The edition this one replaces, when the page holds its row. The
   * continuation line and the "what changed" block are computed from the two
   * projections side by side, so without the row there is nothing to compute
   * and the ask reads exactly as it did before.
   */
  predecessor?: ProjectApprovalReview | null;
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
  predecessor = null,
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

  // P-27. A supersession notice names the SUCCESSOR, and the successor is an
  // open ask, not a record — so the ask puts her in front of itself when the
  // address names it. Its element exists from the first paint; the browser had
  // already given the fragment up before then.
  const [addressed, addressSeen] = useAddressedApproval();
  useEffect(() => {
    if (addressed !== approval.decisionId) return;
    document.getElementById(`approval-${approval.decisionId}`)?.scrollIntoView?.();
    addressSeen();
  }, [addressed, addressSeen, approval.decisionId]);

  /**
   * Whether the reader is the one this approval waits on. 00569 says which
   * chair she is sitting in; `respond_project_approval` and
   * `confirm_project_decision_review` both accept the frozen lead alone, so a
   * studio co-member — or a household member who is not the lead — reads the
   * ask and is offered no door that would only refuse her.
   *
   * Stated the negative way on purpose: only a chair the projection NAMES as
   * somebody else's withholds the acts. A role that is null, absent, or a word
   * this build does not know is a projection older or stranger than 00569, and
   * that is not a licence to guess — the surface behaves exactly as it did
   * before the field existed rather than silently taking the lead's own doors
   * away from her.
   */
  const viewerAnswers =
    approval.viewerRole !== 'studio' && approval.viewerRole !== 'household';
  const due = parseSourceDate(approval.dueAt);
  const reviewComplete = approval.completedReviewCount >= approval.requiredReviewCount;
  const canConfirm =
    viewerAnswers &&
    approval.lifecycleStatus === 'draft' &&
    !reviewComplete &&
    approval.authorityRevision !== null;
  const confirmationUnavailable =
    viewerAnswers &&
    approval.lifecycleStatus === 'draft' &&
    !reviewComplete &&
    approval.authorityRevision === null;
  const awaitingStudioIssue = isProjectApprovalAwaitingStudioIssue(approval);
  const canRespond =
    viewerAnswers &&
    approval.lifecycleStatus === 'pending' &&
    approval.disposition === 'active' &&
    reviewComplete &&
    approval.outcome === null;

  // The stamp is written the moment the act returns, and it survives the
  // refetch that follows: the recorded outcome takes over from the local one.
  const recordedOutcome = approval.outcome ?? justAnswered?.outcome ?? null;

  /**
   * What is fixed about this edition, said in the tense the reader is actually
   * in (`W1-01`).
   *
   * Present tense while the three doors are drawn — that is the act the
   * sentence introduces. Conditional on a draft, where the act on offer is
   * READING the exact edition and nothing is being approved yet. Silent
   * everywhere else: once she has answered, the stamp and the eyebrow beside
   * it say what was done, and repeating "you are approving" over a recorded
   * outcome is the surface contradicting its own record.
   */
  const immutabilitySentence = recordedOutcome
    ? null
    : canRespond
      ? `You are approving edition ${approval.artifactVersion}, exactly as shown.`
      : canConfirm || confirmationUnavailable
        ? `You would be approving edition ${approval.artifactVersion}, exactly as shown.`
        : null;
  // `updatedAt` moves on any later write to the row, so it is never a stand-in
  // for the day the client answered. A stamp with no date is honest; a stamp
  // with the wrong date is not.
  const stampedAt = parseSourceDate(approval.respondedAt) ?? justAnswered?.at ?? null;
  const chosenAct = OUTCOME_ACTS.find((act) => act.outcome === chosen) ?? null;

  /**
   * R11's baseline, PRODUCED rather than read off a field no migration
   * writes. It used to arrive through a cast at `costBaselineCents`, which no
   * projection has ever carried, so the sentence R11 rules for — "$46,880
   * becomes $48,120", the figure the delta moves FROM — never once printed.
   *
   * Where the artifact IS the budget, the edition's own total is a fact the
   * surface already holds (the same fail-closed match the plate's figures
   * stand on), and the total minus the delta the approval declares is the
   * figure it moved from. Nothing else on the projection can produce one, so
   * every other artifact kind keeps the delta-only sentence, which is the
   * honest fallback and not a degraded one.
   *
   * Silent at a zero delta: "$48,120 becomes $48,120" is a sentence that says
   * a thing did not happen twice.
   */
  const isBudgetEdition = approval.artifactKind === 'budget_version';
  const editionBudget = useProjectWorkingBudget(
    // Disabled for every other kind: the plate does not read a budget for
    // them either, and a query that cannot produce a baseline should not run.
    isBudgetEdition ? approval.projectId : '',
  );
  const baselineCents =
    isBudgetEdition &&
    approval.costCentsDelta !== 0 &&
    budgetIsTheEdition(editionBudget.data, approval)
      ? editionBudget.data.targetTotalCents - approval.costCentsDelta
      : null;
  /** The designer, named where the copy has room for a name. */
  const designer = designerGivenName?.trim() || null;
  /** His one line about this edition, frozen with it, when the row carries one. */
  const why = whyOf(approval);
  /** And the hand that wrote it, frozen beside it. Never the live designer. */
  const whyAuthor = whyAuthorOf(approval);

  // Words, not a tally: what she is being told is whether her own review is in,
  // and on the rare approval that takes several, how many of them are.
  const reviewStanding =
    approval.requiredReviewCount <= 1
      ? reviewComplete
        ? viewerAnswers
          ? 'Your review is confirmed.'
          : 'The review is confirmed.'
        : viewerAnswers
          ? 'Your review is still needed.'
          : 'The review is still needed.'
      : approval.completedReviewCount === 0
        ? `None of ${countInWords(approval.requiredReviewCount)} reviews are confirmed yet.`
        : `${upperFirst(countInWords(approval.completedReviewCount))} of ${countInWords(
            approval.requiredReviewCount,
          )} reviews confirmed.`;

  /**
   * ONE act along the thread, and the forward one wins (P-27).
   *
   * Both links used to be drawn, which put "Review previous edition" beside
   * "Review revised edition" and asked her to pick a direction through her own
   * history. The revised edition is where the conversation actually is; the
   * one she answered is behind her, and the continuation line above already
   * names it.
   */
  const forward = revisionAct(approval, anchoredDecisionIds);

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
    // Only an approval is signed. Asking a homeowner to type her legal name to
    // say "let's talk" or "here is what to change" would record an electronic
    // signature against a consent she never gave (ux/02:308): on those two the
    // choice is the act and the hold is the commitment.
    const signing = chosen === 'approved';
    const signedByName = signature.trim();
    if (signing && !signatureIsComplete(signedByName)) return;
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
        // 00569 carries the pair through the wrapper into the columns 00117
        // added. A signature with no method is a check_violation by design, so
        // the name rides only with the method that claims one.
        //
        // RULED 2026-09-05: Return and Hold record a consent method too —
        // never NULL. A press and hold is a click-through, and the record of
        // an answer should say how it was given whatever the answer was. The
        // token is the schema's own word for it: `client_decisions`'
        // check constraint and `_respond_project_approval_checked` both
        // allowlist `click_through`, which is what the ruling's
        // "portal_clickthrough" names on this column (that spelling belongs to
        // the review leg, `confirm_project_decision_review`).
        clientSignature: signing ? signedByName : undefined,
        clientConsentMethod: signing ? 'electronic_signature' : 'click_through',
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
  const weighing = approvalWeighing({
    costCentsDelta: approval.costCentsDelta,
    scheduleDaysDelta: approval.scheduleDaysDelta,
    leadTimeDaysDelta: approval.leadTimeDaysDelta,
    costBaselineCents: baselineCents,
  });

  // P-27. Both are drawn only where the predecessor is in hand AND carries an
  // answer of hers: "since your last answer" is a false heading over an
  // edition she never answered, and a continuation line that cannot name the
  // verb is a line this surface does not write.
  const answeredBefore =
    approval.predecessorDecisionId !== null &&
    predecessor !== null &&
    predecessor.decisionId === approval.predecessorDecisionId &&
    predecessor.outcome !== null;
  const continuation = answeredBefore
    ? successionLine(approval.artifactVersion, predecessor)
    : null;
  const changedSince =
    answeredBefore && continuation ? whatChangedSince(predecessor, approval) : null;

  // `data-never-dim` is spared the Since-Yesterday dim only while something is
  // actually owed on it: a gate she has reviewed and that now waits on the
  // studio owes her nothing, and reads like the other two gates do.
  return (
    <section
      id={`approval-${approval.decisionId}`}
      data-threshold-unit="doorstep-approval"
      {...(recordedOutcome || awaitingStudioIssue || !viewerAnswers
        ? {}
        : { 'data-never-dim': '' })}
      data-testid="doorstep-approval"
      aria-labelledby={`approval-gate-${approval.decisionId}`}
      className={SECTION_CLASS}
    >
      <p className={`pt-2.5 ${EYEBROW_CLASS}`}>
        {!viewerAnswers
          ? recordedOutcome
            ? 'This approval · answered'
            : 'This approval · yours to read'
          : recordedOutcome
            ? 'Your approval · answered'
            : awaitingStudioIssue
              ? 'Your approval · with your studio'
              : approval.lifecycleStatus === 'draft'
                ? 'Your approval · read the edition first'
                : 'Your approval · your answer is needed'}
      </p>
      {/* P-27. The ask opens by saying what it follows, so the two editions
          read as one conversation rather than as two asks with a link between
          them. It never says her earlier answer was undone. */}
      {continuation && (
        <p
          data-testid="approval-continuation"
          className="mt-1.5 max-w-[52ch] text-[15px] leading-[1.62] text-[var(--text-body)]"
        >
          {continuation}
        </p>
      )}
      <ArtifactPlate approval={approval} />

      {/* The ask is a thing someone said, so it is set as one: a pull-quote on
          a clay rule, in the designer's hand, and signed by the hand that wrote
          it — the name frozen with the artifact, never the designer who holds
          the project today. No attribution is drawn when the row carries no
          author: an unsigned sentence is honest, a wrongly signed one is not. */}
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
        {whyAuthor && (
          <p
            data-testid="approval-attribution"
            className="mt-2 text-[15px] leading-normal text-[var(--text-muted)]"
          >
            {`— ${whyAuthor}`}
          </p>
        )}
      </blockquote>

      {due && (
        <p className="mt-3 max-w-[52ch] text-[15px] leading-relaxed text-[var(--text-body)]">
          {`Due ${LONG_MONTH_DAY.format(due)}`}
        </p>
      )}
      {/* `W1-01`. The sentence is present tense, so it stands only while the
          approving is what is actually on offer. Unguarded it was false in
          three states the lead herself reaches: on a draft, where the only act
          is reading the edition; while the studio holds it and nothing is
          waiting on her; and beside her own stamp the moment she has answered,
          under an eyebrow already reading "answered". iOS closed exactly these
          (`W1R2-M1`, `iosb2-M2`): after she answers it is gone. */}
      {immutabilitySentence && (
        <p
          data-testid="immutability-sentence"
          className="mt-1.5 max-w-[52ch] text-[15px] leading-[1.62] text-[var(--text-body)]"
        >
          {immutabilitySentence}
        </p>
      )}

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

      {/* P-27. Beside the weighing, because it is the same reading one step
          back: what this edition asks, against what the last one asked. */}
      {changedSince && (
        <section
          data-testid="approval-changed-since"
          aria-labelledby={`approval-changed-${approval.decisionId}`}
          className="mt-4 max-w-[52ch]"
        >
          <h3 id={`approval-changed-${approval.decisionId}`} className={EYEBROW_CLASS}>
            What changed since your last answer
          </h3>
          {changedSince.map((line) => (
            <p
              key={line}
              className="mt-1.5 text-[15px] leading-[1.62] text-[var(--text-body)]"
            >
              {line}
            </p>
          ))}
        </section>
      )}

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
      {recordedOutcome && <KeepACopy decisionId={approval.decisionId} />}

      <div className="mt-4">
        {!viewerAnswers && (
          <p
            data-testid="approval-answered-by-another"
            className="mb-2 max-w-[52ch] text-[15px] leading-[1.62] text-[var(--text-body)]"
          >
            This one is answered by the person it was sent to.
          </p>
        )}
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
              {viewerAnswers
                ? `You've confirmed edition ${approval.artifactVersion}. ${
                    designer ?? 'Your designer'
                  } issues it next. Nothing is waiting on you.`
                : `Edition ${approval.artifactVersion} is confirmed. ${
                    designer ?? 'The designer'
                  } issues it next.`}
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
              {/* The name, on a rule, dated — on the approval and on nothing
                  else. R1 asks every terminal act for a held gesture; only the
                  act that consents to the edition is also signed. Returning it
                  and holding it consent to nothing, so they take no signature
                  (ux/02:308). */}
              {chosenAct.outcome === 'approved' && (
                <div className="mt-3">
                  <SignatureLine
                    id={`approval-signature-${approval.decisionId}`}
                    testId="approval-signature"
                    value={signature}
                    onChange={setSignature}
                    disabled={respond.isPending}
                  />
                </div>
              )}
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
                    (chosenAct.outcome === 'approved' &&
                      !signatureIsComplete(signature)) ||
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

      {/* P-28. Under the ask, and only while something is actually waiting on
          her: a gate she has answered, or one the studio now holds, has no
          reminders left to stand down. */}
      {viewerAnswers &&
        !recordedOutcome &&
        !awaitingStudioIssue &&
        approval.disposition === 'active' && <RemindMe approval={approval} />}

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

      {forward && (
        <nav
          aria-label={`Approval revision history for ${approval.artifactTitle}`}
          data-testid="approval-revisions"
          className="mt-4"
        >
          <a
            href={`#approval-${forward.id}`}
            className="inline-flex min-h-11 items-center text-[15px] leading-normal text-[var(--text-body)] underline"
          >
            {forward.label}
          </a>
        </nav>
      )}

      <Discussion
        decisionId={approval.decisionId}
        artifactTitle={approval.artifactTitle}
        artifactVersion={approval.artifactVersion}
        designerGivenName={designerGivenName}
        studioName={studioName}
        composerRef={setComposer}
      />
    </section>
  );
}
