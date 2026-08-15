import { render, screen } from '@testing-library/react';

import { ProjectScheduleHandoffMount } from '../project-schedule-handoff-mount';

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
  PhaseAdvanceControl: () => <div data-testid="phase-handoffs">Phase handoffs</div>,
}));

const scheduleMountProps = {
  engagementKind: 'project',
  projectId: 'project-1',
  projectTitle: 'Lakeshore House',
};

describe('ProjectScheduleHandoffMount', () => {
  it('mounts the Rule and its confirm strip — no renderer choice left (B3)', () => {
    render(<ProjectScheduleHandoffMount {...scheduleMountProps} />);

    expect(screen.getByTestId('schedule-rule')).toHaveTextContent(
      'project-1 · Lakeshore House',
    );
    expect(screen.getByTestId('schedule-confirm')).toBeVisible();
  });

  it('does NOT carry the phase-advance control — this mount is a foldable body', () => {
    // The control moved up to ScheduleRuleRegion, which renders it in both
    // fold states; behind a default-folded body it was invisible on every
    // visit. Its status gating is asserted in schedule-rule-region.test.tsx.
    render(<ProjectScheduleHandoffMount {...scheduleMountProps} />);
    expect(screen.queryByTestId('phase-handoffs')).not.toBeInTheDocument();
  });

  it('mounts no project schedule on proposal documents', () => {
    const { container } = render(
      <ProjectScheduleHandoffMount {...scheduleMountProps} engagementKind="proposal" />,
    );

    expect(container).toBeEmptyDOMElement();
  });
});
