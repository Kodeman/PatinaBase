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

  it('shows "needs check" badges for missing dimensions/materials/finish', () => {
    const { container } = renderWithDraft(emptyDraft('https://example.com/product'));
    const badges = within(container).getAllByText('needs check');
    // name, price, description, materials, colors, finish, dimensions all start missing
    // in emptyDraft() — assert at least the three CL-R1 fields are represented.
    expect(badges.length).toBeGreaterThanOrEqual(3);
  });
});
