/**
 * The Library shelf's Field-provenance pass-through (Wave 1P, Task 5 Step 9).
 *
 * `library-shelf.tsx` builds the card's `item` prop FIELD BY FIELD, so widening
 * LayerProductRow and LibraryItem delivers nothing on its own — the shelf has to pass
 * capture_source / captured_at / venue_label through explicitly. The sibling suite
 * (library-card-provenance.test.tsx) renders LibraryCard with a hand-built item and
 * cannot see that wiring at all.
 *
 * This suite renders the SHELF, so the chip has to survive the real prop hand-off.
 */
import { render, screen } from '@testing-library/react';
import { LibraryShelf } from '../library-shelf';

interface Row {
  id: string;
  name: string;
  brand: string | null;
  images: string[] | null;
  source_url: string | null;
  category: string | null;
  layer: 'personal' | 'studio' | 'catalog';
  price_retail: number | null;
  configuration_mode: string | null;
  configuration_summary: unknown;
  capture_source: string | null;
  captured_at: string | null;
  field_capture_id: string | null;
}

let rows: Row[] = [];
let venueByCapture: Record<string, string> = {};
let capturedIdsArg: unknown = null;

jest.mock('@patina/supabase', () => ({
  useLayerProducts: () => ({ data: rows, isLoading: false, isError: false }),
  useCaptureVenueLabels: (ids: unknown) => {
    capturedIdsArg = ids;
    return { data: venueByCapture };
  },
  useStyleArchetypes: () => ({ data: [], isLoading: false }),
  useAssignStyle: () => ({ mutateAsync: jest.fn(), isPending: false }),
  useProductStyles: () => ({ data: [], isLoading: false }),
  useSubmitValidation: () => ({ mutateAsync: jest.fn(), isPending: false, variables: undefined }),
}));

jest.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(),
}));

function row(over: Partial<Row> = {}): Row {
  return {
    id: 'p-1',
    name: 'Bouclé lounge',
    brand: null,
    images: null,
    source_url: null,
    category: 'seating',
    layer: 'personal',
    price_retail: null,
    configuration_mode: null,
    configuration_summary: null,
    capture_source: null,
    captured_at: null,
    field_capture_id: null,
    ...over,
  };
}

function renderShelf() {
  return render(
    <LibraryShelf
      layer="personal"
      name="My Library"
      id="shelf-personal"
      labelledBy="shelf-personal-heading"
      teachingIds={new Set<string>()}
      onDeep={jest.fn()}
    />,
  );
}

beforeEach(() => {
  rows = [];
  venueByCapture = {};
  capturedIdsArg = null;
});

describe('LibraryShelf — the Field provenance pass-through', () => {
  it('carries capture_source, captured_at AND the resolved venue through to the card', () => {
    rows = [
      row({
        capture_source: 'field_capture',
        captured_at: '2026-03-14T09:00:00Z',
        field_capture_id: 'cap-1',
      }),
    ];
    venueByCapture = { 'cap-1': 'High Point' };

    renderShelf();

    expect(screen.getByText('Field · High Point, Mar 2026')).toBeInTheDocument();
  });

  it('degrades to the month alone when the venue query has not resolved that capture', () => {
    rows = [
      row({
        capture_source: 'field_capture',
        captured_at: '2026-03-14T09:00:00Z',
        field_capture_id: 'cap-1',
      }),
    ];
    venueByCapture = {};

    renderShelf();

    expect(screen.getByText('Field · Mar 2026')).toBeInTheDocument();
  });

  it('asks the venue hook for exactly the capture ids on the shelf', () => {
    rows = [
      row({ id: 'p-1', capture_source: 'field_capture', field_capture_id: 'cap-1' }),
      row({ id: 'p-2', capture_source: 'web_extension', field_capture_id: null }),
    ];

    renderShelf();

    expect(capturedIdsArg).toEqual(['cap-1', null]);
  });

  it('shows no chip for a piece that did not come from Field', () => {
    rows = [
      row({
        capture_source: 'web_extension',
        captured_at: '2026-03-14T09:00:00Z',
        field_capture_id: null,
      }),
    ];

    renderShelf();

    expect(screen.queryByText(/^Field/)).toBeNull();
  });
});
