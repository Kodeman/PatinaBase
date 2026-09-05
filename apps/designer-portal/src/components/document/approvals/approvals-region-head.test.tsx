import { act, fireEvent, render, screen } from '@testing-library/react';

import { ProjectApprovalDocument } from './project-approval-document';
import { __setDensityForTest } from '@/hooks/use-lens-density';
import type {
  ProjectApprovalArtifactCandidate,
  ProjectApprovalReview,
} from '@patina/supabase';
import { regionBoxSignature } from '../region/region-box-signature';

const setAuthority = jest.fn();
const createApproval = jest.fn();
const publishApproval = jest.fn();
const withdrawApproval = jest.fn();
const supersedeApproval = jest.fn();

let authority: Record<string, unknown> | null = null;
let approvals: ProjectApprovalReview[] = [];
let candidates: ProjectApprovalArtifactCandidate[] = [];

/* R127 W4 — the lens's fourth fold voice. With no lens attached (the page
   attaches it) a stop renders QUIET, so every claim below about the region's
   body states which density it is making the claim at. `full` is the default
   here because these suites were written against the full body. */
// W4-C9 — the real `useLensDensityStore` runs here, driven through the store's
// own test setter. A `jest.mock` of the module replaced a two-slot hook with a
// zero-slot arrow, so a conditional call could never be detected from this
// suite; C-8 asks for exactly that guard.
beforeEach(() => {
  __setDensityForTest('full');
});
afterEach(() => {
  __setDensityForTest(undefined);
});

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

const renderDocument = (
  quietLeader: { label: string; onAct: () => void } | null = null,
) =>
  render(
    <ProjectApprovalDocument
      projectId="project-1"
      clientProfileId="client-1"
      clientName="Marta Chen"
      phases={[
        { id: 'phase-1', name: 'Design development', status: 'in_progress' },
      ]}
      quietLeader={quietLeader}
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
      name: 'Client approvals No decision lead · no approvals authored CLOSED BY YOU unfold ↓',
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

/**
 * R127 W4 (L-4, OD-12, OD-13) — the quiet body. Until the lens reaches it,
 * Client approvals prints its head, one count line, one leader and one state
 * line; the approvals themselves are not on the paper.
 */
describe('Client approvals quiet body — the lens has not reached this stop', () => {
  const overdue = {
    ...baseReview,
    decisionId: 'decision-overdue',
    isOverdue: true,
  } satisfies ProjectApprovalReview;
  const open2 = {
    ...baseReview,
    decisionId: 'decision-2',
  } satisfies ProjectApprovalReview;

  beforeEach(() => {
    act(() => {
      __setDensityForTest(null);
    });
    authority = {
      decisionLeadId: 'client-1',
      requiredCoapproverId: null,
      revision: 4,
    };
    approvals = [overdue, open2];
  });

  it('prints the head, its own status line and the state line — and no approvals', () => {
    renderDocument();

    expect(
      screen.getByRole('heading', { name: 'Client approvals' }),
    ).toBeInTheDocument();
    // W4-R1: the count line IS the head's status line — no second paragraph,
    // no uppercase strip. Two unsettled, one of them overdue, so the two counts
    // are disjoint: `1 awaiting the client · 1 overdue`, with the day-count on
    // the overdue half because exactly one item is overdue.
    const head = document.querySelector('[data-region-head="approvals-head"]')!;
    expect(head).toHaveTextContent(/1 awaiting the client · 1 overdue( \d+d)?/);
    expect(
      document.querySelectorAll('[data-region-count-line]'),
    ).toHaveLength(0);
    // The head's own acts are the only acts (mockup governs what prints).
    expect(
      screen.queryByRole('button', { name: /See the approvals/ }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByText(
        '1 awaiting the client · not yet on the paper · press Client approvals on the index to open',
      ),
    ).toHaveClass('sr-only');

    expect(
      screen.queryByText(
        /Bind each request to one issued plan, client-ready specification/,
      ),
    ).not.toBeInTheDocument();
    expect(screen.queryByText('Issued drawing set 02')).not.toBeInTheDocument();
  });

  it('NF4-01 — the ranked need\u2019s act is the quiet leader, and it is the ONLY act', () => {
    const onAct = jest.fn();
    renderDocument({ label: 'Chase the approval', onAct });

    const head = document.querySelector('[data-region-head="approvals-head"]')!;
    const leader = screen.getByRole('button', { name: 'Chase the approval' });
    expect(head).toContainElement(leader);
    fireEvent.click(leader);
    expect(onAct).toHaveBeenCalledTimes(1);

    // W4-R1 col 3 — the elected act REPLACES `New approval` as the leader; it
    // does not stand beside it. `actsAtQuiet='leader'` prints entry 0 alone.
    expect(
      screen.queryByRole('button', { name: 'New approval' }),
    ).not.toBeInTheDocument();
  });

  it('NF4-01 — with no need naming approvals the leader is still New approval', () => {
    renderDocument(null);

    const head = document.querySelector('[data-region-head="approvals-head"]')!;
    expect(head).toContainElement(
      screen.getByRole('button', { name: 'New approval' }),
    );
    expect(
      screen.queryByRole('button', { name: 'Chase the approval' }),
    ).not.toBeInTheDocument();
  });

  it('says Nothing yet when nothing stands open — never a zero, never a dash', () => {
    approvals = [{ ...baseReview, disposition: 'withdrawn' }];
    renderDocument();

    expect(
      screen.getByRole('heading', { name: 'Client approvals' }),
    ).toBeInTheDocument();
    const head = document.querySelector('[data-region-head="approvals-head"]')!;
    expect(head).toHaveTextContent('Nothing yet');
    // W4-R1: with no fact there is nothing to press toward, so the sr-only
    // line is the phrase alone.
    expect(screen.getByText('Nothing yet', { selector: '.sr-only' })).toBeInTheDocument();
  });

  it('publishes its density and its short reserve on the index root (OD-12)', () => {
    renderDocument();
    const root = document.querySelector<HTMLElement>(
      '[data-index-region="approvals"]',
    );
    expect(root).toHaveAttribute('data-density', 'quiet');
    expect(root!.style.getPropertyValue('--doc-quiet-reserve')).toBe(
      'var(--doc-quiet-reserve-min)',
    );
  });

  it('keeps the same head element when the lens promotes it to full', () => {
    const { rerender } = renderDocument();
    const head = document.querySelector('[data-region-head="approvals-head"]');
    // H5 — the root's OUTER box may not depend on its density.
    const quietBox = regionBoxSignature(
      document.querySelector('[data-index-region="approvals"]'),
    );
    const heading = screen.getByRole('heading', { name: 'Client approvals' });

    act(() => {
      __setDensityForTest('full');
    });
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

    expect(document.querySelector('[data-region-head="approvals-head"]')).toBe(
      head,
    );
    expect(screen.getByRole('heading', { name: 'Client approvals' })).toBe(
      heading,
    );
    expect(
      document.querySelector('[data-index-region="approvals"]'),
    ).toHaveAttribute('data-density', 'full');
    expect(
      screen.queryByText(/not yet on the paper/),
    ).not.toBeInTheDocument();
    expect(
      screen.getByText(
        /Bind each request to one issued plan, client-ready specification/,
      ),
    ).toBeInTheDocument();
    // The same outer box on the other side of the promotion: same
    // margins, same border, same reserve, same rules. A stop that grew a
    // top margin on promotion would move every root below it.
    expect(
      regionBoxSignature(
        document.querySelector('[data-index-region="approvals"]'),
      ),
    ).toBe(quietBox);
  });

  it('lets the fold she made outrank the lens, whatever the lens says', () => {
    window.localStorage.setItem('patina:doc-fold:project-1:approvals', '1');
    act(() => {
      __setDensityForTest('full');
    });
    renderDocument();

    expect(document.querySelector('[data-fold-seam]')).not.toBeNull();
    expect(
      screen.queryByRole('heading', { name: 'Client approvals' }),
    ).not.toBeInTheDocument();
    expect(
      document.querySelector('[data-index-region="approvals"]'),
    ).toHaveAttribute('data-density', 'full');
  });
});
