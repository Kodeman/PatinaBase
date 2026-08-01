import { render, screen } from '@testing-library/react';

import type { MilestoneDetail } from '@/types/project';
import { EnhancedTimeline } from '../enhanced-timeline';

jest.mock('@/lib/websocket', () => ({
  useWebSocket: () => ({
    isConnected: false,
    onMilestoneUpdate: jest.fn(() => () => undefined),
    onMilestoneCompleted: jest.fn(() => () => undefined),
  }),
  useMilestoneWebSocket: () => ({ messages: [] }),
}));

jest.mock('@/app/projects/[projectId]/actions', () => ({
  submitApprovalAction: jest.fn(),
  postMessageAction: jest.fn(),
}));

jest.mock('@/components/strata-mark', () => ({
  StrataMark: () => null,
}));

jest.mock('@patina/design-system', () => ({
  PhaseTimeline: ({ phases }: { phases: Array<{ id: string; status: string }> }) => (
    <div>
      {phases.map((phase) => (
        <span key={phase.id} data-testid={`phase-${phase.id}`}>
          {phase.status}
        </span>
      ))}
    </div>
  ),
  ApprovalTheater: () => null,
  ProjectCompletionCelebration: () => null,
}));

function milestone(status: MilestoneDetail['status']): MilestoneDetail {
  return {
    id: 'phase-1',
    index: 0,
    title: 'Design',
    phase: 'design',
    status,
    progressPercentage: status === 'completed' ? 100 : 0,
    checklist: [],
    documents: [],
    messages: [],
  };
}

describe('EnhancedTimeline refreshed props', () => {
  it('reconciles refreshed server milestones into its local interactive state', () => {
    const { rerender } = render(
      <EnhancedTimeline projectId="project-1" milestones={[milestone('upcoming')]} />,
    );

    expect(screen.getByTestId('phase-phase-1')).toHaveTextContent('pending');

    rerender(
      <EnhancedTimeline projectId="project-1" milestones={[milestone('completed')]} />,
    );

    expect(screen.getByTestId('phase-phase-1')).toHaveTextContent('completed');
  });
});
