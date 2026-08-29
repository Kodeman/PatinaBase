import { describe, it, expect, afterEach } from 'vitest';
import {
  productRow,
  captureInput,
  decisionInput,
  decisionOptionInput,
  classifySaveError,
  deriveRetryKind,
} from '../../state/effects';
import { draftFromExtraction } from '../../state/draft';
import { initialCaptureState } from '../../state/reducer';
import type { ExtractedProductData } from '@patina/shared';

function extraction(overrides: Partial<ExtractedProductData> = {}): ExtractedProductData {
  return {
    productName: 'Test Chair',
    description: 'desc',
    price: { value: 129900, currency: 'USD', raw: '$1,299' },
    dimensions: null,
    materials: ['Oak'],
    colors: null,
    finish: null,
    availableColors: null,
    images: [
      { url: 'https://x/a.jpg', score: 90, width: 1, height: 1, alt: '' },
      { url: 'https://x/b.jpg', score: 80, width: 1, height: 1, alt: '' },
    ],
    manufacturer: null,
    url: 'https://shop.example/p/1',
    extractedAt: '2026-06-29T00:00:00Z',
    confidence: 'high',
    ...overrides,
  } as unknown as ExtractedProductData;
}

const routing = () => initialCaptureState().routing;

describe('productRow', () => {
  it('stamps the requested status + owner and converts price to cents', () => {
    const row = productRow(draftFromExtraction(extraction()), 'user-1', 'published');
    expect(row.status).toBe('published');
    expect(row.price_retail).toBe(129900);
    expect(row.owner_user_id).toBe('user-1');
    expect(row.layer).toBe('personal');
  });

  it('supports the draft (inbox) status', () => {
    const row = productRow(draftFromExtraction(extraction()), 'user-1', 'draft');
    expect(row.status).toBe('draft');
  });

  it('orders selected images first', () => {
    const draft = draftFromExtraction(extraction());
    draft.images.selected = [1, 0];
    const row = productRow(draft, 'user-1', 'published');
    expect(row.images).toEqual(['https://x/b.jpg', 'https://x/a.jpg']);
  });
});

describe('captureInput', () => {
  it('threads inbox routing + thumbnail into the capture payload input', () => {
    const draft = draftFromExtraction(extraction());
    const r = {
      ...routing(),
      proposalId: 'prop-1',
      scopeRoomId: 'room-1',
      ffeCategorySlug: 'seating',
    };
    const input = captureInput(draft, r, 'designer-1', 'prod-1');
    expect(input.designerId).toBe('designer-1');
    expect(input.productId).toBe('prod-1');
    expect(input.proposalId).toBe('prop-1');
    expect(input.ffeCategorySlug).toBe('seating');
    expect(input.thumbnailUrl).toBe('https://x/a.jpg');
    expect(input.sourceUrl).toBe('https://shop.example/p/1');
  });
});

describe('decisionInput', () => {
  it('falls back to an "Approve: <name>" title and sends immediately', () => {
    const draft = draftFromExtraction(extraction());
    const r = {
      ...routing(),
      decision: { ...routing().decision, designerClientId: 'dc-1', title: '' },
    };
    const input = decisionInput(draft, r);
    expect(input.designerClientId).toBe('dc-1');
    expect(input.title).toBe('Approve: Test Chair');
    expect(input.status).toBe('pending');
  });

  it('keeps an explicit decision title', () => {
    const draft = draftFromExtraction(extraction());
    const r = {
      ...routing(),
      decision: {
        ...routing().decision,
        designerClientId: 'dc-1',
        title: 'Pick a chair',
      },
    };
    expect(decisionInput(draft, r).title).toBe('Pick a chair');
  });
});

describe('decisionOptionInput', () => {
  it('links the option to the product with the first image + price', () => {
    const draft = draftFromExtraction(extraction());
    const input = decisionOptionInput(draft, 'dec-1', 'prod-1');
    expect(input.decisionId).toBe('dec-1');
    expect(input.productId).toBe('prod-1');
    expect(input.imageUrl).toBe('https://x/a.jpg');
    expect(input.priceCents).toBe(129900);
  });
});

describe('classifySaveError (CL W3-E10)', () => {
  const originalOnLine = navigator.onLine;
  afterEach(() => {
    Object.defineProperty(navigator, 'onLine', {
      value: originalOnLine,
      configurable: true,
    });
  });

  it('classifies the real postgrest-js failed-fetch shape as offline even when navigator.onLine is true', () => {
    Object.defineProperty(navigator, 'onLine', {
      value: true,
      configurable: true,
    });
    // What supabase-js/postgrest-js actually throws for a network failure —
    // a plain object, not an Error, message wrapping the original TypeError.
    const { errorClass, message } = classifySaveError({
      message: 'TypeError: Failed to fetch',
      details: '',
      hint: '',
      code: '',
    });
    expect(errorClass).toBe('offline');
    expect(message).toBe("You're offline — your draft is kept. Retry when you're back.");
  });

  it('classifies an Error with a network-ish message as offline', () => {
    Object.defineProperty(navigator, 'onLine', {
      value: true,
      configurable: true,
    });
    expect(
      classifySaveError(new Error('NetworkError when attempting to fetch resource')).errorClass
    ).toBe('offline');
    expect(classifySaveError(new TypeError('Load failed')).errorClass).toBe('offline');
  });

  it('classifies any error as offline when navigator.onLine is false', () => {
    Object.defineProperty(navigator, 'onLine', {
      value: false,
      configurable: true,
    });
    const { errorClass } = classifySaveError(new Error('some other failure'));
    expect(errorClass).toBe('offline');
  });

  it('classifies a PGRST301 code as an expired session', () => {
    const { errorClass, message } = classifySaveError({ code: 'PGRST301' });
    expect(errorClass).toBe('auth');
    expect(message).toBe('Your session expired — sign in to finish saving.');
  });

  it('classifies a 401 status as an expired session', () => {
    const { errorClass } = classifySaveError({ status: 401 });
    expect(errorClass).toBe('auth');
  });

  it('classifies everything else as a server error carrying the formatted message', () => {
    const { errorClass, message } = classifySaveError({
      code: 'P0001',
      message: 'slot conflict',
    });
    expect(errorClass).toBe('server');
    expect(message).toBe('[P0001] slot conflict');
  });
});

describe('deriveRetryKind (CL W3-E10)', () => {
  const routing = () => initialCaptureState().routing;

  it('retries the pending placement when one is preserved', () => {
    const r = {
      ...routing(),
      specBookPlacement: {
        kind: 'fill_slot',
        projectId: 'p',
        roomId: null,
        slotId: 's',
      } as never,
    };
    expect(deriveRetryKind(r, false, 'prod-1')).toBe('reuse');
  });

  it('retries inbox when that was the commit target', () => {
    const r = { ...routing(), commitTarget: 'inbox' as const };
    expect(deriveRetryKind(r, false, null)).toBe('inbox');
  });

  it('retries update when a dedup match exists with no project placement', () => {
    expect(deriveRetryKind(routing(), true, null)).toBe('update');
  });

  it('retries reuse when a dedup match exists with a project placement', () => {
    const r = {
      ...routing(),
      specBookPlacement: {
        kind: 'create_line',
        projectId: 'p',
        roomId: null,
      } as never,
    };
    expect(deriveRetryKind(r, true, null)).toBe('reuse');
  });

  it('falls back to library when nothing else applies', () => {
    expect(deriveRetryKind(routing(), false, null)).toBe('library');
  });

  it("prefers io.lastCommitKind over derivation — a declined merge stays 'save as new', never 'update'", () => {
    // A dedup match is showing (would otherwise derive 'update'), but the
    // user pressed "Save as new" — lastCommitKind carries that choice.
    expect(deriveRetryKind(routing(), true, null, 'library')).toBe('library');
  });

  it('still derives when lastCommitKind is null/undefined', () => {
    expect(deriveRetryKind(routing(), true, null, null)).toBe('update');
    expect(deriveRetryKind(routing(), true, null, undefined)).toBe('update');
  });
});
