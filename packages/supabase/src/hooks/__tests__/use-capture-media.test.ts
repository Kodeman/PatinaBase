/**
 * `useCaptureMediaUrls` — the portal's only read path into the private
 * `capture-media` bucket (spec §11.1, FC-R15).
 *
 * Mocked at the same two boundaries every other hook suite here uses
 * (`@supabase/ssr` for the client, `@tanstack/react-query` for `useQuery`),
 * so `queryFn` can be invoked directly without a React tree or a database.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

type SignedEntry = {
  path: string | null;
  signedUrl: string;
  error: string | null;
};

let signedResult: { data: SignedEntry[] | null; error: unknown } = {
  data: [],
  error: null,
};

const createSignedUrls = vi.fn(async (_paths: string[], _ttl: number) => signedResult);
const storageFrom = vi.fn((_bucket: string) => ({ createSignedUrls }));

vi.mock('@supabase/ssr', () => ({
  createBrowserClient: () => ({ storage: { from: storageFrom } }),
}));

interface QueryConfig {
  queryKey: readonly unknown[];
  enabled: boolean;
  staleTime: number;
  queryFn: () => Promise<Record<string, string>>;
}

let issued: QueryConfig[] = [];

vi.mock('@tanstack/react-query', () => ({
  useQuery: (config: Record<string, unknown>) => {
    issued.push(config as unknown as QueryConfig);
    return config;
  },
}));

// Import AFTER the mocks are wired up.
import {
  useCaptureMediaUrls,
  captureMediaUrlsKey,
  CAPTURE_MEDIA_BUCKET,
  CAPTURE_MEDIA_TTL_SECONDS,
} from '../use-capture-media';

function query(): QueryConfig {
  const found = issued.at(-1);
  if (!found) throw new Error('useCaptureMediaUrls issued no query');
  return found;
}

beforeEach(() => {
  signedResult = { data: [], error: null };
  issued = [];
  createSignedUrls.mockClear();
  storageFrom.mockClear();
});

describe('useCaptureMediaUrls — the query it issues', () => {
  it('names the private bucket the Field app writes to (00234)', () => {
    expect(CAPTURE_MEDIA_BUCKET).toBe('capture-media');
    expect(CAPTURE_MEDIA_TTL_SECONDS).toBe(3600);
  });

  it('is order- and duplicate-insensitive in its query key', () => {
    expect(captureMediaUrlsKey(['b/2.jpg', 'a/1.jpg'], 3600)).toEqual(
      captureMediaUrlsKey(['a/1.jpg', 'b/2.jpg'], 3600),
    );
    useCaptureMediaUrls(['b/2.jpg', 'a/1.jpg', 'a/1.jpg']);
    expect(query().queryKey).toEqual(['capture-media-urls', 'a/1.jpg|b/2.jpg', 3600]);
  });

  it('stays disabled — and never signs — with nothing to sign', () => {
    for (const input of [null, undefined, [], [null, undefined, '', '   ']]) {
      issued = [];
      useCaptureMediaUrls(input as string[] | null | undefined);
      expect(query().enabled).toBe(false);
    }
    expect(createSignedUrls).not.toHaveBeenCalled();
  });

  it('goes stale a minute before the URLs expire', () => {
    useCaptureMediaUrls(['a/1.jpg'], 300);
    expect(query().staleTime).toBe(240_000);
    // A TTL shorter than the safety margin must not produce a negative staleTime.
    useCaptureMediaUrls(['a/1.jpg'], 10);
    expect(query().staleTime).toBe(0);
  });
});

describe('useCaptureMediaUrls — what it resolves', () => {
  it('signs every distinct path in ONE call and returns a path→url map', async () => {
    signedResult = {
      data: [
        { path: 'uid/cap-1/photo.jpg', signedUrl: 'https://s/1?sig=a', error: null },
        { path: 'uid/cap-2/note.m4a', signedUrl: 'https://s/2?sig=b', error: null },
      ],
      error: null,
    };

    useCaptureMediaUrls(['uid/cap-1/photo.jpg', 'uid/cap-2/note.m4a', 'uid/cap-1/photo.jpg']);

    await expect(query().queryFn()).resolves.toEqual({
      'uid/cap-1/photo.jpg': 'https://s/1?sig=a',
      'uid/cap-2/note.m4a': 'https://s/2?sig=b',
    });

    expect(storageFrom).toHaveBeenCalledWith('capture-media');
    expect(createSignedUrls).toHaveBeenCalledTimes(1);
    expect(createSignedUrls).toHaveBeenCalledWith(
      ['uid/cap-1/photo.jpg', 'uid/cap-2/note.m4a'],
      3600,
    );
  });

  it('omits an entry that failed to sign rather than handing back a broken URL', async () => {
    signedResult = {
      data: [
        { path: 'uid/cap-1/photo.jpg', signedUrl: 'https://s/1?sig=a', error: null },
        { path: 'uid/cap-2/gone.jpg', signedUrl: '', error: 'Object not found' },
        { path: null, signedUrl: 'https://s/3?sig=c', error: null },
      ],
      error: null,
    };

    useCaptureMediaUrls(['uid/cap-1/photo.jpg', 'uid/cap-2/gone.jpg', 'uid/cap-3/x.jpg']);

    await expect(query().queryFn()).resolves.toEqual({
      'uid/cap-1/photo.jpg': 'https://s/1?sig=a',
    });
  });

  it('propagates a signing error rather than reporting "no media"', async () => {
    signedResult = { data: null, error: new Error('storage down') };
    useCaptureMediaUrls(['uid/cap-1/photo.jpg']);
    await expect(query().queryFn()).rejects.toThrow('storage down');
  });

  it('honours a caller-supplied TTL', async () => {
    useCaptureMediaUrls(['uid/cap-1/photo.jpg'], 120);
    await query().queryFn();
    expect(createSignedUrls).toHaveBeenCalledWith(['uid/cap-1/photo.jpg'], 120);
  });
});
