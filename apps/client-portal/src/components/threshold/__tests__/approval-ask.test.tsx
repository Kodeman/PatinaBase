import { act, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react';

import type { ProjectApprovalReview } from '@patina/supabase';

/* ── Boundaries ──────────────────────────────────────────────────────────────
   The ask is `/decisions/[id]`'s ceremony moved onto the doorstep, so the
   boundary is the same five hooks that page used. The assertions are about
   the payloads: an outcome recorded here and an outcome recorded there must
   be the same row. ────────────────────────────────────────────────────────── */

jest.mock('@patina/supabase', () => ({
  __esModule: true,
  useConfirmProjectApprovalReview: jest.fn(),
  useRespondProjectApproval: jest.fn(),
  useDecisionComments: jest.fn(),
  useCreateDecisionComment: jest.fn(),
  useDecisionRealtime: jest.fn(),
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

import { ApprovalAsk, useDoorstepApprovals } from '../approval-ask';

const confirmHook = useConfirmProjectApprovalReview as jest.Mock;
const respondHook = useRespondProjectApproval as jest.Mock;
const commentsHook = useDecisionComments as jest.Mock;
const createCommentHook = useCreateDecisionComment as jest.Mock;
const realtimeHook = useDecisionRealtime as jest.Mock;
const authHook = useAuth as jest.Mock;

const respondMutate = jest.fn();
const confirmMutate = jest.fn();
const commentMutate = jest.fn();

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

beforeEach(() => {
  respondMutate.mockReset().mockResolvedValue({});
  confirmMutate.mockReset().mockResolvedValue({});
  commentMutate.mockReset();

  confirmHook.mockReturnValue({ mutateAsync: confirmMutate, isPending: false });
  respondHook.mockReturnValue({ mutateAsync: respondMutate, isPending: false });
  commentsHook.mockReturnValue({ data: [], isLoading: false, isError: false });
  createCommentHook.mockReturnValue({ mutate: commentMutate, isPending: false });
  realtimeHook.mockReturnValue(undefined);
  authHook.mockReturnValue({ user: { id: 'user-1', name: 'Harper Vale' } });

  Object.defineProperty(globalThis, 'crypto', {
    configurable: true,
    value: { randomUUID: () => 'request-key-1' },
  });
});

describe('ApprovalAsk — the ask, answered where it stands', () => {
  it('renders the ask: title, edition, due date, rationale and impact', () => {
    render(<ApprovalAsk approval={APPROVAL} />);

    const ask = screen.getByTestId('doorstep-approval');
    expect(ask).toHaveAttribute('id', 'approval-dec-1');
    expect(ask).toHaveAttribute('data-threshold-unit', 'doorstep-approval');
    expect(ask).toHaveTextContent('Do the library elevations read right to you?');
    expect(ask).toHaveTextContent('Library elevations · Edition 3 · Due August 20');
    expect(screen.getByTestId('approval-rationale')).toHaveTextContent(
      'This releases the joinery package for pricing.',
    );

    const impact = screen.getByTestId('approval-impact');
    expect(impact).toHaveTextContent('Cost');
    expect(impact).toHaveTextContent('+$1,200');
    expect(impact).toHaveTextContent('Lead time');
    expect(impact).toHaveTextContent('−4 days');
    // A delta of nothing is not a fact worth a row.
    expect(impact).not.toHaveTextContent('Schedule');

    expect(screen.getByRole('button', { name: /^approve$/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /ask a question/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^decline$/i })).toBeInTheDocument();
  });

  it('approves with the payload the old detail page sent, then stamps in place', async () => {
    const onAnswered = jest.fn();
    render(<ApprovalAsk approval={APPROVAL} onAnswered={onAnswered} />);

    fireEvent.click(screen.getByRole('button', { name: /^approve$/i }));

    await waitFor(() => expect(respondMutate).toHaveBeenCalledTimes(1));
    expect(respondMutate).toHaveBeenCalledWith({
      projectId: 'proj-1',
      decisionId: 'dec-1',
      outcome: 'approved',
      expectedUpdatedAt: '2026-08-12T12:00:00Z',
      idempotencyKey: 'request-key-1',
    });

    const stamp = await screen.findByTestId('approval-stamp');
    expect(stamp).toHaveTextContent(/^Approved/);
    expect(stamp).toHaveTextContent('Library elevations · Edition 3');
    expect(onAnswered).toHaveBeenCalledWith('dec-1');
  });

  it('declines as changes_requested and reads back as Declined', async () => {
    render(<ApprovalAsk approval={APPROVAL} />);

    fireEvent.click(screen.getByRole('button', { name: /^decline$/i }));

    await waitFor(() => expect(respondMutate).toHaveBeenCalledTimes(1));
    expect(respondMutate.mock.calls[0][0]).toMatchObject({
      outcome: 'changes_requested',
      decisionId: 'dec-1',
    });
    expect(await screen.findByTestId('approval-stamp')).toHaveTextContent(/^Declined/);
  });

  it('holds the gate when the client asks a question', async () => {
    render(<ApprovalAsk approval={APPROVAL} />);

    fireEvent.click(screen.getByRole('button', { name: /ask a question/i }));

    await waitFor(() => expect(respondMutate).toHaveBeenCalledTimes(1));
    expect(respondMutate.mock.calls[0][0]).toMatchObject({ outcome: 'needs_discussion' });
    expect(await screen.findByTestId('approval-stamp')).toHaveTextContent(/^Held/);
  });

  it('reads a recorded decline back from the row, with its own date', () => {
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

    expect(screen.getByTestId('approval-stamp')).toHaveTextContent('Declined 14 August');
    expect(screen.getByTestId('doorstep-approval')).toHaveTextContent('A gate · answered');
    expect(screen.queryByTestId('approval-acts')).not.toBeInTheDocument();
    expect(screen.getByTestId('doorstep-approval')).not.toHaveAttribute('data-never-dim');
  });

  it('confirms the exact edition with the old page’s payload while the gate is a draft', async () => {
    render(
      <ApprovalAsk
        approval={{ ...APPROVAL, lifecycleStatus: 'draft', completedReviewCount: 0 }}
      />,
    );

    expect(screen.getByTestId('doorstep-approval')).toHaveTextContent(
      'your review is required',
    );
    fireEvent.click(screen.getByRole('button', { name: /review exact edition/i }));

    await waitFor(() => expect(confirmMutate).toHaveBeenCalledTimes(1));
    expect(confirmMutate).toHaveBeenCalledWith({
      projectId: 'proj-1',
      decisionId: 'dec-1',
      authorityRevision: 3,
      artifactChecksum: 'a'.repeat(64),
      idempotencyKey: 'request-key-1',
    });
    expect(screen.queryByTestId('approval-acts')).not.toBeInTheDocument();
  });

  it('says so when the approval moved under the client', async () => {
    respondMutate.mockRejectedValue(new Error('approval_conflict'));
    render(<ApprovalAsk approval={APPROVAL} />);

    fireEvent.click(screen.getByRole('button', { name: /^approve$/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent('approval_conflict');
    expect(screen.queryByTestId('approval-stamp')).not.toBeInTheDocument();
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
    expect(thread).toHaveTextContent('I will bring both finishes on Thursday.');
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
  });

  it('never stands an ask that was already answered before the client arrived', () => {
    const { result } = renderHook(() =>
      useDoorstepApprovals([
        { ...APPROVAL, outcome: 'approved', lifecycleStatus: 'responded' },
      ]),
    );
    expect(result.current.asks).toHaveLength(0);
  });
});
