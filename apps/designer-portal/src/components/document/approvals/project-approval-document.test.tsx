import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { axe, toHaveNoViolations } from 'jest-axe';

import { ProjectApprovalDocument } from './project-approval-document';
import { FOCUS_PROJECT_APPROVAL_EVENT } from './project-approval-navigation';
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
let approvalsLoading = false;
let approvalsFetching = false;

jest.mock('@patina/supabase', () => ({
  useProjectApprovals: () => ({
    data: approvals,
    isLoading: approvalsLoading,
    isFetching: approvalsFetching,
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
}));

jest.mock('@/lib/analytics/document-events', () => ({
  documentEvents: {
    actionShown: jest.fn(),
    actionSelected: jest.fn(),
    regionFolded: jest.fn(),
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
      clientName="Marta Chen"
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
  approvalsLoading = false;
  approvalsFetching = false;
  candidates = [candidate];
  setAuthority.mockReset().mockResolvedValue({});
  createApproval.mockReset().mockResolvedValue({});
  publishApproval.mockReset().mockResolvedValue({});
  withdrawApproval.mockReset().mockResolvedValue({});
  supersedeApproval.mockReset().mockResolvedValue({});
  window.localStorage.clear();
});

/** R127 OD-10 (W3-L5). The Client approvals region USED to default folded shut
 *  once its data settled with no open work (no lead + no approvals, or every
 *  approval sealed), so tests that read the record body against exactly that
 *  data had to unfold the seam first. `approvals` is a STOP key now: a derived
 *  default quiets it, never folds it, so the body those tests read is already
 *  on the paper. The act each of them took is replaced by the assertion that
 *  there is nothing left to take — the region arrives open, head and all. */
const approvalsArriveOpen = () => {
  expect(document.querySelector('[data-fold-seam]')).toBeNull();
  expect(
    document.querySelector('[data-region-head="approvals-head"]'),
  ).not.toBeNull();
};

describe('ProjectApprovalDocument authority and composer', () => {
  it('assigns only the exact project client with first-write CAS', async () => {
    renderDocument();
    approvalsArriveOpen();
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

  it('stages the authoring flow as the six named gate parts', () => {
    authority = {
      projectId: 'project-1',
      decisionLeadId: 'client-1',
      requiredCoapproverId: null,
      revision: 4,
    };
    const { container } = renderDocument();
    fireEvent.click(screen.getByRole('button', { name: 'New approval' }));

    const parts = Array.from(
      container.querySelectorAll('form [data-gate-part]'),
    );
    expect(parts.map((part) => part.getAttribute('data-gate-part'))).toEqual([
      'artifact',
      'question',
      'scope',
      'impact',
      'authority',
      'confirmation',
    ]);
    expect(parts.every((part) => part.tagName === 'FIELDSET')).toBe(true);
    expect(screen.getByRole('group', { name: 'Artifact' })).toBeVisible();
    expect(screen.getByLabelText('Scope note')).toBeVisible();
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
  it('retains exact navigation through a stale-cache background refetch', () => {
    authority = {
      decisionLeadId: 'client-1',
      requiredCoapproverId: null,
      revision: 4,
    };
    approvals = [
      {
        ...baseReview,
        disposition: 'superseded',
        successorDecisionId: 'decision-2',
      },
    ];
    approvalsFetching = true;
    const scrollIntoView = jest.fn();
    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
      configurable: true,
      value: scrollIntoView,
    });
    const { rerender } = renderDocument();
    approvalsArriveOpen();

    window.dispatchEvent(
      new CustomEvent(FOCUS_PROJECT_APPROVAL_EVENT, {
        detail: { decisionId: 'decision-1' },
      }),
    );
    expect(
      document.getElementById('project-approval-decision-1'),
    ).not.toHaveFocus();
    expect(scrollIntoView).not.toHaveBeenCalled();

    approvalsFetching = false;
    approvals = [baseReview];
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

    expect(
      document.getElementById('project-approval-decision-1'),
    ).toHaveFocus();
    expect(scrollIntoView).toHaveBeenCalledTimes(1);
  });

  it('clears a final-missing focus request after background refetch settles', () => {
    authority = {
      decisionLeadId: 'client-1',
      requiredCoapproverId: null,
      revision: 4,
    };
    approvals = [baseReview];
    approvalsFetching = true;
    const scrollIntoView = jest.fn();
    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
      configurable: true,
      value: scrollIntoView,
    });
    const { rerender } = renderDocument();

    window.dispatchEvent(
      new CustomEvent(FOCUS_PROJECT_APPROVAL_EVENT, {
        detail: { decisionId: 'decision-1' },
      }),
    );
    expect(
      document.getElementById('project-approval-decision-1'),
    ).not.toHaveFocus();
    expect(scrollIntoView).not.toHaveBeenCalled();

    approvalsFetching = false;
    approvals = [];
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

    approvals = [baseReview];
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
    expect(
      document.getElementById('project-approval-decision-1'),
    ).not.toHaveFocus();
    expect(scrollIntoView).not.toHaveBeenCalled();
  });

  it('retains exact approval navigation until sanitized rows finish loading', () => {
    authority = {
      decisionLeadId: 'client-1',
      requiredCoapproverId: null,
      revision: 4,
    };
    approvalsLoading = true;
    const scrollIntoView = jest.fn();
    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
      configurable: true,
      value: scrollIntoView,
    });
    const { rerender } = renderDocument();

    window.dispatchEvent(
      new CustomEvent(FOCUS_PROJECT_APPROVAL_EVENT, {
        detail: { decisionId: 'decision-1' },
      }),
    );

    approvalsLoading = false;
    approvals = [baseReview];
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

    expect(
      document.getElementById('project-approval-decision-1'),
    ).toHaveFocus();
    expect(scrollIntoView).toHaveBeenCalledTimes(1);
  });

  it('clears a requested ID when the loaded row is stale and does not revive it', () => {
    authority = {
      decisionLeadId: 'client-1',
      requiredCoapproverId: null,
      revision: 4,
    };
    approvalsLoading = true;
    // The region starts open (loading holds the default); pin it open so a
    // later rerender into an all-sealed approval list can't auto-fold it out
    // from under the DOM lookups below.
    window.localStorage.setItem('patina:doc-fold:project-1:approvals', '0');
    const { rerender } = renderDocument();

    window.dispatchEvent(
      new CustomEvent(FOCUS_PROJECT_APPROVAL_EVENT, {
        detail: { decisionId: 'stale-decision' },
      }),
    );

    approvalsLoading = false;
    approvals = [
      {
        ...baseReview,
        decisionId: 'stale-decision',
        disposition: 'superseded',
        successorDecisionId: 'decision-1',
      },
    ];
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
    expect(
      document.getElementById('project-approval-stale-decision'),
    ).not.toHaveFocus();

    approvals = [{ ...baseReview, decisionId: 'stale-decision' }];
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
    expect(
      document.getElementById('project-approval-stale-decision'),
    ).not.toHaveFocus();
  });

  it('focuses the exact canonical approval row from a contextual handoff', () => {
    authority = {
      decisionLeadId: 'client-1',
      requiredCoapproverId: null,
      revision: 4,
    };
    approvals = [baseReview];
    const scrollIntoView = jest.fn();
    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
      configurable: true,
      value: scrollIntoView,
    });
    renderDocument();

    window.dispatchEvent(
      new CustomEvent(FOCUS_PROJECT_APPROVAL_EVENT, {
        detail: { decisionId: 'decision-1' },
      }),
    );

    const row = document.getElementById('project-approval-decision-1');
    expect(row).toHaveFocus();
    expect(scrollIntoView).toHaveBeenCalledWith({
      behavior: 'smooth',
      block: 'center',
    });
  });

  it('uses instant scrolling when reduced motion is requested', () => {
    authority = {
      decisionLeadId: 'client-1',
      requiredCoapproverId: null,
      revision: 4,
    };
    approvals = [baseReview];
    const scrollIntoView = jest.fn();
    const originalMatchMedia = window.matchMedia;
    window.matchMedia = jest
      .fn()
      .mockReturnValue({
        matches: true,
      }) as unknown as typeof window.matchMedia;
    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
      configurable: true,
      value: scrollIntoView,
    });

    try {
      renderDocument();
      window.dispatchEvent(
        new CustomEvent(FOCUS_PROJECT_APPROVAL_EVENT, {
          detail: { decisionId: 'decision-1' },
        }),
      );

      expect(scrollIntoView).toHaveBeenCalledWith({
        behavior: 'auto',
        block: 'center',
      });
    } finally {
      window.matchMedia = originalMatchMedia;
    }
  });

  it('does not focus a stale, superseded, or terminal approval row', () => {
    authority = {
      decisionLeadId: 'client-1',
      requiredCoapproverId: null,
      revision: 4,
    };
    approvals = [
      {
        ...baseReview,
        decisionId: 'stale-decision',
        disposition: 'superseded',
        successorDecisionId: 'decision-1',
      },
      {
        ...baseReview,
        decisionId: 'terminal-decision',
        lifecycleStatus: 'responded',
        outcome: 'approved',
      },
    ];
    renderDocument();
    approvalsArriveOpen();

    window.dispatchEvent(
      new CustomEvent(FOCUS_PROJECT_APPROVAL_EVENT, {
        detail: { decisionId: 'stale-decision' },
      }),
    );

    expect(
      document.getElementById('project-approval-stale-decision'),
    ).not.toHaveFocus();

    window.dispatchEvent(
      new CustomEvent(FOCUS_PROJECT_APPROVAL_EVENT, {
        detail: { decisionId: 'terminal-decision' },
      }),
    );
    expect(
      document.getElementById('project-approval-terminal-decision'),
    ).not.toHaveFocus();
  });

  it('removes the exact navigation listener on unmount', () => {
    const add = jest.spyOn(window, 'addEventListener');
    const remove = jest.spyOn(window, 'removeEventListener');
    const { unmount } = renderDocument();
    const listener = add.mock.calls.find(
      ([eventName]) => eventName === FOCUS_PROJECT_APPROVAL_EVENT,
    )?.[1];

    expect(listener).toBeDefined();
    unmount();
    expect(remove).toHaveBeenCalledWith(FOCUS_PROJECT_APPROVAL_EVENT, listener);

    add.mockRestore();
    remove.mockRestore();
  });

  it('keeps publish review-count gated and offers only valid active-leaf actions', async () => {
    authority = {
      decisionLeadId: 'client-1',
      requiredCoapproverId: null,
      revision: 4,
    };
    approvals = [baseReview];
    const { rerender } = renderDocument();

    expect(screen.getByRole('button', { name: 'Publish for approval' })).toBeDisabled();
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
    fireEvent.click(screen.getByRole('button', { name: 'Publish for approval' }));
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
    approvalsArriveOpen();

    expect(
      screen.queryByRole('button', { name: 'Supersede with new artifact' }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByText(/This approval belongs to a completed phase/),
    ).toHaveAttribute('role', 'status');
  });

  it('unfolds a live leaf as the six-part gate, in order', () => {
    authority = {
      decisionLeadId: 'client-1',
      requiredCoapproverId: null,
      revision: 4,
    };
    approvals = [{ ...baseReview, lifecycleStatus: 'pending' }];
    const { container } = renderDocument();

    const row = container.querySelector('[data-gate-state="open"]');
    expect(row).not.toBeNull();
    expect(
      Array.from(row!.querySelectorAll('[data-gate-part]')).map((part) =>
        part.getAttribute('data-gate-part'),
      ),
    ).toEqual([
      'artifact',
      'question',
      'scope',
      'impact',
      'authority',
      'confirmation',
    ]);
  });

  it('states the artifact at its frozen edition and proof', () => {
    authority = {
      decisionLeadId: 'client-1',
      requiredCoapproverId: null,
      revision: 4,
    };
    approvals = [{ ...baseReview, lifecycleStatus: 'pending' }];
    renderDocument();

    expect(
      screen.getByText(`Edition 2 · frozen at publish · proof ${'a'.repeat(8)}`),
    ).toBeVisible();
  });

  it('renders SCOPE from the bound phase, and the note only when one was written', () => {
    authority = {
      decisionLeadId: 'client-1',
      requiredCoapproverId: null,
      revision: 4,
    };
    approvals = [{ ...baseReview, lifecycleStatus: 'pending' }];
    const { rerender } = renderDocument();

    expect(
      screen.getByText(
        'Bound to Design development — the sole phase this decision releases.',
      ),
    ).toBeVisible();
    expect(screen.queryByText('Main floor only; study excluded.')).toBeNull();

    approvals = [
      {
        ...baseReview,
        lifecycleStatus: 'pending',
        context: 'Main floor only; study excluded.',
      },
    ];
    rerender(
      <ProjectApprovalDocument
        projectId="project-1"
        clientProfileId="client-1"
        phases={[
          { id: 'phase-1', name: 'Design development', status: 'in_progress' },
        ]}
      />,
    );
    expect(
      screen.getByText('Main floor only; study excluded.'),
    ).toBeVisible();
  });

  it('signs every impact, and says so when a delta is zero', () => {
    authority = {
      decisionLeadId: 'client-1',
      requiredCoapproverId: null,
      revision: 4,
    };
    approvals = [
      {
        ...baseReview,
        lifecycleStatus: 'pending',
        costCentsDelta: 420000,
        scheduleDaysDelta: 6,
        leadTimeDaysDelta: 0,
      },
    ];
    renderDocument();

    expect(
      screen.getByText('+$4,200 · +6 days · lead time unchanged'),
    ).toBeVisible();
  });

  it('collapses an approved gate to a seal and an Approved stamp', () => {
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
        respondedAt: '2026-05-12T12:00:00.000Z',
        context: 'Main floor released · 3 rooms · study excluded',
      },
    ];
    const { container } = renderDocument();
    approvalsArriveOpen();

    expect(
      container.querySelector('[data-gate-state="sealed"]'),
    ).not.toBeNull();
    expect(screen.getByText(/^Approved · /)).toBeVisible();
    expect(
      screen.getByText('Main floor released · 3 rooms · study excluded'),
    ).toBeVisible();
    // The ceremony is folded away, not left open beside its own seal.
    expect(container.querySelector('[data-gate-part]')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Publish for approval' })).toBeNull();
  });

  it('links the superseded edition under the seal and focuses it in place', () => {
    authority = {
      decisionLeadId: 'client-1',
      requiredCoapproverId: null,
      revision: 4,
    };
    approvals = [
      {
        ...baseReview,
        decisionId: 'decision-1',
        artifactVersion: 2,
        disposition: 'superseded',
        successorDecisionId: 'decision-2',
      },
      {
        ...baseReview,
        decisionId: 'decision-2',
        artifactVersion: 3,
        artifactChecksum: 'b'.repeat(64),
        lifecycleStatus: 'responded',
        outcome: 'approved',
        predecessorDecisionId: 'decision-1',
        respondedAt: '2026-05-12T12:00:00.000Z',
      },
    ];
    const scrollIntoView = jest.fn();
    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
      configurable: true,
      value: scrollIntoView,
    });
    renderDocument();
    approvalsArriveOpen();

    const link = screen.getByRole('button', {
      name: 'Edition 2 superseded — view',
    });
    fireEvent.click(link);

    expect(document.getElementById('project-approval-decision-1')).toHaveFocus();
    expect(scrollIntoView).toHaveBeenCalled();
  });

  it('keeps a bounced gate unfolded — changes requested is not settled', () => {
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
        respondedAt: '2026-05-12T12:00:00.000Z',
        costCentsDelta: 420050,
      },
    ];
    const { container } = renderDocument();

    expect(container.querySelector('[data-gate-state="open"]')).not.toBeNull();
    expect(container.querySelector('[data-gate-state="sealed"]')).toBeNull();
    expect(
      Array.from(container.querySelectorAll('[data-gate-part]')).map((part) =>
        part.getAttribute('data-gate-part'),
      ),
    ).toEqual([
      'artifact',
      'question',
      'scope',
      'impact',
      'authority',
      'confirmation',
    ]);
    // The question and its impact stay readable while the client waits.
    expect(screen.getByText('Approve this exact drawing set?')).toBeVisible();
    expect(
      screen.getByText('+$4,200.50 · -2 days · +7 lead-time days'),
    ).toBeVisible();
    expect(
      screen.getByRole('button', { name: 'Supersede with new artifact' }),
    ).toBeEnabled();
  });

  it('names the decision lead on every gate surface, with a role fallback', () => {
    authority = {
      projectId: 'project-1',
      decisionLeadId: 'client-1',
      requiredCoapproverId: null,
      revision: 4,
    };
    approvals = [{ ...baseReview, lifecycleStatus: 'pending' }];
    const { rerender } = renderDocument();

    expect(
      screen.getByText('Decision lead — Marta Chen · frozen at publish'),
    ).toBeVisible();

    fireEvent.click(
      screen.getByRole('button', { name: 'Supersede with new artifact' }),
    );
    expect(
      screen.getAllByText('Decision lead — Marta Chen · frozen at publish'),
    ).toHaveLength(2);

    rerender(
      <ProjectApprovalDocument
        projectId="project-1"
        clientProfileId="client-1"
        clientName={null}
        phases={[
          { id: 'phase-1', name: 'Design development', status: 'in_progress' },
        ]}
      />,
    );
    expect(
      screen.getAllByText(
        'Decision lead — the designated project client · frozen at publish',
      ).length,
    ).toBeGreaterThan(0);
  });

  it('states which edition settled on the seal', () => {
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
        respondedAt: '2026-05-12T12:00:00.000Z',
      },
    ];
    renderDocument();
    approvalsArriveOpen();

    expect(
      screen.getByText(`Edition 2 · frozen at publish · proof ${'a'.repeat(8)}`),
    ).toBeVisible();
  });

  it('renders whole dollars without decimals and part-dollars with two', () => {
    authority = {
      decisionLeadId: 'client-1',
      requiredCoapproverId: null,
      revision: 4,
    };
    approvals = [
      {
        ...baseReview,
        lifecycleStatus: 'pending',
        costCentsDelta: 420000,
        scheduleDaysDelta: 0,
        leadTimeDaysDelta: 0,
      },
    ];
    const { rerender } = renderDocument();
    expect(
      screen.getByText('+$4,200 · schedule unchanged · lead time unchanged'),
    ).toBeVisible();

    approvals = [
      {
        ...baseReview,
        lifecycleStatus: 'pending',
        costCentsDelta: -420050,
        scheduleDaysDelta: 0,
        leadTimeDaysDelta: 0,
      },
    ];
    rerender(
      <ProjectApprovalDocument
        projectId="project-1"
        clientProfileId="client-1"
        clientName="Marta Chen"
        phases={[
          { id: 'phase-1', name: 'Design development', status: 'in_progress' },
        ]}
      />,
    );
    expect(
      screen.getByText('-$4,200.50 · schedule unchanged · lead time unchanged'),
    ).toBeVisible();
  });

  it('carries no shadow anywhere in the ceremony (D4)', () => {
    authority = {
      decisionLeadId: 'client-1',
      requiredCoapproverId: null,
      revision: 4,
    };
    approvals = [{ ...baseReview, lifecycleStatus: 'pending' }];
    const { container } = renderDocument();

    expect(container.innerHTML).not.toMatch(/shadow/);
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

describe('ProjectApprovalDocument region gap (W3-L4)', () => {
  it('carries the region-gap token on its root, open and folded, and no other mt-*/mb-*', () => {
    const { container } = renderDocument();

    const open = container.querySelector('[data-index-region="approvals"]');
    expect(open).not.toBeNull();
    expect(open).toHaveClass('mt-[var(--doc-region-gap)]');
    expect(
      open!.className.split(/\s+/).filter((cls) => /^mt-/.test(cls)),
    ).toEqual(['mt-[var(--doc-region-gap)]']);
    expect(open!.className).not.toMatch(/\bmb-/);

    fireEvent.click(screen.getByRole('button', { name: 'Fold ↑' }));

    const folded = container.querySelector('[data-index-region="approvals"]');
    expect(folded).not.toBeNull();
    expect(folded).toHaveClass('mt-[var(--doc-region-gap)]');
    expect(
      folded!.className.split(/\s+/).filter((cls) => /^mt-/.test(cls)),
    ).toEqual(['mt-[var(--doc-region-gap)]']);
    expect(folded!.className).not.toMatch(/\bmb-/);
    // The folded rule steps to `mid` — `strong` is reserved for an open region.
    const rule = folded!.querySelector('[data-rule-weight]');
    expect(rule).toHaveAttribute('data-rule-weight', 'mid');
  });
});
