import { describe, it, expect } from 'vitest';
import {
  buildCapturePayload,
  buildCommitProposalCaptureArgs,
  buildProductInsertPayload,
  deriveCaptureStatus,
} from '../../lib/payloads';

// Columns that exist on the `proposal_captures` table (00130).
// id/captured_at/consumed_at/consumed_proposal_item_id are filled
// server-side and must NOT appear in an insert payload.
const PROPOSAL_CAPTURES_COLUMNS = new Set([
  'designer_id',
  'product_id',
  'proposal_id',
  'scope_room_id',
  'ffe_category_slug',
  'source_url',
  'raw_payload',
  'thumbnail_url',
  'status',
]);

describe('deriveCaptureStatus', () => {
  it('returns inbox when nothing is targeted', () => {
    expect(
      deriveCaptureStatus({ proposalId: null, scopeRoomId: null, ffeCategorySlug: null })
    ).toBe('inbox');
  });

  it('returns inbox when only the proposal is set', () => {
    expect(
      deriveCaptureStatus({
        proposalId: 'p1',
        scopeRoomId: null,
        ffeCategorySlug: null,
      })
    ).toBe('inbox');
  });

  it('returns inbox when only proposal + room are set', () => {
    expect(
      deriveCaptureStatus({
        proposalId: 'p1',
        scopeRoomId: 'r1',
        ffeCategorySlug: null,
      })
    ).toBe('inbox');
  });

  it('returns assigned when all three are set', () => {
    expect(
      deriveCaptureStatus({
        proposalId: 'p1',
        scopeRoomId: 'r1',
        ffeCategorySlug: 'seating',
      })
    ).toBe('assigned');
  });
});

describe('buildCapturePayload', () => {
  it('only includes columns that exist on proposal_captures', () => {
    const payload = buildCapturePayload({
      designerId: 'd1',
      productId: 'pr1',
      proposalId: null,
      scopeRoomId: null,
      ffeCategorySlug: null,
      sourceUrl: 'https://example.com/chair',
      rawPayload: { name: 'Chair' },
      thumbnailUrl: 'https://cdn.example.com/c.jpg',
    });

    for (const key of Object.keys(payload)) {
      expect(
        PROPOSAL_CAPTURES_COLUMNS.has(key),
        `"${key}" is not a column on proposal_captures`
      ).toBe(true);
    }
  });

  it('starts in inbox status when no targeting is set', () => {
    const payload = buildCapturePayload({
      designerId: 'd1',
      productId: 'pr1',
      proposalId: null,
      scopeRoomId: null,
      ffeCategorySlug: null,
      sourceUrl: 'https://example.com/x',
      rawPayload: {},
      thumbnailUrl: null,
    });
    expect(payload.status).toBe('inbox');
  });

  it('moves to assigned status when fully targeted', () => {
    const payload = buildCapturePayload({
      designerId: 'd1',
      productId: 'pr1',
      proposalId: 'p1',
      scopeRoomId: 'r1',
      ffeCategorySlug: 'lighting',
      sourceUrl: 'https://example.com/x',
      rawPayload: {},
      thumbnailUrl: null,
    });
    expect(payload.status).toBe('assigned');
  });

  it('passes through raw_payload as-is', () => {
    const payload = buildCapturePayload({
      designerId: 'd1',
      productId: null,
      proposalId: null,
      scopeRoomId: null,
      ffeCategorySlug: null,
      sourceUrl: 'https://example.com',
      rawPayload: { name: 'Sofa', vendor: { name: 'Acme' } },
      thumbnailUrl: null,
    });
    expect(payload.raw_payload).toEqual({ name: 'Sofa', vendor: { name: 'Acme' } });
  });

  it('preserves null product_id (capture without a real product yet)', () => {
    const payload = buildCapturePayload({
      designerId: 'd1',
      productId: null,
      proposalId: null,
      scopeRoomId: null,
      ffeCategorySlug: null,
      sourceUrl: 'https://example.com',
      rawPayload: {},
      thumbnailUrl: null,
    });
    expect(payload.product_id).toBeNull();
  });
});

// ─── commit_proposal_capture RPC args (Phase 3 / C-A2, migration 00516) ────

const MINIMAL_EXTRACTED_DATA = {
  productName: 'Coastal armchair',
  description: null,
  price: null,
  dimensions: null,
  materials: [],
  colors: null,
  finish: null,
  availableColors: null,
  availableFinishes: null,
  images: [],
  manufacturer: null,
  url: 'https://example.com/armchair',
  extractedAt: new Date().toISOString(),
  confidence: 'high' as const,
};

describe('buildCommitProposalCaptureArgs', () => {
  it('carries the client-generated idempotency key as p_client_capture_id', () => {
    const product = buildProductInsertPayload({
      productName: 'Coastal armchair',
      extractedData: MINIMAL_EXTRACTED_DATA,
      price: '',
      images: [],
      vendorId: null,
      retailerId: null,
      userId: 'u1',
    });

    const args = buildCommitProposalCaptureArgs({
      clientCaptureId: 'cc-123',
      product,
      productStatus: 'draft',
      styleIds: [],
      proposalId: null,
      scopeRoomId: null,
      ffeCategorySlug: null,
      rawPayload: { name: 'Coastal armchair' },
      thumbnailUrl: null,
    });

    expect(args.p_client_capture_id).toBe('cc-123');
  });

  it('maps the product row into the camelCase payload envelope commit_proposal_capture expects', () => {
    const product = buildProductInsertPayload({
      productName: 'Teak bench',
      extractedData: {
        ...MINIMAL_EXTRACTED_DATA,
        productName: 'Teak bench',
        url: 'https://example.com/bench',
      },
      price: '199.00',
      images: ['https://cdn.example.com/bench.jpg'],
      vendorId: 'v1',
      retailerId: 'r1',
      userId: 'u1',
    });

    const args = buildCommitProposalCaptureArgs({
      clientCaptureId: 'cc-456',
      product,
      productStatus: 'draft',
      styleIds: ['s1'],
      proposalId: 'p1',
      scopeRoomId: 'r1',
      ffeCategorySlug: 'seating',
      rawPayload: { name: 'Teak bench' },
      thumbnailUrl: 'https://cdn.example.com/bench.jpg',
    });

    expect(args.p_payload).toMatchObject({
      name: 'Teak bench',
      sourceUrl: 'https://example.com/bench',
      priceRetailCents: 19900,
      vendorId: 'v1',
      retailerId: 'r1',
      thumbnailUrl: 'https://cdn.example.com/bench.jpg',
      rawPayload: { name: 'Teak bench' },
    });
    expect(args.p_style_ids).toEqual(['s1']);
    expect(args.p_proposal_id).toBe('p1');
    expect(args.p_scope_room_id).toBe('r1');
    expect(args.p_ffe_category_slug).toBe('seating');
  });

  it('never leaks a bare snake_case products row shape into p_payload', () => {
    const product = buildProductInsertPayload({
      productName: 'Rattan mirror',
      extractedData: { ...MINIMAL_EXTRACTED_DATA, url: 'https://example.com/mirror' },
      price: '',
      images: [],
      vendorId: null,
      retailerId: null,
      userId: 'u1',
    });

    const args = buildCommitProposalCaptureArgs({
      clientCaptureId: 'cc-789',
      product,
      productStatus: 'draft',
      styleIds: [],
      proposalId: null,
      scopeRoomId: null,
      ffeCategorySlug: null,
      rawPayload: {},
      thumbnailUrl: null,
    });

    // snake_case DB column names must not appear as top-level p_payload keys —
    // the RPC's envelope is documented (00516) as camelCase.
    expect(args.p_payload).not.toHaveProperty('source_url');
    expect(args.p_payload).not.toHaveProperty('price_retail');
    expect(args.p_payload).not.toHaveProperty('owner_user_id');
  });
});
