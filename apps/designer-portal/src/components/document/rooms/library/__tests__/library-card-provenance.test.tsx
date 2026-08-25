import { render } from '@testing-library/react';
import { fieldProvenanceLabel, LibraryCard } from '../library-card';

jest.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(),
}));

jest.mock('@patina/supabase', () => ({
  useStyleArchetypes: () => ({ data: [], isLoading: false }),
  useAssignStyle: () => ({ mutateAsync: jest.fn(), isPending: false }),
  useProductStyles: () => ({ data: [], isLoading: false }),
  useSubmitValidation: () => ({ mutateAsync: jest.fn(), isPending: false, variables: undefined }),
}));

describe('fieldProvenanceLabel', () => {
  it('names Field, the place and the month for a piece minted from a field capture', () => {
    expect(
      fieldProvenanceLabel({
        capture_source: 'field_capture',
        captured_at: '2026-03-14T09:00:00Z',
        venue_label: 'High Point',
      }),
    ).toBe('Field · High Point, Mar 2026');
  });

  it('drops the place when the capture carried no venue', () => {
    expect(
      fieldProvenanceLabel({
        capture_source: 'field_capture',
        captured_at: '2026-03-14T09:00:00Z',
        venue_label: null,
      }),
    ).toBe('Field · Mar 2026');
  });

  it('still says Field when the capture date is missing', () => {
    expect(
      fieldProvenanceLabel({ capture_source: 'field_capture', captured_at: null, venue_label: null }),
    ).toBe('Field');
  });

  it('falls back to bare Field for an unparseable stamp', () => {
    expect(
      fieldProvenanceLabel({
        capture_source: 'field_capture',
        captured_at: 'not-a-date',
        venue_label: null,
      }),
    ).toBe('Field');
  });

  it('says nothing for every other origin', () => {
    for (const source of ['web_extension', 'portal', 'manual', 'import', null, undefined, '']) {
      expect(
        fieldProvenanceLabel({
          capture_source: source as string | null,
          captured_at: '2026-03-14T09:00:00Z',
          venue_label: 'High Point',
        }),
      ).toBeNull();
    }
  });
});

describe('LibraryCard — the chip actually renders', () => {
  const base = {
    id: 'p-1',
    name: 'Bouclé lounge',
    brand: null,
    images: null,
    source_url: null,
    category: 'seating',
    layer: 'personal' as const,
  };

  it('shows the chip on a field-captured piece', () => {
    const { getByText } = render(
      <LibraryCard
        item={{
          ...base,
          capture_source: 'field_capture',
          captured_at: '2026-03-14T09:00:00Z',
          venue_label: 'High Point',
        }}
        needsTeaching={false}
        onDeep={jest.fn()}
      />,
    );
    expect(getByText('Field · High Point, Mar 2026')).toBeInTheDocument();
  });

  it('shows no chip on an extension-captured piece', () => {
    const { queryByText } = render(
      <LibraryCard
        item={{ ...base, capture_source: 'web_extension', captured_at: '2026-03-14T09:00:00Z' }}
        needsTeaching={false}
        onDeep={jest.fn()}
      />,
    );
    expect(queryByText(/^Field/)).toBeNull();
  });
});
