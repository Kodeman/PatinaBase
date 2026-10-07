import { fireEvent, render, screen } from '@testing-library/react';

const useProjectV2 = jest.fn();
const useCompletedProjectsWithoutReview = jest.fn();

jest.mock('@patina/supabase', () => ({
  useProjectV2: (id: string) => useProjectV2(id),
  useCompletedProjectsWithoutReview: () => useCompletedProjectsWithoutReview(),
}));
jest.mock('./document-action', () => ({
  DocumentAction: ({ children, onClick }: { children: React.ReactNode; onClick?: () => void }) => (
    <button type="button" onClick={onClick}>
      {children}
    </button>
  ),
}));
jest.mock('./people/ops/review-request-sheet', () => ({
  ReviewRequestSheet: ({ open, clientName }: { open: boolean; clientName: string }) =>
    open ? <div role="dialog">Request from {clientName}</div> : null,
}));

import { CareClosedLine, CareSection } from './quiet-sections';

beforeEach(() => {
  useProjectV2.mockReturnValue({
    data: {
      completed_at: '2026-08-01T12:00:00Z',
      portfolio_snapshot: null,
    },
  });
  useCompletedProjectsWithoutReview.mockReturnValue({ data: [] });
});

describe('CareSection review handoff', () => {
  it('offers the real review request only after completed closeout', () => {
    useCompletedProjectsWithoutReview.mockReturnValue({
      data: [
        {
          id: 'project-1',
          name: 'Prairie House',
          designer_clients: [
            {
              id: 'designer-client-1',
              client_name: 'Casey Client',
              client: null,
            },
          ],
        },
      ],
    });

    render(<CareSection completedLabel={null} projectId="project-1" />);

    fireEvent.click(screen.getByRole('button', { name: 'Request client review' }));
    expect(screen.getByRole('dialog')).toHaveTextContent('Request from Casey Client');
  });

  it('does not offer a duplicate request once the project has one', () => {
    render(<CareSection completedLabel={null} projectId="project-1" />);

    expect(screen.queryByRole('button', { name: 'Request client review' })).not.toBeInTheDocument();
  });
});

// FR1 F11 / R11 — the closed sentence is the Care head's status line, not a
// free paragraph above the `Care` heading.
describe('the closed sentence (R11)', () => {
  it('prints no free paragraph in the Care body', () => {
    render(<CareSection completedLabel="November 2026" projectId="project-1" />);
    expect(screen.queryByText(/The book closed|Project completed/)).toBeNull();
  });

  it('CareClosedLine states the close day once', () => {
    render(<CareClosedLine projectId="project-1" />);
    expect(screen.getByText('The book closed 1 August.')).toHaveAttribute('data-care-status');
  });

  it('CareClosedLine falls back to the target month, then to the bare fact', () => {
    useProjectV2.mockReturnValue({ data: { completed_at: null, target_end_date: '2026-11-15' } });
    const { rerender } = render(<CareClosedLine projectId="project-1" />);
    expect(screen.getByText('Project completed · November 2026.')).toBeInTheDocument();

    useProjectV2.mockReturnValue({ data: { completed_at: null, target_end_date: null } });
    rerender(<CareClosedLine projectId="project-1" />);
    expect(screen.getByText('Project completed.')).toBeInTheDocument();
  });
});
