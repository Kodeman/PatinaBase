/**
 * SQ-1004 (SQ-1001 #4, triage R6): a swatch DELETE that removes no row, as an
 * RLS-hidden or already-removed swatch gives, is a failure: the row stays and
 * the inline alert shows, never "Removed". Runs the real useDeleteSwatch
 * against a palette_swatches DELETE that returns no rows.
 */
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { PaletteSwatchEditor } from '../palette-swatch-editor';

let mockInk = true;
jest.mock('@/hooks/use-feature-flag', () => ({
  useFeatureFlag: (key: string) => ({ value: key === 'optimistic-ink' ? mockInk : false, isLoading: false }),
}));

const swatch = {
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
} as never;

// createBrowserClient() hands back this browser singleton when it is set.
const browser = globalThis as { __supabaseBrowserClient?: unknown };
let deleted: string[] = [];

beforeEach(() => {
  deleted = [];
  browser.__supabaseBrowserClient = {
    from: () => ({
      delete: () => ({
        eq: (_column: string, id: string) => ({
          select: async () => {
            deleted.push(id);
            return { data: [], error: null };
          },
        }),
      }),
    }),
  };
  jest.spyOn(window, 'confirm').mockReturnValue(true);
});
afterEach(() => {
  delete browser.__supabaseBrowserClient;
  jest.restoreAllMocks();
});

describe('R6 — a zero-row swatch delete is a failure', () => {
  it.each([
    ['with Undo (optimistic-ink on)', true],
    ['pending-only (optimistic-ink off)', false],
  ])('%s: the row stays and the inline failure shows', async (_label, ink) => {
    mockInk = ink;
    render(
      <QueryClientProvider
        client={new QueryClient({ defaultOptions: { mutations: { retry: false } } })}
      >
        <PaletteSwatchEditor proposalId="proposal-1" swatch={swatch} />
      </QueryClientProvider>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Delete swatch' }));

    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent('Couldn’t remove the swatch'),
    );
    expect(deleted).toEqual(['swatch-1']);
    expect(screen.queryByText(/Removed/)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Undo' })).not.toBeInTheDocument();
    expect(screen.getByDisplayValue('Sage')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Delete swatch' })).toBeInTheDocument();
  });
});
