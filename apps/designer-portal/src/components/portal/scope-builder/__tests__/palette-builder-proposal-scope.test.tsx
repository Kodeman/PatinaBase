import { render, screen } from '@testing-library/react';
import { PaletteBuilder } from '../palette-builder';

const paletteRows = {
  'proposal-a': [
    { id: 'palette-a', name: 'Alpha palette', is_primary: true, swatches: [] },
  ],
  'proposal-b': [
    { id: 'palette-b', name: 'Beta palette', is_primary: true, swatches: [] },
  ],
};

const mutation = {
  mutate: jest.fn(),
  mutateAsync: jest.fn(),
  isPending: false,
};
const usePaletteMock = jest.fn((paletteId: string | null) => ({
  data:
    Object.values(paletteRows)
      .flat()
      .find((palette) => palette.id === paletteId) ?? null,
  error: null,
  refetch: jest.fn(),
}));

jest.mock('@patina/supabase', () => ({
  createBrowserClient: jest.fn(),
  usePalettes: (proposalId: keyof typeof paletteRows) => ({
    data: paletteRows[proposalId],
    isLoading: false,
    error: null,
    refetch: jest.fn(),
  }),
  usePalette: (paletteId: string | null) => usePaletteMock(paletteId),
  useSearchPaintColors: () => ({ data: [] }),
  useUpsertPalette: () => mutation,
  useUpsertSwatch: () => mutation,
  useDeletePalette: () => mutation,
  useReorderSwatches: () => mutation,
}));

jest.mock('@patina/design-system', () => ({
  ColorPicker: () => null,
  ImagePaletteExtractor: () => null,
  PaintColorPicker: () => null,
}));

jest.mock('@/components/ui/controls', () => ({
  Button: ({
    children,
    ...props
  }: React.ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button {...props}>{children}</button>
  ),
  IconButton: ({
    children,
    label,
    ...props
  }: React.ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) => (
    <button aria-label={label} {...props}>
      {children}
    </button>
  ),
  Select: () => null,
}));

jest.mock('../palette-swatch-editor', () => ({
  PaletteSwatchEditor: () => null,
}));

describe('PaletteBuilder proposal scoping', () => {
  beforeEach(() => usePaletteMock.mockClear());

  it('drops proposal A selection before rendering proposal B', () => {
    const { rerender } = render(<PaletteBuilder proposalId="proposal-a" />);
    expect(
      screen.getByRole('heading', { name: 'Alpha palette' }),
    ).toBeInTheDocument();

    rerender(<PaletteBuilder proposalId="proposal-b" />);

    expect(
      screen.getByRole('heading', { name: 'Beta palette' }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('heading', { name: 'Alpha palette' }),
    ).not.toBeInTheDocument();
    expect(usePaletteMock).toHaveBeenLastCalledWith('palette-b');
  });
});
