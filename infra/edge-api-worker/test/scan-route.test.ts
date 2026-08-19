/**
 * `GET /v1/scan/room-files/:roomFileId/artifacts/:kind` — the scan read path.
 *
 * The route's whole security argument is that it adds no authorization of its
 * own: it verifies the JWT, then reads under `SET LOCAL ROLE authenticated` on
 * the UNCACHED binding and lets RLS answer. So the suite asserts the mechanism
 * (which binding, which statements, in which order) alongside the responses —
 * a route that returned the right 404 from the wrong connection would be a
 * cross-tenant read waiting to happen.
 *
 * The negative that matters most: a valid caller asking for a Room File they
 * cannot see gets the SAME 404 as one that does not exist. A 403 there would
 * confirm the row — the mood-board bug class this plan gates against.
 */

import { generateKeyPair, SignJWT } from 'jose';
import { createWorker, type WorkerDependencies } from '../src';
import type { QueryResult } from 'pg';
import {
  type DatabaseClient,
  type DatabaseClientFactory,
} from '../src/database';
import type { EdgeApiEnv } from '../src/env';
import {
  parseScanArtifactPath,
  readArtifactRefs,
  resolveScanArtifacts,
} from '../src/scan';
import { ALERT_EVENTS } from '../src/security';

const ROOM_FILE_ID = '3f2b1a6e-8c4d-4a71-9f30-0d2b7c5a1e88';
const SPLAT_OBJECT = 'a1111111-2222-4333-8444-555555555555';
const GLB_OBJECT = 'b1111111-2222-4333-8444-555555555555';
const RENDER_A = 'c1111111-2222-4333-8444-555555555555';
const RENDER_B = 'd1111111-2222-4333-8444-555555555555';

const AUTH_ISSUER = 'https://project.supabase.co/auth/v1';
const R2_ENDPOINT = 'https://account.r2.cloudflarestorage.com';
const SECRET_KEY = 'scan-r2-secret-do-not-log';

function env(overrides: Partial<EdgeApiEnv> = {}): EdgeApiEnv {
  return {
    DB_FRESH: { connectionString: 'postgres://rls-login' } as Hyperdrive,
    DB_PUBLIC_CACHE: {
      connectionString: 'postgres://public-cache',
    } as Hyperdrive,
    SUPABASE_UPSTREAM_URL: 'https://project.supabase.co',
    SUPABASE_ANON_KEY: 'anon-key',
    SUPABASE_JWT_ISSUER: AUTH_ISSUER,
    SUPABASE_JWT_AUDIENCE: 'authenticated',
    SUPABASE_JWKS_URL:
      'https://project.supabase.co/auth/v1/.well-known/jwks.json',
    CATALOG_SOURCE: 'legacy',
    CATALOG_HYPERDRIVE_PERCENT: '0',
    LEGACY_FETCH_TIMEOUT_MS: '100',
    COMPATIBILITY_FETCH_TIMEOUT_MS: '100',
    WEBSOCKET_HANDSHAKE_TIMEOUT_MS: '50',
    SCAN_ROUTES: 'on',
    SCAN_R2_ENDPOINT: R2_ENDPOINT,
    SCAN_R2_BUCKET: 'patina-staging-media-artifacts-us',
    SCAN_R2_ACCESS_KEY_ID: 'AKIAEXAMPLEKEYID',
    SCAN_R2_SECRET_ACCESS_KEY: SECRET_KEY,
    MEDIA_UPLOADS: 'off',
    SCAN_R2_ORIGINALS_BUCKET: 'patina-staging-media-originals-us',
    ...overrides,
  };
}

function dependencies(
  overrides: Partial<WorkerDependencies> = {},
): WorkerDependencies {
  return {
    fetcher: vi.fn(async () => new Response('upstream')),
    queryHyperdrive: vi.fn(async () => []),
    queryFresh: vi.fn(async () => []),
    queryLegacy: vi.fn(async () => []),
    probe: vi.fn(async () => true),
    authorizeHealth: vi.fn(async () => true),
    verifyAuthenticated: vi.fn(async () => {
      throw new Error('unauthorized');
    }),
    resolveScanArtifacts: vi.fn(async () => []),
    authorizeUpload: vi.fn(async () => {}),
    createUploadIntent: vi.fn(async () => {
      throw new Error('media uploads are off in this fixture');
    }),
    resolveUploadForConfirm: vi.fn(async () => {
      throw new Error('media uploads are off in this fixture');
    }),
    confirmUpload: vi.fn(async () => {
      throw new Error('media uploads are off in this fixture');
    }),
    randomUUID: () => 'trace-0000000000000000000000001',
    cohortKey: () => 'trusted-cohort',
    now: () => new Date('2026-08-18T12:34:56.789Z'),
    log: vi.fn(),
    ...overrides,
  };
}

async function request(
  worker: ReturnType<typeof createWorker>,
  requestEnv: EdgeApiEnv,
  path = `/v1/scan/room-files/${ROOM_FILE_ID}/artifacts/splat`,
  headers?: HeadersInit,
) {
  return worker.fetch!(
    new Request(`https://api.patina.cloud${path}`, { headers }) as Request<
      unknown,
      IncomingRequestCfProperties
    >,
    requestEnv,
    {
      waitUntil() {},
      passThroughOnException() {},
      props: {},
    } as unknown as ExecutionContext,
  );
}

async function authToken(privateKey: CryptoKey, role = 'authenticated') {
  const now = Math.floor(Date.now() / 1000);
  return new SignJWT({ role })
    .setProtectedHeader({ alg: 'RS256' })
    .setSubject('00000000-0000-4000-8000-000000000009')
    .setIssuer(AUTH_ISSUER)
    .setAudience('authenticated')
    .setIssuedAt(now)
    .setExpirationTime(now + 60)
    .sign(privateKey);
}

// ── A scripted Postgres client ───────────────────────────────────────────────
// Answers by statement shape rather than call index, so the assertions do not
// silently pass when the route stops issuing one of the two reads.

interface Recorded {
  connectionString: string;
  commands: Array<{ text: string; values?: unknown[] }>;
  ended: boolean;
}

function scriptedFactory(
  recorded: Recorded[],
  rows: { roomFile?: unknown; mediaObjects?: unknown[] },
): DatabaseClientFactory {
  return (connectionString) => {
    const record: Recorded = { connectionString, commands: [], ended: false };
    recorded.push(record);
    const client: DatabaseClient = {
      async connect() {},
      async query<T extends Record<string, unknown> = Record<string, unknown>>(
        text: string,
        values?: unknown[],
      ): Promise<QueryResult<T>> {
        record.commands.push({ text, values });
        const empty = {
          rows: [],
          command: '',
          rowCount: 0,
          oid: 0,
          fields: [],
        } as unknown as QueryResult<T>;
        if (text.includes('FROM public.room_files')) {
          return {
            ...empty,
            rows: rows.roomFile === undefined ? [] : [{ artifacts: rows.roomFile }],
          } as unknown as QueryResult<T>;
        }
        if (text.includes('FROM public.media_objects')) {
          return {
            ...empty,
            rows: (rows.mediaObjects ?? []) as Record<string, unknown>[],
          } as unknown as QueryResult<T>;
        }
        return empty;
      },
      async end() {
        record.ended = true;
      },
    };
    return client;
  };
}

function object(id: string, key: string) {
  return { id, bucket: 'patina-staging-media-artifacts-us', object_key: key };
}

async function liveWorker(rows: {
  roomFile?: unknown;
  mediaObjects?: unknown[];
}) {
  const { privateKey, publicKey } = await generateKeyPair('RS256');
  const recorded: Recorded[] = [];
  const createClient = scriptedFactory(recorded, rows);
  const deps = dependencies({
    resolveScanArtifacts: (req, requestEnv, target) =>
      resolveScanArtifacts(req, requestEnv, target, {
        key: publicKey,
        createClient,
      }),
  });
  return {
    recorded,
    deps,
    worker: createWorker(deps),
    bearer: { authorization: `Bearer ${await authToken(privateKey)}` },
    async badRole() {
      return {
        authorization: `Bearer ${await authToken(privateKey, 'service_role')}`,
      };
    },
  };
}

// ── Path parsing ─────────────────────────────────────────────────────────────

describe('route parsing', () => {
  it('accepts exactly the three artifact kinds', () => {
    for (const kind of ['splat', 'glb', 'renders']) {
      expect(
        parseScanArtifactPath(
          `/v1/scan/room-files/${ROOM_FILE_ID}/artifacts/${kind}`,
        ),
      ).toEqual({ roomFileId: ROOM_FILE_ID, kind });
    }
  });

  it('refuses an unknown kind, a non-UUID id, and anything off the route', () => {
    for (const path of [
      `/v1/scan/room-files/${ROOM_FILE_ID}/artifacts/certificate`,
      `/v1/scan/room-files/${ROOM_FILE_ID}/artifacts/`,
      `/v1/scan/room-files/${ROOM_FILE_ID}/artifacts/splat/extra`,
      '/v1/scan/room-files/not-a-uuid/artifacts/splat',
      "/v1/scan/room-files/1' OR 1=1--/artifacts/splat",
      `/v1/scan/room-files/${ROOM_FILE_ID}`,
      '/v1/catalog/products',
    ]) {
      expect(parseScanArtifactPath(path)).toBeNull();
    }
  });
});

describe('artifact map reading', () => {
  it('reads a single ref for splat and glb', () => {
    const artifacts = {
      splat: { object_id: SPLAT_OBJECT, version: 2 },
      glb: { object_id: GLB_OBJECT },
    };
    expect([...readArtifactRefs(artifacts, 'splat')]).toEqual([
      ['splat', { objectId: SPLAT_OBJECT, version: 2 }],
    ]);
    expect([...readArtifactRefs(artifacts, 'glb')]).toEqual([
      ['glb', { objectId: GLB_OBJECT, version: null }],
    ]);
  });

  it('reads renders as a shot map, in a stable order whatever order it was written', () => {
    const refs = readArtifactRefs(
      {
        renders: {
          turntable: { object_id: RENDER_B },
          corner_ne: { object_id: RENDER_A },
        },
      },
      'renders',
    );
    expect([...refs.keys()]).toEqual(['corner_ne', 'turntable']);
  });

  // The real stored shape (`renders_job.py`'s `run_renders`, verbatim from
  // staging room_files id 5bc4cef2-44fd-5d6f-b7fc-3dfe005e99ab, scan
  // cd72ad9b-da14-5eee-a8c7-1f71ace9db12): the cover shot's ref is hoisted to
  // `renders.object_id`/`.version` so 00490's `scan_media_read` can resolve a
  // single-object ref, and `renders.shots` carries the full set the gallery
  // shows together. This is what broke the flat-map assumption in production.
  const HOISTED_COVER_RENDERS = {
    renders: {
      object_id: '7ca139c2-adb7-4177-b9f6-26331244b548',
      version: 1,
      cover: 'top_down',
      count: 3,
      shots: {
        top_down: {
          object_id: '7ca139c2-adb7-4177-b9f6-26331244b548',
          object_key:
            'scan_artifacts/cd72ad9b-da14-5eee-a8c7-1f71ace9db12/v1/renders/top_down.jpg',
          sha256: '3c520ae6b88e7866b61f7a131fdde09244e3264f28e9e556b62b935857bb2b8',
        },
        corner_ne: {
          object_id: '9ebc2bc4-f96b-4437-a3b5-d1cd48994ffb',
          object_key:
            'scan_artifacts/cd72ad9b-da14-5eee-a8c7-1f71ace9db12/v1/renders/corner_ne.jpg',
          sha256: '620f6402256981dfc66b695a23fb482df46bf80934eea9919cb40c073381d7e',
        },
        corner_nw: {
          object_id: '4e2db7a2-98b3-41a9-8545-e31a8a194366',
          object_key:
            'scan_artifacts/cd72ad9b-da14-5eee-a8c7-1f71ace9db12/v1/renders/corner_nw.jpg',
          sha256: '11cb508e846fadf9ebf579b04a196a268fef0a32cfcacdf42f38286ca8de1ea',
        },
      },
    },
  };

  it('reads the real hoisted-cover shape: the shots map, keyed by shot name', () => {
    const refs = readArtifactRefs(HOISTED_COVER_RENDERS, 'renders');
    expect([...refs.keys()]).toEqual(['corner_ne', 'corner_nw', 'top_down']);
    expect(refs.get('top_down')).toEqual({
      objectId: '7ca139c2-adb7-4177-b9f6-26331244b548',
      version: null, // per-shot entries carry no `version` field of their own
    });
  });

  it('does not duplicate the cover under a synthetic `cover` key when a shot already carries its object id', () => {
    const refs = readArtifactRefs(HOISTED_COVER_RENDERS, 'renders');
    // top_down IS the cover (object_id matches renders.object_id) — no
    // separate 'cover' entry should appear.
    expect(refs.has('cover')).toBe(false);
    expect(refs.size).toBe(3);
  });

  it('folds the hoisted cover in under key "cover" when no shot in the set resolves to the same object', () => {
    const refs = readArtifactRefs(
      {
        renders: {
          object_id: RENDER_B, // not present in `shots` below
          version: 1,
          cover: 'missing_shot',
          count: 1,
          shots: {
            corner_ne: { object_id: RENDER_A },
          },
        },
      },
      'renders',
    );
    expect([...refs.keys()]).toEqual(['corner_ne', 'cover']);
    expect(refs.get('cover')).toEqual({ objectId: RENDER_B, version: 1 });
  });

  it('tolerates the legacy flat shape (no `shots` key) as a fallback', () => {
    const refs = readArtifactRefs(
      {
        renders: {
          turntable: { object_id: RENDER_B },
          corner_ne: { object_id: RENDER_A },
        },
      },
      'renders',
    );
    expect([...refs.keys()]).toEqual(['corner_ne', 'turntable']);
  });

  it('is total against a jsonb column with no shape constraint', () => {
    // None of these may throw inside a request; all read as "no artifact".
    for (const value of [
      undefined,
      null,
      {},
      [],
      'splat',
      42,
      { splat: null },
      { splat: [] },
      { splat: { object_id: '' } },
      { splat: { object_id: 'not-a-uuid' } },
      { splat: { object_id: 7 } },
    ]) {
      expect(readArtifactRefs(value, 'splat').size).toBe(0);
    }
    expect(readArtifactRefs({ renders: { a: 'nope' } }, 'renders').size).toBe(0);
    expect(readArtifactRefs({ renders: [] }, 'renders').size).toBe(0);
  });
});

// ── Authorization ────────────────────────────────────────────────────────────

describe('authorization', () => {
  it('401s without a bearer token, and never touches the database', async () => {
    const { worker, recorded } = await liveWorker({});
    const response = await request(worker, env());

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: 'unauthorized' });
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect(recorded).toHaveLength(0);
  });

  it('401s for a token whose role is not authenticated', async () => {
    const live = await liveWorker({});
    const response = await request(
      live.worker,
      env(),
      undefined,
      await live.badRole(),
    );
    expect(response.status).toBe(401);
    expect(live.recorded).toHaveLength(0);
  });

  it('404s — never 403 — for a Room File the caller cannot see', async () => {
    // RLS on room_files returns no row. The response is byte-identical to a
    // Room File that does not exist, so the route confirms nothing.
    const live = await liveWorker({ roomFile: undefined });
    const response = await request(live.worker, env(), undefined, live.bearer);

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: 'not_found' });
  });

  it('404s when the Room File is visible but registers no artifact of that kind', async () => {
    const live = await liveWorker({ roomFile: { glb: { object_id: GLB_OBJECT } } });
    const response = await request(live.worker, env(), undefined, live.bearer);
    expect(response.status).toBe(404);
  });

  it('404s when the artifact is registered but media_objects RLS hides the row', async () => {
    // The registry ref is readable from the Room File the caller owns, but the
    // object itself belongs to another scan — media_objects_select filters it.
    const live = await liveWorker({
      roomFile: { splat: { object_id: SPLAT_OBJECT } },
      mediaObjects: [],
    });
    const response = await request(live.worker, env(), undefined, live.bearer);
    expect(response.status).toBe(404);
  });
});

// ── The read itself ──────────────────────────────────────────────────────────

describe('the RLS read', () => {
  it('runs on the uncached DB_FRESH binding inside one authenticated transaction', async () => {
    const live = await liveWorker({
      roomFile: { splat: { object_id: SPLAT_OBJECT } },
      mediaObjects: [object(SPLAT_OBJECT, 'scans/abc/1/splat.spz')],
    });
    await request(live.worker, env(), undefined, live.bearer);

    expect(live.recorded).toHaveLength(1);
    const [connection] = live.recorded;
    // Never DB_PUBLIC_CACHE: user-scoped rows must not ride a cached binding.
    expect(connection.connectionString).toBe('postgres://rls-login');

    const commands = connection.commands.map((command) => command.text);
    expect(commands[0]).toBe('BEGIN');
    expect(commands[1]).toBe('SET LOCAL ROLE authenticated');
    expect(commands[2]).toBe(
      "SELECT set_config('request.jwt.claims', $1, true)",
    );
    expect(commands.at(-1)).toBe('COMMIT');
    expect(connection.ended).toBe(true);
  });

  it('parameterizes both reads and filters media objects to servable states', async () => {
    const live = await liveWorker({
      roomFile: { splat: { object_id: SPLAT_OBJECT } },
      mediaObjects: [object(SPLAT_OBJECT, 'scans/abc/1/splat.spz')],
    });
    await request(live.worker, env(), undefined, live.bearer);

    const commands = live.recorded[0].commands;
    const roomFile = commands.find((command) =>
      command.text.includes('FROM public.room_files'),
    );
    expect(roomFile?.values).toEqual([ROOM_FILE_ID]);

    const media = commands.find((command) =>
      command.text.includes('FROM public.media_objects'),
    );
    // 'pending' has no confirmed bytes; 'deleted' is terminal. Signing either
    // would hand the portal a URL that 404s at R2.
    expect(media?.values).toEqual([[SPLAT_OBJECT], ['stored', 'verified']]);
  });
});

// ── Responses ────────────────────────────────────────────────────────────────

describe('capability URLs', () => {
  it('returns one signed, expiring URL for a single-ref kind', async () => {
    const live = await liveWorker({
      roomFile: { splat: { object_id: SPLAT_OBJECT, version: 2 } },
      mediaObjects: [object(SPLAT_OBJECT, 'scans/abc/1/splat.spz')],
    });
    const response = await request(live.worker, env(), undefined, live.bearer);

    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('private, no-store');

    const body = (await response.json()) as {
      kind: string;
      url: string;
      expiresAt: string;
    };
    expect(body.kind).toBe('splat');
    expect(body.expiresAt).toBe('2026-08-18T12:44:56.789Z');

    const url = new URL(body.url);
    expect(url.origin).toBe(R2_ENDPOINT);
    expect(url.pathname).toBe(
      '/patina-staging-media-artifacts-us/scans/abc/1/splat.spz',
    );
    expect(url.searchParams.get('X-Amz-Expires')).toBe('600');
    expect(url.searchParams.get('X-Amz-SignedHeaders')).toBe('host');
    expect(url.searchParams.get('X-Amz-Signature')).toMatch(/^[0-9a-f]{64}$/);
    // The signing secret never rides the URL — only the access key id does.
    expect(body.url).not.toContain(SECRET_KEY);
  });

  it('returns a shot map for renders, one URL per shot', async () => {
    const live = await liveWorker({
      roomFile: {
        renders: {
          turntable: { object_id: RENDER_B },
          corner_ne: { object_id: RENDER_A },
        },
      },
      mediaObjects: [
        object(RENDER_A, 'scans/abc/1/renders/corner_ne.jpg'),
        object(RENDER_B, 'scans/abc/1/renders/turntable.jpg'),
      ],
    });
    const response = await request(
      live.worker,
      env(),
      `/v1/scan/room-files/${ROOM_FILE_ID}/artifacts/renders`,
      live.bearer,
    );

    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      kind: string;
      shots: Record<string, { url: string; expiresAt: string }>;
    };
    expect(body.kind).toBe('renders');
    expect(Object.keys(body.shots)).toEqual(['corner_ne', 'turntable']);
    expect(new URL(body.shots.corner_ne.url).pathname).toBe(
      '/patina-staging-media-artifacts-us/scans/abc/1/renders/corner_ne.jpg',
    );
    expect(body.shots.turntable.expiresAt).toBe('2026-08-18T12:44:56.789Z');
  });

  it('returns a shot map for the real hoisted-cover renders shape end to end', async () => {
    // Same jsonb `room_files.artifacts.renders` a genuinely completed renders
    // job writes (verbatim, minus the sha256/extra fields — see the fixture
    // in the "artifact map reading" suite above for the full field set).
    const live = await liveWorker({
      roomFile: {
        renders: {
          object_id: RENDER_A, // cover ref, hoisted — equals shots.top_down below
          version: 1,
          cover: 'top_down',
          count: 2,
          shots: {
            top_down: { object_id: RENDER_A },
            corner_ne: { object_id: RENDER_B },
          },
        },
      },
      mediaObjects: [
        object(RENDER_A, 'scans/abc/1/renders/top_down.jpg'),
        object(RENDER_B, 'scans/abc/1/renders/corner_ne.jpg'),
      ],
    });
    const response = await request(
      live.worker,
      env(),
      `/v1/scan/room-files/${ROOM_FILE_ID}/artifacts/renders`,
      live.bearer,
    );

    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      kind: string;
      shots: Record<string, { url: string }>;
    };
    expect(body.kind).toBe('renders');
    // The cover (top_down) is not duplicated under a synthetic 'cover' key.
    expect(Object.keys(body.shots)).toEqual(['corner_ne', 'top_down']);
    expect(new URL(body.shots.top_down.url).pathname).toBe(
      '/patina-staging-media-artifacts-us/scans/abc/1/renders/top_down.jpg',
    );
  });

  it('omits a shot whose object the caller cannot see rather than failing the set', async () => {
    const live = await liveWorker({
      roomFile: {
        renders: {
          corner_ne: { object_id: RENDER_A },
          turntable: { object_id: RENDER_B },
        },
      },
      mediaObjects: [object(RENDER_A, 'scans/abc/1/renders/corner_ne.jpg')],
    });
    const response = await request(
      live.worker,
      env(),
      `/v1/scan/room-files/${ROOM_FILE_ID}/artifacts/renders`,
      live.bearer,
    );
    const body = (await response.json()) as { shots: Record<string, unknown> };
    expect(Object.keys(body.shots)).toEqual(['corner_ne']);
  });
});

// ── Logging ──────────────────────────────────────────────────────────────────

describe('logging', () => {
  it('logs the allowlisted failure event only — no id, key, or URL', async () => {
    const deps = dependencies({
      resolveScanArtifacts: vi.fn(async () => {
        throw new Error('connection refused');
      }),
    });
    const response = await request(createWorker(deps), env(), undefined, {
      authorization: 'Bearer irrelevant',
    });

    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: 'scan_artifact_unavailable' });
    expect(deps.log).toHaveBeenCalledWith({
      event: ALERT_EVENTS.scanArtifactFailure,
      severity: 'error',
      traceId: 'trace-0000000000000000000000001',
      routeClass: 'scan.artifact',
      artifactKind: 'splat',
      status: 503,
    });
  });

  it('emits nothing at all on the success path', async () => {
    const live = await liveWorker({
      roomFile: { splat: { object_id: SPLAT_OBJECT } },
      mediaObjects: [object(SPLAT_OBJECT, 'scans/abc/1/splat.spz')],
    });
    await request(live.worker, env(), undefined, live.bearer);
    expect(live.deps.log).not.toHaveBeenCalled();
  });
});

// ── The flag ─────────────────────────────────────────────────────────────────

describe('SCAN_ROUTES', () => {
  it('leaves the path unrouted when off — indistinguishable from any unknown path', async () => {
    const deps = dependencies();
    const response = await request(
      createWorker(deps),
      env({ SCAN_ROUTES: 'off' }),
      undefined,
      { authorization: 'Bearer irrelevant' },
    );

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: 'not_found' });
    expect(deps.resolveScanArtifacts).not.toHaveBeenCalled();
  });

  it('boots the worker 503 when on without its R2 credentials', async () => {
    // Fail LOUD: a scan route missing a secret could only ever 404, which is
    // indistinguishable from "this scan has no splat".
    for (const missing of [
      { SCAN_R2_ACCESS_KEY_ID: undefined },
      { SCAN_R2_SECRET_ACCESS_KEY: undefined },
      { SCAN_R2_ENDPOINT: '' },
      { SCAN_R2_BUCKET: '' },
      { DB_FRESH: undefined },
    ]) {
      const deps = dependencies();
      const response = await request(
        createWorker(deps),
        env(missing as Partial<EdgeApiEnv>),
        undefined,
        { authorization: 'Bearer irrelevant' },
      );
      expect(response.status).toBe(503);
      expect(await response.json()).toEqual({ error: 'service_unavailable' });
      expect(deps.log).toHaveBeenCalledWith(
        expect.objectContaining({
          event: ALERT_EVENTS.configurationInvalid,
          severity: 'critical',
        }),
      );
    }
  });

  it('refuses any value that is not off or on', async () => {
    const response = await request(
      createWorker(dependencies()),
      env({ SCAN_ROUTES: 'true' }),
      undefined,
      { authorization: 'Bearer irrelevant' },
    );
    expect(response.status).toBe(503);
  });

  it('does not disturb the catalog route when off', async () => {
    const deps = dependencies({ queryLegacy: vi.fn(async () => []) });
    const response = await request(
      createWorker(deps),
      env({ SCAN_ROUTES: 'off' }),
      '/v1/catalog/products?ids=00000000-0000-4000-8000-000000000001',
    );
    expect(response.status).toBe(200);
  });
});

// ── CORS ─────────────────────────────────────────────────────────────────────
// This route is called cross-origin, straight from portal browser JS, with an
// `Authorization` header — which forces a CORS preflight `OPTIONS` before the
// real `GET` ever leaves the browser. Confirmed missing live on staging: an
// `OPTIONS` to this exact path 404'd with no `access-control-*` headers at
// all, so `fetch()` failed with an opaque "Failed to fetch" and the read path
// never even reached the Worker — SPLAT/renders stuck on
// `unavailable: 'read-path-pending'` forever, indistinguishable from the route
// being genuinely unwired.
describe('CORS', () => {
  async function optionsRequest(
    worker: ReturnType<typeof createWorker>,
    requestEnv: EdgeApiEnv,
    path = `/v1/scan/room-files/${ROOM_FILE_ID}/artifacts/splat`,
  ) {
    return worker.fetch!(
      new Request(`https://api.patina.cloud${path}`, {
        method: 'OPTIONS',
        headers: {
          origin: 'https://patina-designer-portal-staging.kody-be3.workers.dev',
          'access-control-request-method': 'GET',
          'access-control-request-headers': 'authorization',
        },
      }) as Request<unknown, IncomingRequestCfProperties>,
      requestEnv,
      { waitUntil() {}, passThroughOnException() {}, props: {} } as unknown as ExecutionContext,
    );
  }

  it('answers the preflight with 204 and the CORS headers the browser checks', async () => {
    const response = await optionsRequest(createWorker(dependencies()), env());

    expect(response.status).toBe(204);
    expect(response.headers.get('access-control-allow-origin')).toBe('*');
    expect(response.headers.get('access-control-allow-methods')).toContain('GET');
    expect(response.headers.get('access-control-allow-headers')).toContain('authorization');
  });

  it('never touches the database for a preflight', async () => {
    const deps = dependencies();
    await optionsRequest(createWorker(deps), env());
    expect(deps.resolveScanArtifacts).not.toHaveBeenCalled();
  });

  it('leaves the preflight unrouted — same as any unmatched OPTIONS — when SCAN_ROUTES is off', async () => {
    const response = await optionsRequest(createWorker(dependencies()), env({ SCAN_ROUTES: 'off' }));
    expect(response.status).toBe(404);
    expect(response.headers.get('access-control-allow-origin')).toBeNull();
  });

  it('carries the same CORS header on the real GET response, success or not', async () => {
    // Default `resolveScanArtifacts` resolves to no objects -> 404, but the
    // CORS header must survive every response shape this route can return,
    // not just the happy path.
    const deps = dependencies();
    const response = await request(createWorker(deps), env(), undefined, {
      authorization: 'Bearer irrelevant',
    });
    expect(response.status).toBe(404);
    expect(response.headers.get('access-control-allow-origin')).toBe('*');
  });
});
