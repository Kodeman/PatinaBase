import { render, screen } from '@testing-library/react';
import { AppChrome } from '../app-chrome';

let mockPathname = '/projects';
const useMyProjectApprovalReviews = jest.fn();

jest.mock('@patina/supabase', () => ({
  useMyProjectApprovalReviews: (...args: unknown[]) =>
    useMyProjectApprovalReviews(...args),
}));

jest.mock('next/navigation', () => ({
  usePathname: () => mockPathname,
}));

// ClientHeader pulls in useAuth/useProfile/help-system queries — the whole
// point of PUBLIC_PREFIXES is that a login-less guest page never mounts it
// (and never fires those queries), so it's stubbed here to a visible witness
// rather than a real render.
jest.mock('../client-header', () => ({
  ClientHeader: ({
    approvalsPending,
  }: {
    approvalsPending: number;
  }) => (
    <div data-testid="client-header" data-approvals-pending={approvalsPending}>
      client-header
    </div>
  ),
}));

const project = (
  id: string,
  approvalsPending: number,
  nonStage2ApprovalsPending: number,
) => ({
  id,
  name: id,
  progressPercentage: 0,
  status: 'active',
  approvalsPending,
  nonStage2ApprovalsPending,
  unreadMessages: 0,
});

describe('AppChrome', () => {
  afterEach(() => {
    mockPathname = '/projects';
  });

  beforeEach(() => {
    useMyProjectApprovalReviews.mockReturnValue({ data: [] });
  });

  it.each([
    '/field/abc123',
    '/share/abc123',
    '/rfq/abc123',
    `/plans/${'a'.repeat(64)}`,
    // SP-03 / review M-D3: the shared piece page is opened from a text message
    // by someone with no session — it must not wear the Client Portal chrome.
    '/piece/9c1f0a24-1f2b-4b7e-9a3e-0f2d8a6c5b41',
  ])(
    'renders no header (and never mounts ClientHeader) on the login-less guest path %s',
    (pathname) => {
      mockPathname = pathname;
      render(
        <AppChrome projects={[]}>
          <div>guest content</div>
        </AppChrome>,
      );
      expect(screen.queryByTestId('client-header')).not.toBeInTheDocument();
      expect(screen.getByText('guest content')).toBeInTheDocument();
      expect(useMyProjectApprovalReviews).not.toHaveBeenCalled();
    },
  );

  it('renders the authenticated header on a normal app route', () => {
    mockPathname = '/projects/proj-1';
    render(
      <AppChrome projects={[]}>
        <div>app content</div>
      </AppChrome>,
    );
    expect(screen.getByTestId('client-header')).toBeInTheDocument();
    expect(screen.getByText('app content')).toBeInTheDocument();
  });

  it('adds the sanitized global Stage-2 actionable total to non-Stage2 project work without double counting', () => {
    useMyProjectApprovalReviews.mockReturnValue({
      data: [
        {
          decisionId: 'project-row-stage2',
          projectId: 'project-1',
          disposition: 'active',
          lifecycleStatus: 'pending',
          outcome: null,
          completedReviewCount: 1,
          requiredReviewCount: 1,
        },
        {
          decisionId: 'orphan-stage2',
          projectId: 'no-longer-assigned-project',
          disposition: 'active',
          lifecycleStatus: 'draft',
          outcome: null,
          completedReviewCount: 0,
          requiredReviewCount: 1,
        },
        {
          decisionId: 'awaiting-studio',
          projectId: 'project-2',
          disposition: 'active',
          lifecycleStatus: 'draft',
          outcome: null,
          completedReviewCount: 1,
          requiredReviewCount: 1,
        },
        {
          decisionId: 'answered-pending',
          projectId: 'project-2',
          disposition: 'active',
          lifecycleStatus: 'pending',
          outcome: 'approved',
          completedReviewCount: 1,
          requiredReviewCount: 1,
        },
      ],
    });

    render(
      <AppChrome projects={[project('project-1', 9, 2), project('project-2', 6, 1)]}>
        <div>app content</div>
      </AppChrome>,
    );

    // 3 legacy/proposal rows + 2 globally actionable Stage-2 rows. The project
    // totals already contain project-row-stage2, so summing them would double it.
    expect(screen.getByTestId('client-header')).toHaveAttribute(
      'data-approvals-pending',
      '5',
    );
  });
});
