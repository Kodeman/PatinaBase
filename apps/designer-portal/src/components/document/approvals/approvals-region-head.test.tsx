import { fireEvent, render, screen } from '@testing-library/react';

import { ProjectApprovalDocument } from './project-approval-document';
import type {
  ProjectApprovalArtifactCandidate,
  ProjectApprovalReview,
} from '@patina/supabase';

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
    isFetching: false,
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
  lifecycleStatus: 'pending',
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
        { id: 'phase-1', name: 'Design development', status: 'in_progress' },
      ]}
    />,
  );

beforeEach(() => {
  window.localStorage.clear();
  authority = null;
  approvals = [];
  candidates = [];
  setAuthority.mockReset().mockResolvedValue({});
  createApproval.mockReset().mockResolvedValue({});
});

describe('Client approvals region head', () => {
  it('inks exactly one ledger leader when open with live work', () => {
    authority = {
      decisionLeadId: 'client-1',
      requiredCoapproverId: null,
      revision: 4,
    };
    approvals = [baseReview];
    render(
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
      document.querySelectorAll('[data-action-variant="inked"]'),
    ).toHaveLength(1);
    expect(
      screen.getByRole('button', { name: 'New approval' }),
    ).toHaveAttribute('data-action-variant', 'inked');
  });

  it('arrives OPEN with no lead and no approvals — the default quiets a stop, it never folds it', () => {
    // R127 OD-10 (W3-L5). This case read "renders a folded seam … by default".
    // `approvals` is a STOP key, so its derived default is DENSITY now, not a
    // fold: the region arrives open and quiet, head on the paper. The seam it
    // used to arrive wearing is what the proposal names as the visible
    // first-screen consequence of the change (§4), and the seam's own claims
    // are kept directly below, under the one cause a stop can still have.
    renderDocument();

    expect(document.querySelector('[data-fold-seam]')).toBeNull();
    expect(document.querySelector('[data-region-head]')).not.toBeNull();
    expect(
      screen.getByRole('heading', { name: 'Client approvals' }),
    ).toBeInTheDocument();
  });

  it('renders a folded seam with the no-lead, no-approvals summary when she folded it herself', () => {
    // The seam's claims, whole: its summary line and its `aria-expanded`. Only
    // the cause moved — a stop stands folded because she said so (OD-10), and
    // a choice remembered from before R127 still reads exactly as it did.
    window.localStorage.setItem('patina:doc-fold:project-1:approvals', '1');
    renderDocument();

    expect(
      screen.queryByRole('heading', { name: 'Client approvals' }),
    ).not.toBeInTheDocument();
    const seam = screen.getByRole('button', {
      name: 'Client approvals No decision lead · no approvals authored unfold ↓',
    });
    expect(seam).toBeInTheDocument();
    expect(seam).toHaveAttribute('aria-expanded', 'false');
  });

  it('round-trips the seam: unfolding mounts the head and body', () => {
    window.localStorage.setItem('patina:doc-fold:project-1:approvals', '1');
    renderDocument();

    const seam = screen.getByRole('button', { name: /client approvals/i });
    fireEvent.click(seam);

    expect(
      screen.getByRole('heading', { name: 'Client approvals' }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        /Bind each request to one issued plan, client-ready specification/,
      ),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /unfold/i }),
    ).not.toBeInTheDocument();
  });
});
