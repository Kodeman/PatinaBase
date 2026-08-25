/**
 * `useCaptureVenueLabels` — the place-name half of the Library provenance chip
 * (spec §6 Flow 6). Deliberately its OWN query rather than an embed on
 * `useLayerProducts`, so a failure here costs the chip a place name instead of
 * darkening every Library shelf (plan Ruling 5-A).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

type BuilderResult = { data: unknown; error: unknown };
let tableResult: BuilderResult = { data: [], error: null };
const chain: Array<{ method: string; args: unknown[] }> = [];

function makeBuilder() {
  const record = (method: string) =>
    vi.fn((...args: unknown[]) => {
      chain.push({ method, args });
      return builder;
    });
  const builder = {
    select: record('select'),
    in: record('in'),
    then: (resolve: (v: BuilderResult) => unknown) => Promise.resolve(tableResult).then(resolve),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
  return builder;
}

const from = vi.fn((_table: string) => makeBuilder());
vi.mock('@supabase/ssr', () => ({ createBrowserClient: () => ({ from }) }));

interface QueryConfig {
  queryKey: readonly unknown[];
  enabled: boolean;
  queryFn: () => Promise<Record<string, string>>;
}
let issued: QueryConfig[] = [];
vi.mock('@tanstack/react-query', () => ({
  useQuery: (config: Record<string, unknown>) => {
    issued.push(config as unknown as QueryConfig);
    return config;
  },
}));

import { useCaptureVenueLabels } from '../use-capture-venues';

function query(): QueryConfig {
  const found = issued.at(-1);
  if (!found) throw new Error('useCaptureVenueLabels issued no query');
  return found;
}

beforeEach(() => {
  tableResult = { data: [], error: null };
  chain.length = 0;
  issued = [];
  from.mockClear();
});

describe('useCaptureVenueLabels', () => {
  it('stays disabled with nothing to look up', () => {
    for (const input of [null, undefined, [], [null, undefined, '']]) {
      issued = [];
      useCaptureVenueLabels(input as string[] | null | undefined);
      expect(query().enabled).toBe(false);
    }
    expect(from).not.toHaveBeenCalled();
  });

  it('reads only id + venue_label for the ids it was given', async () => {
    tableResult = {
      data: [
        { id: 'cap-1', venue_label: 'High Point' },
        { id: 'cap-2', venue_label: null },
      ],
      error: null,
    };

    useCaptureVenueLabels(['cap-2', 'cap-1', 'cap-1']);
    expect(query().queryKey).toEqual(['capture-venue-labels', 'cap-1|cap-2']);

    await expect(query().queryFn()).resolves.toEqual({ 'cap-1': 'High Point' });
    expect(from).toHaveBeenCalledWith('field_captures');
    expect(chain).toContainEqual({ method: 'select', args: ['id, venue_label'] });
    expect(chain).toContainEqual({ method: 'in', args: ['id', ['cap-1', 'cap-2']] });
  });

  it('resolves to an empty map rather than throwing when the read fails', async () => {
    // Ruling 5-A: a failure here must cost the chip its place name, never the shelf.
    tableResult = { data: null, error: new Error('RLS') };
    useCaptureVenueLabels(['cap-1']);
    await expect(query().queryFn()).resolves.toEqual({});
  });
});
