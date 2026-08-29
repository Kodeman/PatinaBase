/**
 * CL-R1 fix pass: proves the RecordRegion edits (dimensions/materials/finish)
 * actually round-trip through draftToProductPayload → buildProductInsertPayload
 * into the shape the Supabase insert expects, and that FIELD_EDIT marks the
 * dimensions field 'edited' at the reducer level.
 *
 * state/draft.ts and lib/payloads.ts are read-only imports here — lane D9 owns
 * state/draft.ts and state/draft.test.ts; this file only exercises them.
 */
import { describe, it, expect } from 'vitest';

import { buildProductInsertPayload } from '../../lib/payloads';
import { draftToProductPayload, emptyDraft } from '../../state/draft';
import { captureReducer, initialCaptureState } from '../../state/reducer';
import type { DraftSlice } from '../../state/types';

describe('record edits round-trip into the product insert payload', () => {
  it('carries an edited width/materials/finish through to the insert row', () => {
    const base = emptyDraft('https://example.com/product');
    const draft: DraftSlice = {
      ...base,
      fields: {
        ...base.fields,
        dimensions: {
          value: { ...base.fields.dimensions.value, width: '40' },
          status: 'edited',
          source: 'user',
        },
        materials: { value: ['Oak'], status: 'edited', source: 'user' },
        finish: { value: 'Walnut', status: 'edited', source: 'user' },
      },
    };

    const row = buildProductInsertPayload(draftToProductPayload(draft, 'u'));

    expect(row.dimensions).not.toBeNull();
    expect(row.dimensions!.width).toBe(40);
    expect(typeof row.dimensions!.width).toBe('number');
    expect(row.dimensions!.unit).toBe('in');
    expect(row.materials).toEqual(['Oak']);
    expect(row.finish).toBe('Walnut');
  });

  it('reports null dimensions once every dimension field is cleared back to empty', () => {
    const base = emptyDraft('https://example.com/product');
    // Start from a populated width (as if the person had typed one), then
    // clear it — the same sequence the sticky-disclosure fix protects in
    // the UI. The payload should treat this identically to "never entered".
    const populated: DraftSlice = {
      ...base,
      fields: {
        ...base.fields,
        dimensions: {
          value: { ...base.fields.dimensions.value, width: '40' },
          status: 'edited',
          source: 'user',
        },
      },
    };
    const cleared: DraftSlice = {
      ...populated,
      fields: {
        ...populated.fields,
        dimensions: {
          value: { ...populated.fields.dimensions.value, width: '' },
          status: 'edited',
          source: 'user',
        },
      },
    };

    const row = buildProductInsertPayload(draftToProductPayload(cleared, 'u'));

    expect(row.dimensions).toBeNull();
  });
});

describe('captureReducer — FIELD_EDIT on dimensions', () => {
  it('marks the dimensions field edited', () => {
    const state = initialCaptureState();
    state.draft = emptyDraft('https://example.com/product');

    const next = captureReducer(state, {
      type: 'FIELD_EDIT',
      field: 'dimensions',
      value: { ...state.draft.fields.dimensions.value, width: '40' },
    });

    expect(next.draft?.fields.dimensions.status).toBe('edited');
    expect(next.draft?.fields.dimensions.source).toBe('user');
    expect(next.draft?.fields.dimensions.value.width).toBe('40');
  });
});
