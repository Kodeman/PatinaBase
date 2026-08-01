import { fireEvent, render, screen } from '@testing-library/react';

import {
  useMyPendingReviewRequests,
  useMySubmittedReviews,
} from '@patina/supabase';
import { ReviewsIndex } from '../ReviewsIndex';

jest.mock('@patina/supabase', () => ({
  useMyPendingReviewRequests: jest.fn(),
  useMySubmittedReviews: jest.fn(),
}));

jest.mock('@patina/help-system', () => ({
  EmptyState: () => <div>CMS empty review state</div>,
  SectionIntro: () => null,
  SurfaceKeys: {
    ClientPortal: {
      Reviews: {
        PendingIntro: 'pending-intro',
        Empty: { NoReviews: 'no-reviews' },
      },
    },
  },
  useHelpContent: () => ({ data: null, isLoading: false }),
}));

jest.mock('../PastReviewCard', () => ({ PastReviewCard: () => null }));
jest.mock('../SubmitReviewDialog', () => ({ SubmitReviewDialog: () => null }));

const mockPending = useMyPendingReviewRequests as jest.Mock;
const mockPast = useMySubmittedReviews as jest.Mock;

describe('ReviewsIndex query states', () => {
  it('shows one retryable failure if either reviews query fails', () => {
    const retryPending = jest.fn();
    const retryPast = jest.fn();
    mockPending.mockReturnValue({
      data: [],
      isLoading: false,
      isError: true,
      refetch: retryPending,
    });
    mockPast.mockReturnValue({
      data: [],
      isLoading: false,
      isError: false,
      refetch: retryPast,
    });

    render(<ReviewsIndex userId="client-1" />);

    expect(screen.getByRole('alert')).toHaveTextContent(/unable to load reviews/i);
    expect(screen.queryByText(/no reviews yet/i)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /try again/i }));
    expect(retryPending).toHaveBeenCalledTimes(1);
    expect(retryPast).toHaveBeenCalledTimes(1);
  });

  it('shows no-reviews copy only after both queries succeed empty', () => {
    mockPending.mockReturnValue({
      data: [],
      isLoading: false,
      isError: false,
      refetch: jest.fn(),
    });
    mockPast.mockReturnValue({
      data: [],
      isLoading: false,
      isError: false,
      refetch: jest.fn(),
    });

    render(<ReviewsIndex userId="client-1" />);

    expect(screen.getByText(/no reviews yet/i)).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});
