/**
 * use-scan-refine-artifacts.ts — the portal's only reader of Refine's
 * delivery record (Field Capture P2, Layer 3).
 *
 * Mirrors use-room-scan-photos.test.ts: intercept the chained query builder,
 * the storage API and `fetch` at their boundaries and React Query at its, so
 * `queryFn` can be invoked directly and inspected — no live database, no
 * bucket, no network.
 *
 * The assertions that matter:
 *  · flag-off (`enabled: false`) ⇒ the query never runs — zero DB, zero
 *    Storage. A "gated at render" version of this hook would still sign URLs.
 *  · ONE `createSignedUrls` call, carrying only the WANTED keys.
 *  · every missing/broken slot resolves to `null` rather than throwing.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

type BuilderResult = { data: unknown; error: unknown };

interface MockBuilder {
  /* eslint-disable @typescript-eslint/no-explicit-any */
  select: any;
  eq: any;
  order: any;
  /* eslint-enable @typescript-eslint/no-explicit-any */
  then: (resolve: (value: BuilderResult) => unknown) => Promise<unknown>;
  __result: BuilderResult;
}

function makeBuilder(initial: BuilderResult): MockBuilder {
  const builder = { __result: initial } as MockBuilder;
  const record = () => vi.fn(() => builder);
  builder.select = record();
  builder.eq = record();
  builder.order = record();
  builder.then = (resolve) => Promise.resolve(builder.__result).then(resolve);
  return builder;
}

let tableResult: BuilderResult = { data: [], error: null };

type SignedEntry = { path: string | null; signedUrl: string; error: string | null };
let signedUrlsResult: { data: SignedEntry[] | null; error: unknown } = {
  data: [],
  error: null,
};
const createSignedUrls = vi.fn(async (_paths: string[], _expiresIn: number) => signedUrlsResult);
const storageFrom = vi.fn(() => ({ createSignedUrls }));
const fromSpy = vi.fn(() => makeBuilder(tableResult));

const supabaseClient = {
  from: fromSpy,
  storage: { from: storageFrom },
};

vi.mock('@supabase/ssr', () => ({
  createBrowserClient: () => supabaseClient,
}));

vi.mock('@tanstack/react-query', () => ({
  // Returns the config so tests can call queryFn and read `enabled` directly.
  useQuery: (config: unknown) => config,
}));

// Import AFTER the mocks are wired up.
import {
  useScanRefineArtifacts,
  parseScanRefineRecord,
  DEFAULT_REFINE_ARTIFACT_NAMES,
  type ScanRefineArtifactSet,
} from '../use-scan-refine-artifacts';

// ─────────────────────────────────────────────────────────────────────────────
// Fixtures
// ─────────────────────────────────────────────────────────────────────────────

const SCAN = 'ec1f9a54-0000-4000-8000-000000000001';
const ROOM_FILE = 'ec1f9a54-0000-4000-8000-0000000000f1';
const PREFIX = `room_file/74056c2a-866d-42b0-9e2a-d473c2484316/${SCAN}/v1/refine`;

const ADVISORY =
  'advisory_not_gating_r123: loop_rotation_rmse_deg 1.250000->1.310000 (+4.80%); ' +
  'loop_translation_direction_rmse_deg 2.000000->1.900000 (-5.00%); verified_loop_edges 31';

function refineRecord(overrides: Record<string, unknown> = {}) {
  return {
    scanId: SCAN,
    roomFileId: ROOM_FILE,
    roomFileVersion: 1,
    bucket: 'room-scans',
    keysByName: {
      'pose-deltas-v1.json': `${PREFIX}/pose-deltas-v1.json`,
      'refined-poses-v1.json': `${PREFIX}/refined-poses-v1.json`,
      'refinement-evidence-v1.json': `${PREFIX}/refinement-evidence-v1.json`,
      'refine-manifest-v1.json': `${PREFIX}/refine-manifest-v1.json`,
    },
    refinementEvidenced: true,
    absoluteAccuracyCertified: false,
    verdictReason: 'reprojection improved and loop evidence held',
    loopConsistencyAdvisory: ADVISORY,
    ...overrides,
  };
}

function roomFileRow(present: unknown, version = 1) {
  return { id: ROOM_FILE, scan_id: SCAN, version, present };
}

/** Invoke the hook's queryFn the way React Query would. */
async function runQuery(
  scanId: string | null,
  options?: Parameters<typeof useScanRefineArtifacts>[1],
) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const config = useScanRefineArtifacts(scanId, options) as any;
  return (await config.queryFn()) as ScanRefineArtifactSet | null;
}

const fetchMock = vi.fn();

beforeEach(() => {
  tableResult = { data: [], error: null };
  signedUrlsResult = { data: [], error: null };
  // This package's vitest config does not set `clearMocks`, so call history
  // and implementations leak between tests unless reset explicitly — and the
  // "nothing was signed" assertions are exactly the ones a leak would falsify.
  fetchMock.mockReset();
  createSignedUrls.mockReset();
  createSignedUrls.mockImplementation(async () => signedUrlsResult);
  storageFrom.mockClear();
  fromSpy.mockClear();
  vi.stubGlobal('fetch', fetchMock);
});

/** Sign every requested path and serve each one a JSON body. */
function serve(bodies: Record<string, unknown>, status = 200) {
  createSignedUrls.mockImplementation(async (paths: string[]) => ({
    data: paths.map((path) => ({
      path,
      signedUrl: `https://storage.test/${path}?token=abc`,
      error: null,
    })),
    error: null,
  }));
  fetchMock.mockImplementation(async (url: string) => {
    const name = url.split('?')[0].split('/').pop() as string;
    if (!(name in bodies)) return { ok: false, status: 404, json: async () => ({}) };
    return { ok: status === 200, status, json: async () => bodies[name] };
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// parseScanRefineRecord
// ═══════════════════════════════════════════════════════════════════════════

describe('parseScanRefineRecord', () => {
  const ctx = { scanId: SCAN, roomFileId: ROOM_FILE, roomFileVersion: 1 };

  it('reads a well-formed record and keeps the advisory verbatim', () => {
    const parsed = parseScanRefineRecord({ refine_engine: refineRecord() }, ctx);
    expect(parsed).not.toBeNull();
    expect(parsed!.bucket).toBe('room-scans');
    expect(parsed!.refinementEvidenced).toBe(true);
    expect(parsed!.absoluteAccuracyCertified).toBe(false);
    // Character for character — refine_adapter.py:1116.
    expect(parsed!.loopConsistencyAdvisory).toBe(ADVISORY);
    expect(parsed!.keysByName['pose-deltas-v1.json']).toBe(
      `${PREFIX}/pose-deltas-v1.json`,
    );
  });

  it.each([
    ['present null', null],
    ['present a string', 'nope'],
    ['present an array', [{ refine_engine: {} }]],
    ['no refine_engine key', { drawings: {} }],
    ['refine_engine not an object', { refine_engine: 'delivered' }],
    ['no bucket', { refine_engine: refineRecord({ bucket: undefined }) }],
    ['empty bucket', { refine_engine: refineRecord({ bucket: '' }) }],
    ['no keys at all', { refine_engine: refineRecord({ keysByName: {} }) }],
    ['keysByName not an object', { refine_engine: refineRecord({ keysByName: 'x' }) }],
    [
      'refinementEvidenced not a boolean',
      { refine_engine: refineRecord({ refinementEvidenced: 'true' }) },
    ],
    [
      'absoluteAccuracyCertified missing',
      { refine_engine: refineRecord({ absoluteAccuracyCertified: undefined }) },
    ],
  ])('%s → null, no throw', (_label, present) => {
    let parsed: unknown;
    expect(() => {
      parsed = parseScanRefineRecord(present, ctx);
    }).not.toThrow();
    expect(parsed).toBeNull();
  });

  it('drops individual non-string keys rather than the whole record', () => {
    const parsed = parseScanRefineRecord(
      {
        refine_engine: refineRecord({
          keysByName: {
            'pose-deltas-v1.json': `${PREFIX}/pose-deltas-v1.json`,
            'refined-poses-v1.json': 42,
            'refinement-evidence-v1.json': '',
          },
        }),
      },
      ctx,
    );
    expect(Object.keys(parsed!.keysByName)).toEqual(['pose-deltas-v1.json']);
  });

  it('accepts the per-artifact rows shape as an alternative to keysByName', () => {
    const parsed = parseScanRefineRecord(
      {
        refine_engine: refineRecord({
          keysByName: undefined,
          artifacts: [
            { name: 'pose-deltas-v1.json', key: `${PREFIX}/pose-deltas-v1.json`, sha256: 'a' },
            { name: 'refinement-evidence-v1.json', key: `${PREFIX}/refinement-evidence-v1.json` },
            { name: 'nameless' },
          ],
        }),
      },
      ctx,
    );
    expect(Object.keys(parsed!.keysByName).sort()).toEqual([
      'pose-deltas-v1.json',
      'refinement-evidence-v1.json',
    ]);
  });

  it('falls back to the row context when the record omits its own identity', () => {
    const parsed = parseScanRefineRecord(
      {
        refine_engine: refineRecord({
          scanId: undefined,
          roomFileId: undefined,
          roomFileVersion: 'one',
        }),
      },
      ctx,
    );
    expect(parsed!.scanId).toBe(SCAN);
    expect(parsed!.roomFileId).toBe(ROOM_FILE);
    expect(parsed!.roomFileVersion).toBe(1);
  });

  it('a record whose verdict is unreadable is refused, not half-rendered', () => {
    expect(
      parseScanRefineRecord(
        { refine_engine: refineRecord({ refinementEvidenced: null }) },
        ctx,
      ),
    ).toBeNull();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// The flag gate — the property the whole design turns on
// ═══════════════════════════════════════════════════════════════════════════

describe('useScanRefineArtifacts — gating', () => {
  it('enabled: false ⇒ the query never runs (zero DB, zero Storage)', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const config = useScanRefineArtifacts(SCAN, { enabled: false }) as any;
    expect(config.enabled).toBe(false);
    expect(fromSpy).not.toHaveBeenCalled();
    expect(storageFrom).not.toHaveBeenCalled();
    expect(createSignedUrls).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([
    ['null', null],
    ['undefined', undefined],
    ['empty string', ''],
  ])('scanId %s ⇒ disabled', (_label, scanId) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const config = useScanRefineArtifacts(scanId as string | null) as any;
    expect(config.enabled).toBe(false);
  });

  it('is enabled only with BOTH a scanId and the flag on', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((useScanRefineArtifacts(SCAN, { enabled: true }) as any).enabled).toBe(true);
  });

  it('caches forever — the artifacts are create-only and checksummed', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((useScanRefineArtifacts(SCAN) as any).staleTime).toBe(Infinity);
  });

  it('the query key carries the scan and the SORTED wanted names', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const config = useScanRefineArtifacts(SCAN, {
      names: ['refinement-evidence-v1.json', 'pose-deltas-v1.json', 'pose-deltas-v1.json'],
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    }) as any;
    expect(config.queryKey).toEqual([
      'scan-refine-artifacts',
      SCAN,
      ['pose-deltas-v1.json', 'refinement-evidence-v1.json'],
    ]);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Resolution
// ═══════════════════════════════════════════════════════════════════════════

describe('useScanRefineArtifacts — resolution', () => {
  it('signs ONLY the wanted keys, in ONE createSignedUrls call', async () => {
    tableResult = { data: [roomFileRow({ refine_engine: refineRecord() })], error: null };
    serve({
      'pose-deltas-v1.json': { schemaVersion: 1, frames: [] },
      'refinement-evidence-v1.json': { schemaVersion: 1, refinementEvidenced: true },
    });

    const result = await runQuery(SCAN);

    expect(createSignedUrls).toHaveBeenCalledTimes(1);
    const [paths, expiresIn] = createSignedUrls.mock.calls[0];
    expect(expiresIn).toBe(3600);
    // The record carries four keys; only the two wanted ones are signed —
    // the manifest and refined-poses are never fetched by this consumer.
    expect(paths.sort()).toEqual([
      `${PREFIX}/pose-deltas-v1.json`,
      `${PREFIX}/refinement-evidence-v1.json`,
    ]);
    expect(Object.keys(result!.documents).sort()).toEqual([
      ...DEFAULT_REFINE_ARTIFACT_NAMES,
    ].sort());
    expect(result!.documents['pose-deltas-v1.json']).toEqual({
      schemaVersion: 1,
      frames: [],
    });
  });

  it('honours a caller-supplied name list', async () => {
    tableResult = { data: [roomFileRow({ refine_engine: refineRecord() })], error: null };
    serve({ 'refined-poses-v1.json': { schemaVersion: 1, frames: [] } });

    const result = await runQuery(SCAN, { names: ['refined-poses-v1.json'] });

    expect(createSignedUrls.mock.calls[0][0]).toEqual([
      `${PREFIX}/refined-poses-v1.json`,
    ]);
    expect(result!.documents['refined-poses-v1.json']).toEqual({
      schemaVersion: 1,
      frames: [],
    });
  });

  it('takes the newest room_file version that carries a record', async () => {
    tableResult = {
      data: [
        roomFileRow({ drawings: {} }, 3), // v3: no refine record
        roomFileRow({ refine_engine: refineRecord({ roomFileVersion: 2 }) }, 2),
        roomFileRow({ refine_engine: refineRecord({ roomFileVersion: 1 }) }, 1),
      ],
      error: null,
    };
    serve({ 'pose-deltas-v1.json': { schemaVersion: 1, frames: [] } });

    const result = await runQuery(SCAN);
    expect(result!.record.roomFileVersion).toBe(2);
  });

  it.each([
    ['no room_files rows', [] as unknown[]],
    ['a row with no present', [roomFileRow(null)]],
    ['a row with no refine_engine', [roomFileRow({ drawings: {} })]],
  ])('%s ⇒ null, and nothing is signed', async (_label, rows) => {
    tableResult = { data: rows, error: null };
    const result = await runQuery(SCAN);
    expect(result).toBeNull();
    expect(createSignedUrls).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('a record carrying none of the wanted keys ⇒ null, nothing signed', async () => {
    tableResult = {
      data: [
        roomFileRow({
          refine_engine: refineRecord({
            keysByName: { 'refine-manifest-v1.json': `${PREFIX}/refine-manifest-v1.json` },
          }),
        }),
      ],
      error: null,
    };
    const result = await runQuery(SCAN);
    expect(result).toBeNull();
    expect(createSignedUrls).not.toHaveBeenCalled();
  });

  it('a 404 on one artifact yields null for THAT slot, not a failed query', async () => {
    tableResult = { data: [roomFileRow({ refine_engine: refineRecord() })], error: null };
    serve({ 'pose-deltas-v1.json': { schemaVersion: 1, frames: [] } }); // evidence 404s

    const result = await runQuery(SCAN);
    expect(result!.documents['pose-deltas-v1.json']).not.toBeNull();
    expect(result!.documents['refinement-evidence-v1.json']).toBeNull();
  });

  it('a rejected fetch yields null for that slot (allSettled, not all)', async () => {
    tableResult = { data: [roomFileRow({ refine_engine: refineRecord() })], error: null };
    createSignedUrls.mockImplementation(async (paths: string[]) => ({
      data: paths.map((path) => ({
        path,
        signedUrl: `https://storage.test/${path}`,
        error: null,
      })),
      error: null,
    }));
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('pose-deltas')) throw new TypeError('network down');
      return { ok: true, status: 200, json: async () => ({ schemaVersion: 1 }) };
    });

    let result: ScanRefineArtifactSet | null = null;
    await expect(
      (async () => {
        result = await runQuery(SCAN);
      })(),
    ).resolves.toBeUndefined();
    expect(result!.documents['pose-deltas-v1.json']).toBeNull();
    expect(result!.documents['refinement-evidence-v1.json']).toEqual({ schemaVersion: 1 });
  });

  it('malformed JSON yields null for that slot', async () => {
    tableResult = { data: [roomFileRow({ refine_engine: refineRecord() })], error: null };
    createSignedUrls.mockImplementation(async (paths: string[]) => ({
      data: paths.map((path) => ({ path, signedUrl: `https://s/${path}`, error: null })),
      error: null,
    }));
    fetchMock.mockImplementation(async () => ({
      ok: true,
      status: 200,
      json: async () => {
        throw new SyntaxError('Unexpected token <');
      },
    }));

    const result = await runQuery(SCAN);
    expect(result!.documents['pose-deltas-v1.json']).toBeNull();
    expect(result!.documents['refinement-evidence-v1.json']).toBeNull();
  });

  it('a signing failure degrades every slot to null rather than throwing', async () => {
    tableResult = { data: [roomFileRow({ refine_engine: refineRecord() })], error: null };
    createSignedUrls.mockImplementation(async () => ({
      data: null,
      error: { message: 'not authorized' },
    }));

    const result = await runQuery(SCAN);
    expect(result!.record.bucket).toBe('room-scans');
    expect(result!.documents['pose-deltas-v1.json']).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('one signed entry carrying an error degrades only that slot', async () => {
    tableResult = { data: [roomFileRow({ refine_engine: refineRecord() })], error: null };
    createSignedUrls.mockImplementation(async (paths: string[]) => ({
      data: paths.map((path) => ({
        path,
        signedUrl: `https://s/${path}`,
        error: path.includes('evidence') ? 'Object not found' : null,
      })),
      error: null,
    }));
    fetchMock.mockImplementation(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ schemaVersion: 1, frames: [] }),
    }));

    const result = await runQuery(SCAN);
    expect(result!.documents['pose-deltas-v1.json']).toEqual({ schemaVersion: 1, frames: [] });
    expect(result!.documents['refinement-evidence-v1.json']).toBeNull();
  });

  it('signs against the bucket the RECORD names, not a hard-coded one', async () => {
    tableResult = {
      data: [roomFileRow({ refine_engine: refineRecord({ bucket: 'other-bucket' }) })],
      error: null,
    };
    serve({ 'pose-deltas-v1.json': { schemaVersion: 1 } });
    await runQuery(SCAN);
    expect(storageFrom).toHaveBeenCalledWith('other-bucket');
  });

  it('a public-URL-form key is repaired to a bare path before signing (R122)', async () => {
    const publicForm = `https://x.supabase.co/storage/v1/object/public/room-scans/${PREFIX}/pose-deltas-v1.json`;
    tableResult = {
      data: [
        roomFileRow({
          refine_engine: refineRecord({
            keysByName: { 'pose-deltas-v1.json': publicForm },
          }),
        }),
      ],
      error: null,
    };
    serve({ 'pose-deltas-v1.json': { schemaVersion: 1 } });

    await runQuery(SCAN, { names: ['pose-deltas-v1.json'] });
    expect(createSignedUrls.mock.calls[0][0]).toEqual([
      `${PREFIX}/pose-deltas-v1.json`,
    ]);
  });

  it('a database error still propagates — that is a real failure, not a gap', async () => {
    tableResult = { data: null, error: { message: 'permission denied' } };
    await expect(runQuery(SCAN)).rejects.toEqual({ message: 'permission denied' });
  });
});
