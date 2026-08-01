import { fireEvent, render, screen, waitFor } from '@testing-library/react';

import type { MilestoneDetail } from '@/types/project';
import { AuthoritativeEnhancedTimeline } from '../enhanced-timeline';

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
  PhaseTimeline: ({
    phases,
    activePhaseId,
  }: {
    phases: Array<{ id: string; label: string; status: string; progress?: number }>;
    activePhaseId?: string;
  }) => {
    const React = jest.requireActual('react') as typeof import('react');
    const [expandedId, setExpandedId] = React.useState<string | undefined>(
      activePhaseId,
    );
    React.useEffect(() => {
      if (activePhaseId !== undefined) setExpandedId(activePhaseId);
    }, [activePhaseId]);
    return (
      <div>
        {phases.map((phase) => (
          <button
            key={phase.id}
            type="button"
            data-testid={`phase-${phase.id}`}
            aria-expanded={expandedId === phase.id}
            onClick={() => setExpandedId(phase.id)}
          >
            <span data-testid={`phase-label-${phase.id}`}>{phase.label}</span>
            <span data-testid={`phase-status-${phase.id}`}>
              {phase.status}:{phase.progress}
            </span>
          </button>
        ))}
      </div>
    );
  },
  ApprovalTheater: () => null,
  ProjectCompletionCelebration: () => null,
}));

function milestone(
  status: MilestoneDetail['status'],
  overrides: Partial<MilestoneDetail> = {},
): MilestoneDetail {
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
    ...overrides,
  };
}

describe('EnhancedTimeline refreshed props', () => {
  it('refreshes local phase state from a changed authority fingerprint', async () => {
    const { rerender } = render(
      <AuthoritativeEnhancedTimeline
        projectId="project-1"
        milestones={[milestone('upcoming')]}
      />,
    );

    expect(screen.getByTestId('phase-status-phase-1')).toHaveTextContent('pending');

    rerender(
      <AuthoritativeEnhancedTimeline
        projectId="project-1"
        milestones={[milestone('completed')]}
      />,
    );

    await waitFor(() => {
      expect(screen.getByTestId('phase-status-phase-1')).toHaveTextContent('completed');
    });
  });

  it('preserves manual expansion while applying refreshed canonical authority', async () => {
    const current = milestone('in_progress', {
      authorityVersion: '2026-08-01T12:00:00.000Z',
      progressPercentage: 10,
    });
    const next = milestone('upcoming', {
      id: 'phase-2',
      index: 1,
      title: 'Installation',
      phase: 'installation',
      authorityVersion: '2026-08-01T12:00:00.000Z',
    });
    const { rerender } = render(
      <AuthoritativeEnhancedTimeline
        projectId="project-1"
        milestones={[current, next]}
      />,
    );

    fireEvent.click(screen.getByTestId('phase-phase-2'));
    expect(screen.getByTestId('phase-phase-2')).toHaveAttribute(
      'aria-expanded',
      'true',
    );

    rerender(
      <AuthoritativeEnhancedTimeline
        projectId="project-1"
        milestones={[
          {
            ...current,
            authorityVersion: '2026-08-01T12:01:00.000Z',
            progressPercentage: 35,
          },
          next,
        ]}
      />,
    );

    await waitFor(() => {
      expect(screen.getByTestId('phase-status-phase-1')).toHaveTextContent(
        'active:35',
      );
    });
    expect(screen.getByTestId('phase-phase-2')).toHaveAttribute(
      'aria-expanded',
      'true',
    );
  });

  it('labels thread phases as concurrent workstreams', () => {
    render(
      <AuthoritativeEnhancedTimeline
        projectId="project-1"
        milestones={[
          milestone('upcoming', { tags: ['Concurrent workstream'] }),
        ]}
      />,
    );

    expect(screen.getByTestId('phase-label-phase-1')).toHaveTextContent(
      'Concurrent workstream',
    );
  });
});
