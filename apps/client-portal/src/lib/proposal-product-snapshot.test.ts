import { productFromProposalSnapshot } from './proposal-product-snapshot';

describe('proposal product snapshot rendering', () => {
  it('renders the association-time proposal copy exactly', () => {
    expect(
      productFromProposalSnapshot({
        product_id: 'proposal-product',
        name: 'Association-time chair',
        images: ['proposal.jpg'],
        brand: 'Proposal Brand',
        source_url: 'https://example.invalid/proposal',
        dimensions: { width: '30 in' },
        materials: ['oak'],
        price_retail: 120_000,
        has_teaching: true,
      }),
    ).toEqual({
      id: 'proposal-product',
      name: 'Association-time chair',
      images: ['proposal.jpg'],
      brand: 'Proposal Brand',
      source_url: 'https://example.invalid/proposal',
      dimensions: { width: '30 in' },
      materials: ['oak'],
      price_retail: 120_000,
      has_teaching: true,
      record_completeness_hidden: false,
    });
  });

  it('preserves the safe-DTO marker when tier redaction hides scoring inputs', () => {
    expect(
      productFromProposalSnapshot({
        name: 'Milestone chair',
        record_completeness_hidden: true,
      }, 'proposal-item-id'),
    ).toMatchObject({
      id: 'proposal-item-id',
      record_completeness_hidden: true,
    });
  });

  it('fails closed when proposal provenance is absent', () => {
    expect(productFromProposalSnapshot(undefined)).toBeUndefined();
    expect(productFromProposalSnapshot({})).toBeUndefined();
    expect(productFromProposalSnapshot({ name: 'No identity' })).toBeUndefined();
  });
});
