import { describe, it, expect } from 'vitest';
import {
  buildCapturePayload,
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
