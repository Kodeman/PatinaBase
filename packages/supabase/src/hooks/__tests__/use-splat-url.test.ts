/**
 * `useSplatUrl` — the Room View SPLAT projection's data seam (Rendered Room v2, W2).
 *
 * Mocked at the same two boundaries every other hook suite here uses (`@supabase/ssr`
 * for the chained query builder, `@tanstack/react-query` for `useQuery`), so the
 * `queryFn` can be invoked directly and the hook's derived contract asserted without a
 * database or a React tree. The `useQuery` mock is one step richer than the sibling
 * suites' — it returns an injectable `data`/`isLoading` alongside the config, because
 * what is under test here is precisely what the hook DERIVES from the row.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

type BuilderResult = { data: unknown; error: unknown };

interface MockBuilder {
  /* eslint-disable @typescript-eslint/no-explicit-any */
  select: any;
  eq: any;
  maybeSingle: any;
  /* eslint-enable @typescript-eslint/no-explicit-any */
  __result: BuilderResult;
}

let tableResult: BuilderResult = { data: null, error: null };

function makeBuilder(): MockBuilder {
  const builder = { __result: tableResult } as MockBuilder;
  const chain = () => vi.fn(() => builder);
  builder.select = chain();
  builder.eq = chain();
  builder.maybeSingle = vi.fn(async () => builder.__result);
  return builder;
}

let lastBuilder: MockBuilder | null = null;
const from = vi.fn((_table: string) => {
  lastBuilder = makeBuilder();
  return lastBuilder;
});

vi.mock('@supabase/ssr', () => ({
  createBrowserClient: () => ({ from }),
}));

/** What the mocked `useQuery` should hand back for the next `useSplatUrl` call. */
let queryState: { data: unknown; isLoading: boolean } = { data: undefined, isLoading: false };
/** The config the hook handed `useQuery` — the hook itself returns the DERIVED
 *  `SplatSource`, so the query has to be captured on the way in. */
let lastQueryConfig: QueryConfig | null = null;

interface QueryConfig {
  queryKey: unknown[];
  enabled: boolean;
  queryFn: () => Promise<SplatArtifactRef | null>;
}

vi.mock('@tanstack/react-query', () => ({
  useQuery: (config: Record<string, unknown>) => {
    lastQueryConfig = config as unknown as QueryConfig;
    return { ...config, ...queryState };
  },
}));

/** The query `useSplatUrl` just issued. */
function query(): QueryConfig {
  if (!lastQueryConfig) throw new Error('useSplatUrl issued no query');
  return lastQueryConfig;
}

// Import AFTER the mocks are wired up.
import {
  useSplatUrl,
  readSplatArtifactRef,
  SPLAT_ARTIFACT_KIND,
  type SplatArtifactRef,
} from '../use-splat-url';

const REF: SplatArtifactRef = { object_id: '11111111-2222-3333-4444-555555555555', version: 3 };

beforeEach(() => {
  tableResult = { data: null, error: null };
  queryState = { data: undefined, isLoading: false };
  lastBuilder = null;
  lastQueryConfig = null;
  from.mockClear();
});

describe('readSplatArtifactRef', () => {
  it('reads a well-formed ref under the `splat` key', () => {
    expect(readSplatArtifactRef({ splat: { object_id: REF.object_id, version: 3 } })).toEqual(REF);
  });

  it('names the key the migration named', () => {
    expect(SPLAT_ARTIFACT_KIND).toBe('splat');
  });

  it('treats a missing version as unknown rather than inventing 0', () => {
    // `version` is informational (00490 joins on `object_id` alone), so its absence
    // must not change whether the artifact is considered present.
    expect(readSplatArtifactRef({ splat: { object_id: REF.object_id } })).toEqual({
      object_id: REF.object_id,
      version: null,
    });
  });

  it('ignores every other artifact kind', () => {
    expect(readSplatArtifactRef({ mesh: { object_id: REF.object_id } })).toBeNull();
  });

  it('is total against a jsonb column with no shape constraint', () => {
    // `artifacts` is plain jsonb; none of these may throw into a render.
    for (const value of [
      undefined,
      null,
      {},
      [],
      'splat',
      42,
      { splat: null },
      { splat: 'a-uuid' },
      { splat: [] },
      { splat: {} },
      { splat: { object_id: '' } },
      { splat: { object_id: 7 } },
    ]) {
      expect(readSplatArtifactRef(value)).toBeNull();
    }
  });
});

describe('useSplatUrl — the query', () => {
  it('reads only id + artifacts from the named Room File row', async () => {
    tableResult = { data: { id: 'rf-1', artifacts: { splat: { object_id: REF.object_id } } }, error: null };

    useSplatUrl('rf-1');

    expect(query().queryKey).toEqual(['room-file-splat-artifact', 'rf-1']);
    expect(query().enabled).toBe(true);
    await expect(query().queryFn()).resolves.toEqual({ object_id: REF.object_id, version: null });

    expect(from).toHaveBeenCalledWith('room_files');
    // The certificate jsonb is heavy and no part of this answer.
    expect(lastBuilder?.select).toHaveBeenCalledWith('id, artifacts');
    expect(lastBuilder?.eq).toHaveBeenCalledWith('id', 'rf-1');
  });

  it('resolves to null for a Room File that registers nothing', async () => {
    tableResult = { data: { id: 'rf-1', artifacts: {} }, error: null };
    useSplatUrl('rf-1');
    await expect(query().queryFn()).resolves.toBeNull();
  });

  it('propagates a query error rather than reporting "no splat"', async () => {
    tableResult = { data: null, error: new Error('RLS') };
    useSplatUrl('rf-1');
    await expect(query().queryFn()).rejects.toThrow('RLS');
  });

  it('stays disabled without a Room File id, and when the caller disables it', () => {
    useSplatUrl(null);
    expect(query().enabled).toBe(false);
    useSplatUrl(undefined);
    expect(query().enabled).toBe(false);
    useSplatUrl('rf-1', { enabled: false });
    expect(query().enabled).toBe(false);
  });
});

describe('useSplatUrl — the derived contract', () => {
  it('reports read-path-pending for a registered splat: present, but no URL', () => {
    queryState = { data: REF, isLoading: false };
    const source = useSplatUrl('rf-1');

    expect(source.hasArtifact).toBe(true);
    expect(source.artifact).toEqual(REF);
    // The W2 capability-URL route does not exist yet, and the hook does not
    // invent one — it says why.
    expect(source.url).toBeNull();
    expect(source.unavailable).toBe('read-path-pending');
  });

  it('reports no-artifact when the current Room File registers none', () => {
    queryState = { data: null, isLoading: false };
    const source = useSplatUrl('rf-1');

    expect(source.hasArtifact).toBe(false);
    expect(source.artifact).toBeNull();
    expect(source.url).toBeNull();
    expect(source.unavailable).toBe('no-artifact');
  });

  it('carries the loading flag through while the row is in flight', () => {
    queryState = { data: undefined, isLoading: true };
    const source = useSplatUrl('rf-1');

    expect(source.isLoading).toBe(true);
    expect(source.hasArtifact).toBe(false);
  });

  it('takes a urlSource verbatim and reports it as available', () => {
    // The forward seam: today the dev `?splatUrl=` override, later the resolved
    // capability URL. Either way it is authoritative and `unavailable` clears.
    queryState = { data: REF, isLoading: false };
    const source = useSplatUrl('rf-1', { urlSource: '/fixtures/splat/room-fixture.ply' });

    expect(source.url).toBe('/fixtures/splat/room-fixture.ply');
    expect(source.unavailable).toBeNull();
    expect(source.hasArtifact).toBe(true);
    expect(source.isLoading).toBe(false);
  });

  it('lets a urlSource reach the stage for a Room File with no artifact at all', () => {
    queryState = { data: null, isLoading: false };
    const source = useSplatUrl('rf-1', { urlSource: '/fixtures/splat/room-fixture.ply' });

    expect(source.hasArtifact).toBe(true);
    expect(source.url).toBe('/fixtures/splat/room-fixture.ply');
  });

  it('ignores an empty urlSource — an empty override is not an override', () => {
    queryState = { data: REF, isLoading: false };
    expect(useSplatUrl('rf-1', { urlSource: '' }).unavailable).toBe('read-path-pending');
    expect(useSplatUrl('rf-1', { urlSource: null }).unavailable).toBe('read-path-pending');
  });
});
