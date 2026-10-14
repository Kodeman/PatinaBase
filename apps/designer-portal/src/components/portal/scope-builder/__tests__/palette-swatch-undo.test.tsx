/**
 * US-34 N15: with `optimistic-ink` on, swatch delete asks no confirm. An
 * in-flow Undo row takes focus and reads "Removing…", then "Removed" only on
 * the delete's receipt; the host keeps the row in place after the receipt drops
 * it from the palette. Undo restores only that swatch, so an edit to another
 * swatch made before the Undo survives it. Renders the real PaletteBuilder
 * host and editor. The data hooks are stand-ins over a real QueryClient: the
 * delete's receipt drops the row from the cached palette (as the refetch
 * does); the restore's own merge is proven in use-restore-swatch.test.ts.
 */
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { PaletteBuilder } from '../palette-builder';

type Deferred<T> = { resolve: (v: T) => void; reject: (e: Error) => void };
type Swatch = {
  id: string;
  palette_id: string;
  hex: string;
  name: string | null;
  role: string | null;
  paint_color_id: null;
  brand: null;
  brand_code: null;
  source_pixel: null;
  sort_order: number;
  created_at: string;
};
let mockDeletes: Deferred<void>[] = [];
let mockRestores: Array<{ swatch: Swatch } & Deferred<Swatch>> = [];
let mockInk = true;

jest.mock('@/hooks/use-feature-flag', () => ({
  useFeatureFlag: (key: string) => ({ value: key === 'optimistic-ink' ? mockInk : false, isLoading: false }),
}));

jest.mock('@patina/design-system', () => ({
  ColorPicker: () => null,
  ImagePaletteExtractor: () => null,
  PaintColorPicker: () => null,
}));

jest.mock('@patina/supabase', () => {
  const rq = jest.requireActual('@tanstack/react-query');
  const idle = { mutate: jest.fn(), mutateAsync: jest.fn(), isPending: false };
  const KEY = ['proposal-palette', 'palette-1'];
  type Pal = { swatches: Swatch[] };
  return {
    createBrowserClient: jest.fn(),
    usePalettes: () => ({
      data: [{ id: 'palette-1', proposal_id: 'proposal-1', name: 'Main palette', is_primary: true }],
      isLoading: false,
      error: null,
      refetch: jest.fn(),
    }),
    usePalette: (id: string | null) =>
      rq.useQuery({ queryKey: ['proposal-palette', id], queryFn: () => new Promise(() => {}), staleTime: Infinity }),
    useSearchPaintColors: () => ({ data: [] }),
    useUpsertPalette: () => idle,
    useDeletePalette: () => idle,
    useReorderSwatches: () => idle,
    useUpsertSwatch: () => idle,
    useDeleteSwatch: () => {
      const qc = rq.useQueryClient();
      return rq.useMutation({
        mutationFn: () => new Promise<void>((resolve, reject) => mockDeletes.push({ resolve, reject })),
        onSuccess: (_d: void, v: { swatchId: string }) =>
          qc.setQueryData(KEY, (p: Pal) => ({ ...p, swatches: p.swatches.filter((s) => s.id !== v.swatchId) })),
      });
    },
    useRestoreSwatch: () => {
      const qc = rq.useQueryClient();
      return rq.useMutation({
        mutationFn: (v: { swatch: Swatch }) =>
          new Promise<Swatch>((resolve, reject) => mockRestores.push({ swatch: v.swatch, resolve, reject })),
        onSuccess: (row: Swatch) =>
          qc.setQueryData(KEY, (p: Pal) => ({
            ...p,
            swatches: [...p.swatches, row].sort((a, b) => a.created_at.localeCompare(b.created_at)),
          })),
      });
    },
  };
});

const sw = (id: string, name: string, created_at: string): Swatch => ({
  id,
  palette_id: 'palette-1',
  hex: '#A8B5A6',
  name,
  role: null,
  paint_color_id: null,
  brand: null,
  brand_code: null,
  source_pixel: null,
  sort_order: 0,
  created_at,
});
const SAGE = sw('s-1', 'Sage', '2026-10-01T00:00:00Z');
const CLAY = sw('s-2', 'Clay', '2026-10-02T00:00:00Z');
const OAT = sw('s-3', 'Oat', '2026-10-03T00:00:00Z');

let client: QueryClient;
const renderBuilder = () => {
  client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  client.setQueryData(['proposal-palette', 'palette-1'], {
    id: 'palette-1',
    proposal_id: 'proposal-1',
    name: 'Main palette',
    is_primary: true,
    source_image_url: null,
    swatches: [SAGE, CLAY, OAT],
  });
  return render(
    <QueryClientProvider client={client}>
      <PaletteBuilder proposalId="proposal-1" />
    </QueryClientProvider>,
  );
};

const names = () => screen.getAllByPlaceholderText('Name (optional)').map((i) => (i as HTMLInputElement).value);
const deleteButtons = () => screen.getAllByRole('button', { name: 'Delete swatch' });

let confirmSpy: jest.SpyInstance;
beforeEach(() => {
  mockDeletes = [];
  mockRestores = [];
  mockInk = true;
  confirmSpy = jest.spyOn(window, 'confirm').mockReturnValue(true);
});
afterEach(() => jest.restoreAllMocks());

describe('N15 — swatch delete with Undo', () => {
  it('reads "Removed" only after the receipt, and Undo restores the row', async () => {
    renderBuilder();
    fireEvent.click(deleteButtons()[1]);

    await waitFor(() => expect(mockDeletes).toHaveLength(1));
    expect(confirmSpy).not.toHaveBeenCalled();
    const status = screen.getByRole('status');
    expect(status).toHaveTextContent('Clay: Removing…');
    expect(status).not.toHaveTextContent('Removed');
    const undo = screen.getByRole('button', { name: 'Undo' });
    expect(undo).toHaveFocus();
    expect(undo.className).toContain('min-h-[44px]');
    expect(undo.closest('div')?.className).not.toMatch(/shadow/);

    await act(async () => mockDeletes[0].resolve());
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Clay: Removed'));
    // The palette no longer holds Clay, but the row stays at its place for Undo.
    expect(names()).toEqual(['Sage', 'Clay', 'Oat']);
    expect(deleteButtons()).toHaveLength(2);

    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
    await waitFor(() => expect(mockRestores).toHaveLength(1));
    expect(mockRestores[0].swatch).toEqual(CLAY);
    expect(screen.getByRole('button', { name: 'Restoring…' })).toBeInTheDocument();

    await act(async () => mockRestores[0].resolve(CLAY));
    await waitFor(() => expect(screen.queryByRole('status')).not.toBeInTheDocument());
    expect(names()).toEqual(['Sage', 'Clay', 'Oat']);
    expect(deleteButtons()).toHaveLength(3);
    await waitFor(() => expect(deleteButtons()[1]).toHaveFocus());
  });

  it('Undo pressed while the delete is in flight waits for its receipt', async () => {
    renderBuilder();
    fireEvent.click(deleteButtons()[0]);
    await waitFor(() => expect(mockDeletes).toHaveLength(1));

    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
    expect(mockRestores).toHaveLength(0);
    expect(screen.getByRole('button', { name: 'Restoring…' })).toBeInTheDocument();

    await act(async () => mockDeletes[0].resolve());
    await waitFor(() => expect(mockRestores).toHaveLength(1));
    expect(mockRestores[0].swatch).toEqual(SAGE);
  });

  it('a refused delete closes the Undo row, never reads "Removed", and says so', async () => {
    renderBuilder();
    fireEvent.click(deleteButtons()[1]);
    await waitFor(() => expect(mockDeletes).toHaveLength(1));

    await act(async () => mockDeletes[0].reject(new Error('refused')));

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Couldn’t remove the swatch'));
    expect(screen.queryByText(/Removed/)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Undo' })).not.toBeInTheDocument();
    expect(names()).toEqual(['Sage', 'Clay', 'Oat']);
  });

  it('an edit to another swatch made before Undo survives the Undo', async () => {
    renderBuilder();
    fireEvent.click(deleteButtons()[1]);
    await waitFor(() => expect(mockDeletes).toHaveLength(1));
    await act(async () => mockDeletes[0].resolve());
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Removed'));

    // Oat is renamed (settled into the palette) while the Undo row is open.
    act(() => {
      client.setQueryData(['proposal-palette', 'palette-1'], (p: { swatches: Swatch[] }) => ({
        ...p,
        swatches: p.swatches.map((s) => (s.id === 's-3' ? { ...s, name: 'Oatmeal' } : s)),
      }));
    });

    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
    await waitFor(() => expect(mockRestores).toHaveLength(1));
    // Undo sends only the removed swatch, never the earlier list.
    expect(mockRestores[0].swatch).toEqual(CLAY);
    await act(async () => mockRestores[0].resolve(CLAY));

    await waitFor(() => expect(screen.queryByRole('status')).not.toBeInTheDocument());
    const palette = client.getQueryData<{ swatches: Swatch[] }>(['proposal-palette', 'palette-1'])!;
    expect(palette.swatches.map((s) => s.name)).toEqual(['Sage', 'Clay', 'Oatmeal']);
  });

  it('flag off keeps F15c: confirm first, then pending-only with no Undo', async () => {
    mockInk = false;
    renderBuilder();
    fireEvent.click(deleteButtons()[1]);

    expect(confirmSpy).toHaveBeenCalledWith('Delete this swatch?');
    await waitFor(() => expect(mockDeletes).toHaveLength(1));
    expect(within(screen.getByRole('status')).getByText('Removing…')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Undo' })).not.toBeInTheDocument();
  });
});
