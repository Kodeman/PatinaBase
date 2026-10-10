import { render, screen } from '@testing-library/react';
import PayoutsPage from './page';

jest.mock('@tanstack/react-query', () => ({
  keepPreviousData: jest.fn(),
  useQuery: () => ({
    data: {
      rows: [],
      meta: { total: 0 },
      totals: {
        pendingCents: 0,
        processingCents: 0,
        completedCentsLast30Days: 0,
      },
    },
    isLoading: false,
    isError: false,
    error: null,
    isFetching: false,
  }),
}));

describe('PayoutsPage', () => {
  it('renders the exact Designer payouts heading', () => {
    render(<PayoutsPage />);

    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe(
      'Designer payouts',
    );
  });
});
