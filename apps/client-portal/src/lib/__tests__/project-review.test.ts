import { adaptClientProjectReviewBundle, applyClientReviewMediaUrls, reviewVerdictFromLabel } from '../project-review';

describe('client project review adapter', () => {
  it('keeps only the immutable client-safe review allowlist', () => {
    expect(adaptClientProjectReviewBundle({
      edition: { id: 'edition-1', status: 'published' }, project: { id: 'project-1' }, internal_cost_cents: 99,
      items: [{ id: 'item-1', snapshot: { name: 'Chair', room: { name: 'Living room' }, clientLineTotalCents: 120000, media: [{ id: 'asset-1', checksumSha256: 'hash' }] }, feedback: [], markup: 0.9 }],
    })).toEqual({ projectId: 'project-1', editionId: 'edition-1', publishedAt: null, status: 'published', items: [{ id: 'item-1', name: 'Chair', roomName: 'Living room', imageUrl: null, clientPriceCents: 120000, currency: 'USD', verdict: null, comment: null, mediaAssetIds: ['asset-1'] }] });
  });

  it('maps the stored verdict vocabulary without conflating it with authorization', () => {
    expect(reviewVerdictFromLabel('Looks good')).toBe('approved');
    expect(reviewVerdictFromLabel('Needs a change')).toBe('rejected');
    expect(reviewVerdictFromLabel('Ask a question')).toBe('comment');
  });

  it('omits draft and unknown editions instead of treating them as published', () => {
    expect(adaptClientProjectReviewBundle({ edition: { id: 'draft', status: 'draft' }, project: { id: 'project-1' }, items: [] })).toBeNull();
    expect(adaptClientProjectReviewBundle({ id: 'not-an-edition', status: 'published', items: [] })).toBeNull();
  });

  it('keeps closed immutable editions read-only and applies ephemeral signed media by asset id', () => {
    const bundle = adaptClientProjectReviewBundle({
      edition: { id: 'final', status: 'finalized' }, project: { id: 'project-1' },
      items: [{ id: 'item-1', snapshot: { name: 'Chair', media: [{ id: 'asset-1' }] }, feedback: [{ verdict: 'comment', body: 'Could this be lighter?' }] }],
    });
    expect(bundle?.status).toBe('finalized');
    expect(applyClientReviewMediaUrls(bundle!, [{ assetId: 'asset-1', signedUrl: 'https://signed.example/chair' }]).items[0]).toMatchObject({
      imageUrl: 'https://signed.example/chair', verdict: 'comment', comment: 'Could this be lighter?',
    });
  });
});
