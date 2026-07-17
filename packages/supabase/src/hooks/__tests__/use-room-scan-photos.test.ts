import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─────────────────────────────────────────────────────────────────────────────
// Mocks — mirrors use-clients.test.ts / use-decisions.test.ts: intercept the
// chained query builder + storage API at the `@supabase/ssr` boundary and
// React Query so we can invoke `queryFn` directly and inspect what was
// queried/signed, without a live database or storage bucket.
// ─────────────────────────────────────────────────────────────────────────────

type BuilderResult = { data: unknown; error: unknown };

interface MockBuilder {
  /* eslint-disable @typescript-eslint/no-explicit-any */
  select: any;
  eq: any;
  in: any;
  order: any;
  /* eslint-enable @typescript-eslint/no-explicit-any */
  then: (resolve: (value: BuilderResult) => unknown) => Promise<unknown>;
  __result: BuilderResult;
}

function makeBuilder(initial: BuilderResult = { data: null, error: null }): MockBuilder {
  const builder = { __result: initial } as MockBuilder;
  const record = () =>
    vi.fn(() => builder);
  builder.select = record();
  builder.eq = record();
  builder.in = record();
  builder.order = record();
  builder.then = (resolve) => Promise.resolve(builder.__result).then(resolve);
  return builder;
}

let tableResult: BuilderResult = { data: [], error: null };

type SignedEntry = { path: string | null; signedUrl: string; error: string | null };
let signedUrlsResult: { data: SignedEntry[] | null; error: unknown } = { data: [], error: null };
const createSignedUrls = vi.fn(async (_paths: string[], _expiresIn: number) => signedUrlsResult);
const storageFrom = vi.fn(() => ({ createSignedUrls }));

const supabaseClient = {
  from: vi.fn(() => makeBuilder(tableResult)),
  storage: { from: storageFrom },
};

vi.mock('@supabase/ssr', () => ({
  createBrowserClient: () => supabaseClient,
}));

vi.mock('@tanstack/react-query', () => ({
  useQuery: (config: unknown) => config,
}));

// Import AFTER mocks are wired up.
import {
  useRoomScanPhotos,
  useRoomScanCovers,
  resolveCoverPhoto,
  dedupeRoomScanPhotos,
  publicUrlToPath,
  type RoomScanPhotoRow,
} from '../use-room-scan-photos';

beforeEach(() => {
  tableResult = { data: [], error: null };
  signedUrlsResult = { data: [], error: null };
  supabaseClient.from.mockClear();
  storageFrom.mockClear();
  createSignedUrls.mockClear();
});

// ─────────────────────────────────────────────────────────────────────────────
// publicUrlToPath
// ─────────────────────────────────────────────────────────────────────────────

describe('publicUrlToPath', () => {
  it('strips the bucket marker off a public-form URL', () => {
    const url =
      'https://bkvcixdmuyejfzcijpdg.supabase.co/storage/v1/object/public/room-scans/u1/scan1/img.heic';
    expect(publicUrlToPath(url)).toBe('u1/scan1/img.heic');
  });

  it('returns null for an already-signed URL (has scheme, no public marker)', () => {
    const url =
      'https://bkvcixdmuyejfzcijpdg.supabase.co/storage/v1/object/sign/room-scans/u1/scan1/img.heic?token=abc123';
    expect(publicUrlToPath(url)).toBeNull();
  });

  it('returns null for garbage input (empty / null / undefined)', () => {
    expect(publicUrlToPath('')).toBeNull();
    expect(publicUrlToPath(null)).toBeNull();
    expect(publicUrlToPath(undefined)).toBeNull();
  });

  it('passes a bare storage path (no scheme) through unchanged', () => {
    expect(publicUrlToPath('u1/scan1/img.heic')).toBe('u1/scan1/img.heic');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// dedupeRoomScanPhotos (I82)
// ─────────────────────────────────────────────────────────────────────────────

function row(overrides: Partial<RoomScanPhotoRow>): RoomScanPhotoRow {
  return {
    id: overrides.id ?? 'row-id',
    scan_id: 'scan-1',
    image_url: 'https://x/room-scans/img.heic',
    thumbnail_url: null,
    is_primary: false,
    display_order: 0,
    quality_score: null,
    photo_kind: 'auto',
    caption: null,
    captured_at: '2026-01-01T00:00:00Z',
    camera_transform: null,
    mime_type: 'image/heic',
    ...overrides,
  };
}

describe('dedupeRoomScanPhotos', () => {
  it('collapses duplicate (image_url) rows from retried batch inserts to one', () => {
    const rows = [
      row({ id: 'a', image_url: 'https://x/room-scans/img.heic' }),
      row({ id: 'b', image_url: 'https://x/room-scans/img.heic' }),
      row({ id: 'c', image_url: 'https://x/room-scans/other.heic' }),
    ];
    const deduped = dedupeRoomScanPhotos(rows);
    expect(deduped).toHaveLength(2);
    expect(deduped.map((r) => r.image_url).sort()).toEqual([
      'https://x/room-scans/img.heic',
      'https://x/room-scans/other.heic',
    ]);
  });

  it('prefers the thumbnail-bearing row within a duplicate group', () => {
    const noThumb = row({ id: 'no-thumb', image_url: 'https://x/room-scans/img.heic', thumbnail_url: null });
    const withThumb = row({
      id: 'with-thumb',
      image_url: 'https://x/room-scans/img.heic',
      thumbnail_url: 'https://x/room-scans/img_thumb.jpg',
    });
    const deduped = dedupeRoomScanPhotos([noThumb, withThumb]);
    expect(deduped).toHaveLength(1);
    expect(deduped[0].id).toBe('with-thumb');
  });

  it('keeps input order for non-duplicate rows', () => {
    const rows = [row({ id: 'a', image_url: 'a.heic' }), row({ id: 'b', image_url: 'b.heic' })];
    expect(dedupeRoomScanPhotos(rows).map((r) => r.id)).toEqual(['a', 'b']);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// resolveCoverPhoto (I81)
// ─────────────────────────────────────────────────────────────────────────────

describe('resolveCoverPhoto', () => {
  it('returns null for an empty list', () => {
    expect(resolveCoverPhoto([])).toBeNull();
  });

  it('picks the is_primary row over higher-quality non-primary rows', () => {
    const rows = [
      row({ id: 'best-quality', is_primary: false, quality_score: 0.99, display_order: 0 }),
      row({ id: 'primary', is_primary: true, quality_score: 0.2, display_order: 5 }),
    ];
    expect(resolveCoverPhoto(rows)?.id).toBe('primary');
  });

  it('breaks ties among is_primary rows (or the whole set, with none primary) by highest quality_score', () => {
    const rows = [
      row({ id: 'low', is_primary: true, quality_score: 0.4, display_order: 0 }),
      row({ id: 'high', is_primary: true, quality_score: 0.9, display_order: 1 }),
    ];
    expect(resolveCoverPhoto(rows)?.id).toBe('high');
  });

  it('breaks a quality_score tie by lowest display_order', () => {
    const rows = [
      row({ id: 'later', is_primary: false, quality_score: 0.5, display_order: 3 }),
      row({ id: 'earlier', is_primary: false, quality_score: 0.5, display_order: 1 }),
    ];
    expect(resolveCoverPhoto(rows)?.id).toBe('earlier');
  });

  it('falls back to the first row when nothing is primary and all ties resolve equal', () => {
    const rows = [
      row({ id: 'first', is_primary: false, quality_score: null, display_order: 0 }),
      row({ id: 'second', is_primary: false, quality_score: null, display_order: 0 }),
    ];
    expect(resolveCoverPhoto(rows)?.id).toBe('first');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// useRoomScanPhotos — hook-level (dedupe + batch signing wired together)
// ─────────────────────────────────────────────────────────────────────────────

describe('useRoomScanPhotos', () => {
  it('dedupes rows and signs every distinct path in ONE createSignedUrls call', async () => {
    tableResult = {
      data: [
        row({
          id: 'dup-no-thumb',
          image_url: 'https://x.supabase.co/storage/v1/object/public/room-scans/u1/s1/a.heic',
          thumbnail_url: null,
          display_order: 0,
        }),
        row({
          id: 'dup-with-thumb',
          image_url: 'https://x.supabase.co/storage/v1/object/public/room-scans/u1/s1/a.heic',
          thumbnail_url: 'https://x.supabase.co/storage/v1/object/public/room-scans/u1/s1/a_thumb.jpg',
          display_order: 0,
        }),
        row({
          id: 'b',
          image_url: 'https://x.supabase.co/storage/v1/object/public/room-scans/u1/s1/b.heic',
          thumbnail_url: null,
          display_order: 1,
        }),
      ],
      error: null,
    };
    signedUrlsResult = {
      data: [
        { path: 'u1/s1/a.heic', signedUrl: 'https://signed/a.heic', error: null },
        { path: 'u1/s1/a_thumb.jpg', signedUrl: 'https://signed/a_thumb.jpg', error: null },
        { path: 'u1/s1/b.heic', signedUrl: 'https://signed/b.heic', error: null },
      ],
      error: null,
    };

    const config = useRoomScanPhotos('scan-1') as unknown as {
      queryFn: () => Promise<Array<{ id: string; signedImageUrl: string | null; signedThumbUrl: string | null }>>;
    };
    const result = await config.queryFn();

    // Dedupe collapsed the two `a.heic` rows to one, preferring the
    // thumbnail-bearing row.
    expect(result).toHaveLength(2);
    expect(result.map((r) => r.id)).toEqual(['dup-with-thumb', 'b']);

    // Signed in exactly one storage call, over the 3 distinct paths.
    expect(storageFrom).toHaveBeenCalledWith('room-scans');
    expect(createSignedUrls).toHaveBeenCalledTimes(1);
    expect(createSignedUrls.mock.calls[0][0].sort()).toEqual([
      'u1/s1/a.heic',
      'u1/s1/a_thumb.jpg',
      'u1/s1/b.heic',
    ]);

    const a = result.find((r) => r.id === 'dup-with-thumb')!;
    expect(a.signedImageUrl).toBe('https://signed/a.heic');
    expect(a.signedThumbUrl).toBe('https://signed/a_thumb.jpg');

    const b = result.find((r) => r.id === 'b')!;
    expect(b.signedImageUrl).toBe('https://signed/b.heic');
    expect(b.signedThumbUrl).toBeNull(); // thumbnail_url was null on that row
  });

  it('returns [] without touching storage when the scan has no photo rows', async () => {
    tableResult = { data: [], error: null };

    const config = useRoomScanPhotos('scan-empty') as unknown as {
      queryFn: () => Promise<unknown[]>;
    };
    const result = await config.queryFn();

    expect(result).toEqual([]);
    expect(storageFrom).not.toHaveBeenCalled();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// useRoomScanCovers — batch cover resolution across a SET of scan ids
// ─────────────────────────────────────────────────────────────────────────────

describe('useRoomScanCovers', () => {
  it('is disabled (no query, no storage call) when given no ids', () => {
    const config = useRoomScanCovers([]) as unknown as { enabled: boolean };
    expect(config.enabled).toBe(false);
    expect(supabaseClient.from).not.toHaveBeenCalled();
  });

  it('dedupes/sorts ids into the query key and filters out null/undefined entries', () => {
    const config = useRoomScanCovers(['scan-b', null, 'scan-a', undefined, 'scan-b']) as unknown as {
      queryKey: unknown[];
    };
    expect(config.queryKey).toEqual(['room-scan-covers', ['scan-a', 'scan-b']]);
  });

  it('resolves one cover per scan (I81), signs only the covers in ONE call, and reports zero-photo scans as null', async () => {
    tableResult = {
      data: [
        // scan-1: two candidates — highest quality_score should win the cover.
        row({
          id: 's1-low',
          scan_id: 'scan-1',
          image_url: 'https://x.supabase.co/storage/v1/object/public/room-scans/u1/s1/low.heic',
          thumbnail_url: null,
          is_primary: false,
          quality_score: 0.2,
          display_order: 0,
        }),
        row({
          id: 's1-high',
          scan_id: 'scan-1',
          image_url: 'https://x.supabase.co/storage/v1/object/public/room-scans/u1/s1/high.heic',
          thumbnail_url: 'https://x.supabase.co/storage/v1/object/public/room-scans/u1/s1/high_thumb.jpg',
          is_primary: false,
          quality_score: 0.9,
          display_order: 1,
        }),
        // scan-2: only one row, no thumbnail — cover falls back to the image.
        row({
          id: 's2-only',
          scan_id: 'scan-2',
          image_url: 'https://x.supabase.co/storage/v1/object/public/room-scans/u1/s2/only.heic',
          thumbnail_url: null,
          is_primary: false,
          quality_score: null,
          display_order: 0,
        }),
        // scan-3 has zero rows — never appears in `data` at all.
      ],
      error: null,
    };
    signedUrlsResult = {
      data: [
        { path: 'u1/s1/high.heic', signedUrl: 'https://signed/high.heic', error: null },
        { path: 'u1/s1/high_thumb.jpg', signedUrl: 'https://signed/high_thumb.jpg', error: null },
        { path: 'u1/s2/only.heic', signedUrl: 'https://signed/only.heic', error: null },
      ],
      error: null,
    };

    const config = useRoomScanCovers(['scan-1', 'scan-2', 'scan-3']) as unknown as {
      queryFn: () => Promise<Map<string, { id: string; signedImageUrl: string | null; signedThumbUrl: string | null } | null>>;
    };
    const result = await config.queryFn();

    expect(result.size).toBe(3);

    const scan1Cover = result.get('scan-1');
    expect(scan1Cover?.id).toBe('s1-high');
    expect(scan1Cover?.signedThumbUrl).toBe('https://signed/high_thumb.jpg');
    expect(scan1Cover?.signedImageUrl).toBe('https://signed/high.heic');

    const scan2Cover = result.get('scan-2');
    expect(scan2Cover?.id).toBe('s2-only');
    expect(scan2Cover?.signedThumbUrl).toBeNull();
    expect(scan2Cover?.signedImageUrl).toBe('https://signed/only.heic');

    // scan-3 had zero rows — explicit null, distinct from an absent key.
    expect(result.has('scan-3')).toBe(true);
    expect(result.get('scan-3')).toBeNull();

    // Exactly one signing call, over only the resolved covers' paths (the
    // discarded s1-low candidate's path is never sent for signing).
    expect(createSignedUrls).toHaveBeenCalledTimes(1);
    expect(createSignedUrls.mock.calls[0][0].sort()).toEqual([
      'u1/s1/high.heic',
      'u1/s1/high_thumb.jpg',
      'u1/s2/only.heic',
    ]);
  });

  it('skips the storage call entirely when every requested scan has zero photos', async () => {
    tableResult = { data: [], error: null };

    const config = useRoomScanCovers(['scan-empty-1', 'scan-empty-2']) as unknown as {
      queryFn: () => Promise<Map<string, unknown>>;
    };
    const result = await config.queryFn();

    expect(result.get('scan-empty-1')).toBeNull();
    expect(result.get('scan-empty-2')).toBeNull();
    expect(storageFrom).not.toHaveBeenCalled();
  });
});
