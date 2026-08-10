import { fireEvent, render, screen } from '@testing-library/react';
import { ProjectReviewEdition } from '../ProjectReviewEdition';
import { useClientProjectReviewBundle, useRecordProjectReviewFeedback } from '@/hooks/use-commercial-client';

jest.mock('@/hooks/use-commercial-client', () => ({ useClientProjectReviewBundle: jest.fn(), useRecordProjectReviewFeedback: jest.fn() }));
jest.mock('next/image', () => (props: any) => <img {...props} />);

const review = useClientProjectReviewBundle as jest.Mock;
const feedback = useRecordProjectReviewFeedback as jest.Mock;

describe('ProjectReviewEdition', () => {
  it('records a preference only and explains it is not authorization', () => {
    const mutate = jest.fn();
    review.mockReturnValue({ isLoading: false, data: { editionId: 'edition-1', status: 'published', publishedAt: null, items: [{ id: 'item-1', name: 'Chair', roomName: 'Living room', imageUrl: null, clientPriceCents: 120000, currency: 'USD', verdict: null, comment: null }] } });
    feedback.mockReturnValue({ mutate, isPending: false });
    render(<ProjectReviewEdition projectId="project-1" />);
    expect(screen.getByText(/does not authorize a purchase/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Needs a change' }));
    expect(mutate).toHaveBeenCalledWith({ editionId: 'edition-1', reviewItemId: 'item-1', verdict: 'rejected' });
  });

  it('requires a written question before recording the comment verdict', () => {
    const mutate = jest.fn();
    review.mockReturnValue({ isLoading: false, data: { editionId: 'edition-1', status: 'published', publishedAt: null, items: [{ id: 'item-1', name: 'Chair', roomName: 'Living room', imageUrl: null, clientPriceCents: null, currency: 'USD', verdict: null, comment: null }] } });
    feedback.mockReturnValue({ mutate, isPending: false });
    render(<ProjectReviewEdition projectId="project-1" />);
    const question = screen.getByRole('textbox', { name: 'Question about Chair' });
    fireEvent.change(question, { target: { value: 'Could this be lighter?' } });
    fireEvent.click(screen.getByRole('button', { name: 'Ask a question' }));
    expect(mutate).toHaveBeenCalledWith({ editionId: 'edition-1', reviewItemId: 'item-1', verdict: 'comment', comment: 'Could this be lighter?' });
  });

  it('does not offer verdict controls after an edition is closed', () => {
    review.mockReturnValue({ isLoading: false, data: { editionId: 'edition-1', status: 'finalized', publishedAt: null, items: [{ id: 'item-1', name: 'Chair', roomName: 'Living room', imageUrl: null, clientPriceCents: null, currency: 'USD', verdict: 'approved', comment: null }] } });
    feedback.mockReturnValue({ mutate: jest.fn(), isPending: false });
    render(<ProjectReviewEdition projectId="project-1" />);
    expect(screen.queryByRole('button', { name: 'Looks good' })).not.toBeInTheDocument();
    expect(screen.getByText(/edition is closed/i)).toBeInTheDocument();
  });
});
