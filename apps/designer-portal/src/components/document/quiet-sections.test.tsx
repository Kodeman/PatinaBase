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

import { CareSection } from './quiet-sections';

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
