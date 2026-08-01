import { fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { PaletteSwatchEditor } from './palette-swatch-editor';

const deleteSwatchMutate = jest.fn(
  (_variables: unknown, options?: { onSuccess?: () => void }) => {
    options?.onSuccess?.();
  },
);

jest.mock('@patina/supabase', () => ({
  useUpsertSwatch: () => ({ mutate: jest.fn(), isPending: false }),
  useDeleteSwatch: () => ({ mutate: deleteSwatchMutate, isPending: false }),
}));

describe('Palette drafting facet reconciliation', () => {
  beforeEach(() => {
    deleteSwatchMutate.mockClear();
    jest.spyOn(window, 'confirm').mockReturnValue(true);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('passes proposal identity to the canonical invalidating delete mutation', () => {
    const queryClient = new QueryClient();

    render(
      <QueryClientProvider client={queryClient}>
        <PaletteSwatchEditor
          proposalId="proposal-1"
          swatch={
            {
              id: 'swatch-1',
              palette_id: 'palette-1',
              hex: '#A8B5A6',
              name: 'Sage',
              role: 'wall',
              paint_color_id: null,
              brand: null,
              brand_code: null,
              source_pixel: null,
              sort_order: 0,
              created_at: '2026-07-31T12:00:00Z',
            } as never
          }
        />
      </QueryClientProvider>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Delete swatch' }));

    expect(deleteSwatchMutate).toHaveBeenCalledWith({
      proposalId: 'proposal-1',
      swatchId: 'swatch-1',
      paletteId: 'palette-1',
    });
  });
});
