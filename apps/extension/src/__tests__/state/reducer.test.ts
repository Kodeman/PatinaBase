import { describe, it, expect } from 'vitest';
import { captureReducer, initialCaptureState } from '../../state/reducer';
import type { CaptureState } from '../../state/types';
import type { ExtractedProductData } from '@patina/shared';

function extraction(
  overrides: Partial<ExtractedProductData> = {}
): ExtractedProductData {
  return {
    productName: 'Test Chair',
    description: null,
    price: { value: 10000, currency: 'USD', raw: '$100' },
    dimensions: null,
    materials: [],
    colors: null,
    finish: null,
    availableColors: null,
    images: [{ url: 'https://x/a.jpg', score: 90, width: 1, height: 1, alt: '' }],
    manufacturer: null,
    url: 'https://shop.example/p/1',
    extractedAt: '2026-06-29T00:00:00Z',
    confidence: 'high',
    ...overrides,
  } as unknown as ExtractedProductData;
}

const fakeUser = { id: 'u1', email: 'a@b.com' } as unknown as CaptureState['session']['user'];

function captured(): CaptureState {
  let s = initialCaptureState();
  s = captureReducer(s, { type: 'SESSION_RESOLVED', user: fakeUser });
  s = captureReducer(s, { type: 'EXTRACTION_START', url: 'https://shop.example/p/1', entry: 'toolbar' });
  s = captureReducer(s, { type: 'EXTRACTION_SUCCESS', data: extraction() });
  return s;
}

describe('captureReducer — nav', () => {
  it('starts on boot, checking session', () => {
    const s = initialCaptureState();
    expect(s.nav.screen).toBe('boot');
    expect(s.session.status).toBe('checking');
  });

  it('NAV moves the base screen', () => {
    const s = captureReducer(initialCaptureState(), { type: 'NAV', screen: 'R5' });
    expect(s.nav.screen).toBe('R5');
  });

  it('OPEN_OVERLAY records the return-to base screen', () => {
    const s = captureReducer(captured(), { type: 'OPEN_OVERLAY', overlay: 'C5' });
    expect(s.nav.screen).toBe('C2');
    expect(s.nav.overlay).toBe('C5');
    expect(s.nav.returnTo).toBe('C2');
  });

  it('CLOSE_OVERLAY pops back to the base screen', () => {
    let s = captureReducer(captured(), { type: 'OPEN_OVERLAY', overlay: 'C5' });
    s = captureReducer(s, { type: 'CLOSE_OVERLAY' });
    expect(s.nav.overlay).toBeNull();
    expect(s.nav.screen).toBe('C2');
  });
});

describe('captureReducer — session', () => {
  it('SESSION_RESOLVED with a user becomes signed-in and arms capture', () => {
    const s = captureReducer(initialCaptureState(), { type: 'SESSION_RESOLVED', user: fakeUser });
    expect(s.session.status).toBe('signed-in');
    expect(s.session.user).toBe(fakeUser);
    expect(s.nav.screen).toBe('C1');
  });

  it('SESSION_RESOLVED with null shows the signed-out screen', () => {
    const s = captureReducer(initialCaptureState(), { type: 'SESSION_RESOLVED', user: null });
    expect(s.session.status).toBe('signed-out');
    expect(s.nav.screen).toBe('signedOut');
  });

  it('SIGNED_OUT clears the draft and returns to signed-out', () => {
    let s = captured();
    s = captureReducer(s, { type: 'SIGNED_OUT' });
    expect(s.session.status).toBe('signed-out');
    expect(s.nav.screen).toBe('signedOut');
    expect(s.draft).toBeNull();
  });
});

describe('captureReducer — extraction lifecycle', () => {
  it('EXTRACTION_START enters C1 and marks extracting', () => {
    let s = captureReducer(initialCaptureState(), { type: 'SESSION_RESOLVED', user: fakeUser });
    s = captureReducer(s, { type: 'EXTRACTION_START', url: 'https://x', entry: 'shortcut' });
    expect(s.nav.screen).toBe('C1');
    expect(s.io.isExtracting).toBe(true);
    expect(s.nav.entry).toBe('shortcut');
  });

  it('EXTRACTION_SUCCESS builds the draft and lands on C2', () => {
    const s = captured();
    expect(s.io.isExtracting).toBe(false);
    expect(s.nav.screen).toBe('C2');
    expect(s.draft?.fields.name.value).toBe('Test Chair');
  });

  it('EXTRACTION_PARTIAL forces named fields to missing', () => {
    let s = captureReducer(initialCaptureState(), { type: 'SESSION_RESOLVED', user: fakeUser });
    s = captureReducer(s, { type: 'EXTRACTION_START', url: 'https://x', entry: 'toolbar' });
    s = captureReducer(s, {
      type: 'EXTRACTION_PARTIAL',
      data: extraction(),
      missing: ['price', 'description'],
    });
    expect(s.nav.screen).toBe('C2');
    expect(s.draft?.fields.price.status).toBe('missing');
    expect(s.draft?.fields.description.status).toBe('missing');
    expect(s.draft?.fields.name.status).toBe('extracted');
  });

  it('EXTRACTION_BLOCKED routes to R2 with the snapshot url', () => {
    let s = captureReducer(initialCaptureState(), { type: 'SESSION_RESOLVED', user: fakeUser });
    s = captureReducer(s, { type: 'EXTRACTION_BLOCKED', snapshotUrl: 'data:image/jpeg;base64,xx' });
    expect(s.nav.screen).toBe('R2');
    expect(s.io.isExtracting).toBe(false);
  });

  it('MANUAL_START seeds a blank draft on C2 for hand entry', () => {
    let s = captureReducer(initialCaptureState(), { type: 'SESSION_RESOLVED', user: fakeUser });
    s = captureReducer(s, { type: 'MANUAL_START', url: 'https://x/p' });
    expect(s.nav.screen).toBe('C2');
    expect(s.draft?.captureKind).toBe('unknown');
    expect(s.draft?.sourceUrl).toBe('https://x/p');
    expect(s.draft?.fields.name.status).toBe('missing');
    expect(s.draft?.images.all).toEqual([]);
  });

  it('SNAPSHOT_CAPTURED seeds a snapshot draft with the uploaded image', () => {
    let s = captureReducer(initialCaptureState(), { type: 'SESSION_RESOLVED', user: fakeUser });
    s = captureReducer(s, {
      type: 'SNAPSHOT_CAPTURED',
      sourceUrl: 'https://x/p',
      imageUrl: 'https://cdn/snap.jpg',
    });
    expect(s.nav.screen).toBe('C2');
    expect(s.draft?.captureKind).toBe('snapshot');
    expect(s.draft?.snapshotUrl).toBe('https://cdn/snap.jpg');
    expect(s.draft?.images.all).toHaveLength(1);
    expect(s.draft?.images.selected).toEqual([0]);
  });

  it('IMAGE_CAPTURED seeds an image draft (OCR-eligible)', () => {
    let s = captureReducer(initialCaptureState(), { type: 'SESSION_RESOLVED', user: fakeUser });
    s = captureReducer(s, { type: 'IMAGE_CAPTURED', sourceUrl: 'https://x/p', imageUrl: 'https://cdn/i.jpg' });
    expect(s.nav.screen).toBe('C2');
    expect(s.draft?.captureKind).toBe('image');
    expect(s.draft?.snapshotUrl).toBeNull();
    expect(s.draft?.images.all[0]?.url).toBe('https://cdn/i.jpg');
  });

  it('EXTRACTION_UNKNOWN routes to R4, EXTRACTION_ERROR routes to R5', () => {
    const base = captureReducer(initialCaptureState(), { type: 'SESSION_RESOLVED', user: fakeUser });
    expect(captureReducer(base, { type: 'EXTRACTION_UNKNOWN' }).nav.screen).toBe('R4');
    const err = captureReducer(base, { type: 'EXTRACTION_ERROR', error: 'timeout' });
    expect(err.nav.screen).toBe('R5');
    expect(err.io.error).toBe('timeout');
  });
});

describe('captureReducer — draft editing', () => {
  it('FIELD_EDIT updates value and marks the field edited', () => {
    let s = captured();
    s = captureReducer(s, { type: 'FIELD_EDIT', field: 'name', value: 'Renamed' });
    expect(s.draft?.fields.name.value).toBe('Renamed');
    expect(s.draft?.fields.name.status).toBe('edited');
  });

  it('FIELD_REVERT restores the original extracted value', () => {
    let s = captured();
    s = captureReducer(s, { type: 'FIELD_EDIT', field: 'name', value: 'Renamed' });
    s = captureReducer(s, { type: 'FIELD_REVERT', field: 'name' });
    expect(s.draft?.fields.name.value).toBe('Test Chair');
    expect(s.draft?.fields.name.status).toBe('extracted');
  });
});

describe('captureReducer — save + dedup', () => {
  it('SAVE_START marks saving; SAVE_SUCCESS(library) lands on S4', () => {
    let s = captured();
    s = captureReducer(s, { type: 'SAVE_START', target: 'library' });
    expect(s.io.isSaving).toBe(true);
    s = captureReducer(s, { type: 'SAVE_SUCCESS', productId: 'p1', landed: 'library' });
    expect(s.io.isSaving).toBe(false);
    expect(s.nav.screen).toBe('S4');
    expect(s.io.lastSavedProductId).toBe('p1');
  });

  it('SAVE_SUCCESS(inbox) lands on S5', () => {
    let s = captured();
    s = captureReducer(s, { type: 'SAVE_SUCCESS', productId: 'p1', landed: 'inbox' });
    expect(s.nav.screen).toBe('S5');
  });

  it('CAPTURE_NEXT resets the draft and re-arms on C1', () => {
    let s = captured();
    s = captureReducer(s, { type: 'SAVE_SUCCESS', productId: 'p1', landed: 'library' });
    s = captureReducer(s, { type: 'CAPTURE_NEXT' });
    expect(s.draft).toBeNull();
    expect(s.nav.screen).toBe('C1');
    expect(s.io.error).toBeNull();
  });

  it('DUPLICATE_FOUND stores the match and routes to D1', () => {
    let s = captured();
    s = captureReducer(s, {
      type: 'DUPLICATE_FOUND',
      match: { id: 'p9', name: 'Test Chair', imageUrl: null, priceRetail: 10000, capturedAt: null },
      confidence: 0.82,
    });
    expect(s.nav.screen).toBe('D1');
    expect(s.dedup.match?.id).toBe('p9');
    expect(s.dedup.confidence).toBeCloseTo(0.82);
  });

  it('does not mutate the previous state (pure reducer)', () => {
    const s0 = captured();
    const before = s0.nav.screen;
    captureReducer(s0, { type: 'NAV', screen: 'R5' });
    expect(s0.nav.screen).toBe(before);
  });
});
