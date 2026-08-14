import { fireEvent, render, screen } from '@testing-library/react';
import { WorkBlock } from './work-block';

const tasksRefetch = jest.fn();
const gatesRefetch = jest.fn();
let tasksQuery: Record<string, unknown>;
let gatesQuery: Record<string, unknown>;

jest.mock('@/hooks/use-section-work', () => ({
  gateState: () => 'requested',
  useSectionTasks: () => tasksQuery,
  useSectionGates: () => gatesQuery,
  useSectionLoggedMinutes: () => ({ data: 0 }),
  useCreateSectionTask: () => ({ mutate: jest.fn() }),
  useToggleSectionTask: () => ({ mutate: jest.fn() }),
}));

const renderWork = (clientUserId: string | null = null) =>
  render(
    <WorkBlock
      projectId="project-1"
      sectionKey="project"
      sectionLabel="Project"
      clientUserId={clientUserId}
      clientName="Avery"
    />,
  );

describe('WorkBlock query states', () => {
  beforeEach(() => {
    tasksRefetch.mockReset();
    gatesRefetch.mockReset();
    tasksQuery = { data: [], isLoading: false, isError: false, refetch: tasksRefetch };
    gatesQuery = { data: [], isLoading: false, isError: false, refetch: gatesRefetch };
  });

  it('does not show a false empty prompt while work is loading', () => {
    tasksQuery.isLoading = true;
    renderWork();
    expect(screen.getByText('Reading the work')).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Add the first task' })).not.toBeInTheDocument();
  });

  it('shows a retry instead of a false empty prompt when a read fails', () => {
    gatesQuery.isError = true;
    renderWork();
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(tasksRefetch).toHaveBeenCalledTimes(1);
    expect(gatesRefetch).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('button', { name: 'Add the first task' })).not.toBeInTheDocument();
  });

  it('guides only after both reads succeed empty', () => {
    renderWork();
    expect(screen.getByRole('button', { name: 'Add the first task' })).toBeVisible();
  });

  it('does not offer new legacy section sign-off creation', () => {
    renderWork('client-1');
    expect(
      screen.queryByRole('button', { name: /request sign-off/i }),
    ).not.toBeInTheDocument();
  });
});
