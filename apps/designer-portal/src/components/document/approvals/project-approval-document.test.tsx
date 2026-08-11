import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { axe, toHaveNoViolations } from 'jest-axe';

import { ProjectApprovalDocument } from './project-approval-document';
import type {
  ProjectApprovalArtifactCandidate,
  ProjectApprovalReview,
} from '@patina/supabase';

expect.extend(toHaveNoViolations);

const setAuthority = jest.fn();
const createApproval = jest.fn();
const publishApproval = jest.fn();
const withdrawApproval = jest.fn();
const supersedeApproval = jest.fn();

let authority: Record<string, unknown> | null = null;
let approvals: ProjectApprovalReview[] = [];
let candidates: ProjectApprovalArtifactCandidate[] = [];

jest.mock('@patina/supabase', () => ({
  useProjectApprovals: () => ({
    data: approvals,
    isLoading: false,
    isError: false,
  }),
  useProjectApprovalArtifactCandidates: () => ({
    data: candidates,
    isLoading: false,
    isError: false,
  }),
  useProjectDecisionAuthority: () => ({
    data: authority,
    isLoading: false,
    isError: false,
  }),
  useSetProjectDecisionAuthority: () => ({
    mutateAsync: setAuthority,
    isPending: false,
  }),
  useCreateProjectApproval: () => ({
    mutateAsync: createApproval,
    isPending: false,
  }),
  usePublishProjectApproval: () => ({
    mutateAsync: publishApproval,
    isPending: false,
  }),
  useWithdrawProjectApproval: () => ({
    mutateAsync: withdrawApproval,
    isPending: false,
  }),
  useSupersedeProjectApproval: () => ({
    mutateAsync: supersedeApproval,
    isPending: false,
  }),
  useProjectApprovalRealtime: jest.fn(),
}));

jest.mock('@/lib/analytics/document-events', () => ({
  documentEvents: {
    actionShown: jest.fn(),
    actionSelected: jest.fn(),
  },
}));

const candidate = {
  artifactKind: 'plan_issue',
  artifactId: 'issue-1',
  artifactVersion: 2,
  artifactChecksum: 'a'.repeat(64),
  artifactTitle: 'Issued drawing set 02',
  issuedAt: '2026-08-10T12:00:00.000Z',
  publishedAt: null,
} satisfies ProjectApprovalArtifactCandidate;

const baseReview = {
  decisionId: 'decision-1',
  projectId: 'project-1',
  phaseId: 'phase-1',
  sectionKey: null,
  artifactKind: 'plan_issue',
  artifactId: 'issue-1',
  artifactVersion: 2,
  artifactChecksum: 'a'.repeat(64),
  artifactTitle: 'Issued drawing set 02',
  question: 'Approve this exact drawing set?',
  context: null,
  dueAt: '2099-09-01T12:00:00.000Z',
  costCentsDelta: 0,
  scheduleDaysDelta: -2,
  leadTimeDaysDelta: 7,
  lifecycleStatus: 'draft',
  outcome: null,
  disposition: 'active',
  isOverdue: false,
  completedReviewCount: 0,
  requiredReviewCount: 1,
  authorityRevision: 4,
  predecessorDecisionId: null,
  successorDecisionId: null,
  createdAt: '2026-08-10T12:00:00.000Z',
  sentAt: null,
  respondedAt: null,
  updatedAt: '2026-08-10T12:05:00.000Z',
} satisfies ProjectApprovalReview;

const renderDocument = () =>
  render(
    <ProjectApprovalDocument
      projectId="project-1"
      clientProfileId="client-1"
      phases={[
        {
          id: 'phase-1',
          name: 'Design development',
          status: 'in_progress',
        },
      ]}
    />,
  );

beforeEach(() => {
  authority = null;
  approvals = [];
  candidates = [candidate];
  setAuthority.mockReset().mockResolvedValue({});
  createApproval.mockReset().mockResolvedValue({});
  publishApproval.mockReset().mockResolvedValue({});
  withdrawApproval.mockReset().mockResolvedValue({});
  supersedeApproval.mockReset().mockResolvedValue({});
});

describe('ProjectApprovalDocument authority and composer', () => {
  it('assigns only the exact project client with first-write CAS', async () => {
    renderDocument();
    fireEvent.click(
      screen.getByRole('button', { name: 'Assign project client' }),
    );

    await waitFor(() =>
      expect(setAuthority).toHaveBeenCalledWith({
        projectId: 'project-1',
        decisionLeadId: 'client-1',
        expectedRevision: 0,
      }),
    );
    expect(screen.queryByText(/co-approver/i)).not.toBeInTheDocument();
  });

  it('reassigns a stale authority to the exact current project client with nonzero CAS', async () => {
    authority = {
      projectId: 'project-1',
      decisionLeadId: 'former-client',
      requiredCoapproverId: null,
      revision: 7,
    };
    renderDocument();

    fireEvent.click(
      screen.getByRole('button', { name: 'Assign current project client' }),
    );

    await waitFor(() =>
      expect(setAuthority).toHaveBeenCalledWith({
        projectId: 'project-1',
        decisionLeadId: 'client-1',
        expectedRevision: 7,
      }),
    );
  });

  it('excludes completed phases from new approval authoring', () => {
    authority = {
      projectId: 'project-1',
      decisionLeadId: 'client-1',
      requiredCoapproverId: null,
      revision: 4,
    };
    render(
      <ProjectApprovalDocument
        projectId="project-1"
        clientProfileId="client-1"
        phases={[
          { id: 'phase-0', name: 'Discovery', status: 'completed' },
          { id: 'phase-1', name: 'Design development', status: 'in_progress' },
        ]}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'New approval' }));
    expect(screen.getByLabelText('Exact project phase')).not.toHaveTextContent(
      'Discovery',
    );
    expect(screen.getByLabelText('Exact project phase')).toHaveTextContent(
      'Design development',
    );
  });

  it('sends the exact phase/artifact, preserves all three signed zero deltas, and reuses the key on retry', async () => {
    authority = {
      projectId: 'project-1',
      decisionLeadId: 'client-1',
      requiredCoapproverId: null,
      revision: 4,
    };
    createApproval
      .mockRejectedValueOnce(new Error('Temporary write conflict'))
      .mockResolvedValueOnce({});
    renderDocument();

    fireEvent.click(screen.getByRole('button', { name: 'New approval' }));
    fireEvent.change(screen.getByLabelText('Title'), {
      target: { value: 'Drawing set 02' },
    });
    fireEvent.change(screen.getByLabelText('Approval question'), {
      target: { value: 'Approve this exact drawing set?' },
    });
    fireEvent.change(screen.getByLabelText('Exact project phase'), {
      target: { value: 'phase-1' },
    });
    fireEvent.change(screen.getByLabelText('Issued artifact'), {
      target: { value: 'plan_issue:issue-1' },
    });
    fireEvent.change(screen.getByLabelText('Due date and time'), {
      target: { value: '2099-09-01T12:00' },
    });

    fireEvent.click(
      screen.getByRole('button', { name: 'Create review draft' }),
    );
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Temporary write conflict',
    );
    fireEvent.click(
      screen.getByRole('button', { name: 'Create review draft' }),
    );

    await waitFor(() => expect(createApproval).toHaveBeenCalledTimes(2));
    expect(createApproval.mock.calls[0][0]).toEqual({
      projectId: 'project-1',
      idempotencyKey: expect.any(String),
      payload: expect.objectContaining({
        phaseId: 'phase-1',
        artifactKind: 'plan_issue',
        artifactId: 'issue-1',
        costCentsDelta: 0,
        scheduleDaysDelta: 0,
        leadTimeDaysDelta: 0,
      }),
    });
    expect(createApproval.mock.calls[1][0].idempotencyKey).toBe(
      createApproval.mock.calls[0][0].idempotencyKey,
    );
  });
});

describe('ProjectApprovalDocument lifecycle and accessibility', () => {
  it('keeps publish review-count gated and offers only valid active-leaf actions', async () => {
    authority = {
      decisionLeadId: 'client-1',
      requiredCoapproverId: null,
      revision: 4,
    };
    approvals = [baseReview];
    const { rerender } = renderDocument();

    expect(screen.getByRole('button', { name: 'Publish' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Withdraw' })).toBeEnabled();
    expect(
      screen.queryByRole('button', { name: 'Supersede with new artifact' }),
    ).not.toBeInTheDocument();

    approvals = [{ ...baseReview, completedReviewCount: 1 }];
    rerender(
      <ProjectApprovalDocument
        projectId="project-1"
        clientProfileId="client-1"
        phases={[
          {
            id: 'phase-1',
            name: 'Design development',
            status: 'in_progress',
          },
        ]}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Publish' }));
    await waitFor(() =>
      expect(publishApproval).toHaveBeenCalledWith({
        projectId: 'project-1',
        decisionId: 'decision-1',
      }),
    );
  });

  it('withdraws a pending leaf with a reason and stable idempotency evidence', async () => {
    authority = {
      decisionLeadId: 'client-1',
      requiredCoapproverId: null,
      revision: 4,
    };
    approvals = [{ ...baseReview, lifecycleStatus: 'pending' }];
    renderDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Withdraw' }));
    fireEvent.change(screen.getByLabelText('Withdrawal reason'), {
      target: { value: 'A newer issued set is ready.' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Confirm withdrawal' }));

    await waitFor(() =>
      expect(withdrawApproval).toHaveBeenCalledWith({
        projectId: 'project-1',
        decisionId: 'decision-1',
        expectedUpdatedAt: baseReview.updatedAt,
        reason: 'A newer issued set is ready.',
        idempotencyKey: expect.any(String),
      }),
    );
  });

  it('does not offer the current source or same checksum for leaf supersession', () => {
    authority = {
      decisionLeadId: 'client-1',
      requiredCoapproverId: null,
      revision: 4,
    };
    approvals = [
      {
        ...baseReview,
        lifecycleStatus: 'responded',
        outcome: 'changes_requested',
      },
    ];
    candidates = [
      candidate,
      { ...candidate, artifactId: 'issue-2', artifactTitle: 'Same bytes' },
      {
        ...candidate,
        artifactId: 'issue-3',
        artifactTitle: 'Issued drawing set 03',
        artifactChecksum: 'b'.repeat(64),
      },
    ];
    renderDocument();

    fireEvent.click(
      screen.getByRole('button', { name: 'Supersede with new artifact' }),
    );
    const options = Array.from(
      screen.getByLabelText('New issued artifact').querySelectorAll('option'),
    ).map((option) => option.textContent);
    expect(options).toEqual([
      'Choose a genuinely new artifact',
      'Issued drawing set 03 · v2',
    ]);
  });

  it('suppresses supersession when the approval is bound to a completed phase', () => {
    authority = {
      decisionLeadId: 'client-1',
      requiredCoapproverId: null,
      revision: 4,
    };
    approvals = [
      {
        ...baseReview,
        lifecycleStatus: 'responded',
        outcome: 'approved',
      },
    ];
    render(
      <ProjectApprovalDocument
        projectId="project-1"
        clientProfileId="client-1"
        phases={[
          { id: 'phase-1', name: 'Design development', status: 'completed' },
        ]}
      />,
    );

    expect(
      screen.queryByRole('button', { name: 'Supersede with new artifact' }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByText(/This approval belongs to a completed phase/),
    ).toHaveAttribute('role', 'status');
  });

  it('has named controls, 44px actions, and a one-column 320px base layout', async () => {
    authority = {
      decisionLeadId: 'client-1',
      requiredCoapproverId: null,
      revision: 4,
    };
    const { container } = renderDocument();
    fireEvent.click(screen.getByRole('button', { name: 'New approval' }));

    expect(container.querySelector('.grid-cols-1')).not.toBeNull();
    expect(container.querySelector('[data-action-hit]')).not.toBeNull();
    expect(
      container.querySelector('[data-project-approval-document]'),
    ).toHaveClass('min-w-0');
    expect(await axe(container)).toHaveNoViolations();
  });
});
