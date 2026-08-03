import { render, screen } from '@testing-library/react';
import { RecentBoardsStrip } from './recent-boards-strip';

const useRecentBoards = jest.fn();

jest.mock('@patina/supabase', () => ({
  useRecentBoards: (...args: unknown[]) => useRecentBoards(...args),
}));

jest.mock('next/navigation', () => ({
  usePathname: () => '/desk',
}));

describe('RecentBoardsStrip', () => {
  beforeEach(() => {
    useRecentBoards.mockReturnValue({ data: [], isLoading: false, isError: false });
  });

  it('renders proposal and project boards as room links with a safe return target', () => {
    useRecentBoards.mockReturnValue({
      isLoading: false,
      isError: false,
      data: [
        {
          id: 'proposal-board',
          name: 'Living room direction',
          owner: { kind: 'proposal', id: 'proposal-1' },
          ownerName: 'Lake House',
          roomName: 'Living room',
          coverImageUrl: 'https://images.example/cover.jpg',
          coverFallbackUrls: ['https://images.example/pin.jpg'],
          verdictCounts: { approved: 2, rejected: 1, comment: 1, total: 4 },
          updatedAt: new Date().toISOString(),
        },
        {
          id: 'project-board',
          name: 'Install alternates',
          owner: { kind: 'project', id: 'project-1' },
          ownerName: 'Lake House project',
          roomName: null,
          coverImageUrl: null,
          coverFallbackUrls: [
            'https://images.example/one.jpg',
            'https://images.example/two.jpg',
          ],
          verdictCounts: { approved: 0, rejected: 0, comment: 0, total: 0 },
          updatedAt: new Date().toISOString(),
        },
      ],
    });

    render(<RecentBoardsStrip />);

    expect(screen.getByText('Recent boards')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Open mood board Living room direction' })).toHaveAttribute(
      'href',
      '/board/proposal-board?source=desk_recents&from=%2Fdesk',
    );
    expect(screen.getByRole('link', { name: 'Open mood board Install alternates' })).toHaveAttribute(
      'href',
      '/board/project-board?source=desk_recents&from=%2Fdesk',
    );
    expect(screen.getByText('Living room')).toBeInTheDocument();
    expect(screen.getByText('Lake House project')).toBeInTheDocument();
    const verdicts = screen.getByLabelText('Client verdicts: 2 approved, 1 flagged, 1 noted');
    expect(verdicts).toHaveTextContent('2 Approved');
    expect(verdicts).toHaveTextContent('1 Flagged');
    expect(verdicts).toHaveTextContent('1 Noted');
  });

  it('stays absent once an empty query resolves', () => {
    const { container } = render(<RecentBoardsStrip />);
    expect(container).toBeEmptyDOMElement();
  });
});
