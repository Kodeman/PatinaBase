import { fireEvent, render, screen, waitFor } from '@testing-library/react';

import type { MilestoneDetail } from '@/types/project';
import type { ProjectApprovalReview } from '@patina/supabase';
import { AuthoritativeEnhancedTimeline } from '../enhanced-timeline';

jest.mock('@/lib/websocket', () => ({
  useWebSocket: () => ({
    isConnected: false,
    onMilestoneUpdate: jest.fn(() => () => undefined),
    onMilestoneCompleted: jest.fn(() => () => undefined),
  }),
  useMilestoneWebSocket: () => ({ messages: [] }),
}));

jest.mock('@/app/projects/[projectId]/actions', () => ({ postMessageAction: jest.fn() }));

jest.mock('@/components/strata-mark', () => ({
  StrataMark: () => null,
}));

jest.mock('@patina/design-system', () => ({
  PhaseTimeline: ({
    phases,
    activePhaseId,
    renderExpandedContent,
  }: {
    phases: Array<{ id: string; label: string; status: string; progress?: number }>;
    activePhaseId?: string;
    renderExpandedContent?: (phase: any) => React.ReactNode;
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
          <div key={phase.id}>
            <button
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
            {expandedId === phase.id ? renderExpandedContent?.(phase) : null}
          </div>
        ))}
      </div>
    );
  },
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

  it('associates canonical approvals only by exact phase id', () => {
    const approval = {
      decisionId: 'decision-1',
      projectId: 'project-1',
      phaseId: 'phase-1',
      artifactTitle: 'Issued plan set',
      artifactVersion: 4,
      question: 'Approve issued plan set 4?',
      dueAt: '2026-08-20T12:00:00.000Z',
      lifecycleStatus: 'pending',
      outcome: null,
      disposition: 'active',
      isOverdue: false,
    } as ProjectApprovalReview;
    render(
      <AuthoritativeEnhancedTimeline
        projectId="project-1"
        milestones={[milestone('in_progress')]}
        projectApprovals={[approval]}
      />,
    );

    expect(screen.getByRole('link', { name: approval.question })).toHaveAttribute(
      'href',
      '/decisions/decision-1',
    );
    expect(screen.queryByText('Review and Approve')).not.toBeInTheDocument();
  });

  it('shows an explicit project-level fallback instead of guessing a phase', () => {
    const approval = {
      decisionId: 'decision-2',
      projectId: 'project-1',
      phaseId: 'unknown-phase',
      artifactTitle: 'Budget checkpoint',
      artifactVersion: 2,
      question: 'Approve budget checkpoint 2?',
      dueAt: '2026-08-20T12:00:00.000Z',
      lifecycleStatus: 'pending',
      outcome: null,
      disposition: 'active',
      isOverdue: false,
    } as ProjectApprovalReview;
    render(
      <AuthoritativeEnhancedTimeline
        projectId="project-1"
        milestones={[milestone('in_progress')]}
        projectApprovals={[approval]}
      />,
    );

    expect(screen.getByRole('heading', { name: 'Project-level approvals' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: approval.question })).toBeInTheDocument();
  });
});
