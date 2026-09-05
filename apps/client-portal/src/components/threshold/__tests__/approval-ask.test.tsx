import {
  act,
  fireEvent,
  render,
  renderHook,
  screen,
  waitFor,
  within,
} from '@testing-library/react';

import type { ProjectApprovalReview } from '@patina/supabase';

/* ── Boundaries ──────────────────────────────────────────────────────────────
   The ask is `/decisions/[id]`'s ceremony moved onto the doorstep, so the
   boundary is the same five hooks that page used, plus the working-budget read
   the budget editions need. The assertions are about the payloads: an outcome
   recorded here and an outcome recorded there must be the same row.
   ────────────────────────────────────────────────────────────────────────── */

jest.mock('@patina/supabase', () => ({
  __esModule: true,
  useConfirmProjectApprovalReview: jest.fn(),
  useRespondProjectApproval: jest.fn(),
  useDecisionComments: jest.fn(),
  useCreateDecisionComment: jest.fn(),
  useDecisionRealtime: jest.fn(),
}));

jest.mock('@/hooks/use-commercial-client', () => ({
  __esModule: true,
  useProjectWorkingBudget: jest.fn(),
}));

jest.mock('@/hooks/use-auth', () => ({
  __esModule: true,
  useAuth: jest.fn(),
}));

jest.mock('@/lib/analytics/events', () => ({
  __esModule: true,
  makingEvents: {
    actionShown: jest.fn(),
    actionSelected: jest.fn(),
  },
}));

import {
  useConfirmProjectApprovalReview,
  useCreateDecisionComment,
  useDecisionComments,
  useDecisionRealtime,
  useRespondProjectApproval,
} from '@patina/supabase';
import { useAuth } from '@/hooks/use-auth';
import { useProjectWorkingBudget } from '@/hooks/use-commercial-client';

import { HOLD_MS } from '../instruments/scored-action';
import {
  ApprovalAsk,
  ApprovalReceipt,
  ApprovalRecords,
  useDoorstepApprovals,
} from '../approval-ask';

const confirmHook = useConfirmProjectApprovalReview as jest.Mock;
const respondHook = useRespondProjectApproval as jest.Mock;
const commentsHook = useDecisionComments as jest.Mock;
const createCommentHook = useCreateDecisionComment as jest.Mock;
const realtimeHook = useDecisionRealtime as jest.Mock;
const authHook = useAuth as jest.Mock;
const budgetHook = useProjectWorkingBudget as jest.Mock;

const respondMutate = jest.fn();
const confirmMutate = jest.fn();
const commentMutate = jest.fn();
const commentMutateAsync = jest.fn();

const APPROVAL: ProjectApprovalReview = {
  decisionId: 'dec-1',
  projectId: 'proj-1',
  phaseId: 'ph-4',
  sectionKey: null,
  artifactKind: 'plan_issue',
  artifactId: 'art-1',
  artifactVersion: 3,
  artifactChecksum: 'a'.repeat(64),
  artifactTitle: 'Library elevations',
  question: 'Do the library elevations read right to you?',
  context: 'This releases the joinery package for pricing. It does not order anything.',
  why: null,
  whyAuthorName: null,
  viewerRole: 'lead',
  dueAt: '2026-08-20',
  costCentsDelta: 120000,
  scheduleDaysDelta: 0,
  leadTimeDaysDelta: -4,
  lifecycleStatus: 'pending',
  outcome: null,
  disposition: 'active',
  isOverdue: false,
  completedReviewCount: 1,
  requiredReviewCount: 1,
  authorityRevision: 3,
  predecessorDecisionId: null,
  successorDecisionId: null,
  createdAt: '2026-08-01T12:00:00Z',
  sentAt: '2026-08-02T12:00:00Z',
  respondedAt: null,
  updatedAt: '2026-08-12T12:00:00Z',
};

/**
 * A terminal act is HELD, not tapped (P-18). Fake time covers the hold itself
 * and is handed back before the act's own promises are flushed, so the
 * mutations settle on the real clock the rest of the file waits on.
 */
async function hold(target: HTMLElement) {
  jest.useFakeTimers();
  fireEvent.pointerDown(target, { clientX: 4, clientY: 4 });
  act(() => {
    jest.advanceTimersByTime(HOLD_MS);
  });
  jest.useRealTimers();
  await act(async () => {
    fireEvent.pointerUp(target);
  });
}

/** The typed legal name the approval carries (R1) — and only the approval. */
function sign(name = 'Harper Vale') {
  fireEvent.change(screen.getByTestId('approval-signature'), {
    target: { value: name },
  });
}

/** Sign if this outcome asks for a name; Return and Hold do not (ux/02:308). */
function signIfAsked() {
  if (screen.queryByTestId('approval-signature')) sign();
}

/** Choose an outcome, sign it, hold the submit — the beats an outcome takes. */
async function answer(name: RegExp) {
  fireEvent.click(screen.getByRole('button', { name }));
  signIfAsked();
  await hold(screen.getByRole('button', { name: /submit response/i }));
}

/** Returning takes one more beat: the note the designer needs (R10). */
async function returnEdition(note = 'The runner is too dark for the stair hall.') {
  fireEvent.click(screen.getByRole('button', { name: /^return$/i }));
  fireEvent.change(await screen.findByTestId('approval-change-note'), {
    target: { value: note },
  });
  await hold(screen.getByRole('button', { name: /submit response/i }));
}

/** Re-submitting after a refusal: the note and the name are already there. */
async function submitAgain() {
  await hold(screen.getByRole('button', { name: /submit response/i }));
}

// jsdom's Crypto has no `randomUUID`, so it is lent for the test and handed
// back afterwards. The rest of the global — `getRandomValues` above all — is
// left where it is; replacing the whole object takes it away from every test
// that follows.
type WithRandomUUID = { randomUUID?: () => string };
const realRandomUUID = (globalThis.crypto as WithRandomUUID).randomUUID;

beforeEach(() => {
  respondMutate.mockReset().mockResolvedValue({});
  confirmMutate.mockReset().mockResolvedValue({});
  commentMutate.mockReset();

  confirmHook.mockReturnValue({ mutateAsync: confirmMutate, isPending: false });
  respondHook.mockReturnValue({ mutateAsync: respondMutate, isPending: false });
  commentsHook.mockReturnValue({ data: [], isLoading: false, isError: false });
  commentMutateAsync.mockReset().mockResolvedValue({});
  createCommentHook.mockReturnValue({
    mutate: commentMutate,
    mutateAsync: commentMutateAsync,
    isPending: false,
  });
  realtimeHook.mockReturnValue(undefined);
  budgetHook.mockReturnValue({ data: null, isLoading: false, isError: false });
  authHook.mockReturnValue({ user: { id: 'user-1', name: 'Harper Vale' } });

  Object.defineProperty(globalThis.crypto, 'randomUUID', {
    configurable: true,
    writable: true,
    value: () => 'request-key-1',
  });
});

afterEach(() => {
  if (realRandomUUID) {
    Object.defineProperty(globalThis.crypto, 'randomUUID', {
      configurable: true,
      writable: true,
      value: realRandomUUID,
    });
  } else {
    delete (globalThis.crypto as WithRandomUUID).randomUUID;
  }
  expect(typeof globalThis.crypto.getRandomValues).toBe('function');
});

describe('ApprovalAsk — the ask, answered where it stands', () => {
  it('renders the ask: title, edition, due date, rationale, authority and impact', () => {
    render(<ApprovalAsk approval={APPROVAL} />);

    const ask = screen.getByTestId('doorstep-approval');
    expect(ask).toHaveAttribute('id', 'approval-dec-1');
    expect(ask).toHaveAttribute('data-threshold-unit', 'doorstep-approval');
    expect(ask).toHaveAttribute('data-never-dim');
    expect(ask).toHaveTextContent('Do the library elevations read right to you?');
    // The artifact is a plate now: named, dated, and marked at the frame's
    // edge. The due date stands under the ask, not inside the picture.
    const plate = within(ask).getByTestId('approval-plate');
    expect(plate).toHaveTextContent('Library elevations');
    expect(plate).toHaveTextContent(/Edition 3 · Issued August \d+/);
    expect(ask).toHaveTextContent('Due August 20');
    expect(screen.getByTestId('approval-rationale')).toHaveTextContent(
      'This releases the joinery package for pricing.',
    );
    // The line that fixes what the client is bound to, byte for byte.
    expect(screen.getByTestId('immutability-sentence')).toHaveTextContent(
      'You are approving edition 3, exactly as shown.',
    );
    // Authority is unconditional copy, not a companion of the confirm act —
    // and one review is a sentence about her own, never a tally.
    expect(screen.getByTestId('approval-review-count')).toHaveTextContent(
      'Your review is confirmed.',
    );

    // One spoken sentence, then the figures. The schedule moved by nothing and
    // is said so anyway — she is agreeing to all three (R11).
    expect(screen.getByTestId('approval-impact-sentence')).toHaveTextContent(
      'The cost rises by $1,200, the schedule does not change, and the lead time shortens by four days.',
    );
    expect(screen.getByTestId('approval-impact-ledger')).toHaveTextContent(
      'Cost +$1,200 · Schedule 0 days · Lead time −4 days',
    );
    expect(screen.getByTestId('approval-impact')).not.toHaveTextContent('Cost Schedule');

    // Three doors, one weight: same variant, verb labels, no ranking.
    const doors = ['approve', 'return', 'hold'].map((label) =>
      screen.getByRole('button', { name: new RegExp(`^${label}$`, 'i') }),
    );
    expect(doors).toHaveLength(3);
    const variants = new Set(doors.map((door) => door.className.match(/da-\w+/g)?.join(' ')));
    expect(variants.size).toBe(1);
  });

  it('names the figure the cost moves from when the edition carries a baseline', () => {
    render(
      <ApprovalAsk
        approval={
          {
            ...APPROVAL,
            costCentsDelta: 124_000,
            scheduleDaysDelta: 0,
            leadTimeDaysDelta: 0,
            costBaselineCents: 4_688_000,
          } as ProjectApprovalReview
        }
      />,
    );

    expect(screen.getByTestId('approval-impact-sentence')).toHaveTextContent(
      '$46,880 becomes $48,120',
    );
  });

  it('states an edition that changes nothing rather than showing a blank', () => {
    render(
      <ApprovalAsk
        approval={{
          ...APPROVAL,
          costCentsDelta: 0,
          scheduleDaysDelta: 0,
          leadTimeDaysDelta: 0,
        }}
      />,
    );

    expect(screen.getByTestId('approval-impact-sentence')).toHaveTextContent(
      'No cost, schedule or lead-time change.',
    );
    // Nothing moved, so the ledger says nothing: the same negation twice, once
    // in prose and once in mono, reads as a stutter.
    expect(screen.queryByTestId('approval-impact-ledger')).not.toBeInTheDocument();
  });

  it('names the consequence and takes a second beat before recording an outcome', () => {
    render(<ApprovalAsk approval={APPROVAL} />);

    fireEvent.click(screen.getByRole('button', { name: /^approve$/i }));

    // Nothing is recorded on the first click.
    expect(respondMutate).not.toHaveBeenCalled();
    expect(screen.getByTestId('approval-consequence')).toHaveTextContent(
      'Approve · Accept this exact edition and its stated impacts.',
    );
    // The other two acts are gone while one is chosen, so no second act can fire.
    expect(screen.queryByRole('button', { name: /^return$/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^hold$/i })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /choose another outcome/i }));
    expect(screen.getByRole('button', { name: /^return$/i })).toBeInTheDocument();
    expect(respondMutate).not.toHaveBeenCalled();
  });

  it('approves with the payload the old detail page sent, plus her name, then stamps in place', async () => {
    const onAnswered = jest.fn();
    render(<ApprovalAsk approval={APPROVAL} onAnswered={onAnswered} />);

    await answer(/^approve$/i);

    await waitFor(() => expect(respondMutate).toHaveBeenCalledTimes(1));
    // The old page's payload exactly, with the typed legal name and its
    // consent method beside it (R1). `respond_project_approval` carries the
    // pair from 00570 onward and writes the 00117 consent columns with it.
    expect(respondMutate).toHaveBeenCalledWith({
      projectId: 'proj-1',
      decisionId: 'dec-1',
      outcome: 'approved',
      expectedUpdatedAt: '2026-08-12T12:00:00Z',
      idempotencyKey: 'request-key-1',
      clientSignature: 'Harper Vale',
      clientConsentMethod: 'electronic_signature',
    });

    const stamp = await screen.findByTestId('approval-stamp');
    expect(stamp).toHaveTextContent(/^APPROVED/);
    expect(stamp).toHaveTextContent('Library elevations · Edition 3');
    expect(onAnswered).toHaveBeenCalledWith('dec-1');
  });

  it('returns the edition as changes_requested and reads back as RETURNED', async () => {
    render(<ApprovalAsk approval={APPROVAL} />);

    await returnEdition();

    await waitFor(() => expect(respondMutate).toHaveBeenCalledTimes(1));
    expect(respondMutate.mock.calls[0][0]).toMatchObject({
      outcome: 'changes_requested',
      decisionId: 'dec-1',
    });
    expect(await screen.findByTestId('approval-stamp')).toHaveTextContent(/^RETURNED/);
  });

  it('holds the approval when the client asks a question', async () => {
    render(<ApprovalAsk approval={APPROVAL} />);

    await answer(/^hold$/i);

    await waitFor(() => expect(respondMutate).toHaveBeenCalledTimes(1));
    expect(respondMutate.mock.calls[0][0]).toMatchObject({ outcome: 'needs_discussion' });
    expect(await screen.findByTestId('approval-stamp')).toHaveTextContent(/^HELD/);
  });

  it('reads a recorded return back from the row, with its own date', () => {
    render(
      <ApprovalAsk
        approval={{
          ...APPROVAL,
          outcome: 'changes_requested',
          lifecycleStatus: 'responded',
          respondedAt: '2026-08-14T12:00:00Z',
        }}
      />,
    );

    expect(screen.getByTestId('approval-stamp')).toHaveTextContent('RETURNED 14 August');
    expect(screen.getByTestId('doorstep-approval')).toHaveTextContent(
      'Your approval · answered',
    );
    expect(screen.queryByTestId('approval-acts')).not.toBeInTheDocument();
    expect(screen.getByTestId('doorstep-approval')).not.toHaveAttribute('data-never-dim');
  });

  it('stamps no date rather than a date the client did not answer on', () => {
    render(
      <ApprovalAsk
        approval={{
          ...APPROVAL,
          outcome: 'approved',
          lifecycleStatus: 'responded',
          respondedAt: null,
          // A later write to the row — a supersede, a disposition change — is
          // not the day the client answered.
          updatedAt: '2026-09-30T12:00:00Z',
        }}
      />,
    );

    const stamp = screen.getByTestId('approval-stamp');
    expect(stamp).toHaveTextContent(/^APPROVED\s*Library elevations/);
    expect(stamp).not.toHaveTextContent('September');
  });

  it('confirms the exact edition with the old page’s payload, and keeps its place', async () => {
    const onAnswered = jest.fn();
    render(
      <ApprovalAsk
        approval={{ ...APPROVAL, lifecycleStatus: 'draft', completedReviewCount: 0 }}
        onAnswered={onAnswered}
      />,
    );

    expect(screen.getByTestId('doorstep-approval')).toHaveTextContent(
      'Your approval · read the edition first',
    );
    await hold(screen.getByRole('button', { name: /review exact edition/i }));

    await waitFor(() => expect(confirmMutate).toHaveBeenCalledTimes(1));
    expect(confirmMutate).toHaveBeenCalledWith({
      projectId: 'proj-1',
      decisionId: 'dec-1',
      authorityRevision: 3,
      artifactChecksum: 'a'.repeat(64),
      idempotencyKey: 'request-key-1',
    });
    expect(screen.queryByTestId('approval-acts')).not.toBeInTheDocument();
    // The surface speaks rather than deleting itself.
    expect(await screen.findByTestId('approval-notice')).toHaveTextContent(
      'Review confirmed for this exact artifact. Your designer can now issue it.',
    );
    expect(onAnswered).toHaveBeenCalledWith('dec-1');
  });

  it('says so in the house’s words when a confirm is refused', async () => {
    confirmMutate.mockRejectedValue(new Error('artifact_checksum_mismatch'));
    render(
      <ApprovalAsk
        approval={{ ...APPROVAL, lifecycleStatus: 'draft', completedReviewCount: 0 }}
      />,
    );

    await hold(screen.getByRole('button', { name: /review exact edition/i }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(
      'The artifact changed or the review could not be confirmed. Refresh and review it again.',
    );
    expect(alert).not.toHaveTextContent('artifact_checksum_mismatch');
    expect(screen.queryByTestId('approval-notice')).not.toBeInTheDocument();
  });

  it('holds the confirmed draft on the doorstep and says the studio has it', () => {
    render(
      <ApprovalAsk
        approval={{
          ...APPROVAL,
          lifecycleStatus: 'draft',
          completedReviewCount: 1,
          requiredReviewCount: 1,
        }}
      />,
    );

    expect(screen.getByTestId('doorstep-approval')).toHaveTextContent(
      'Your approval · with your studio',
    );
    // No timing: nothing on this row knows when the studio will issue it.
    expect(screen.getByTestId('approval-awaiting-studio-issue')).toHaveTextContent(
      "You've confirmed edition 3. Your designer issues it next. Nothing is waiting on you.",
    );
    expect(screen.queryByRole('button', { name: /review exact edition/i })).not.toBeInTheDocument();
    expect(screen.queryByTestId('approval-acts')).not.toBeInTheDocument();
  });

  it('says why the review cannot be confirmed when the authority revision is missing', () => {
    render(
      <ApprovalAsk
        approval={{
          ...APPROVAL,
          lifecycleStatus: 'draft',
          completedReviewCount: 0,
          authorityRevision: null,
        }}
      />,
    );

    expect(screen.getByTestId('approval-confirmation-unavailable')).toHaveTextContent(
      'Review confirmation is temporarily unavailable. The frozen authority revision was not supplied.',
    );
    expect(screen.queryByRole('button', { name: /review exact edition/i })).not.toBeInTheDocument();
  });

  it('says so in the house’s words when the approval moved under the client', async () => {
    respondMutate.mockRejectedValue(new Error('approval_conflict'));
    render(<ApprovalAsk approval={APPROVAL} />);

    await answer(/^approve$/i);

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(
      'This approval changed while it was open. Refresh before responding.',
    );
    // A Postgres string is never copy.
    expect(alert).not.toHaveTextContent('approval_conflict');
    expect(screen.queryByTestId('approval-stamp')).not.toBeInTheDocument();
  });

  it('renders no ask copy for a withdrawn or superseded gate’s acts', () => {
    render(<ApprovalAsk approval={{ ...APPROVAL, disposition: 'withdrawn' }} />);
    expect(screen.queryByTestId('approval-acts')).not.toBeInTheDocument();
    expect(screen.getByTestId('doorstep-approval')).toHaveTextContent(
      'Do the library elevations read right to you?',
    );
  });

  it('stands the rationale block down when the gate carries no scope line', () => {
    render(<ApprovalAsk approval={{ ...APPROVAL, context: null }} />);
    expect(screen.queryByTestId('approval-rationale')).not.toBeInTheDocument();
  });

  it('reads the neighbouring editions in place, and only when they stand on this page', () => {
    const { rerender } = render(
      <ApprovalAsk
        approval={{ ...APPROVAL, predecessorDecisionId: 'dec-0', successorDecisionId: 'dec-2' }}
      />,
    );
    // Nothing is anchored, so nothing is claimed.
    expect(screen.queryByTestId('approval-revisions')).not.toBeInTheDocument();

    rerender(
      <ApprovalAsk
        approval={{ ...APPROVAL, predecessorDecisionId: 'dec-0', successorDecisionId: 'dec-2' }}
        anchoredDecisionIds={['dec-1', 'dec-0']}
      />,
    );
    const link = screen.getByRole('link', { name: 'Review previous edition' });
    expect(link).toHaveAttribute('href', '#approval-dec-0');
    expect(
      screen.queryByRole('link', { name: 'Review revised edition' }),
    ).not.toBeInTheDocument();
  });
});

describe('the artifact, shown', () => {
  it('names and dates the edition on a plate, and marks it at the frame', () => {
    render(<ApprovalAsk approval={APPROVAL} />);

    const plate = screen.getByTestId('approval-plate');
    expect(within(plate).getByTestId('approval-plate-title')).toHaveTextContent(
      'Library elevations',
    );
    expect(plate).toHaveTextContent(/Edition 3 · Issued August \d+/);
    // Provenance, not a compliance string: twelve characters of the checksum,
    // and never the whole sixty-four.
    const makersMark = within(plate).getByTestId('approval-makers-mark');
    expect(makersMark).toHaveTextContent('a'.repeat(12));
    expect(makersMark.textContent).toHaveLength(12);
    expect(plate).not.toHaveTextContent('a'.repeat(13));
    expect(plate.textContent).not.toMatch(/checksum|sha|fingerprint|verify/i);
  });

  it('draws no picture of a plan issue, whatever a snapshot claims to carry', () => {
    // The frozen snapshot cannot reach this surface — `parseProjectApprovalReview`
    // builds its object field by field — and a plan_issue snapshot carries no
    // cover key in the first place. The plate names the edition instead.
    render(
      <ApprovalAsk
        approval={
          {
            ...APPROVAL,
            sourceSnapshot: { coverImageUrl: 'https://plans.example/cover.png' },
          } as ProjectApprovalReview
        }
      />,
    );

    const plate = screen.getByTestId('approval-plate');
    expect(within(plate).queryByRole('img')).not.toBeInTheDocument();
    expect(within(plate).getByTestId('approval-plate-title')).toHaveTextContent(
      'Library elevations',
    );
  });

  it('sets the ask as a pull-quote and signs it in its author’s name', () => {
    render(
      <ApprovalAsk
        approval={{ ...APPROVAL, whyAuthorName: 'Leah Quist' }}
        designerGivenName="Leah"
      />,
    );

    const quote = screen.getByTestId('approval-question');
    expect(quote).toHaveTextContent('Do the library elevations read right to you?');
    expect(within(quote).getByTestId('approval-attribution')).toHaveTextContent('— Leah Quist');
    expect(quote.className).toContain('border-l-2');
    expect(quote.className).toContain('border-[var(--accent-primary)]');
  });

  // A studio has more than one designer and this sentence is immutable. It is
  // signed by the hand that wrote it or by nobody — never by whoever holds the
  // project on the day she reads it (ruling, 2026-09-05).
  it('never signs the ask with the designer who holds the project today', () => {
    render(
      <ApprovalAsk
        approval={{ ...APPROVAL, why: 'The sconces move up two inches.' }}
        designerGivenName="Nora"
        studioName="Quist Interiors"
      />,
    );

    expect(screen.getByTestId('approval-why')).toBeInTheDocument();
    expect(screen.queryByTestId('approval-attribution')).not.toBeInTheDocument();
  });

  it.each<[string, unknown]>([
    ['no author at all', undefined],
    ['an author the projection left null', null],
    ['an author name that is blank', '   '],
    ['an author name that is not a string', 12],
  ])('signs nothing for %s', (_case, whyAuthorName) => {
    render(
      <ApprovalAsk
        approval={{ ...APPROVAL, whyAuthorName } as unknown as ProjectApprovalReview}
        designerGivenName="Leah"
      />,
    );
    expect(screen.queryByTestId('approval-attribution')).not.toBeInTheDocument();
  });

  it('carries the designer’s own line about the edition under the question', () => {
    render(
      <ApprovalAsk
        approval={{ ...APPROVAL, why: 'The stair-hall sconces move up two inches.' }}
        designerGivenName="Leah"
      />,
    );

    expect(within(screen.getByTestId('approval-question')).getByTestId('approval-why'))
      .toHaveTextContent('The stair-hall sconces move up two inches.');
  });

  // The last two cases are shapes the type forbids and a pre-00569 projection
  // can still hand us, so they are asserted through `unknown` on purpose.
  it.each<[string, unknown]>([
    ['no why at all', undefined],
    ['a why the projection left null', null],
    ['a why that is blank', '   '],
    ['a why that is not a string', 12],
  ])('draws no note for %s', (_case, why) => {
    render(
      <ApprovalAsk approval={{ ...APPROVAL, why } as unknown as ProjectApprovalReview} />,
    );
    expect(screen.queryByTestId('approval-why')).not.toBeInTheDocument();
  });
});

describe('ApprovalAsk — a budget edition', () => {
  const BUDGET_APPROVAL: ProjectApprovalReview = {
    ...APPROVAL,
    artifactKind: 'budget_version',
    artifactId: 'budget-9',
    artifactTitle: 'Working budget',
  };

  const BUDGET = {
    id: 'budget-9',
    projectId: 'proj-1',
    version: 3,
    state: 'published' as const,
    currency: 'USD',
    lowTotalCents: 4000000,
    targetTotalCents: 5000000,
    highTotalCents: 6000000,
    lines: [
      {
        roomName: 'Library',
        category: 'seating',
        lowCents: 100000,
        targetCents: 150000,
        highCents: 200000,
        notes: null,
      },
    ],
    checkpoint: {
      id: 'cp-1',
      state: 'published' as const,
      publishedAt: '2026-08-02T12:00:00Z',
      acknowledgedAt: null,
      overrideReason: null,
      evidenceFingerprint: 'a'.repeat(64),
    },
  };

  it('shows the figures of the exact edition the question is about', () => {
    budgetHook.mockReturnValue({ data: BUDGET, isLoading: false, isError: false });
    render(<ApprovalAsk approval={BUDGET_APPROVAL} />);

    expect(budgetHook).toHaveBeenCalledWith('proj-1');
    const details = screen.getByTestId('approval-budget-details');
    expect(details).toHaveTextContent('Target');
    expect(details).toHaveTextContent('$50,000');
    expect(details).toHaveTextContent('Library · seating');
    expect(details).toHaveTextContent('Target $1,500');
  });

  it('draws the budget inside the plate, and folds the breakdown on a phone', () => {
    budgetHook.mockReturnValue({ data: BUDGET, isLoading: false, isError: false });
    render(<ApprovalAsk approval={BUDGET_APPROVAL} />);

    // The budget IS the picture on the plate when the artifact is a budget.
    expect(
      within(screen.getByTestId('approval-plate')).getByTestId('approval-budget'),
    ).toBeInTheDocument();

    // Three totals stand; the room-by-room breakdown folds on a narrow
    // viewport and stands open at reading width, with no control there at all.
    const breakdown = screen.getByTestId('approval-budget-breakdown');
    expect(breakdown.parentElement).toHaveClass('hidden', 'sm:block');
    const disclosure = screen.getByRole('button', { name: /read the breakdown/i });
    expect(disclosure.parentElement).toHaveClass('sm:hidden');
    expect(disclosure).toHaveAttribute('aria-expanded', 'false');

    fireEvent.click(disclosure);
    expect(screen.getByTestId('approval-budget-breakdown').parentElement).toHaveClass('block');
    expect(
      screen.getByRole('button', { name: /close the breakdown/i }),
    ).toHaveAttribute('aria-expanded', 'true');
  });

  it('fails closed when the budget on hand is not that exact edition', () => {
    budgetHook.mockReturnValue({
      data: { ...BUDGET, version: 4 },
      isLoading: false,
      isError: false,
    });
    render(<ApprovalAsk approval={BUDGET_APPROVAL} />);

    expect(screen.queryByTestId('approval-budget-details')).not.toBeInTheDocument();
    expect(screen.getByTestId('approval-budget-unavailable')).toHaveTextContent(
      'Budget details are unavailable for this exact approved edition.',
    );
  });

  it('fails closed when the checkpoint fingerprint does not match the artifact', () => {
    budgetHook.mockReturnValue({
      data: { ...BUDGET, checkpoint: { ...BUDGET.checkpoint, evidenceFingerprint: 'b'.repeat(64) } },
      isLoading: false,
      isError: false,
    });
    render(<ApprovalAsk approval={BUDGET_APPROVAL} />);

    expect(screen.getByTestId('approval-budget-unavailable')).toBeInTheDocument();
  });

  it('holds the figures while the budget is still coming', () => {
    budgetHook.mockReturnValue({ data: undefined, isLoading: true, isError: false });
    render(<ApprovalAsk approval={BUDGET_APPROVAL} />);

    expect(screen.getByTestId('approval-budget-loading')).toHaveTextContent(
      'Budget details are loading…',
    );
  });

  it('reads no budget at all for an edition that is not a budget', () => {
    render(<ApprovalAsk approval={APPROVAL} />);
    expect(screen.queryByTestId('approval-budget')).not.toBeInTheDocument();
    expect(budgetHook).not.toHaveBeenCalled();
  });
});

describe('ApprovalAsk — the discussion', () => {
  it('posts a comment through the decision thread and clears the draft', async () => {
    commentMutate.mockImplementation((_input, options) => options?.onSuccess?.());
    render(<ApprovalAsk approval={APPROVAL} />);

    const field = screen.getByTestId('approval-comment-field');
    fireEvent.change(field, { target: { value: '  Can we see the brass in daylight?  ' } });
    fireEvent.click(screen.getByRole('button', { name: /^post$/i }));

    expect(commentMutate).toHaveBeenCalledTimes(1);
    expect(commentMutate.mock.calls[0][0]).toEqual({
      decisionId: 'dec-1',
      body: 'Can we see the brass in daylight?',
    });
    await waitFor(() => expect(field).toHaveValue(''));
    expect(realtimeHook).toHaveBeenCalledWith('dec-1');
    // The guarantee the old page made, kept word for word.
    expect(screen.getByTestId('approval-discussion')).toHaveTextContent(
      'They never submit or change an approval outcome.',
    );
    // The thread has a heading of its own to browse to.
    expect(screen.getByRole('heading', { name: 'The discussion' })).toBeInTheDocument();
  });

  it('writes the thread back, the client’s own words in her own name', () => {
    commentsHook.mockReturnValue({
      data: [
        {
          id: 'c1',
          decision_id: 'dec-1',
          author_id: 'user-1',
          body: 'Can we see the brass in daylight?',
          created_at: '2026-08-13T12:00:00Z',
          updated_at: '2026-08-13T12:00:00Z',
        },
        {
          id: 'c2',
          decision_id: 'dec-1',
          author_id: 'designer-9',
          body: 'I will bring both finishes on Thursday.',
          created_at: '2026-08-13T15:00:00Z',
          updated_at: '2026-08-13T15:00:00Z',
        },
      ],
      isLoading: false,
      isError: false,
    });
    render(<ApprovalAsk approval={APPROVAL} />);

    const thread = screen.getByTestId('approval-discussion');
    expect(thread).toHaveTextContent('You');
    expect(thread).toHaveTextContent('The studio');
    // Never the internal reviewer who typed it.
    expect(thread).not.toHaveTextContent('designer-9');
    expect(thread).toHaveTextContent('I will bring both finishes on Thursday.');
    expect(screen.queryByTestId('approval-comments-empty')).not.toBeInTheDocument();
  });

  it('says the thread is empty rather than leaving it ambiguous', () => {
    render(<ApprovalAsk approval={APPROVAL} />);
    expect(screen.getByTestId('approval-comments-empty')).toHaveTextContent(
      'No comments yet. Add a note for your designer below.',
    );
  });

  it('does not invite a reply into a thread that failed to read', () => {
    commentsHook.mockReturnValue({ data: undefined, isLoading: false, isError: true });
    render(<ApprovalAsk approval={APPROVAL} />);

    expect(screen.getByTestId('approval-comments-error')).toHaveTextContent(
      'Comments could not be read just now. Refresh to try again.',
    );
    expect(screen.queryByTestId('approval-comment-field')).not.toBeInTheDocument();
  });

  it('holds the thread while it is still coming', () => {
    commentsHook.mockReturnValue({ data: undefined, isLoading: true, isError: false });
    render(<ApprovalAsk approval={APPROVAL} />);

    expect(screen.getByTestId('approval-comments-loading')).toBeInTheDocument();
    expect(screen.queryByTestId('approval-comment-field')).not.toBeInTheDocument();
  });

  it('keeps the draft and says so when the comment does not land', () => {
    commentMutate.mockImplementation((_input, options) =>
      options?.onError?.(new Error('nope')),
    );
    render(<ApprovalAsk approval={APPROVAL} />);

    fireEvent.change(screen.getByTestId('approval-comment-field'), {
      target: { value: 'A question' },
    });
    fireEvent.click(screen.getByRole('button', { name: /^post$/i }));

    expect(screen.getByRole('alert')).toHaveTextContent('The comment could not be posted');
    expect(screen.getByTestId('approval-comment-field')).toHaveValue('A question');
  });
});

describe('ApprovalReceipt', () => {
  it('stands as the record of an approval answered on an earlier visit', () => {
    render(
      <ApprovalReceipt
        approval={{
          ...APPROVAL,
          outcome: 'approved',
          lifecycleStatus: 'responded',
          respondedAt: '2026-08-14T12:00:00Z',
        }}
      />,
    );

    const receipt = screen.getByTestId('doorstep-approval-receipt');
    expect(receipt).toHaveAttribute('id', 'approval-dec-1');
    expect(screen.getByTestId('approval-receipt-stamp')).toHaveTextContent('APPROVED 14 August');
    expect(receipt).toHaveTextContent('Library elevations · Edition 3');
    // The only act on a closed approval reads its discussion; nothing on it
    // can be changed, and it links nowhere.
    const acts = screen.getAllByRole('button');
    expect(acts).toHaveLength(1);
    expect(acts[0]).toHaveTextContent('Read the discussion');
    expect(receipt.querySelector('a')).toBeNull();
  });

  it('says the disposition ahead of the outcome on a superseded edition', () => {
    render(
      <ApprovalReceipt
        approval={{
          ...APPROVAL,
          outcome: 'changes_requested',
          disposition: 'superseded',
          lifecycleStatus: 'responded',
          respondedAt: '2026-08-14T12:00:00Z',
        }}
      />,
    );

    // Reading plainly RETURNED beside the edition that replaced it is what
    // this precedence exists to prevent.
    expect(screen.getByTestId('approval-receipt-stamp')).toHaveTextContent('SUPERSEDED 14 August');
    expect(screen.getByTestId('approval-receipt-stamp')).not.toHaveTextContent('RETURNED');
  });

  it('keeps the discussion readable, and unwritable, after the approval closed', () => {
    render(
      <ApprovalReceipt
        approval={{
          ...APPROVAL,
          outcome: 'approved',
          lifecycleStatus: 'responded',
          respondedAt: '2026-08-14T12:00:00Z',
        }}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /read the discussion/i }));

    expect(screen.getByTestId('approval-discussion')).toBeInTheDocument();
    expect(screen.queryByTestId('approval-comment-field')).not.toBeInTheDocument();
  });

  it('says nothing about an approval that is still open', () => {
    const { container } = render(<ApprovalReceipt approval={APPROVAL} />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe('ApprovalRecords', () => {
  const closed = (id: string, at: string): ProjectApprovalReview => ({
    ...APPROVAL,
    decisionId: id,
    outcome: 'approved',
    lifecycleStatus: 'responded',
    respondedAt: at,
  });

  it('stands the closed approvals under one heading, and counts none of them', () => {
    render(<ApprovalRecords approvals={[closed('a', '2026-08-14T12:00:00Z')]} />);

    const records = screen.getByTestId('approval-records');
    expect(records).toHaveTextContent('Earlier approvals');
    expect(records).not.toHaveTextContent('Gates closed');
    expect(records.textContent).not.toMatch(/·\s*\d/);
  });

  it('folds the tail rather than stacking a year of stamps on the page', () => {
    const many = [
      closed('a', '2026-08-14T12:00:00Z'),
      closed('b', '2026-08-13T12:00:00Z'),
      closed('c', '2026-08-12T12:00:00Z'),
      closed('d', '2026-08-11T12:00:00Z'),
    ];
    render(<ApprovalRecords approvals={many} />);

    expect(screen.getAllByTestId('doorstep-approval-receipt')).toHaveLength(3);
    fireEvent.click(screen.getByRole('button', { name: /^read the earlier approvals$/i }));
    expect(screen.getAllByTestId('doorstep-approval-receipt')).toHaveLength(4);
  });

  it('says nothing when no approval has closed', () => {
    const { container } = render(<ApprovalRecords approvals={[]} />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe('useDoorstepApprovals', () => {
  it('keeps an ask that was answered while the client stood on the doorstep', () => {
    const { result, rerender } = renderHook(
      ({ approvals }: { approvals: ProjectApprovalReview[] }) =>
        useDoorstepApprovals(approvals),
      { initialProps: { approvals: [APPROVAL] } },
    );
    expect(result.current.asks).toHaveLength(1);

    act(() => result.current.onAnswered('dec-1'));
    rerender({
      approvals: [{ ...APPROVAL, outcome: 'approved', lifecycleStatus: 'responded' }],
    });
    expect(result.current.asks).toHaveLength(1);
    expect(result.current.asks[0].outcome).toBe('approved');
    expect(result.current.records).toHaveLength(0);
  });

  it('keeps the record of an approval answered before the client arrived', () => {
    const { result } = renderHook(() =>
      useDoorstepApprovals([
        { ...APPROVAL, outcome: 'approved', lifecycleStatus: 'responded' },
      ]),
    );
    expect(result.current.asks).toHaveLength(0);
    expect(result.current.records).toHaveLength(1);
    expect(result.current.anchoredDecisionIds).toEqual(['dec-1']);
  });

  it('keeps a confirmed draft standing while the studio holds it', () => {
    const { result } = renderHook(() =>
      useDoorstepApprovals([
        { ...APPROVAL, lifecycleStatus: 'draft', completedReviewCount: 1, requiredReviewCount: 1 },
      ]),
    );
    expect(result.current.asks).toHaveLength(1);
    expect(result.current.records).toHaveLength(0);
  });
});

/* ── The words the homeowner reads ───────────────────────────────────────────
   P-04 (no "gate" in front of a client), P-24 (words where a number was),
   P-10 (the wait names who has it and offers a way to ask), P-11 (the studio
   answers as itself, and one line says who answers).
   ────────────────────────────────────────────────────────────────────────── */

const AWAITING: ProjectApprovalReview = {
  ...APPROVAL,
  lifecycleStatus: 'draft',
  completedReviewCount: 1,
  requiredReviewCount: 1,
};

describe('the ask in the house’s vocabulary', () => {
  it('never prints the word gate, in any of the four states it stands in', () => {
    const states: ProjectApprovalReview[] = [
      { ...APPROVAL, lifecycleStatus: 'draft', completedReviewCount: 0 },
      APPROVAL,
      AWAITING,
      {
        ...APPROVAL,
        outcome: 'approved',
        lifecycleStatus: 'responded',
        respondedAt: '2026-08-14T12:00:00Z',
      },
    ];

    for (const approval of states) {
      const { unmount } = render(<ApprovalAsk approval={approval} />);
      expect(screen.getByTestId('doorstep-approval').textContent).not.toMatch(/gate/i);
      unmount();
    }
  });

  it('names the state without the word, in each of the four', () => {
    const { rerender } = render(
      <ApprovalAsk
        approval={{ ...APPROVAL, lifecycleStatus: 'draft', completedReviewCount: 0 }}
      />,
    );
    expect(screen.getByTestId('doorstep-approval')).toHaveTextContent(
      'Your approval · read the edition first',
    );

    rerender(<ApprovalAsk approval={APPROVAL} />);
    expect(screen.getByTestId('doorstep-approval')).toHaveTextContent(
      'Your approval · your answer is needed',
    );
  });

  it('reads the record of a closed edition without the word either', () => {
    render(
      <ApprovalReceipt
        approval={{
          ...APPROVAL,
          outcome: 'changes_requested',
          disposition: 'superseded',
          lifecycleStatus: 'responded',
          respondedAt: '2026-08-14T12:00:00Z',
        }}
      />,
    );

    const receipt = screen.getByTestId('doorstep-approval-receipt');
    expect(receipt).toHaveTextContent('Your approval · closed');
    expect(receipt.textContent).not.toMatch(/gate/i);
  });

  it('asks for the change in the designer’s own name, and will not send an empty return', () => {
    render(<ApprovalAsk approval={APPROVAL} designerGivenName="Leah" />);

    fireEvent.click(screen.getByRole('button', { name: /^return$/i }));

    expect(screen.getByLabelText('Tell Leah what to change.')).toBeInTheDocument();
    const submit = screen.getByRole('button', { name: /submit response/i });
    expect(submit).toBeDisabled();

    // Instruction, never validation: nothing on the page reports a failure,
    // and no refusal ink is spent on a note she has not written yet.
    const acts = screen.getByTestId('approval-acts');
    expect(acts.textContent).not.toMatch(/required|invalid|must|error/i);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('names the designer generically when the house has no name for him', () => {
    render(<ApprovalAsk approval={APPROVAL} />);
    fireEvent.click(screen.getByRole('button', { name: /^return$/i }));
    expect(screen.getByLabelText('Tell your designer what to change.')).toBeInTheDocument();
  });

  it('records nothing while the note is only whitespace', async () => {
    render(<ApprovalAsk approval={APPROVAL} />);
    fireEvent.click(screen.getByRole('button', { name: /^return$/i }));
    fireEvent.change(screen.getByTestId('approval-change-note'), { target: { value: '   ' } });

    expect(screen.getByRole('button', { name: /submit response/i })).toBeDisabled();
    await hold(screen.getByRole('button', { name: /submit response/i }));
    expect(respondMutate).not.toHaveBeenCalled();
    expect(commentMutateAsync).not.toHaveBeenCalled();
  });

  it('sends the note into the discussion before it records the return', async () => {
    render(<ApprovalAsk approval={APPROVAL} />);

    await returnEdition('The runner is too dark for the stair hall.');

    await waitFor(() => expect(respondMutate).toHaveBeenCalledTimes(1));
    expect(commentMutateAsync).toHaveBeenCalledWith({
      decisionId: 'dec-1',
      body: 'The runner is too dark for the stair hall.',
    });
    expect(commentMutateAsync.mock.invocationCallOrder[0]).toBeLessThan(
      respondMutate.mock.invocationCallOrder[0],
    );
  });

  it('does not return the edition when the note itself is refused', async () => {
    commentMutateAsync.mockRejectedValue(new Error('decision_comment refused: 42501'));
    render(<ApprovalAsk approval={APPROVAL} />);

    await returnEdition();

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'The note could not be sent, so the edition was not returned. Your note is still here; try again.',
    );
    expect(respondMutate).not.toHaveBeenCalled();
    expect(screen.queryByTestId('approval-stamp')).not.toBeInTheDocument();
  });

  it('says the note once when a refused outcome is submitted again', async () => {
    respondMutate.mockRejectedValueOnce(new Error('approval_conflict'));
    render(<ApprovalAsk approval={APPROVAL} />);

    await returnEdition('The runner is too dark for the stair hall.');

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'This approval changed while it was open. Refresh before responding.',
    );
    expect(commentMutateAsync).toHaveBeenCalledTimes(1);

    await submitAgain();

    // The note reached the thread on the first press. The retry records the
    // outcome and leaves the thread alone — the designer reads it once.
    await waitFor(() => expect(respondMutate).toHaveBeenCalledTimes(2));
    expect(commentMutateAsync).toHaveBeenCalledTimes(1);
  });

  it('sends the note again when she changes what she wants to say', async () => {
    respondMutate.mockRejectedValueOnce(new Error('approval_conflict'));
    render(<ApprovalAsk approval={APPROVAL} />);

    await returnEdition('The runner is too dark.');
    await screen.findByRole('alert');

    fireEvent.change(screen.getByTestId('approval-change-note'), {
      target: { value: 'The runner is too dark, and the sconces sit low.' },
    });
    await submitAgain();

    await waitFor(() => expect(commentMutateAsync).toHaveBeenCalledTimes(2));
    expect(commentMutateAsync.mock.calls[1][0]).toEqual({
      decisionId: 'dec-1',
      body: 'The runner is too dark, and the sconces sit low.',
    });
  });

  it('asks for no note on the two outcomes that are not a return', () => {
    render(<ApprovalAsk approval={APPROVAL} />);

    fireEvent.click(screen.getByRole('button', { name: /^approve$/i }));
    expect(screen.queryByTestId('approval-change-note')).not.toBeInTheDocument();
    sign();
    expect(screen.getByRole('button', { name: /submit response/i })).not.toBeDisabled();

    fireEvent.click(screen.getByRole('button', { name: /choose another outcome/i }));
    fireEvent.click(screen.getByRole('button', { name: /^hold$/i }));
    expect(screen.queryByTestId('approval-change-note')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /submit response/i })).not.toBeDisabled();
  });

  it('holds the approval, not the gate, when the client keeps it open', () => {
    render(<ApprovalAsk approval={APPROVAL} />);
    fireEvent.click(screen.getByRole('button', { name: /^hold$/i }));

    expect(screen.getByTestId('approval-consequence')).toHaveTextContent(
      'Hold · Keep this open while you and your designer talk it through.',
    );
  });
});

describe('reviews counted in words', () => {
  it('says her own review is still needed rather than nought of one', () => {
    render(
      <ApprovalAsk
        approval={{ ...APPROVAL, lifecycleStatus: 'draft', completedReviewCount: 0 }}
      />,
    );

    const line = screen.getByTestId('approval-review-count');
    expect(line).toHaveTextContent('Your review is still needed.');
    expect(line.textContent).not.toMatch(/\d/);
  });

  it('counts several reviews in words', () => {
    render(
      <ApprovalAsk
        approval={{ ...APPROVAL, completedReviewCount: 2, requiredReviewCount: 3 }}
      />,
    );

    const line = screen.getByTestId('approval-review-count');
    expect(line).toHaveTextContent('Two of three reviews confirmed.');
    expect(line.textContent).not.toMatch(/\d/);
  });

  it('says none rather than zero when several are still owed', () => {
    render(
      <ApprovalAsk
        approval={{
          ...APPROVAL,
          lifecycleStatus: 'draft',
          completedReviewCount: 0,
          requiredReviewCount: 3,
        }}
      />,
    );

    expect(screen.getByTestId('approval-review-count')).toHaveTextContent(
      'None of three reviews are confirmed yet.',
    );
  });
});

/* ── The chair the reader is sitting in (00569 `viewerRole`) ─────────────────
   `respond_project_approval` and `confirm_project_decision_review` both accept
   the frozen decision lead ALONE. A studio co-member signed into the client app
   used to be told "your answer is needed" and could hold Approve all the way
   into the RPC's refusal. The projection now says which chair she is in, and a
   door that would only refuse her is not drawn at all.
   ─────────────────────────────────────────────────────────────────────────── */
describe('who this approval waits on', () => {
  const DOORS = /^(approve|return|hold)$/i;

  it('offers the three doors to the lead', () => {
    render(<ApprovalAsk approval={{ ...APPROVAL, viewerRole: 'lead' }} />);

    expect(screen.getByTestId('approval-acts')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: DOORS })).toHaveLength(3);
    expect(screen.getByTestId('doorstep-approval')).toHaveTextContent(
      'Your approval · your answer is needed',
    );
    expect(screen.queryByTestId('approval-answered-by-another')).not.toBeInTheDocument();
  });

  // A projection older or stranger than 00569 names no chair this build knows.
  // Absence is not a licence to guess, so the surface behaves exactly as it did
  // before the field existed rather than taking the lead's own doors from her.
  it.each<[string, unknown]>([
    ['a chair the projection left null', null],
    ['no chair at all', undefined],
    ['a chair this build does not recognise', 'owner'],
  ])('offers the three doors for %s', (_case, viewerRole) => {
    render(
      <ApprovalAsk
        approval={{ ...APPROVAL, viewerRole } as unknown as ProjectApprovalReview}
      />,
    );

    expect(screen.getByTestId('approval-acts')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: DOORS })).toHaveLength(3);
  });

  it.each<['studio' | 'household']>([['studio'], ['household']])(
    'draws no door for a %s reader, and does not tell her an answer is owed',
    (viewerRole) => {
      render(<ApprovalAsk approval={{ ...APPROVAL, viewerRole }} />);

      expect(screen.queryByTestId('approval-acts')).not.toBeInTheDocument();
      expect(screen.queryAllByRole('button', { name: DOORS })).toHaveLength(0);

      const ask = screen.getByTestId('doorstep-approval');
      expect(ask).toHaveTextContent('This approval · yours to read');
      expect(ask).not.toHaveTextContent('your answer is needed');
      // Nothing is owed on it, so it is not spared the Since-Yesterday dim.
      expect(ask).not.toHaveAttribute('data-never-dim');
      // Not a screen whose acts merely went missing: one line says who answers.
      expect(screen.getByTestId('approval-answered-by-another')).toHaveTextContent(
        'This one is answered by the person it was sent to.',
      );
      // And the ask reads in the third person, never the second.
      expect(screen.getByTestId('approval-review-count')).toHaveTextContent(
        'The review is confirmed.',
      );
    },
  );

  it('draws no confirm act for a studio reader on a draft edition', () => {
    render(
      <ApprovalAsk
        approval={{
          ...APPROVAL,
          viewerRole: 'studio',
          lifecycleStatus: 'draft',
          completedReviewCount: 0,
        }}
      />,
    );

    expect(
      screen.queryByRole('button', { name: /review exact edition/i }),
    ).not.toBeInTheDocument();
    expect(screen.getByTestId('approval-review-count')).toHaveTextContent(
      'The review is still needed.',
    );
  });

  // The refusal sentence explains an act she was offered. Never offered, never
  // shown — a studio reader is not told the studio's tooling is broken.
  it('does not show the confirmation-unavailable sentence to a studio reader', () => {
    render(
      <ApprovalAsk
        approval={{
          ...APPROVAL,
          viewerRole: 'studio',
          lifecycleStatus: 'draft',
          completedReviewCount: 0,
          authorityRevision: null,
        }}
      />,
    );

    expect(
      screen.queryByTestId('approval-confirmation-unavailable'),
    ).not.toBeInTheDocument();
  });

  it('does not claim a studio reader confirmed the edition herself', () => {
    render(
      <ApprovalAsk
        approval={{ ...AWAITING, viewerRole: 'studio' }}
        designerGivenName="Nora"
      />,
    );

    const line = screen.getByTestId('approval-awaiting-studio-issue');
    expect(line).toHaveTextContent('Edition 3 is confirmed. Nora issues it next.');
    expect(line).not.toHaveTextContent("You've confirmed");
    expect(line).not.toHaveTextContent('Nothing is waiting on you.');
  });

  it('still shows the recorded outcome to a reader who did not answer', () => {
    render(
      <ApprovalAsk
        approval={{
          ...APPROVAL,
          viewerRole: 'studio',
          outcome: 'approved',
          respondedAt: '2026-08-14T12:00:00Z',
        }}
      />,
    );

    expect(screen.getByTestId('doorstep-approval')).toHaveTextContent(
      'This approval · answered',
    );
  });
});

describe('the end of the wait', () => {
  it('names what she did, who has it, and that nothing waits on her', () => {
    render(<ApprovalAsk approval={AWAITING} designerGivenName="Nora" studioName="Quist Interiors" />);

    const said = screen.getByTestId('approval-awaiting-studio-issue');
    expect(said).toHaveTextContent(
      "You've confirmed edition 3. Nora issues it next. Nothing is waiting on you.",
    );
    // No invented timing — the row carries no date the studio promised.
    expect(said.textContent).not.toMatch(/day|week|soon|shortly/i);
  });

  it('falls back to "your designer" when the house has no lead named', () => {
    render(<ApprovalAsk approval={AWAITING} />);

    expect(screen.getByTestId('approval-awaiting-studio-issue')).toHaveTextContent(
      'Your designer issues it next.',
    );
    expect(screen.getByRole('button', { name: /ask your designer about this/i }))
      .toBeInTheDocument();
  });

  it('puts her in the composer already on the page, and opens no route', () => {
    render(<ApprovalAsk approval={AWAITING} designerGivenName="Nora" studioName="Quist Interiors" />);

    const act = screen.getByRole('button', { name: /ask nora about this/i });
    expect(act.tagName).toBe('BUTTON');
    fireEvent.click(act);

    expect(screen.getByTestId('approval-comment-field')).toHaveFocus();
  });

  it('draws no act at all when there is no composer to put her in', () => {
    commentsHook.mockReturnValue({ data: undefined, isLoading: false, isError: true });
    render(<ApprovalAsk approval={AWAITING} designerGivenName="Nora" studioName="Quist Interiors" />);

    expect(screen.getByTestId('approval-awaiting-studio-issue')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /ask nora about this/i })).not.toBeInTheDocument();
  });
});

describe('who is speaking, and who answers', () => {
  const thread = [
    {
      id: 'c1',
      decision_id: 'dec-1',
      author_id: 'user-1',
      body: 'Can we see the brass in daylight?',
      created_at: '2026-08-13T12:00:00Z',
      updated_at: '2026-08-13T12:00:00Z',
    },
    {
      id: 'c2',
      decision_id: 'dec-1',
      author_id: 'designer-9',
      body: 'I will bring both finishes on Thursday.',
      created_at: '2026-08-13T15:00:00Z',
      updated_at: '2026-08-13T15:00:00Z',
    },
  ];

  it('signs the studio’s side with the designer she knows, under the studio', () => {
    commentsHook.mockReturnValue({ data: thread, isLoading: false, isError: false });
    render(
      <ApprovalAsk approval={APPROVAL} designerGivenName="Nora" studioName="Quist Interiors" />,
    );

    const written = screen.getByTestId('approval-discussion');
    expect(written).toHaveTextContent('Nora · Quist Interiors');
    expect(written).toHaveTextContent('You');
    expect(written).not.toHaveTextContent('designer-9');
  });

  it('keeps the studio anonymous when only half the name is known', () => {
    commentsHook.mockReturnValue({ data: thread, isLoading: false, isError: false });
    render(<ApprovalAsk approval={APPROVAL} designerGivenName="Nora" />);

    const written = screen.getByTestId('approval-discussion');
    expect(written).toHaveTextContent('The studio');
    expect(written).not.toHaveTextContent('Nora ·');
  });

  it('signs a closed approval’s thread the same way', () => {
    commentsHook.mockReturnValue({ data: thread, isLoading: false, isError: false });
    render(
      <ApprovalRecords
        approvals={[
          {
            ...APPROVAL,
            outcome: 'approved',
            lifecycleStatus: 'responded',
            respondedAt: '2026-08-14T12:00:00Z',
          },
        ]}
        designerGivenName="Nora"
        studioName="Quist Interiors"
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /read the discussion/i }));
    expect(screen.getByTestId('approval-discussion')).toHaveTextContent('Nora · Quist Interiors');
  });

  it('says who answers, once, under the outcomes', () => {
    render(<ApprovalAsk approval={APPROVAL} />);

    expect(screen.getByTestId('approval-who-answers')).toHaveTextContent(
      "You're the one who answers this.",
    );
  });

  it('says it only where an answer is hers to give', () => {
    render(<ApprovalAsk approval={AWAITING} />);
    expect(screen.queryByTestId('approval-who-answers')).not.toBeInTheDocument();
  });
});

describe('the outcome is signed and held (P-18)', () => {
  it('draws the ruled line, dated, once an outcome is chosen', () => {
    render(<ApprovalAsk approval={APPROVAL} />);
    expect(screen.queryByTestId('approval-signature')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /^approve$/i }));

    const rule = screen.getByTestId('approval-signature');
    expect(rule).toHaveAttribute('autocomplete', 'name');
    expect(screen.getByLabelText('Type your full name')).toBe(rule);
    expect(screen.getByTestId('approval-signature-notice')).toHaveTextContent(
      'Your typed name acts as your electronic signature.',
    );
    expect(screen.getByTestId('approval-signature-date')).toHaveClass('font-mono');
  });

  it('leaves the submit unheld until there is a name to hold it with', async () => {
    render(<ApprovalAsk approval={APPROVAL} />);
    fireEvent.click(screen.getByRole('button', { name: /^approve$/i }));

    const submit = screen.getByRole('button', { name: /submit response/i });
    expect(submit).toBeDisabled();

    sign('H');
    expect(submit).toBeDisabled();

    sign('  ');
    expect(submit).toBeDisabled();
    await hold(submit);
    expect(respondMutate).not.toHaveBeenCalled();

    sign('Harper Vale');
    expect(submit).not.toBeDisabled();
  });

  it('records nothing on a tap, and only on a hold held to its length', async () => {
    render(<ApprovalAsk approval={APPROVAL} />);
    fireEvent.click(screen.getByRole('button', { name: /^approve$/i }));
    sign();

    const submit = screen.getByRole('button', { name: /submit response/i });
    // A tap is a pointer press and the click that trails it; neither records.
    fireEvent.pointerDown(submit, { clientX: 4, clientY: 4 });
    fireEvent.pointerUp(submit);
    fireEvent.click(submit);
    expect(respondMutate).not.toHaveBeenCalled();

    jest.useFakeTimers();
    fireEvent.pointerDown(submit, { clientX: 4, clientY: 4 });
    act(() => {
      jest.advanceTimersByTime(HOLD_MS - 1);
    });
    fireEvent.pointerUp(submit);
    act(() => {
      jest.advanceTimersByTime(HOLD_MS * 2);
    });
    jest.useRealTimers();
    expect(respondMutate).not.toHaveBeenCalled();

    await hold(submit);
    await waitFor(() => expect(respondMutate).toHaveBeenCalledTimes(1));
  });

  it('asks no name of a return or a hold, and records no consent for them', async () => {
    render(<ApprovalAsk approval={APPROVAL} />);

    // Returning consents to nothing, so there is no rule to sign on: the
    // choice is the act and the hold is the commitment (ux/02:308).
    fireEvent.click(screen.getByRole('button', { name: /^return$/i }));
    expect(screen.queryByTestId('approval-signature')).not.toBeInTheDocument();

    fireEvent.change(screen.getByTestId('approval-change-note'), {
      target: { value: 'The runner is too dark for the stair hall.' },
    });
    await hold(screen.getByRole('button', { name: /submit response/i }));

    await waitFor(() => expect(respondMutate).toHaveBeenCalledTimes(1));
    expect(respondMutate.mock.calls[0][0]).toMatchObject({
      outcome: 'changes_requested',
      clientSignature: undefined,
      clientConsentMethod: undefined,
    });

  });

  it('asks no name of a hold either', async () => {
    render(<ApprovalAsk approval={APPROVAL} />);

    fireEvent.click(screen.getByRole('button', { name: /^hold$/i }));
    expect(screen.queryByTestId('approval-signature')).not.toBeInTheDocument();
    // Nothing to type, so the act is armed the moment it is chosen.
    const submit = screen.getByRole('button', { name: /submit response/i });
    expect(submit).not.toBeDisabled();
    await hold(submit);

    await waitFor(() => expect(respondMutate).toHaveBeenCalledTimes(1));
    expect(respondMutate.mock.calls[0][0]).toMatchObject({
      outcome: 'needs_discussion',
      clientSignature: undefined,
      clientConsentMethod: undefined,
    });
  });

  it('names the gesture on both held acts, and asks no signature of the review', async () => {
    render(<ApprovalAsk approval={{ ...APPROVAL, lifecycleStatus: 'draft', completedReviewCount: 0 }} />);

    const confirm = screen.getByRole('button', { name: /review exact edition/i });
    const said = confirm.getAttribute('aria-describedby');
    expect(document.getElementById(said as string)).toHaveTextContent(
      'Press and hold to confirm this exact edition.',
    );
    // R1: a hold is still a click-through, so nothing is signed here.
    expect(screen.queryByTestId('approval-signature')).not.toBeInTheDocument();

    await hold(confirm);
    await waitFor(() => expect(confirmMutate).toHaveBeenCalledTimes(1));
    expect(confirmMutate.mock.calls[0][0]).not.toHaveProperty('clientSignature');
  });
});
