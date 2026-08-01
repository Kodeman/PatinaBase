import { render, screen } from '@testing-library/react';

import { ProjectOverview } from '../project-overview';

jest.mock('@/lib/websocket', () => ({
  useActivityFeed: () => [],
  useTeamPresence: () => [],
}));

jest.mock('@patina/design-system', () => ({
  Avatar: () => null,
  AvatarGroup: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  Tooltip: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  TooltipTrigger: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  TooltipContent: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

function project(status: string) {
  return {
    id: 'project-1',
    name: 'Lake House',
    status,
    progressPercentage: status === 'completed' ? 100 : 50,
    completedMilestones: status === 'completed' ? 2 : 1,
    totalMilestones: 2,
  };
}

describe('ProjectOverview scope-change doorway', () => {
  it('keeps the doorway available for an active project', () => {
    render(<ProjectOverview project={project('active')} />);

    expect(
      screen.getByRole('link', { name: /request a change to this project/i }),
    ).toHaveAttribute('href', '/projects/project-1/scope-change/new');
  });

  it.each(['completed', 'archived'])(
    'hides the doorway when a project is %s',
    (status) => {
      render(<ProjectOverview project={project(status)} />);

      expect(
        screen.queryByRole('link', { name: /request a change to this project/i }),
      ).not.toBeInTheDocument();
    },
  );
});
