/**
 * 00591 — the review ask's own delivery. The pending tab's reason line keeps
 * its prose; the delivery word joins it as an element (sentence case,
 * terracotta) only when the mail needs the studio.
 */

import { fireEvent, render, screen, within } from '@testing-library/react';
import { ReviewsView } from '../reviews-view';

let mockEmailDeliveryByRef: Record<string, unknown> = {};
const mockUseEmailDelivery = jest.fn();

const sentAsk = {
  id: 'review-1',
  request_status: 'sent',
  rating: null,
  quote: null,
  published: false,
  designer_client: {
    client_name: 'Dave Okonkwo',
    client_email: 'dave@okonkwo.net',
    client: { full_name: 'Dave Okonkwo' },
  },
};

jest.mock('@patina/supabase', () => ({
  useReviewStats: () => ({ data: undefined }),
  useClientReviews: ({ requestStatus }: { requestStatus: string }) => ({
    data: requestStatus === 'sent' ? [sentAsk] : [],
    isLoading: false,
  }),
  useCompletedProjectsWithoutReview: () => ({ data: [], isLoading: false }),
  useTogglePortfolioPublish: () => ({ mutateAsync: jest.fn(), isPending: false }),
  useCreateReviewRequest: () => ({ mutateAsync: jest.fn(), isPending: false }),
  useEmailDelivery: (...args: unknown[]) => {
    mockUseEmailDelivery(...args);
    return { byRef: mockEmailDeliveryByRef, isLoading: false, isError: false };
  },
}));

const bounced = {
  logId: 'log-1',
  refId: 'review-1',
  recipient: 'dave@okonkwo.net',
  state: 'bounced',
  status: 'bounced',
  sentAt: '2026-09-08T14:00:00.000Z',
  deliveredAt: null,
  bouncedAt: '2026-09-09T09:00:00.000Z',
  bounceType: 'permanent',
  bounceReason: 'no such mailbox',
  delayedAt: null,
  lastEvent: 'email.bounced',
  lastEventAt: '2026-09-09T09:00:00.000Z',
  createdAt: '2026-09-08T14:00:00.000Z',
};

beforeEach(() => {
  mockEmailDeliveryByRef = {};
  mockUseEmailDelivery.mockClear();
});

describe('ReviewsView · pending', () => {
  it('keeps the reason line alone while the ask is behaving', () => {
    render(<ReviewsView notify={jest.fn()} />);

    const row = screen.getByText('Dave Okonkwo').closest('li') as HTMLElement;
    expect(row).toHaveTextContent('Request sent — awaiting their words');
    expect(within(row).queryByTestId('delivery-word')).toBeNull();
  });

  it('prints the bounce beside the reason, as an element not a joined string', () => {
    mockEmailDeliveryByRef = { 'review-1': bounced };

    render(<ReviewsView notify={jest.fn()} />);

    const row = screen.getByText('Dave Okonkwo').closest('li') as HTMLElement;
    const word = within(row).getByTestId('delivery-word');
    expect(word).toHaveTextContent("Bounced 9 Sept — didn't reach dave@okonkwo.net");
    expect(word).toHaveAttribute('role', 'status');
    // The reason line survives — the word joins it, it does not replace it.
    expect(row).toHaveTextContent('Request sent — awaiting their words');
  });

  it('asks the log only for the tab that prints the word', () => {
    render(<ReviewsView notify={jest.fn()} />);

    expect(mockUseEmailDelivery).toHaveBeenCalledWith('client_review', ['review-1']);

    mockUseEmailDelivery.mockClear();
    fireEvent.click(screen.getByRole('button', { name: /Collected/ }));
    expect(mockUseEmailDelivery).toHaveBeenCalled();
    for (const call of mockUseEmailDelivery.mock.calls) {
      expect(call[1]).toEqual([]);
    }
  });
});
