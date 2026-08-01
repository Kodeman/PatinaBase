import { render, screen } from '@testing-library/react';
import type { Database } from '@patina/supabase';

import { ProjectScheduleHandoffMount } from '../project-schedule-handoff-mount';

jest.mock('@/components/document/phase-timeline', () => ({
  PhaseTimeline: ({ projectId }: { projectId: string }) => (
    <div data-testid="legacy-schedule">Legacy schedule · {projectId}</div>
  ),
}));

jest.mock('@/components/document/schedule/schedule-rule', () => ({
  ScheduleRule: ({
    projectId,
    projectTitle,
  }: {
    projectId: string;
    projectTitle: string;
  }) => (
    <div data-testid="schedule-rule">
      Schedule rule · {projectId} · {projectTitle}
    </div>
  ),
}));

jest.mock('@/components/document/schedule/schedule-confirm-strip', () => ({
  ScheduleConfirmStrip: ({ projectId }: { projectId: string }) => (
    <div data-testid="schedule-confirm">Confirm schedule · {projectId}</div>
  ),
}));

jest.mock('@/components/document/phase-advance-control', () => ({
  PhaseAdvanceControl: ({
    projectId,
    phases,
  }: {
    projectId: string;
    phases: readonly unknown[] | undefined;
  }) => (
    <div data-testid="phase-handoffs">
      Phase handoffs · {projectId} · {phases?.length ?? 0}
    </div>
  ),
}));

type PhaseRow = Database['public']['Tables']['project_phases']['Row'];

const schedulePhases = [
  {
    id: 'phase-1',
    name: 'Design Development',
    project_id: 'project-1',
    status: 'in_progress',
    lane: 'main',
    sort_order: 0,
  } as PhaseRow,
];

const scheduleMountProps = {
  engagementKind: 'project',
  projectId: 'project-1',
  projectTitle: 'Lakeshore House',
  projectStatus: 'active',
  phases: schedulePhases,
};

describe('ProjectScheduleHandoffMount', () => {
  it('mounts phase handoffs under the legacy schedule renderer', () => {
    render(
      <ProjectScheduleHandoffMount
        {...scheduleMountProps}
        showScheduleRule={false}
      />,
    );

    expect(screen.getByTestId('legacy-schedule')).toHaveTextContent('project-1');
    expect(screen.queryByTestId('schedule-rule')).not.toBeInTheDocument();
    expect(screen.getByTestId('schedule-confirm')).toBeVisible();
    expect(screen.getByTestId('phase-handoffs')).toHaveTextContent('project-1 · 1');
  });

  it('mounts the same phase handoffs under the Rule/Spine schedule renderer', () => {
    render(<ProjectScheduleHandoffMount {...scheduleMountProps} showScheduleRule />);

    expect(screen.getByTestId('schedule-rule')).toHaveTextContent(
      'project-1 · Lakeshore House',
    );
    expect(screen.queryByTestId('legacy-schedule')).not.toBeInTheDocument();
    expect(screen.getByTestId('schedule-confirm')).toBeVisible();
    expect(screen.getByTestId('phase-handoffs')).toBeVisible();
  });

  it.each(['on_hold', 'completed', 'archived', 'draft'])(
    'keeps the schedule visible but hides phase mutation controls for %s projects',
    (projectStatus) => {
      render(
        <ProjectScheduleHandoffMount
          {...scheduleMountProps}
          projectStatus={projectStatus}
          showScheduleRule={false}
        />,
      );

      expect(screen.getByTestId('legacy-schedule')).toBeVisible();
      expect(screen.getByTestId('schedule-confirm')).toBeVisible();
      expect(screen.queryByTestId('phase-handoffs')).not.toBeInTheDocument();
    },
  );

  it('mounts no project schedule or mutation control on proposal documents', () => {
    const { container } = render(
      <ProjectScheduleHandoffMount
        {...scheduleMountProps}
        engagementKind="proposal"
        showScheduleRule
      />,
    );

    expect(container).toBeEmptyDOMElement();
    expect(screen.queryByTestId('phase-handoffs')).not.toBeInTheDocument();
  });
});
