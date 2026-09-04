import { render, screen } from '@testing-library/react';

import type { ClientProjectOverview, MilestoneDetail } from '@/types/project';

/* ── One surface ────────────────────────────────────────────────────────────
   There is no flag left here and no second tree to fall back to: every client
   gets the house, on the first commit, with no swap a moment later. What this
   suite holds is the wiring — the props the Threshold is handed, the single
   canonical approvals query, and the one thing this component still owns
   outright: `client_project_view` fires exactly once per project. ────────── */

jest.mock('@patina/supabase', () => ({
  useProjectApprovals: jest.fn(),
}));

// A plain function component, NOT a jest.fn: `resetMocks: true` wipes mock
// implementations before every test, and a wiped component mock renders
// `undefined` and throws. The props under test are written out as attributes
// instead.
jest.mock('@/components/threshold/threshold', () => ({
  __esModule: true,
  Threshold: function MockThreshold(props: Record<string, unknown>) {
    return (
      <div
        data-testid="the-threshold"
        data-approval-count={String((props.projectApprovals as unknown[])?.length ?? 0)}
        data-approvals-loading={String(props.projectApprovalsLoading)}
        data-approvals-error={String(props.projectApprovalsError)}
        data-project-id={String(props.projectId)}
        data-milestone-count={String((props.milestones as unknown[])?.length ?? 0)}
        data-other-houses={(props.otherHouses as { id: string }[])
          ?.map((house) => house.id)
          .join(',')}
      />
    );
  },
}));

jest.mock('@/lib/analytics/events', () => ({
  __esModule: true,
  clientEvents: { projectView: jest.fn() },
}));

import { clientEvents } from '@/lib/analytics/events';
import { useProjectApprovals } from '@patina/supabase';

import { ProjectSurfaceSwitch } from '../project-surface-switch';

const approvalsMock = useProjectApprovals as jest.Mock;

const PROJECT_ID = 'proj-vale';

const PROJECT = {
  id: PROJECT_ID,
  name: 'The Vale Residence',
  status: 'active',
  progressPercentage: 60,
  completedMilestones: 3,
  totalMilestones: 6,
  approvalsPending: 0,
  unreadMessages: 0,
} as ClientProjectOverview;

const MILESTONES: MilestoneDetail[] = [];

function renderSwitch(otherHouses?: { id: string; name: string }[]) {
  return render(
    <ProjectSurfaceSwitch
      projectId={PROJECT_ID}
      project={PROJECT}
      milestones={MILESTONES}
      otherHouses={otherHouses}
    />,
  );
}

beforeEach(() => {
  approvalsMock.mockReturnValue({
    data: [{ decisionId: 'approval-1' }],
    isLoading: false,
    isError: false,
  });
});

describe('ProjectSurfaceSwitch — which surface', () => {
  it('renders the Threshold, with no flag read of any kind', () => {
    renderSwitch();

    const house = screen.getByTestId('the-threshold');
    expect(house).toHaveAttribute('data-project-id', PROJECT_ID);
    expect(house).toHaveAttribute('data-approval-count', '1');
    expect(house).toHaveAttribute('data-approvals-loading', 'false');
    expect(house).toHaveAttribute('data-approvals-error', 'false');
  });

  it('renders it on the very first commit — nothing else is ever shown', () => {
    const { rerender } = renderSwitch();
    expect(screen.getByTestId('the-threshold')).toBeInTheDocument();

    rerender(
      <ProjectSurfaceSwitch
        projectId={PROJECT_ID}
        project={PROJECT}
        milestones={MILESTONES}
      />,
    );

    expect(screen.getByTestId('the-threshold')).toBeInTheDocument();
  });

  it('owns one canonical project approval query', () => {
    renderSwitch();

    expect(approvalsMock).toHaveBeenCalledTimes(1);
    expect(approvalsMock).toHaveBeenCalledWith(PROJECT_ID);
  });

  it('passes an approvals read that is still loading through as loading', () => {
    approvalsMock.mockReturnValue({ data: undefined, isLoading: true, isError: false });
    renderSwitch();

    const house = screen.getByTestId('the-threshold');
    expect(house).toHaveAttribute('data-approvals-loading', 'true');
    expect(house).toHaveAttribute('data-approval-count', '0');
  });

  it('hands the client’s other houses to the house she is standing in', () => {
    renderSwitch([
      { id: 'proj-linden', name: 'The Linden house' },
      { id: 'proj-ash', name: 'The Ash cottage' },
    ]);

    expect(screen.getByTestId('the-threshold')).toHaveAttribute(
      'data-other-houses',
      'proj-linden,proj-ash',
    );
  });

  it('says nothing about other houses for a solo client', () => {
    renderSwitch();

    expect(screen.getByTestId('the-threshold')).toHaveAttribute('data-other-houses', '');
  });
});

describe('ProjectSurfaceSwitch — client_project_view', () => {
  it('fires exactly once per open', () => {
    renderSwitch();

    expect(clientEvents.projectView).toHaveBeenCalledTimes(1);
    expect(clientEvents.projectView).toHaveBeenCalledWith(PROJECT_ID);
  });

  it('re-reports only when the project changes', () => {
    const { rerender } = renderSwitch();

    rerender(
      <ProjectSurfaceSwitch
        projectId={PROJECT_ID}
        project={{ ...PROJECT, name: 'Renamed mid-session' }}
        milestones={MILESTONES}
      />,
    );
    expect(clientEvents.projectView).toHaveBeenCalledTimes(1);

    rerender(
      <ProjectSurfaceSwitch
        projectId="proj-other"
        project={PROJECT}
        milestones={MILESTONES}
      />,
    );
    expect(clientEvents.projectView).toHaveBeenCalledTimes(2);
    expect(clientEvents.projectView).toHaveBeenLastCalledWith('proj-other');
  });
});
