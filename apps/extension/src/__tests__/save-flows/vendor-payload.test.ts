import { describe, it, expect } from 'vitest';
import { buildVendorInsertPayload } from '../../lib/payloads';
import type { VendorCaptureInput } from '@patina/shared';

// Columns that exist on the `vendors` table (union of initial schema + 00009 + 00034)
const VENDORS_COLUMNS = new Set([
  // 00001 initial
  'id', 'name', 'website', 'description', 'contact_info', 'notes',
  'created_at', 'updated_at',
  // 00009 vendor management
  'logo_url', 'market_position', 'production_model', 'founded_year',
  'ownership', 'headquarters_city', 'headquarters_state',
  'parent_company_id', 'primary_category', 'secondary_categories',
  'designer_rating_avg', 'review_count', 'lead_times',
  // 00034 vendor extended fields
  'hero_image_url', 'social_links', 'brand_story', 'made_in',
]);

// Columns that should NEVER be sent (known past bugs)
const FORBIDDEN_COLUMNS = [
  'ownership_type',   // wrong name — the column is `ownership`
  'certifications',   // vendor certifications removed from the capture path (CL-R16)
];

describe('buildVendorInsertPayload', () => {
  const fullInput: VendorCaptureInput = {
    name: 'Restoration Hardware',
    website: 'https://rh.com',
    logoUrl: 'https://rh.com/logo.png',
    heroImageUrl: 'https://rh.com/hero.jpg',
    marketPosition: 'luxury',
    productionModel: 'mixed',
    primaryCategory: 'Furniture',
    contactEmail: 'trade@rh.com',
    contactPhone: '555-0100',
    instagram: 'https://instagram.com/restorationhardware',
    pinterest: 'https://pinterest.com/rh',
    facebook: 'https://facebook.com/rh',
    foundedYear: 1980,
    headquartersCity: 'Corte Madera',
    headquartersState: 'CA',
    story: { mission: 'Luxury living.', philosophy: null, history: null, craftsmanship: null },
    certifications: ['fsc', 'greenguard'],
    ownershipType: 'public',
    madeIn: 'USA',
    notes: 'Trade program available',
  };

  it('only includes columns that exist on the vendors table', () => {
    const payload = buildVendorInsertPayload(fullInput);
    const keys = Object.keys(payload);

    for (const key of keys) {
      expect(VENDORS_COLUMNS.has(key), `"${key}" is not a column on the vendors table`).toBe(true);
    }
  });

  it('never sends forbidden columns', () => {
    const payload = buildVendorInsertPayload(fullInput);
    const keys = Object.keys(payload);

    for (const col of FORBIDDEN_COLUMNS) {
      expect(keys).not.toContain(col);
    }
  });

  it('maps ownershipType to the "ownership" column', () => {
    const payload = buildVendorInsertPayload(fullInput);
    expect(payload).toHaveProperty('ownership', 'public');
    expect(payload).not.toHaveProperty('ownership_type');
  });

  it('packs social links into a single JSONB column', () => {
    const payload = buildVendorInsertPayload(fullInput);
    expect(payload.social_links).toEqual({
      instagram: 'https://instagram.com/restorationhardware',
      pinterest: 'https://pinterest.com/rh',
      facebook: 'https://facebook.com/rh',
    });
  });

  it('stores brand_story as JSONB (not text)', () => {
    const payload = buildVendorInsertPayload(fullInput);
    expect(payload.brand_story).toEqual({
      mission: 'Luxury living.',
      philosophy: null,
      history: null,
      craftsmanship: null,
    });
  });

  it('handles minimal input gracefully', () => {
    const minimal: VendorCaptureInput = { name: 'Test', website: 'https://test.com' };
    const payload = buildVendorInsertPayload(minimal);

    expect(payload.name).toBe('Test');
    expect(payload.website).toBe('https://test.com');
    expect(payload.ownership).toBeNull();
    expect(payload.made_in).toBeNull();
    expect(payload.hero_image_url).toBeNull();
    expect(payload.social_links).toEqual({
      instagram: null,
      pinterest: null,
      facebook: null,
    });
  });
});
