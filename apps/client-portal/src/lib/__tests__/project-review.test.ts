import { adaptClientProjectReviewBundle, reviewVerdictFromLabel } from '../project-review';

describe('client project review adapter', () => {
  it('keeps only the immutable client-safe review allowlist', () => {
    expect(adaptClientProjectReviewBundle({
      edition_id: 'edition-1', status: 'published', internal_cost_cents: 99,
      review_items: [{ id: 'item-1', item_name: 'Chair', room_name: 'Living room', client_price_cents: 120000, image_url: 'https://example.test/chair.jpg', markup: 0.9 }],
    })).toEqual({ editionId: 'edition-1', publishedAt: null, status: 'published', items: [{ id: 'item-1', name: 'Chair', roomName: 'Living room', imageUrl: 'https://example.test/chair.jpg', clientPriceCents: 120000, currency: 'USD', verdict: null, comment: null }] });
  });

  it('maps the stored verdict vocabulary without conflating it with authorization', () => {
    expect(reviewVerdictFromLabel('Looks good')).toBe('approved');
    expect(reviewVerdictFromLabel('Needs a change')).toBe('rejected');
    expect(reviewVerdictFromLabel('Ask a question')).toBe('comment');
  });
});
