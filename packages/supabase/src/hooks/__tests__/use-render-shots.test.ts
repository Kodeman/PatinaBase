/**
 * `useRenderShots` — mirrors `use-splat-url.test.ts`'s mocking shape (the
 * chained Supabase query builder + an injectable `useQuery`), since the hook
 * under test follows the same two-phase (presence, then capability) contract.
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

let session: { access_token: string } | null = { access_token: 'session-token' };
const getSession = vi.fn(async () => ({ data: { session } }));

vi.mock('@supabase/ssr', () => ({
  createBrowserClient: () => ({ from, auth: { getSession } }),
}));

let presenceState: { data: unknown; isLoading: boolean } = { data: undefined, isLoading: false };
let shotsState: { data: unknown; isLoading: boolean; isFetched: boolean } = {
  data: undefined,
  isLoading: false,
  isFetched: false,
};
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
    return key === 'room-file-renders-shots'
      ? { ...config, ...shotsState }
      : { ...config, ...presenceState };
  },
}));

function issuedWithKey(key: string): QueryConfig {
  const found = issued.filter((config) => config.queryKey[0] === key).at(-1);
  if (!found) throw new Error(`useRenderShots issued no ${key} query`);
  return found;
}

function presenceQuery(): QueryConfig {
  return issuedWithKey('room-file-renders-artifact');
}

function shotsQuery(): QueryConfig {
  return issuedWithKey('room-file-renders-shots');
}

// Import AFTER the mocks are wired up.
import { useRenderShots, readRendersArtifactPresence, RENDERS_ARTIFACT_KIND } from '../use-render-shots';
import { edgeApiBaseUrl } from '../../lib/scan-artifact-url';

beforeEach(() => {
  tableResult = { data: null, error: null };
  presenceState = { data: undefined, isLoading: false };
  shotsState = { data: undefined, isLoading: false, isFetched: false };
  session = { access_token: 'session-token' };
  lastBuilder = null;
  issued = [];
  from.mockClear();
  getSession.mockClear();
  delete process.env.NEXT_PUBLIC_EDGE_API_URL;
  vi.unstubAllGlobals();
});

describe('readRendersArtifactPresence', () => {
  it('names the key the renders stage registers under', () => {
    expect(RENDERS_ARTIFACT_KIND).toBe('renders');
  });

  it('is present for a hoisted-cover manifest', () => {
    expect(
      readRendersArtifactPresence({
        renders: { object_id: '11111111-2222-3333-4444-555555555555', shots: { top_down: {} } },
      }),
    ).toBe(true);
  });

  it('is present for the legacy flat shot map (no object_id of its own)', () => {
    expect(
      readRendersArtifactPresence({
        renders: { top_down: { object_id: '11111111-2222-3333-4444-555555555555' } },
      }),
    ).toBe(true);
  });

  it('ignores every other artifact kind', () => {
    expect(readRendersArtifactPresence({ splat: { object_id: 'x' } })).toBe(false);
  });

  it('is total against a jsonb column with no shape constraint', () => {
    for (const value of [
      undefined,
      null,
      {},
      [],
      'renders',
      42,
      { renders: null },
      { renders: 'a-uuid' },
      { renders: [] },
      { renders: {} },
      { renders: { top_down: 'a-uuid' } },
      { renders: { top_down: {} } },
    ]) {
      expect(readRendersArtifactPresence(value)).toBe(false);
    }
  });
});

describe('useRenderShots — presence', () => {
  it('reads only id + artifacts from the named Room File row', async () => {
    tableResult = {
      data: { id: 'rf-1', artifacts: { renders: { object_id: 'obj-1', shots: {} } } },
      error: null,
    };

    useRenderShots('rf-1');

    expect(presenceQuery().queryKey).toEqual(['room-file-renders-artifact', 'rf-1']);
    expect(presenceQuery().enabled).toBe(true);
    await expect(presenceQuery().queryFn()).resolves.toBe(true);

    expect(from).toHaveBeenCalledWith('room_files');
    expect(lastBuilder?.select).toHaveBeenCalledWith('id, artifacts');
    expect(lastBuilder?.eq).toHaveBeenCalledWith('id', 'rf-1');
  });

  it('resolves false for a Room File that registers nothing', async () => {
    tableResult = { data: { id: 'rf-1', artifacts: {} }, error: null };
    useRenderShots('rf-1');
    await expect(presenceQuery().queryFn()).resolves.toBe(false);
  });

  it('propagates a query error rather than reporting "no renders"', async () => {
    tableResult = { data: null, error: new Error('RLS') };
    useRenderShots('rf-1');
    await expect(presenceQuery().queryFn()).rejects.toThrow('RLS');
  });

  it('stays disabled without a Room File id, and when the caller disables it', () => {
    useRenderShots(null);
    expect(presenceQuery().enabled).toBe(false);
    useRenderShots(undefined);
    expect(presenceQuery().enabled).toBe(false);
    useRenderShots('rf-1', { enabled: false });
    expect(presenceQuery().enabled).toBe(false);
  });
});

describe('useRenderShots — the derived contract', () => {
  it('reports no-artifact when the current Room File registers none', () => {
    presenceState = { data: false, isLoading: false };
    const source = useRenderShots('rf-1');

    expect(source.hasArtifact).toBe(false);
    expect(source.shots).toBeNull();
    expect(source.unavailable).toBe('no-artifact');
  });

  it('carries the loading flag through while the row is in flight', () => {
    presenceState = { data: undefined, isLoading: true };
    const source = useRenderShots('rf-1');

    expect(source.isLoading).toBe(true);
    expect(source.hasArtifact).toBe(false);
  });

  it('reports read-path-pending for a registered manifest with the read path unwired', () => {
    presenceState = { data: true, isLoading: false };
    const source = useRenderShots('rf-1');

    expect(source.hasArtifact).toBe(true);
    expect(source.shots).toBeNull();
    expect(source.unavailable).toBe('read-path-pending');
    expect(shotsQuery().enabled).toBe(false);
  });
});

describe('useRenderShots — the capability-URL resolver leg', () => {
  const SHOTS = {
    corner_ne: { url: 'https://r2/corner_ne.jpg', expiresAt: '2026-08-18T12:44:56.789Z' },
    top_down: { url: 'https://r2/top_down.jpg', expiresAt: '2026-08-18T12:44:56.789Z' },
  };

  it('stays disabled when the Room File registers nothing — nothing to resolve', () => {
    process.env.NEXT_PUBLIC_EDGE_API_URL = 'https://edge.example';
    presenceState = { data: false, isLoading: false };
    useRenderShots('rf-1');
    expect(shotsQuery().enabled).toBe(false);
  });

  it('calls the typed route with the session bearer and no cache', async () => {
    process.env.NEXT_PUBLIC_EDGE_API_URL = 'https://edge.example/';
    presenceState = { data: true, isLoading: false };
    const fetchMock = vi.fn(
      async () => new Response(JSON.stringify({ kind: 'renders', shots: SHOTS }), { status: 200 }),
    );
    vi.stubGlobal('fetch', fetchMock);

    useRenderShots('rf-1');
    expect(shotsQuery().enabled).toBe(true);
    expect(shotsQuery().queryKey).toEqual(['room-file-renders-shots', 'rf-1']);
    await expect(shotsQuery().queryFn()).resolves.toEqual(SHOTS);

    expect(getSession).toHaveBeenCalled();
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://edge.example/v1/scan/room-files/rf-1/artifacts/renders');
    expect((init.headers as Record<string, string>).authorization).toBe('Bearer session-token');
    expect(init.cache).toBe('no-store');
  });

  it('refuses to ask without a session rather than sending an anonymous request', async () => {
    process.env.NEXT_PUBLIC_EDGE_API_URL = 'https://edge.example';
    presenceState = { data: true, isLoading: false };
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    session = null;

    useRenderShots('rf-1');
    await expect(shotsQuery().queryFn()).rejects.toThrow('no session');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('hands the resolved shot map through as the ordinary source', () => {
    process.env.NEXT_PUBLIC_EDGE_API_URL = 'https://edge.example';
    presenceState = { data: true, isLoading: false };
    shotsState = { data: SHOTS, isLoading: false, isFetched: true };

    const source = useRenderShots('rf-1');
    expect(source.shots).toEqual(SHOTS);
    expect(source.unavailable).toBeNull();
    expect(source.hasArtifact).toBe(true);
    expect(source.isLoading).toBe(false);
  });

  it('reads a 404 as typed absence — registered, but nothing servable', () => {
    process.env.NEXT_PUBLIC_EDGE_API_URL = 'https://edge.example';
    presenceState = { data: true, isLoading: false };
    shotsState = { data: null, isLoading: false, isFetched: true };

    const source = useRenderShots('rf-1');
    expect(source.shots).toBeNull();
    expect(source.unavailable).toBe('no-artifact');
    expect(source.hasArtifact).toBe(false);
  });

  it('stays pending — never "absent" — while the capability request is in flight', () => {
    process.env.NEXT_PUBLIC_EDGE_API_URL = 'https://edge.example';
    presenceState = { data: true, isLoading: false };
    shotsState = { data: undefined, isLoading: true, isFetched: false };

    const source = useRenderShots('rf-1');
    expect(source.unavailable).toBe('read-path-pending');
    expect(source.hasArtifact).toBe(true);
    expect(source.isLoading).toBe(true);
  });

  it('reports the base URL only when one is configured (shared helper, sanity check)', () => {
    expect(edgeApiBaseUrl()).toBeNull();
    process.env.NEXT_PUBLIC_EDGE_API_URL = 'https://edge.example';
    expect(edgeApiBaseUrl()).toBe('https://edge.example');
  });
});
