/**
 * `POST /v1/media/uploads` and `POST /v1/media/uploads/:uploadId/confirm` — the
 * Phase-2 upload interface, piloted for scan originals (DELIVERY-PLAN W3).
 *
 * The security argument is the same as the read path's and is asserted the same
 * way: the route adds no authorization of its own, so the suite pins the
 * MECHANISM — which binding, which statements, in which order — alongside the
 * responses. A route that minted the right URL from the wrong connection would
 * be a cross-tenant WRITE waiting to happen, which is strictly worse than the
 * read case.
 *
 * The presigned PUT is checked against an INDEPENDENT SigV4 implementation
 * (Python hmac/hashlib over the same inputs), not against this repo's signer,
 * so the test proves agreement with the algorithm rather than with src/r2.ts.
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
  assertObservedMatchesDeclared,
  assertUploadCaller,
  confirmUpload,
  createUploadIntent,
  hexToBase64,
  parseMediaUploadPath,
  parseUploadIntentBody,
  resolveUploadForConfirm,
  signUploadPut,
  UploadMismatchError,
  UploadRequestError,
  type PendingUpload,
} from '../src/media-uploads';
import { ALERT_EVENTS } from '../src/security';

const SCAN_ID = 'c3333333-3333-4333-8333-333333333333';
const UPLOAD_ID = 'e5555555-5555-4555-8555-555555555555';
const DECLARED_SHA = 'a'.repeat(64);
const DECLARED_SIZE = 2048;
const OBJECT_KEY = `scan_originals/${SCAN_ID}/mesh/mesh.ply`;
const ORIGINALS_BUCKET = 'patina-staging-media-originals-us';

const AUTH_ISSUER = 'https://project.supabase.co/auth/v1';
const R2_ENDPOINT =
  'https://be3aaeed18a81b5d90ee2263b62219ea.r2.cloudflarestorage.com';
const WRITE_KEY_ID = 'AKIAWRITEEXAMPLEID';
const WRITE_SECRET = 'example-write-secret-access-key';
const NOW = new Date('2026-08-18T12:34:56.789Z');

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
    SCAN_ROUTES: 'off',
    SCAN_R2_ENDPOINT: R2_ENDPOINT,
    SCAN_R2_BUCKET: 'patina-staging-media-artifacts-us',
    MEDIA_UPLOADS: 'on',
    SCAN_R2_ORIGINALS_BUCKET: ORIGINALS_BUCKET,
    SCAN_R2_WRITE_ACCESS_KEY_ID: WRITE_KEY_ID,
    SCAN_R2_WRITE_SECRET_ACCESS_KEY: WRITE_SECRET,
    ...overrides,
  };
}

function validBody(overrides: Record<string, unknown> = {}) {
  return {
    scanId: SCAN_ID,
    artifactKind: 'mesh',
    filename: 'mesh.ply',
    declaredSha256: DECLARED_SHA,
    declaredSize: DECLARED_SIZE,
    declaredMime: 'application/octet-stream',
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
    // Overridden with the REAL verifier by `liveWorker` below; the bare default
    // is a no-op so the tests that never reach the routes are unaffected.
    authorizeUpload: vi.fn(async () => {}),
    createUploadIntent: vi.fn(async () => ({
      uploadId: UPLOAD_ID,
      bucket: ORIGINALS_BUCKET,
      objectKey: OBJECT_KEY,
      lifecycleState: 'pending',
      version: 1,
      created: true,
    })),
    resolveUploadForConfirm: vi.fn(async () => ({
      bucket: ORIGINALS_BUCKET,
      objectKey: OBJECT_KEY,
      lifecycleState: 'pending',
      declaredSha256: DECLARED_SHA,
      declaredSize: DECLARED_SIZE,
    })),
    confirmUpload: vi.fn(async () => ({
      uploadId: UPLOAD_ID,
      lifecycleState: 'stored',
      sha256: DECLARED_SHA,
      etag: '"deadbeef"',
      sizeBytes: DECLARED_SIZE,
      changed: true,
    })),
    randomUUID: () => 'trace-0000000000000000000000002',
    cohortKey: () => 'trusted-cohort',
    now: () => NOW,
    log: vi.fn(),
    ...overrides,
  };
}

async function post(
  worker: ReturnType<typeof createWorker>,
  requestEnv: EdgeApiEnv,
  path: string,
  body: unknown,
  headers: HeadersInit = {},
) {
  return worker.fetch!(
    new Request(`https://api.patina.cloud${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...headers },
      body: typeof body === 'string' ? body : JSON.stringify(body),
    }) as Request<unknown, IncomingRequestCfProperties>,
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
// Answers by statement shape, not by call index, so an assertion cannot pass
// because the route quietly stopped issuing one of its statements.

interface Recorded {
  connectionString: string;
  commands: Array<{ text: string; values?: unknown[] }>;
  ended: boolean;
}

function scriptedFactory(
  recorded: Recorded[],
  rows: {
    roomScan?: unknown[];
    intent?: unknown;
    mediaObject?: unknown[];
    confirmed?: unknown;
    throwOn?: { match: string; error: unknown };
  },
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
        if (rows.throwOn && text.includes(rows.throwOn.match)) {
          throw rows.throwOn.error;
        }
        if (text.includes('FROM public.room_scans')) {
          return {
            ...empty,
            rows: (rows.roomScan ?? []) as Record<string, unknown>[],
          } as unknown as QueryResult<T>;
        }
        if (text.includes('create_media_upload_intent')) {
          return {
            ...empty,
            rows: [{ intent: rows.intent }],
          } as unknown as QueryResult<T>;
        }
        if (text.includes('FROM public.media_objects')) {
          return {
            ...empty,
            rows: (rows.mediaObject ?? []) as Record<string, unknown>[],
          } as unknown as QueryResult<T>;
        }
        if (text.includes('confirm_media_upload')) {
          return {
            ...empty,
            rows: [{ confirmed: rows.confirmed }],
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

const INTENT_ROW = {
  object_id: UPLOAD_ID,
  bucket: ORIGINALS_BUCKET,
  object_key: OBJECT_KEY,
  version: 1,
  lifecycle_state: 'pending',
  created: true,
};

async function liveWorker(rows: Parameters<typeof scriptedFactory>[1]) {
  const { privateKey, publicKey } = await generateKeyPair('RS256');
  const recorded: Recorded[] = [];
  const createClient = scriptedFactory(recorded, rows);
  const deps = dependencies({
    authorizeUpload: (req, requestEnv) =>
      assertUploadCaller(req, requestEnv, publicKey),
    createUploadIntent: (req, requestEnv, input) =>
      createUploadIntent(req, requestEnv, input, {
        key: publicKey,
        createClient,
      }),
    resolveUploadForConfirm: (req, requestEnv, uploadId) =>
      resolveUploadForConfirm(req, requestEnv, uploadId, {
        key: publicKey,
        createClient,
      }),
    confirmUpload: (req, requestEnv, uploadId, observed) =>
      confirmUpload(req, requestEnv, uploadId, observed, {
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
  it('matches the intent path and the confirm path', () => {
    expect(parseMediaUploadPath('/v1/media/uploads')).toEqual({ kind: 'intent' });
    expect(
      parseMediaUploadPath(`/v1/media/uploads/${UPLOAD_ID}/confirm`),
    ).toEqual({ kind: 'confirm', uploadId: UPLOAD_ID });
  });

  it('refuses a malformed upload id and anything off the routes', () => {
    for (const path of [
      '/v1/media/uploads/not-a-uuid/confirm',
      `/v1/media/uploads/${UPLOAD_ID}`,
      `/v1/media/uploads/${UPLOAD_ID}/confirm/extra`,
      "/v1/media/uploads/1' OR 1=1--/confirm",
      '/v1/media/uploads/',
      '/v1/scan/room-files',
    ]) {
      expect(parseMediaUploadPath(path)).toBeNull();
    }
  });
});

// ── Body validation ──────────────────────────────────────────────────────────

describe('intent body', () => {
  it('accepts a well-formed body', () => {
    expect(parseUploadIntentBody(validBody())).toEqual({
      scanId: SCAN_ID,
      artifactKind: 'mesh',
      filename: 'mesh.ply',
      declaredSha256: DECLARED_SHA,
      declaredSize: DECLARED_SIZE,
      declaredMime: 'application/octet-stream',
    });
  });

  it('refuses every malformed field, one class of error for all of them', () => {
    for (const body of [
      null,
      'a string',
      [],
      validBody({ scanId: 'not-a-uuid' }),
      validBody({ artifactKind: 'splat' }), // an ARTIFACT kind, not an ORIGINAL
      validBody({ artifactKind: 'usdz/../..' }),
      validBody({ filename: 'nested/path.ply' }),
      validBody({ filename: '../escape.ply' }),
      validBody({ filename: '.hidden' }),
      validBody({ filename: '' }),
      validBody({ declaredSha256: 'A'.repeat(64) }), // uppercase is not the hex we store
      validBody({ declaredSha256: 'abc' }),
      validBody({ declaredSize: 0 }),
      validBody({ declaredSize: -1 }),
      validBody({ declaredSize: 1.5 }),
      validBody({ declaredSize: 5_368_709_121 }),
      validBody({ declaredMime: 'not-a-mime' }),
      validBody({ declaredMime: 'application/octet stream' }),
    ]) {
      expect(() => parseUploadIntentBody(body)).toThrow(UploadRequestError);
    }
  });

  it('accepts every artifact kind the capture bundle actually carries', () => {
    for (const artifactKind of [
      'anchors',
      'bundleArchive',
      'bundleManifest',
      'capturedRoomJson',
      'coverageHeatmap',
      'depthArchive',
      'depthIndex',
      'heroFrame',
      'keyframeIndex',
      'keyframeSummary',
      'keyframesArchive',
      'mesh',
      'photosManifest',
      'scorecard',
      'thumbnail',
      'usdz',
      'worldMap',
    ]) {
      expect(parseUploadIntentBody(validBody({ artifactKind })).artifactKind).toBe(
        artifactKind,
      );
    }
  });

  // 00500: bundleArchive (the Patina client's whole-bundle zip) and
  // keyframesArchive (Field's keyframes.tar) share the legacy Supabase
  // Storage `bundle` folder / `scan_bundle_url` column, but the
  // registry-keyed interface (`scan_originals/{scanId}/{artifactKind}/…`)
  // must never conflate them — each kind name is its own key segment.
  it('treats bundleArchive and keyframesArchive as distinct kinds', () => {
    const bundleArchive = parseUploadIntentBody(
      validBody({ artifactKind: 'bundleArchive', filename: 'bundle.zip' }),
    );
    const keyframesArchive = parseUploadIntentBody(
      validBody({ artifactKind: 'keyframesArchive', filename: 'keyframes.tar' }),
    );
    expect(bundleArchive.artifactKind).toBe('bundleArchive');
    expect(keyframesArchive.artifactKind).toBe('keyframesArchive');
    expect(bundleArchive.artifactKind).not.toBe(keyframesArchive.artifactKind);
  });
});

// ── The presigned PUT ────────────────────────────────────────────────────────

describe('presigned PUT', () => {
  it('signs PUT with content-length and the sha256 checksum as conditions', async () => {
    const signed = await signUploadPut(
      env(),
      { bucket: ORIGINALS_BUCKET, objectKey: OBJECT_KEY },
      { declaredSha256: DECLARED_SHA, declaredSize: DECLARED_SIZE },
      NOW,
    );

    expect(signed.url).toBe(
      `${R2_ENDPOINT}/${ORIGINALS_BUCKET}/${OBJECT_KEY}` +
        '?X-Amz-Algorithm=AWS4-HMAC-SHA256' +
        `&X-Amz-Credential=${WRITE_KEY_ID}%2F20260818%2Fauto%2Fs3%2Faws4_request` +
        '&X-Amz-Date=20260818T123456Z' +
        '&X-Amz-Expires=1800' +
        '&X-Amz-SignedHeaders=content-length%3Bhost%3Bx-amz-checksum-sha256' +
        // Computed by an INDEPENDENT SigV4 implementation (Python hmac/hashlib
        // over the same inputs), so this asserts agreement with the algorithm
        // rather than agreement with src/r2.ts.
        '&X-Amz-Signature=e5c2d10dbc2a2c698ac6ab66810554db7328e8f3124ff3eff1e775c6bf52abc1',
    );
  });

  it('lives exactly thirty minutes', async () => {
    const signed = await signUploadPut(
      env(),
      { bucket: ORIGINALS_BUCKET, objectKey: OBJECT_KEY },
      { declaredSha256: DECLARED_SHA, declaredSize: DECLARED_SIZE },
      NOW,
    );
    expect(signed.expiresAt).toBe('2026-08-18T13:04:56.789Z');
  });

  it('signs with the WRITE credentials, never the read pair', async () => {
    const withoutRead = await signUploadPut(
      env({
        SCAN_R2_ACCESS_KEY_ID: undefined,
        SCAN_R2_SECRET_ACCESS_KEY: undefined,
      }),
      { bucket: ORIGINALS_BUCKET, objectKey: OBJECT_KEY },
      { declaredSha256: DECLARED_SHA, declaredSize: DECLARED_SIZE },
      NOW,
    );
    expect(withoutRead.url).toContain(WRITE_KEY_ID);
  });

  it('changes the signature when the declared size changes', async () => {
    const first = await signUploadPut(
      env(),
      { bucket: ORIGINALS_BUCKET, objectKey: OBJECT_KEY },
      { declaredSha256: DECLARED_SHA, declaredSize: DECLARED_SIZE },
      NOW,
    );
    const other = await signUploadPut(
      env(),
      { bucket: ORIGINALS_BUCKET, objectKey: OBJECT_KEY },
      { declaredSha256: DECLARED_SHA, declaredSize: DECLARED_SIZE + 1 },
      NOW,
    );
    expect(first.url).not.toBe(other.url);
  });

  it('base64-encodes the declared digest the way S3 expects', () => {
    expect(hexToBase64(DECLARED_SHA)).toBe(
      'qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqo=',
    );
  });
});

// ── Intent: authorization and mechanism ──────────────────────────────────────

describe('POST /v1/media/uploads', () => {
  it('401s a request with no bearer token', async () => {
    const { worker } = await liveWorker({ roomScan: [{ id: SCAN_ID }] });
    const response = await post(worker, env(), '/v1/media/uploads', validBody());
    expect(response.status).toBe(401);
  });

  it('401s a token whose role is not authenticated', async () => {
    const { worker, badRole } = await liveWorker({ roomScan: [{ id: SCAN_ID }] });
    const response = await post(
      worker,
      env(),
      '/v1/media/uploads',
      validBody(),
      await badRole(),
    );
    expect(response.status).toBe(401);
  });

  it('404s — never 403 — a scan the caller cannot see under their own RLS', async () => {
    // The scripted room_scans read returns nothing, which is exactly what the
    // real policy returns for a scan belonging to someone else. A 403 here
    // would confirm the scan exists: the mood-board bug class.
    const { worker, bearer, recorded } = await liveWorker({ roomScan: [] });
    const response = await post(
      worker,
      env(),
      '/v1/media/uploads',
      validBody(),
      bearer,
    );

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: 'not_found' });
    // And the write RPC was never reached.
    const statements = recorded[0].commands.map((command) => command.text);
    expect(statements.some((text) => text.includes('create_media_upload_intent'))).toBe(
      false,
    );
  });

  it('400s a malformed body without touching the database', async () => {
    const { worker, bearer, recorded } = await liveWorker({
      roomScan: [{ id: SCAN_ID }],
    });
    const response = await post(
      worker,
      env(),
      '/v1/media/uploads',
      validBody({ filename: '../escape.ply' }),
      bearer,
    );
    expect(response.status).toBe(400);
    expect(recorded).toHaveLength(0);
  });

  it('400s a body that is not JSON at all', async () => {
    const { worker, bearer } = await liveWorker({ roomScan: [{ id: SCAN_ID }] });
    const response = await post(
      worker,
      env(),
      '/v1/media/uploads',
      'not json',
      bearer,
    );
    expect(response.status).toBe(400);
  });

  it('reads the scan under SET LOCAL ROLE authenticated on the uncached binding, then calls the RPC', async () => {
    const { worker, bearer, recorded } = await liveWorker({
      roomScan: [{ id: SCAN_ID }],
      intent: INTENT_ROW,
    });
    await post(worker, env(), '/v1/media/uploads', validBody(), bearer);

    expect(recorded).toHaveLength(1);
    // User-scoped work never rides the cached binding.
    expect(recorded[0].connectionString).toBe('postgres://rls-login');
    expect(recorded[0].ended).toBe(true);

    const statements = recorded[0].commands.map((command) => command.text);
    expect(statements[0]).toBe('BEGIN');
    expect(statements[1]).toBe('SET LOCAL ROLE authenticated');
    expect(statements[2]).toContain('request.jwt.claims');
    // The caller's-own-RLS visibility read comes BEFORE the write RPC.
    const scanIndex = statements.findIndex((text) =>
      text.includes('FROM public.room_scans'),
    );
    const rpcIndex = statements.findIndex((text) =>
      text.includes('create_media_upload_intent'),
    );
    expect(scanIndex).toBeGreaterThan(-1);
    expect(rpcIndex).toBeGreaterThan(scanIndex);
    expect(statements.at(-1)).toBe('COMMIT');
  });

  it('passes the ORIGINALS bucket to the registry, never the artifacts bucket', async () => {
    const { worker, bearer, recorded } = await liveWorker({
      roomScan: [{ id: SCAN_ID }],
      intent: INTENT_ROW,
    });
    await post(worker, env(), '/v1/media/uploads', validBody(), bearer);

    const rpc = recorded[0].commands.find((command) =>
      command.text.includes('create_media_upload_intent'),
    );
    expect(rpc?.values).toEqual([
      SCAN_ID,
      'mesh',
      'mesh.ply',
      ORIGINALS_BUCKET,
      DECLARED_SHA,
      String(DECLARED_SIZE),
      'application/octet-stream',
    ]);
  });

  it('returns 201 with the upload id, the signed PUT, and the conditions the client must send', async () => {
    const { worker, bearer } = await liveWorker({
      roomScan: [{ id: SCAN_ID }],
      intent: INTENT_ROW,
    });
    const response = await post(
      worker,
      env(),
      '/v1/media/uploads',
      validBody(),
      bearer,
    );

    expect(response.status).toBe(201);
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    const body = (await response.json()) as Record<string, unknown>;
    expect(body.uploadId).toBe(UPLOAD_ID);
    expect(body.expiresAt).toBe('2026-08-18T13:04:56.789Z');
    expect(String(body.putUrl)).toContain(
      `/${ORIGINALS_BUCKET}/scan_originals/${SCAN_ID}/mesh/mesh.ply?`,
    );
    expect(body.requiredHeaders).toEqual({
      'content-length': '2048',
      'x-amz-checksum-sha256': 'qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqo=',
    });
  });

  it('is idempotent: a repeated intent answers 200 with the SAME upload id', async () => {
    const { worker, bearer } = await liveWorker({
      roomScan: [{ id: SCAN_ID }],
      intent: { ...INTENT_ROW, created: false },
    });
    const response = await post(
      worker,
      env(),
      '/v1/media/uploads',
      validBody(),
      bearer,
    );

    expect(response.status).toBe(200);
    expect((await response.json()) as Record<string, unknown>).toMatchObject({
      uploadId: UPLOAD_ID,
    });
  });

  it('maps the registry errcodes onto the route vocabulary', async () => {
    for (const [code, status] of [
      ['P0410', 404],
      ['P0411', 400],
      ['P0412', 409],
      ['P0413', 409],
      ['P0416', 429],
    ] as const) {
      const { worker, bearer } = await liveWorker({
        roomScan: [{ id: SCAN_ID }],
        throwOn: {
          match: 'create_media_upload_intent',
          error: Object.assign(new Error('rejected'), { code }),
        },
      });
      const response = await post(
        worker,
        env(),
        '/v1/media/uploads',
        validBody(),
        bearer,
      );
      expect(response.status).toBe(status);
    }
  });

  it('429s the per-scan pending-intent cap (00501, P0416) with a typed body', async () => {
    const { worker, bearer } = await liveWorker({
      roomScan: [{ id: SCAN_ID }],
      throwOn: {
        match: 'create_media_upload_intent',
        error: Object.assign(new Error('cap tripped'), { code: 'P0416' }),
      },
    });
    const response = await post(
      worker,
      env(),
      '/v1/media/uploads',
      validBody(),
      bearer,
    );
    expect(response.status).toBe(429);
    expect(await response.json()).toEqual({ error: 'upload_quota_exceeded' });
  });

  it('503s an unrecognised database failure rather than calling it a data answer', async () => {
    const { worker, bearer } = await liveWorker({
      roomScan: [{ id: SCAN_ID }],
      throwOn: {
        match: 'create_media_upload_intent',
        error: new Error('connection reset'),
      },
    });
    const response = await post(
      worker,
      env(),
      '/v1/media/uploads',
      validBody(),
      bearer,
    );
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: 'media_upload_unavailable' });
  });
});

// ── Confirm ──────────────────────────────────────────────────────────────────

function headResponse(
  overrides: {
    status?: number;
    length?: string;
    checksum?: string | null;
    etag?: string;
  } = {},
) {
  const headers = new Headers({
    'content-length': overrides.length ?? String(DECLARED_SIZE),
    etag: overrides.etag ?? '"deadbeef"',
  });
  if (overrides.checksum !== null) {
    headers.set(
      'x-amz-checksum-sha256',
      overrides.checksum ?? hexToBase64(DECLARED_SHA),
    );
  }
  return new Response(null, { status: overrides.status ?? 200, headers });
}

describe('POST /v1/media/uploads/:uploadId/confirm', () => {
  const CONFIRM_PATH = `/v1/media/uploads/${UPLOAD_ID}/confirm`;

  it('404s — never 403 — an upload the caller cannot see', async () => {
    const { worker, bearer, deps } = await liveWorker({ mediaObject: [] });
    const response = await post(worker, env(), CONFIRM_PATH, {}, bearer);
    expect(response.status).toBe(404);
    // Nothing was HEADed for an upload this caller cannot see.
    expect(deps.fetcher).not.toHaveBeenCalled();
  });

  it('401s a request with no bearer token', async () => {
    const { worker } = await liveWorker({ mediaObject: [] });
    const response = await post(worker, env(), CONFIRM_PATH, {});
    expect(response.status).toBe(401);
  });

  it('HEADs R2 with the write credentials and lands `stored` on a match', async () => {
    const fetcher = vi.fn(async () => headResponse());
    const live = await liveWorker({
      mediaObject: [
        {
          id: UPLOAD_ID,
          bucket: ORIGINALS_BUCKET,
          object_key: OBJECT_KEY,
          lifecycle_state: 'pending',
          scan_id: SCAN_ID,
          provenance: {
            declared_sha256: DECLARED_SHA,
            declared_size: DECLARED_SIZE,
          },
        },
      ],
      confirmed: {
        object_id: UPLOAD_ID,
        lifecycle_state: 'stored',
        sha256: DECLARED_SHA,
        etag: '"deadbeef"',
        size_bytes: DECLARED_SIZE,
        changed: true,
      },
    });
    const worker = createWorker({ ...live.deps, fetcher });
    const confirmed = await post(worker, env(), CONFIRM_PATH, {}, live.bearer);

    expect(confirmed.status).toBe(200);
    expect(await confirmed.json()).toEqual({
      uploadId: UPLOAD_ID,
      lifecycle: 'stored',
      sha256: DECLARED_SHA,
      etag: '"deadbeef"',
      sizeBytes: DECLARED_SIZE,
    });

    const [url, init] = fetcher.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ];
    expect(init.method).toBe('HEAD');
    expect(url).toContain(WRITE_KEY_ID);
    expect(url).toContain('X-Amz-Expires=60');
    expect(url).toContain(
      'X-Amz-SignedHeaders=host%3Bx-amz-checksum-mode',
    );

    // Two SHORT transactions, not one held across the network round trip.
    expect(live.recorded).toHaveLength(2);
    expect(
      live.recorded.every(
        (record) => record.connectionString === 'postgres://rls-login',
      ),
    ).toBe(true);
  });
});

describe('confirm mismatch', () => {
  const CONFIRM_PATH = `/v1/media/uploads/${UPLOAD_ID}/confirm`;

  const pendingRow = {
    id: UPLOAD_ID,
    bucket: ORIGINALS_BUCKET,
    object_key: OBJECT_KEY,
    lifecycle_state: 'pending',
    scan_id: SCAN_ID,
    provenance: { declared_sha256: DECLARED_SHA, declared_size: DECLARED_SIZE },
  };

  async function confirmWith(response: Response) {
    const fetcher = vi.fn(async () => response);
    const live = await liveWorker({ mediaObject: [pendingRow] });
    const worker = createWorker({ ...live.deps, fetcher });
    return {
      live,
      result: await post(worker, env(), CONFIRM_PATH, {}, live.bearer),
    };
  }

  it('409s a size disagreement and leaves the row pending', async () => {
    const { live, result } = await confirmWith(headResponse({ length: '999' }));
    expect(result.status).toBe(409);
    expect(await result.json()).toEqual({
      error: 'upload_mismatch',
      reason: 'size',
    });
    // The confirm RPC — the only thing that would advance the lifecycle — was
    // never called.
    const statements = live.recorded.flatMap((record) =>
      record.commands.map((command) => command.text),
    );
    expect(statements.some((text) => text.includes('confirm_media_upload'))).toBe(
      false,
    );
  });

  it('409s a checksum disagreement', async () => {
    const { result } = await confirmWith(
      headResponse({ checksum: hexToBase64('b'.repeat(64)) }),
    );
    expect(result.status).toBe(409);
    expect(await result.json()).toEqual({
      error: 'upload_mismatch',
      reason: 'checksum',
    });
  });

  it('409s when the object is not in R2 at all', async () => {
    const { result } = await confirmWith(headResponse({ status: 404 }));
    expect(result.status).toBe(409);
    expect(await result.json()).toEqual({
      error: 'upload_mismatch',
      reason: 'missing',
    });
  });

  // 00498 accepted this case and recorded `sha256_verified_by='put_condition'`,
  // on the theory that the signed PUT condition was a weaker but real
  // assurance. The 2026-08-19 R2 probe (OPERATIONS.md "What the R2 probe
  // established") measured both halves of that theory and inverted the
  // conclusion: the condition IS enforced, AND R2 reports the digest on a
  // checksum-mode HEAD. So this case cannot arise for bytes that came through
  // the presigned PUT — it can only arise for bytes that did not — and it is
  // now refused rather than blessed.
  it('409s when R2 returns no checksum — those bytes did not come through the signed PUT', async () => {
    const fetcher = vi.fn(async () => headResponse({ checksum: null }));
    const live = await liveWorker({ mediaObject: [pendingRow] });
    const worker = createWorker({ ...live.deps, fetcher });
    const result = await post(worker, env(), CONFIRM_PATH, {}, live.bearer);
    expect(result.status).toBe(409);
    expect(await result.json()).toEqual({
      error: 'upload_mismatch',
      reason: 'checksum',
    });

    // And the write path was never reached, so the row stays pending.
    const rpc = live.recorded
      .flatMap((record) => record.commands)
      .find((command) => command.text.includes('confirm_media_upload'));
    expect(rpc).toBeUndefined();
  });

  it('is idempotent on a second confirm of the same bytes', async () => {
    const fetcher = vi.fn(async () => headResponse());
    const live = await liveWorker({
      mediaObject: [{ ...pendingRow, lifecycle_state: 'stored' }],
      confirmed: {
        object_id: UPLOAD_ID,
        lifecycle_state: 'stored',
        sha256: DECLARED_SHA,
        etag: '"deadbeef"',
        size_bytes: DECLARED_SIZE,
        changed: false,
      },
    });
    const worker = createWorker({ ...live.deps, fetcher });
    const result = await post(worker, env(), CONFIRM_PATH, {}, live.bearer);
    expect(result.status).toBe(200);
    expect((await result.json()) as Record<string, unknown>).toMatchObject({
      lifecycle: 'stored',
    });
  });

  it('refuses to confirm an intent that recorded nothing to compare against', () => {
    const pending: PendingUpload = {
      bucket: ORIGINALS_BUCKET,
      objectKey: OBJECT_KEY,
      lifecycleState: 'pending',
      declaredSha256: null,
      declaredSize: null,
    };
    expect(() =>
      assertObservedMatchesDeclared(pending, {
        sizeBytes: DECLARED_SIZE,
        etag: null,
        sha256: DECLARED_SHA,
      }),
    ).toThrow(UploadMismatchError);
  });

  // The 2026-08-19 R2 probe (OPERATIONS.md) showed a checksum-mode HEAD returns
  // the digest for anything written through the presigned PUT, so a null one is
  // evidence the bytes did not come through it — never a reason to fall back to
  // trusting the PUT condition, which is what 00498 did.
  it('FAILS CLOSED when R2 reports no checksum at all', () => {
    const pending: PendingUpload = {
      bucket: ORIGINALS_BUCKET,
      objectKey: OBJECT_KEY,
      lifecycleState: 'pending',
      declaredSha256: DECLARED_SHA,
      declaredSize: DECLARED_SIZE,
    };
    expect(() =>
      assertObservedMatchesDeclared(pending, {
        sizeBytes: DECLARED_SIZE,
        etag: '"' + 'a'.repeat(32) + '"',
        sha256: null,
      }),
    ).toThrow(UploadMismatchError);
  });
});

// ── Findings 2, 10 and 12 — the W3-A review's flag-on blockers ───────────────

describe('the intent leg refuses to re-sign an object that already landed', () => {
  it('answers with the row and NO putUrl once the upload is stored', async () => {
    const live = await liveWorker({ roomScan: [{ id: SCAN_ID }] });
    const worker = createWorker({
      ...live.deps,
      // 00498 returns the existing row for an exact restatement after a
      // successful confirm; the route must not turn that into a fresh PUT.
      createUploadIntent: async () => ({
        uploadId: UPLOAD_ID,
        bucket: ORIGINALS_BUCKET,
        objectKey: OBJECT_KEY,
        lifecycleState: 'stored',
        version: 1,
        created: false,
      }),
    });
    const response = await post(
      worker,
      env(),
      '/v1/media/uploads',
      validBody(),
      live.bearer,
    );
    expect(response.status).toBe(200);
    const body = (await response.json()) as Record<string, unknown>;
    expect(body).toEqual({ uploadId: UPLOAD_ID, lifecycle: 'stored' });
    expect(body.putUrl).toBeUndefined();
    expect(body.requiredHeaders).toBeUndefined();
  });

  it('still signs while the object is pending', async () => {
    const live = await liveWorker({
      roomScan: [{ id: SCAN_ID }],
      intent: INTENT_ROW,
    });
    const response = await post(
      live.worker,
      env(),
      '/v1/media/uploads',
      validBody(),
      live.bearer,
    );
    const body = (await response.json()) as Record<string, unknown>;
    expect(typeof body.putUrl).toBe('string');
  });
});

describe('the intent leg verifies the caller before it reads the body', () => {
  // `post` builds its own Request; these two need to hand one in (a body that
  // is not JSON, and a Request whose .json() is spied on), so they call through
  // the same shape directly.
  const send = (
    worker: ReturnType<typeof createWorker>,
    requestEnv: EdgeApiEnv,
    request: Request,
  ) =>
    worker.fetch!(
      request as Request<unknown, IncomingRequestCfProperties>,
      requestEnv,
      {
        waitUntil() {},
        passThroughOnException() {},
        props: {},
      } as unknown as ExecutionContext,
    );

  it('401s without parsing JSON at all', async () => {
    const live = await liveWorker({ roomScan: [{ id: SCAN_ID }] });
    const request = new Request('https://api.patina.cloud/v1/media/uploads', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      // Not JSON. A route that parsed first would answer 400 about the body;
      // the 401 is about the caller and must come first.
      body: '{ this is not json',
    });
    const response = await send(live.worker, env(), request);
    expect(response.status).toBe(401);
    expect((await response.json()) as Record<string, unknown>).toMatchObject({
      error: 'unauthorized',
    });
  });

  it('leaves a malformed body unread when the token is missing', async () => {
    const live = await liveWorker({ roomScan: [{ id: SCAN_ID }] });
    const spy = vi.fn(async () => ({}) as unknown);
    const request = new Request('https://api.patina.cloud/v1/media/uploads', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(validBody()),
    });
    Object.defineProperty(request, 'json', { value: spy });
    const response = await send(live.worker, env(), request);
    expect(response.status).toBe(401);
    expect(spy).not.toHaveBeenCalled();
  });
});

describe('the confirm leg is pinned to the originals bucket', () => {
  const CONFIRM_PATH = `/v1/media/uploads/${UPLOAD_ID}/confirm`;

  it('404s a registry row the caller CAN see that names another bucket', async () => {
    // The finding-12 shape: media_objects also holds the pipeline's artifact
    // rows, and a caller who can see the scan can see those too. Confirming one
    // would HEAD a pipeline output with the WRITE credential.
    const live = await liveWorker({
      mediaObject: [
        {
          id: UPLOAD_ID,
          bucket: 'patina-staging-media-artifacts-us',
          object_key: 'scans/rls-test/1/mesh.glb',
          lifecycle_state: 'pending',
          scan_id: SCAN_ID,
          provenance: {
            declared_sha256: DECLARED_SHA,
            declared_size: DECLARED_SIZE,
          },
        },
      ],
    });
    const fetcher = vi.fn(async () => new Response(null, { status: 200 }));
    const worker = createWorker({ ...live.deps, fetcher });
    const response = await post(
      worker,
      env(),
      CONFIRM_PATH,
      {},
      live.bearer,
    );
    expect(response.status).toBe(404);
    // And nothing was HEADed — the refusal happens before R2 is touched.
    expect(fetcher).not.toHaveBeenCalled();
  });
});

// ── The flag and the config contract ─────────────────────────────────────────

describe('MEDIA_UPLOADS', () => {
  it('leaves both routes unrouted when the flag is off', async () => {
    const worker = createWorker(dependencies());
    for (const path of [
      '/v1/media/uploads',
      `/v1/media/uploads/${UPLOAD_ID}/confirm`,
    ]) {
      const response = await post(
        worker,
        env({ MEDIA_UPLOADS: 'off' }),
        path,
        validBody(),
        { authorization: 'Bearer irrelevant' },
      );
      expect(response.status).toBe(404);
      // Unrouted means unrouted: no CORS header advertises the route either.
      expect(response.headers.get('access-control-allow-origin')).toBeNull();
    }
  });

  it('fails the whole worker closed when the flag is on without its write credentials', async () => {
    const worker = createWorker(dependencies());
    for (const missing of [
      { SCAN_R2_WRITE_ACCESS_KEY_ID: undefined },
      { SCAN_R2_WRITE_SECRET_ACCESS_KEY: undefined },
      { SCAN_R2_ORIGINALS_BUCKET: undefined },
      { DB_FRESH: undefined },
    ] as Partial<EdgeApiEnv>[]) {
      const response = await post(
        worker,
        env(missing),
        '/v1/media/uploads',
        validBody(),
      );
      expect(response.status).toBe(503);
      expect(await response.json()).toEqual({ error: 'service_unavailable' });
    }
  });

  it('fails closed on any value that is not off or on', async () => {
    const log = vi.fn();
    const worker = createWorker(dependencies({ log }));
    for (const value of ['true', 'ON', '', 'yes'] as string[]) {
      const response = await post(
        worker,
        env({ MEDIA_UPLOADS: value as 'on' }),
        '/v1/media/uploads',
        validBody(),
      );
      expect(response.status).toBe(503);
    }
    expect(log).toHaveBeenCalledWith(
      expect.objectContaining({
        event: ALERT_EVENTS.configurationInvalid,
        routeClass: 'media.upload',
      }),
    );
  });

  it('answers the CORS preflight the browser sends before an authorized POST', async () => {
    const worker = createWorker(dependencies());
    const response = await worker.fetch!(
      new Request(`https://api.patina.cloud/v1/media/uploads`, {
        method: 'OPTIONS',
      }) as Request<unknown, IncomingRequestCfProperties>,
      env(),
      {
        waitUntil() {},
        passThroughOnException() {},
        props: {},
      } as unknown as ExecutionContext,
    );
    expect(response.status).toBe(204);
    expect(response.headers.get('access-control-allow-methods')).toBe(
      'POST, OPTIONS',
    );
  });
});

// ── Logging discipline ───────────────────────────────────────────────────────

describe('structured logging', () => {
  it('names the stage and the mismatch reason and nothing else about the upload', async () => {
    const log = vi.fn();
    const fetcher = vi.fn(async () => headResponse({ length: '999' }));
    const live = await liveWorker({
      mediaObject: [
        {
          id: UPLOAD_ID,
          bucket: ORIGINALS_BUCKET,
          object_key: OBJECT_KEY,
          lifecycle_state: 'pending',
          scan_id: SCAN_ID,
          provenance: {
            declared_sha256: DECLARED_SHA,
            declared_size: DECLARED_SIZE,
          },
        },
      ],
    });
    const worker = createWorker({ ...live.deps, fetcher, log });
    await post(
      worker,
      env(),
      `/v1/media/uploads/${UPLOAD_ID}/confirm`,
      {},
      live.bearer,
    );

    const event = log.mock.calls.at(-1)?.[0] as Record<string, unknown>;
    expect(event).toMatchObject({
      event: ALERT_EVENTS.mediaUploadFailure,
      routeClass: 'media.upload',
      uploadStage: 'confirm',
      mismatchReason: 'size',
      status: 409,
    });
    // Nothing identifying the upload, the scan, the key, or the credential.
    const serialized = JSON.stringify(event);
    for (const secret of [
      UPLOAD_ID,
      SCAN_ID,
      OBJECT_KEY,
      DECLARED_SHA,
      WRITE_KEY_ID,
      WRITE_SECRET,
    ]) {
      expect(serialized).not.toContain(secret);
    }
  });
});
