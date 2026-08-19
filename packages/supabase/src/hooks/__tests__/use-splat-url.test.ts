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

/** The session the resolver leg reads its bearer token from. */
let session: { access_token: string } | null = { access_token: 'session-token' };
const getSession = vi.fn(async () => ({ data: { session } }));

vi.mock('@supabase/ssr', () => ({
  createBrowserClient: () => ({ from, auth: { getSession } }),
}));

/** What the mocked `useQuery` should hand back for the next `useSplatUrl` call. */
let queryState: { data: unknown; isLoading: boolean } = { data: undefined, isLoading: false };
/** The same, for the resolver leg — kept separate so a test can hold the artifact
 *  row fixed while varying only what the capability route said. */
let capabilityState: { data: unknown; isLoading: boolean; isFetched: boolean } = {
  data: undefined,
  isLoading: false,
  isFetched: false,
};
/** Every config the hook handed `useQuery` this render — the hook itself returns
 *  the DERIVED `SplatSource`, so the queries have to be captured on the way in. */
let issued: QueryConfig[] = [];

interface QueryConfig {
  queryKey: unknown[];
  enabled: boolean;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  queryFn: () => Promise<any>;
}

vi.mock('@tanstack/react-query', () => ({
  useQuery: (config: Record<string, unknown>) => {
    issued.push(config as unknown as QueryConfig);
    const key = (config.queryKey as unknown[])[0];
    return key === 'room-file-splat-url'
      ? { ...config, ...capabilityState }
      : { ...config, ...queryState };
  },
}));

function issuedWithKey(key: string): QueryConfig {
  const found = issued.filter((config) => config.queryKey[0] === key).at(-1);
  if (!found) throw new Error(`useSplatUrl issued no ${key} query`);
  return found;
}

/** The artifact-presence query `useSplatUrl` just issued. */
function query(): QueryConfig {
  return issuedWithKey('room-file-splat-artifact');
}

/** The capability-URL query `useSplatUrl` just issued. */
function capabilityQuery(): QueryConfig {
  return issuedWithKey('room-file-splat-url');
}

// Import AFTER the mocks are wired up.
import {
  useSplatUrl,
  readSplatArtifactRef,
  SPLAT_ARTIFACT_KIND,
  type SplatArtifactRef,
} from '../use-splat-url';
import {
  edgeApiBaseUrl,
  fetchScanArtifact,
  ScanArtifactError,
} from '../../lib/scan-artifact-url';

const REF: SplatArtifactRef = { object_id: '11111111-2222-3333-4444-555555555555', version: 3 };

beforeEach(() => {
  tableResult = { data: null, error: null };
  queryState = { data: undefined, isLoading: false };
  capabilityState = { data: undefined, isLoading: false, isFetched: false };
  session = { access_token: 'session-token' };
  lastBuilder = null;
  issued = [];
  from.mockClear();
  getSession.mockClear();
  delete process.env.NEXT_PUBLIC_EDGE_API_URL;
  vi.unstubAllGlobals();
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

describe('useSplatUrl — the capability-URL resolver leg', () => {
  const CAPABILITY = {
    url: 'https://account.r2.cloudflarestorage.com/bucket/splat.spz?X-Amz-Signature=abc',
    expiresAt: '2026-08-18T12:44:56.789Z',
  };

  it('stays disabled, and reports read-path-pending, when NEXT_PUBLIC_EDGE_API_URL is unset', () => {
    // Every environment today: the Worker's own SCAN_ROUTES flag rests at `off`
    // until the R2 credentials exist, so the seam must behave exactly as it did
    // before the resolver existed rather than firing a request at nothing.
    queryState = { data: REF, isLoading: false };
    const source = useSplatUrl('rf-1');

    expect(capabilityQuery().enabled).toBe(false);
    expect(source.url).toBeNull();
    expect(source.unavailable).toBe('read-path-pending');
    expect(source.hasArtifact).toBe(true);
  });

  it('stays disabled when the Room File registers no splat — nothing to resolve', () => {
    process.env.NEXT_PUBLIC_EDGE_API_URL = 'https://edge.example';
    queryState = { data: null, isLoading: false };
    useSplatUrl('rf-1');
    expect(capabilityQuery().enabled).toBe(false);
  });

  it('stays disabled behind a urlSource override — the override is authoritative', () => {
    process.env.NEXT_PUBLIC_EDGE_API_URL = 'https://edge.example';
    queryState = { data: REF, isLoading: false };
    const source = useSplatUrl('rf-1', { urlSource: '/fixtures/splat/room-fixture.ply' });

    expect(capabilityQuery().enabled).toBe(false);
    expect(source.url).toBe('/fixtures/splat/room-fixture.ply');
  });

  it('calls the typed route with the session bearer and no cache', async () => {
    process.env.NEXT_PUBLIC_EDGE_API_URL = 'https://edge.example/';
    queryState = { data: REF, isLoading: false };
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ kind: 'splat', ...CAPABILITY }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    useSplatUrl('rf-1');
    expect(capabilityQuery().enabled).toBe(true);
    expect(capabilityQuery().queryKey).toEqual(['room-file-splat-url', 'rf-1']);
    await expect(capabilityQuery().queryFn()).resolves.toEqual(CAPABILITY);

    expect(getSession).toHaveBeenCalled();
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    // The trailing slash on the configured base must not double up.
    expect(url).toBe('https://edge.example/v1/scan/room-files/rf-1/artifacts/splat');
    expect((init.headers as Record<string, string>).authorization).toBe('Bearer session-token');
    // The response carries a URL that expires; caching it would hand out a dead one.
    expect(init.cache).toBe('no-store');
  });

  it('refuses to ask without a session rather than sending an anonymous request', async () => {
    process.env.NEXT_PUBLIC_EDGE_API_URL = 'https://edge.example';
    queryState = { data: REF, isLoading: false };
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    session = null;

    useSplatUrl('rf-1');
    await expect(capabilityQuery().queryFn()).rejects.toThrow('no session');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('hands the resolved capability URL through as the ordinary source', () => {
    process.env.NEXT_PUBLIC_EDGE_API_URL = 'https://edge.example';
    queryState = { data: REF, isLoading: false };
    capabilityState = { data: CAPABILITY, isLoading: false, isFetched: true };

    const source = useSplatUrl('rf-1');
    expect(source.url).toBe(CAPABILITY.url);
    expect(source.unavailable).toBeNull();
    expect(source.hasArtifact).toBe(true);
    expect(source.isLoading).toBe(false);
  });

  it('reads a 404 as typed absence — registered, but nothing servable', () => {
    // The route collapses "not yours", "no such row", and "no confirmed bytes"
    // into one 404 on purpose. The viewer gets one honest answer: nothing to show.
    process.env.NEXT_PUBLIC_EDGE_API_URL = 'https://edge.example';
    queryState = { data: REF, isLoading: false };
    capabilityState = { data: null, isLoading: false, isFetched: true };

    const source = useSplatUrl('rf-1');
    expect(source.url).toBeNull();
    expect(source.unavailable).toBe('no-artifact');
    expect(source.hasArtifact).toBe(false);
    // The ref is still reported for telemetry — the row said it was registered.
    expect(source.artifact).toEqual(REF);
  });

  it('stays pending — never "absent" — while the capability request is in flight', () => {
    process.env.NEXT_PUBLIC_EDGE_API_URL = 'https://edge.example';
    queryState = { data: REF, isLoading: false };
    capabilityState = { data: undefined, isLoading: true, isFetched: false };

    const source = useSplatUrl('rf-1');
    expect(source.unavailable).toBe('read-path-pending');
    expect(source.hasArtifact).toBe(true);
    expect(source.isLoading).toBe(true);
  });
});

describe('fetchScanArtifact', () => {
  it('resolves null without a base URL, and never fetches', async () => {
    const fetchMock = vi.fn();
    await expect(fetchScanArtifact('rf-1', 'splat', 'token', fetchMock as unknown as typeof fetch)).resolves.toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('reads a 404 as absent and a 401 as an error', async () => {
    process.env.NEXT_PUBLIC_EDGE_API_URL = 'https://edge.example';
    const notFound = vi.fn(async () => new Response('{}', { status: 404 }));
    await expect(
      fetchScanArtifact('rf-1', 'splat', 'token', notFound as unknown as typeof fetch),
    ).resolves.toBeNull();

    // An expired session must surface as an error, not as "this room has no splat".
    const unauthorized = vi.fn(async () => new Response('{}', { status: 401 }));
    await expect(
      fetchScanArtifact('rf-1', 'splat', 'token', unauthorized as unknown as typeof fetch),
    ).rejects.toThrow(ScanArtifactError);
  });

  it('returns the renders shot map, dropping malformed entries', async () => {
    process.env.NEXT_PUBLIC_EDGE_API_URL = 'https://edge.example';
    const body = {
      kind: 'renders',
      shots: {
        corner_ne: { url: 'https://r2/corner.jpg', expiresAt: '2026-08-18T12:44:56.789Z' },
        broken: { url: 42 },
      },
    };
    const fetchMock = vi.fn(async () => new Response(JSON.stringify(body), { status: 200 }));
    await expect(
      fetchScanArtifact('rf-1', 'renders', 'token', fetchMock as unknown as typeof fetch),
    ).resolves.toEqual({
      kind: 'renders',
      shots: {
        corner_ne: { url: 'https://r2/corner.jpg', expiresAt: '2026-08-18T12:44:56.789Z' },
      },
    });
  });

  it('trims a trailing slash off the configured base URL', async () => {
    process.env.NEXT_PUBLIC_EDGE_API_URL = 'https://edge.example//';
    const fetchMock = vi.fn(async (_input: string) => new Response('{}', { status: 404 }));
    await fetchScanArtifact('rf 1', 'glb', 'token', fetchMock as unknown as typeof fetch);
    expect(fetchMock.mock.calls[0][0]).toBe(
      'https://edge.example/v1/scan/room-files/rf%201/artifacts/glb',
    );
  });

  it('reports the base URL only when one is configured', () => {
    expect(edgeApiBaseUrl()).toBeNull();
    process.env.NEXT_PUBLIC_EDGE_API_URL = '   ';
    expect(edgeApiBaseUrl()).toBeNull();
    process.env.NEXT_PUBLIC_EDGE_API_URL = 'https://edge.example';
    expect(edgeApiBaseUrl()).toBe('https://edge.example');
  });
});
