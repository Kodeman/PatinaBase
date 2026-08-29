/**
 * RecordRegion coverage for CL-R1 (dimensions/materials/finish visible + editable).
 *
 * Mounts RecordRegion directly under <CaptureProvider initial={...}>, the same
 * seam src/__tests__/state/CaptureProvider.test.tsx and
 * src/__tests__/panel/field-visibility.test.tsx use — no need to mock supabase
 * here since RecordRegion only reads useDraft()/useCaptureDispatch(), it
 * doesn't touch useReferenceData() like RouteCommitRegion does.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, within } from '@testing-library/react';

import { RecordRegion } from '../../panel/regions/RecordRegion';
import { CaptureProvider } from '../../state/CaptureProvider';
import { initialCaptureState } from '../../state/reducer';
import { emptyDraft } from '../../state/draft';
import type { DraftSlice } from '../../state/types';

afterEach(cleanup);

function draftWithRecordFields(): DraftSlice {
  const base = emptyDraft('https://example.com/product');
  return {
    ...base,
    fields: {
      ...base.fields,
      dimensions: {
        value: { ...base.fields.dimensions.value, width: '34', height: '30', depth: '32', unit: 'in' },
        status: 'extracted',
        source: 'extracted',
      },
      materials: { value: ['Oak', 'Leather'], status: 'extracted', source: 'extracted' },
      finish: { value: 'Walnut', status: 'extracted', source: 'extracted' },
    },
  };
}

function renderWithDraft(draft: DraftSlice) {
  const state = initialCaptureState();
  state.draft = draft;
  return render(
    <CaptureProvider initial={state}>
      <RecordRegion />
    </CaptureProvider>
  );
}

describe('RecordRegion — dimensions/materials/finish (CL-R1)', () => {
  it('renders all three rows with values when the draft has them', () => {
    renderWithDraft(draftWithRecordFields());

    expect((screen.getByLabelText('Width') as HTMLInputElement).value).toBe('34');
    expect((screen.getByLabelText('Height') as HTMLInputElement).value).toBe('30');
    expect((screen.getByLabelText('Depth') as HTMLInputElement).value).toBe('32');
    expect((screen.getByLabelText('Unit') as HTMLSelectElement).value).toBe('in');

    expect(screen.getByText('Oak')).toBeTruthy();
    expect(screen.getByText('Leather')).toBeTruthy();

    expect((screen.getByLabelText('Finish') as HTMLInputElement).value).toBe('Walnut');

    // Extra dimension fields stay behind the "More" disclosure until toggled.
    expect(screen.queryByLabelText('Seat height')).toBeNull();
    fireEvent.click(screen.getByText('More'));
    expect(screen.getByLabelText('Seat height')).toBeTruthy();
  });

  it('editing dimension width dispatches FIELD_EDIT and the input reflects the update', () => {
    renderWithDraft(draftWithRecordFields());

    const widthInput = screen.getByLabelText('Width') as HTMLInputElement;
    fireEvent.change(widthInput, { target: { value: '40' } });

    expect((screen.getByLabelText('Width') as HTMLInputElement).value).toBe('40');
    // Other dims untouched.
    expect((screen.getByLabelText('Height') as HTMLInputElement).value).toBe('30');
  });

  it('materials × removes a material via FIELD_EDIT', () => {
    renderWithDraft(draftWithRecordFields());

    expect(screen.getByText('Oak')).toBeTruthy();
    fireEvent.click(screen.getByLabelText('Remove Oak'));

    expect(screen.queryByText('Oak')).toBeNull();
    expect(screen.getByText('Leather')).toBeTruthy();
  });

  it('an inline "Add a material" input adds a new material on Enter', () => {
    renderWithDraft(draftWithRecordFields());

    const input = screen.getByLabelText('Add a material') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'Brass' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    expect(screen.getByText('Brass')).toBeTruthy();
    expect((screen.getByLabelText('Add a material') as HTMLInputElement).value).toBe('');
  });

  it('shows "+ Add …" buttons and hides inputs when dimensions/materials/finish are missing', () => {
    renderWithDraft(emptyDraft('https://example.com/product'));

    expect(screen.getByText('+ Add dimensions')).toBeTruthy();
    expect(screen.queryByLabelText('Width')).toBeNull();

    expect(screen.getByText('+ Add materials')).toBeTruthy();
    expect(screen.queryByLabelText('Add a material')).toBeNull();

    expect(screen.getByText('+ Add finish')).toBeTruthy();
    expect(screen.queryByLabelText('Finish')).toBeNull();
  });

  it('clicking "+ Add dimensions" reveals the width/height/depth inputs', () => {
    renderWithDraft(emptyDraft('https://example.com/product'));

    fireEvent.click(screen.getByText('+ Add dimensions'));

    expect(screen.getByLabelText('Width')).toBeTruthy();
    expect(screen.getByLabelText('Height')).toBeTruthy();
    expect(screen.getByLabelText('Depth')).toBeTruthy();
  });

  it('shows "needs check" badges scoped to the three new rows when missing', () => {
    renderWithDraft(emptyDraft('https://example.com/product'));

    const dimensionsHeader = screen.getByText('Dimensions').closest('div') as HTMLElement;
    const materialsHeader = screen.getByText('Materials').closest('div') as HTMLElement;
    const finishHeader = screen.getByText('Finish').closest('div') as HTMLElement;

    expect(within(dimensionsHeader).getByText('needs check')).toBeTruthy();
    expect(within(materialsHeader).getByText('needs check')).toBeTruthy();
    expect(within(finishHeader).getByText('needs check')).toBeTruthy();
  });

  // ── Sticky disclosure regression (fix pass) ───────────────────────────────
  // Clearing a value (or removing the last chip) must never unmount the input
  // being actively edited — the row stays open once opened.

  it('clearing the only dimension value keeps the Width input mounted', () => {
    const base = emptyDraft('https://example.com/product');
    const draft: DraftSlice = {
      ...base,
      fields: {
        ...base.fields,
        dimensions: {
          value: { ...base.fields.dimensions.value, width: '34' },
          status: 'extracted',
          source: 'extracted',
        },
      },
    };
    renderWithDraft(draft);

    const widthInput = screen.getByLabelText('Width') as HTMLInputElement;
    fireEvent.change(widthInput, { target: { value: '' } });

    expect(screen.getByLabelText('Width')).toBeTruthy();
    expect((screen.getByLabelText('Width') as HTMLInputElement).value).toBe('');
  });

  it('removing the last material keeps the "Add a material" input mounted', () => {
    const base = draftWithRecordFields();
    const draft: DraftSlice = {
      ...base,
      fields: {
        ...base.fields,
        materials: { value: ['Oak'], status: 'extracted', source: 'extracted' },
      },
    };
    renderWithDraft(draft);

    fireEvent.click(screen.getByLabelText('Remove Oak'));

    expect(screen.queryByText('Oak')).toBeNull();
    expect(screen.getByLabelText('Add a material')).toBeTruthy();
  });

  it('clearing the finish value keeps the Finish input mounted', () => {
    renderWithDraft(draftWithRecordFields());

    const finishInput = screen.getByLabelText('Finish') as HTMLInputElement;
    fireEvent.change(finishInput, { target: { value: '' } });

    expect(screen.getByLabelText('Finish')).toBeTruthy();
    expect((screen.getByLabelText('Finish') as HTMLInputElement).value).toBe('');
  });

  // ── "More (n)" disclosure ──────────────────────────────────────────────────

  it('auto-expands "More" when the draft already has populated extra dimension fields, and shows a count once collapsed', () => {
    const base = emptyDraft('https://example.com/product');
    const draft: DraftSlice = {
      ...base,
      fields: {
        ...base.fields,
        dimensions: {
          value: { ...base.fields.dimensions.value, seatHeight: '18', armHeight: '24' },
          status: 'extracted',
          source: 'extracted',
        },
      },
    };
    renderWithDraft(draft);

    // Auto-expanded at mount — no click needed to see the populated extras.
    expect(screen.getByLabelText('Seat height')).toBeTruthy();
    expect(screen.getByText('Less')).toBeTruthy();

    fireEvent.click(screen.getByText('Less'));

    expect(screen.queryByLabelText('Seat height')).toBeNull();
    expect(screen.getByText('More (2)')).toBeTruthy();
  });

  // ── SKU / model # (CL-R1) ─────────────────────────────────────────────────

  it('renders the SKU row with its value and edits it via FIELD_EDIT', () => {
    const base = emptyDraft('https://example.com/product');
    const draft: DraftSlice = {
      ...base,
      fields: { ...base.fields, sku: { value: 'H4614', status: 'extracted', source: 'extracted' } },
    };
    renderWithDraft(draft);

    const skuInput = screen.getByLabelText('SKU / model #') as HTMLInputElement;
    expect(skuInput.value).toBe('H4614');
    expect(skuInput.className).toContain('font-mono');

    fireEvent.change(skuInput, { target: { value: 'H4614-B' } });
    expect((screen.getByLabelText('SKU / model #') as HTMLInputElement).value).toBe('H4614-B');
  });

  it('offers "+ Add SKU" when missing, and the input stays mounted once cleared', () => {
    renderWithDraft(emptyDraft('https://example.com/product'));

    expect(screen.queryByLabelText('SKU / model #')).toBeNull();
    fireEvent.click(screen.getByText('+ Add SKU'));

    const skuInput = screen.getByLabelText('SKU / model #') as HTMLInputElement;
    fireEvent.change(skuInput, { target: { value: 'X' } });
    fireEvent.change(screen.getByLabelText('SKU / model #'), { target: { value: '' } });

    expect(screen.getByLabelText('SKU / model #')).toBeTruthy();
  });

  // ── Currency glyph (CL-R13) ───────────────────────────────────────────────

  it('shows $ and no ISO code for a USD draft', () => {
    renderWithDraft(emptyDraft('https://example.com/product'));

    expect(screen.getByText('$')).toBeTruthy();
    expect(screen.getByText('Price')).toBeTruthy();
    expect(screen.queryByText('USD')).toBeNull();
  });

  it('shows £ and the ISO code beside the label for a GBP draft', () => {
    const draft: DraftSlice = { ...emptyDraft('https://example.com/product'), currency: 'GBP' };
    renderWithDraft(draft);

    expect(screen.getByText('£')).toBeTruthy();
    expect(screen.queryByText('$')).toBeNull();
    expect(screen.getByText('GBP')).toBeTruthy();
  });

  it('falls back to the ISO code as the glyph for a currency with no symbol', () => {
    const draft: DraftSlice = { ...emptyDraft('https://example.com/product'), currency: 'SEK' };
    renderWithDraft(draft);

    const glyph = screen.getByPlaceholderText('0.00').previousElementSibling as HTMLElement;
    expect(glyph.textContent).toBe('SEK ');
  });

  it('duplicate materials (case-insensitive) are ignored on add', () => {
    renderWithDraft(draftWithRecordFields());

    const input = screen.getByLabelText('Add a material') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'oak' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    expect(screen.getAllByText('Oak')).toHaveLength(1);
    expect((screen.getByLabelText('Add a material') as HTMLInputElement).value).toBe('');
  });
});
