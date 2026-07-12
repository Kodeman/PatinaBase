import {
  applyFieldCorrections,
  isApproved,
  isBatchFullyResolved,
  isItemEligibleForCommit,
  selectEligibleBatchRows,
  type CatalogFeedItemForCommit,
} from '@/lib/catalog-commit';

function item(overrides: Partial<CatalogFeedItemForCommit> = {}): CatalogFeedItemForCommit {
  return {
    id: 'item-1',
    batch_id: 'batch-1',
    status: 'normalized',
    confidence: 0.95,
    normalized: { name: 'Chesterfield Sofa', price_retail_cents: 129900 },
    match_product_id: null,
    action: 'create',
    committed_product_id: null,
    ...overrides,
  };
}

describe('isApproved', () => {
  it('is true only when the gate task status is approved', () => {
    expect(isApproved({ status: 'approved' })).toBe(true);
  });

  it('is false for awaiting_review, rejected, or missing task', () => {
    expect(isApproved({ status: 'awaiting_review' })).toBe(false);
    expect(isApproved({ status: 'rejected' })).toBe(false);
    expect(isApproved(null)).toBe(false);
    expect(isApproved(undefined)).toBe(false);
  });
});

describe('selectEligibleBatchRows', () => {
  it('includes normalized rows with confidence >= 0.9 and no committed_product_id', () => {
    const rows = [item({ id: 'a', confidence: 0.95 }), item({ id: 'b', confidence: 0.9 })];
    expect(selectEligibleBatchRows(rows).map((r) => r.id)).toEqual(['a', 'b']);
  });

  it('excludes rows below the 0.9 confidence threshold', () => {
    const rows = [item({ id: 'a', confidence: 0.89 }), item({ id: 'b', confidence: 0.5 })];
    expect(selectEligibleBatchRows(rows)).toEqual([]);
  });

  it('excludes rows not in normalized status (e.g. review_queued, error)', () => {
    const rows = [
      item({ id: 'a', status: 'review_queued', confidence: 0.95 }),
      item({ id: 'b', status: 'error', confidence: null }),
      item({ id: 'c', status: 'auto_committed', confidence: 0.95, committed_product_id: 'p1' }),
    ];
    expect(selectEligibleBatchRows(rows)).toEqual([]);
  });

  it('treats a null confidence as 0 (excluded)', () => {
    const rows = [item({ id: 'a', confidence: null })];
    expect(selectEligibleBatchRows(rows)).toEqual([]);
  });

  it('idempotent re-run: a row already committed is excluded even if it still reads normalized/high-confidence', () => {
    const rows = [item({ id: 'a', confidence: 0.95, committed_product_id: 'product-123' })];
    expect(selectEligibleBatchRows(rows)).toEqual([]);
  });
});

describe('isItemEligibleForCommit', () => {
  it('true when the gate task is approved and the item is not yet committed', () => {
    expect(isItemEligibleForCommit(item(), { status: 'approved' })).toBe(true);
  });

  it('false when the gate task is not approved, regardless of confidence', () => {
    expect(isItemEligibleForCommit(item({ confidence: 0.2 }), { status: 'awaiting_review' })).toBe(false);
  });

  it('false when the item is already committed, even if approved', () => {
    expect(
      isItemEligibleForCommit(item({ committed_product_id: 'product-123' }), { status: 'approved' }),
    ).toBe(false);
  });

  it('is NOT confidence-gated — a low-confidence row is eligible once a human approves it', () => {
    expect(isItemEligibleForCommit(item({ confidence: 0.1 }), { status: 'approved' })).toBe(true);
  });
});

describe('applyFieldCorrections', () => {
  it('returns normalized unchanged when there are no corrections', () => {
    const normalized = { name: 'Sofa', price_retail_cents: 100 };
    expect(applyFieldCorrections(normalized, null)).toBe(normalized);
    expect(applyFieldCorrections(normalized, undefined)).toBe(normalized);
  });

  it('overlays corrections on top of normalized, field by field', () => {
    const normalized = { name: 'Sofa', price_retail_cents: 100, category: 'seating' };
    const corrected = applyFieldCorrections(normalized, { price_retail_cents: 130000 });
    expect(corrected).toEqual({ name: 'Sofa', price_retail_cents: 130000, category: 'seating' });
  });

  it('does not mutate the original normalized object', () => {
    const normalized = { name: 'Sofa' };
    applyFieldCorrections(normalized, { name: 'Sofa Deluxe' });
    expect(normalized.name).toBe('Sofa');
  });

  it('adds a field not present in normalized', () => {
    const normalized = { name: 'Sofa' };
    expect(applyFieldCorrections(normalized, { vendor_sku: 'SKU-1' })).toEqual({
      name: 'Sofa',
      vendor_sku: 'SKU-1',
    });
  });
});

describe('isBatchFullyResolved', () => {
  it('false while any row is pending, normalized, or review_queued', () => {
    expect(isBatchFullyResolved([{ status: 'auto_committed' }, { status: 'normalized' }])).toBe(false);
    expect(isBatchFullyResolved([{ status: 'review_queued' }])).toBe(false);
    expect(isBatchFullyResolved([{ status: 'pending' }])).toBe(false);
  });

  it('true when every row is committed, rejected, skipped, or errored', () => {
    expect(
      isBatchFullyResolved([
        { status: 'auto_committed' },
        { status: 'approved_committed' },
        { status: 'rejected' },
        { status: 'skipped' },
        { status: 'error' },
      ]),
    ).toBe(true);
  });

  it('true for an empty batch', () => {
    expect(isBatchFullyResolved([])).toBe(true);
  });
});
