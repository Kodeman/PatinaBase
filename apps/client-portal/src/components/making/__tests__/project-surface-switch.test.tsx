import { render, screen } from '@testing-library/react';

import type { ClientProjectOverview, MilestoneDetail } from '@/types/project';

/* ── The flag gate ──────────────────────────────────────────────────────────
   This is the one seam the whole rollout hangs on, and the invariants are
   behavioural, not visual: today's tree renders while the flag is loading and
   when it is off, The Making renders only on a resolved-true flag, and
   `client_project_view` fires EXACTLY ONCE across a loading→true transition.

   That last one is not decoration. The flag can only resolve from an effect,
   so every flagged open renders today's tree for at least one commit; React
   runs child effects before the parent's, so an emitter inside either branch
   fires before the switch can flip. Two emitters meant two events on the
   flag's own primary flow (SinglePaneSoloRedirect does a client-side
   router.replace with PostHog already initialised, so both were captured).

   Both surfaces are stubbed: this suite is about which one is chosen and what
   is reported, not about what either renders. ─────────────────────────────── */

jest.mock('@/hooks/use-feature-flag', () => ({
  __esModule: true,
  useFeatureFlag: jest.fn(),
}));

jest.mock('@patina/supabase', () => ({
  useProjectApprovals: jest.fn(),
}));

// A plain function component, NOT a jest.fn: `resetMocks: true` wipes mock
// implementations before every test, and a wiped component mock renders
// `undefined` and throws. The props under test are written out as attributes
// instead.
jest.mock('@/components/project-view-wrapper', () => ({
  __esModule: true,
  ProjectViewWrapper: function MockProjectViewWrapper(props: Record<string, unknown>) {
    return (
      <div
        data-testid="legacy-project-view"
        data-show-overview={String(props.showOverview)}
        data-emit-project-view={String(props.emitProjectView)}
        data-approval-count={String((props.projectApprovals as unknown[])?.length ?? 0)}
      />
    );
  },
}));

jest.mock('../the-making', () => ({
  __esModule: true,
  TheMaking: (props: Record<string, unknown>) => (
    <div
      data-testid="the-making"
      data-approval-count={String((props.projectApprovals as unknown[])?.length ?? 0)}
    />
  ),
}));

jest.mock('@/components/threshold/threshold', () => ({
  __esModule: true,
  Threshold: (props: Record<string, unknown>) => (
    <div
      data-testid="the-threshold"
      data-approval-count={String((props.projectApprovals as unknown[])?.length ?? 0)}
      data-approvals-loading={String(props.projectApprovalsLoading)}
      data-approvals-error={String(props.projectApprovalsError)}
      data-project-id={String(props.projectId)}
      data-milestone-count={String((props.milestones as unknown[])?.length ?? 0)}
    />
  ),
}));

jest.mock('@/lib/analytics/events', () => ({
  __esModule: true,
  clientEvents: { projectView: jest.fn() },
}));

import { useFeatureFlag } from '@/hooks/use-feature-flag';
import { clientEvents } from '@/lib/analytics/events';
import { useProjectApprovals } from '@patina/supabase';

import { ProjectSurfaceSwitch } from '../project-surface-switch';

const flagMock = useFeatureFlag as jest.Mock;

/** Answers per flag name; anything unnamed falls to a resolved-false read. */
function flags(values: Record<string, { value: boolean; isLoading: boolean }>) {
  flagMock.mockImplementation(
    (name: string) => values[name] ?? { value: false, isLoading: false },
  );
}
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

function renderSwitch() {
  return render(
    <ProjectSurfaceSwitch
      projectId={PROJECT_ID}
      project={PROJECT}
      milestones={MILESTONES}
    />,
  );
}

beforeEach(() => {
  flags({});
  approvalsMock.mockReturnValue({
    data: [{ decisionId: 'approval-1' }],
    isLoading: false,
    isError: false,
  });
});

describe('ProjectSurfaceSwitch — which surface', () => {
  it('renders today’s tree while the flag is still loading', () => {
    flags({ 'single-pane': { value: false, isLoading: true } });
    renderSwitch();

    expect(screen.getByTestId('legacy-project-view')).toBeInTheDocument();
    expect(screen.queryByTestId('the-making')).not.toBeInTheDocument();
  });

  it('renders today’s tree, with showOverview intact, when the flag is off', () => {
    flags({ 'single-pane': { value: false, isLoading: false } });
    renderSwitch();

    expect(screen.getByTestId('legacy-project-view')).toHaveAttribute(
      'data-show-overview',
      'true',
    );
    expect(screen.queryByTestId('the-making')).not.toBeInTheDocument();
  });

  it('never renders gated UI on a truthy value that has not resolved', () => {
    // Fail-closed: an override or a stale cache can hand back value:true while
    // isLoading is still set. Loading wins.
    flags({ 'single-pane': { value: true, isLoading: true } });
    renderSwitch();

    expect(screen.getByTestId('legacy-project-view')).toBeInTheDocument();
    expect(screen.queryByTestId('the-making')).not.toBeInTheDocument();
  });

  it('renders The Making only on a resolved-true flag', () => {
    flags({ 'single-pane': { value: true, isLoading: false } });
    renderSwitch();

    expect(screen.getByTestId('the-making')).toBeInTheDocument();
    expect(screen.getByTestId('the-making')).toHaveAttribute('data-approval-count', '1');
    expect(screen.queryByTestId('legacy-project-view')).not.toBeInTheDocument();
  });

  it('owns one canonical project approval query for either surface', () => {
    flags({ 'single-pane': { value: false, isLoading: false } });
    renderSwitch();

    expect(approvalsMock).toHaveBeenCalledTimes(1);
    expect(approvalsMock).toHaveBeenCalledWith(PROJECT_ID);
    expect(screen.getByTestId('legacy-project-view')).toHaveAttribute(
      'data-approval-count',
      '1',
    );
  });
});

describe('ProjectSurfaceSwitch — client_project_view', () => {
  it('fires exactly once across a loading → true transition', () => {
    flags({ 'single-pane': { value: false, isLoading: true } });
    const { rerender } = renderSwitch();

    flags({ 'single-pane': { value: true, isLoading: false } });
    rerender(
      <ProjectSurfaceSwitch
        projectId={PROJECT_ID}
        project={PROJECT}
        milestones={MILESTONES}
      />,
    );

    expect(screen.getByTestId('the-making')).toBeInTheDocument();
    expect(clientEvents.projectView).toHaveBeenCalledTimes(1);
    expect(clientEvents.projectView).toHaveBeenCalledWith(PROJECT_ID);
  });

  it('fires exactly once with the flag off', () => {
    flags({ 'single-pane': { value: false, isLoading: false } });
    renderSwitch();

    expect(clientEvents.projectView).toHaveBeenCalledTimes(1);
  });

  it('silences the legacy tree’s own emitter so the count cannot double', () => {
    flags({ 'single-pane': { value: false, isLoading: false } });
    renderSwitch();

    expect(screen.getByTestId('legacy-project-view')).toHaveAttribute(
      'data-emit-project-view',
      'false',
    );
  });

  it('re-reports only when the project changes', () => {
    flags({ 'single-pane': { value: true, isLoading: false } });
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

/* ── The Threshold's own gate ───────────────────────────────────────────────
   `threshold` is read FIRST and wins outright — a client in both pilots gets
   the house. It is independently fail-closed, and it does not disturb the one
   emitter: `client_project_view` still fires exactly once on its branch, and
   exactly once across a loading → true transition on it. ─────────────────── */

describe('ProjectSurfaceSwitch — the threshold flag', () => {
  it('renders today’s tree while the threshold flag is still loading', () => {
    flags({ threshold: { value: true, isLoading: true } });
    renderSwitch();

    expect(screen.getByTestId('legacy-project-view')).toBeInTheDocument();
    expect(screen.queryByTestId('the-threshold')).not.toBeInTheDocument();
  });

  it('renders The Threshold on a resolved-true flag, with the same props', () => {
    flags({ threshold: { value: true, isLoading: false } });
    renderSwitch();

    const house = screen.getByTestId('the-threshold');
    expect(house).toHaveAttribute('data-project-id', PROJECT_ID);
    expect(house).toHaveAttribute('data-approval-count', '1');
    expect(house).toHaveAttribute('data-approvals-loading', 'false');
    expect(house).toHaveAttribute('data-approvals-error', 'false');
    expect(screen.queryByTestId('the-making')).not.toBeInTheDocument();
    expect(screen.queryByTestId('legacy-project-view')).not.toBeInTheDocument();
  });

  it('wins over single-pane when both are on', () => {
    flags({
      threshold: { value: true, isLoading: false },
      'single-pane': { value: true, isLoading: false },
    });
    renderSwitch();

    expect(screen.getByTestId('the-threshold')).toBeInTheDocument();
    expect(screen.queryByTestId('the-making')).not.toBeInTheDocument();
  });

  it('leaves The Making standing when only single-pane is on', () => {
    flags({
      threshold: { value: false, isLoading: false },
      'single-pane': { value: true, isLoading: false },
    });
    renderSwitch();

    expect(screen.getByTestId('the-making')).toBeInTheDocument();
    expect(screen.queryByTestId('the-threshold')).not.toBeInTheDocument();
  });

  it('fires client_project_view exactly once on the threshold branch', () => {
    flags({ threshold: { value: true, isLoading: false } });
    renderSwitch();

    expect(clientEvents.projectView).toHaveBeenCalledTimes(1);
    expect(clientEvents.projectView).toHaveBeenCalledWith(PROJECT_ID);
  });

  it('fires exactly once across a loading → threshold-true transition', () => {
    flags({ threshold: { value: false, isLoading: true } });
    const { rerender } = renderSwitch();

    flags({ threshold: { value: true, isLoading: false } });
    rerender(
      <ProjectSurfaceSwitch
        projectId={PROJECT_ID}
        project={PROJECT}
        milestones={MILESTONES}
      />,
    );

    expect(screen.getByTestId('the-threshold')).toBeInTheDocument();
    expect(clientEvents.projectView).toHaveBeenCalledTimes(1);
  });
});
