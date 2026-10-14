import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  MutationObserver,
  QueryClient,
  useMutation,
  useQueryClient,
  type UseMutationOptions,
} from '@tanstack/react-query';
import { useRestoreSwatch, type PaletteSwatch, type PaletteWithSwatches } from '../use-palettes';

/**
 * US-34 N15: swatch-delete Undo inserts the removed row again (its own id,
 * sort_order and created_at) and merges only that row into the CURRENT cached
 * palette, never a whole earlier list (triage R5). A real QueryClient runs the
 * hook's options; only the React bindings and the Supabase client are stubbed.
 */
vi.mock('@tanstack/react-query', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tanstack/react-query')>();
  return { ...actual, useQueryClient: vi.fn(), useMutation: vi.fn() };
});

let inserted: Record<string, unknown> | null = null;
let reply: { data: unknown; error: unknown } = { data: null, error: null };
vi.mock('../../client', () => ({
  createBrowserClient: () => ({
    from: () => ({
      insert: (row: Record<string, unknown>) => {
        inserted = row;
        return { select: () => ({ single: async () => reply }) };
      },
    }),
  }),
}));

const swatch = (id: string, sort_order: number, created_at: string, name: string): PaletteSwatch => ({
  id,
  palette_id: 'pal-1',
  hex: '#A8B5A6',
  name,
  role: 'wall',
  paint_color_id: null,
  brand: null,
  brand_code: null,
  source_pixel: null,
  sort_order,
  created_at,
});

const A = swatch('a', 0, '2026-10-01T00:00:00Z', 'Sage');
const B = swatch('b', 0, '2026-10-02T00:00:00Z', 'Clay');
const C = swatch('c', 0, '2026-10-03T00:00:00Z', 'Oat');
const KEY = ['proposal-palette', 'pal-1'];

function build(client: QueryClient) {
  vi.mocked(useQueryClient).mockReturnValue(client);
  vi.mocked(useMutation).mockImplementation(((o: unknown) => o) as never);
  const options = useRestoreSwatch() as unknown as UseMutationOptions<
    PaletteSwatch,
    Error,
    { swatch: PaletteSwatch; proposalId: string }
  >;
  return new MutationObserver(client, options);
}

const palette = (swatches: PaletteSwatch[]): PaletteWithSwatches => ({
  id: 'pal-1',
  proposal_id: 'prop-1',
  name: 'Main',
  scope_room_id: null,
  is_primary: true,
  source_image_url: null,
  notes: null,
  sort_order: 0,
  created_at: '2026-10-01T00:00:00Z',
  updated_at: '2026-10-01T00:00:00Z',
  swatches,
});

beforeEach(() => {
  inserted = null;
  reply = { data: null, error: null };
});

describe('useRestoreSwatch (N15 Undo)', () => {
  it('inserts the removed row with its own id, order and created_at', async () => {
    const client = new QueryClient();
    client.setQueryData(KEY, palette([A, C]));
    reply = { data: B, error: null };

    await build(client).mutate({ swatch: B, proposalId: 'prop-1' });

    expect(inserted).toMatchObject({
      id: 'b',
      palette_id: 'pal-1',
      name: 'Clay',
      sort_order: 0,
      created_at: '2026-10-02T00:00:00Z',
    });
  });

  it('a concurrent edit made before Undo survives it; the row returns to its old place', async () => {
    const client = new QueryClient();
    // B was deleted; then C was renamed and a new swatch D added (settled).
    const renamedC = { ...C, name: 'Oatmeal' };
    const D = swatch('d', 0, '2026-10-04T00:00:00Z', 'Ink');
    client.setQueryData(KEY, palette([A, renamedC, D]));
    reply = { data: B, error: null };

    await build(client).mutate({ swatch: B, proposalId: 'prop-1' });

    const after = client.getQueryData<PaletteWithSwatches>(KEY)!;
    expect(after.swatches.map((s) => s.id)).toEqual(['a', 'b', 'c', 'd']);
    expect(after.swatches.find((s) => s.id === 'c')?.name).toBe('Oatmeal');
  });

  it('appends when its old place no longer exists, and never duplicates a row already back', async () => {
    const client = new QueryClient();
    const early = swatch('e', 0, '2026-09-01T00:00:00Z', 'First');
    const late = swatch('l', 9, '2026-12-01T00:00:00Z', 'Last');
    client.setQueryData(KEY, palette([early]));
    reply = { data: late, error: null };
    await build(client).mutate({ swatch: late, proposalId: 'prop-1' });
    expect(client.getQueryData<PaletteWithSwatches>(KEY)!.swatches.map((s) => s.id)).toEqual(['e', 'l']);

    await build(client).mutate({ swatch: late, proposalId: 'prop-1' });
    expect(client.getQueryData<PaletteWithSwatches>(KEY)!.swatches.map((s) => s.id)).toEqual(['e', 'l']);
  });

  it('a refused restore leaves the cache untouched', async () => {
    const client = new QueryClient();
    const before = palette([A, C]);
    client.setQueryData(KEY, before);
    reply = { data: null, error: new Error('permission denied') };

    await expect(build(client).mutate({ swatch: B, proposalId: 'prop-1' })).rejects.toThrow(
      'permission denied',
    );
    expect(client.getQueryData(KEY)).toBe(before);
  });
});
