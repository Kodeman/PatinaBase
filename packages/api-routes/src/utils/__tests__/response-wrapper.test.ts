import { describe, expect, it } from 'vitest';
import { apiSuccess } from '../response-wrapper';

describe('apiSuccess cache policy', () => {
  it('defaults successful responses to private no-store', () => {
    const response = apiSuccess({ ok: true });

    expect(response.headers.get('cache-control')).toBe('private, no-store');
  });

  it('emits public cache headers only for the reviewed public contract', () => {
    const response = apiSuccess(
      { ok: true },
      undefined,
      {
        cache: {
          visibility: 'public',
          reviewedPublic: true,
          ttl: 60,
          swr: 15,
        },
      },
    );

    expect(response.headers.get('cache-control')).toBe(
      'public, max-age=60, stale-while-revalidate=15',
    );
  });

  it('fails closed when an unreviewed cache object reaches runtime', () => {
    const response = apiSuccess({ ok: true }, undefined, {
      cache: { visibility: 'public', ttl: 60 } as any,
    });

    expect(response.headers.get('cache-control')).toBe('private, no-store');
  });
});
