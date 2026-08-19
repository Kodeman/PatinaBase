/**
 * The capability URL itself. A presigned GET is only as good as its canonical
 * request, so the canonical bytes are pinned directly rather than inferred from
 * a signature — a change that silently alters what is signed (an extra query
 * parameter, a differently-encoded key, a signed payload) fails here loudly.
 *
 * Everything is deterministic given fixed credentials and a fixed clock, so the
 * signature is asserted as an exact value: SigV4's whole point is that the same
 * inputs produce the same bytes, and a test that only checks the shape would
 * pass against a subtly wrong signing-key chain.
 */

import {
  canonicalRequestFor,
  encodeRfc3986,
  presignR2GetUrl,
  PresignError,
  type PresignRequest,
} from '../src/r2';

const NOW = new Date('2026-08-18T12:34:56.789Z');
const ENDPOINT = 'https://be3aaeed18a81b5d90ee2263b62219ea.r2.cloudflarestorage.com';

function input(overrides: Partial<PresignRequest> = {}): PresignRequest {
  return {
    endpoint: ENDPOINT,
    bucket: 'patina-staging-media-artifacts-us',
    objectKey: 'scans/abc/room-file/1/splat.spz',
    accessKeyId: 'AKIAEXAMPLEKEYID',
    secretAccessKey: 'example-secret-access-key',
    expiresInSeconds: 600,
    now: NOW,
    ...overrides,
  };
}

describe('canonical request', () => {
  it('signs GET, the /bucket/key path, the sorted query, host only, and no payload', () => {
    const { canonicalRequest } = canonicalRequestFor(input());

    expect(canonicalRequest).toBe(
      [
        'GET',
        '/patina-staging-media-artifacts-us/scans/abc/room-file/1/splat.spz',
        'X-Amz-Algorithm=AWS4-HMAC-SHA256' +
          '&X-Amz-Credential=AKIAEXAMPLEKEYID%2F20260818%2Fauto%2Fs3%2Faws4_request' +
          '&X-Amz-Date=20260818T123456Z' +
          '&X-Amz-Expires=600' +
          '&X-Amz-SignedHeaders=host',
        'host:be3aaeed18a81b5d90ee2263b62219ea.r2.cloudflarestorage.com\n',
        'host',
        'UNSIGNED-PAYLOAD',
      ].join('\n'),
    );
  });

  it('scopes the credential to the request date, region auto, service s3', () => {
    expect(canonicalRequestFor(input()).credentialScope).toBe(
      '20260818/auto/s3/aws4_request',
    );
  });

  it('encodes each key segment but keeps the separators', () => {
    const { canonicalUri } = canonicalRequestFor(
      input({ objectKey: 'renders/corner ne (1).jpg' }),
    );
    expect(canonicalUri).toBe(
      '/patina-staging-media-artifacts-us/renders/corner%20ne%20%281%29.jpg',
    );
  });

  it('escapes the characters encodeURIComponent leaves behind', () => {
    // `!'()*` are legal in an object key and illegal in a canonical URI.
    expect(encodeRfc3986("a!b'c(d)e*f")).toBe('a%21b%27c%28d%29e%2Af');
  });
});

describe('presigned URL', () => {
  it('is byte-for-byte reproducible from fixed credentials and a fixed clock', async () => {
    const first = await presignR2GetUrl(input());
    const second = await presignR2GetUrl(input());

    expect(first.url).toBe(second.url);
    expect(first.url).toBe(
      `${ENDPOINT}/patina-staging-media-artifacts-us/scans/abc/room-file/1/splat.spz` +
        '?X-Amz-Algorithm=AWS4-HMAC-SHA256' +
        '&X-Amz-Credential=AKIAEXAMPLEKEYID%2F20260818%2Fauto%2Fs3%2Faws4_request' +
        '&X-Amz-Date=20260818T123456Z' +
        '&X-Amz-Expires=600' +
        '&X-Amz-SignedHeaders=host' +
        // Computed by an INDEPENDENT SigV4 implementation (Python hmac/hashlib
        // over the same inputs), so this asserts agreement with the algorithm
        // rather than agreement with src/r2.ts.
        '&X-Amz-Signature=c2ad69aaadc75f02b70766cacb37c5d74b403b9254f1aa442ec34f49f7af003f',
    );
  });

  it('changes the signature when the object changes', async () => {
    const first = await presignR2GetUrl(input());
    const other = await presignR2GetUrl(
      input({ objectKey: 'scans/abc/room-file/1/mesh.glb' }),
    );
    expect(first.url).not.toBe(other.url);
  });

  it('reports the instant the capability dies', async () => {
    const { expiresAt } = await presignR2GetUrl(input());
    expect(expiresAt).toBe('2026-08-18T12:44:56.789Z');
  });

  it('refuses an endpoint that is not a bare https origin', async () => {
    // A path would change the object the signature covers; http would put a
    // capability on the wire in clear.
    for (const endpoint of [
      'http://account.r2.cloudflarestorage.com',
      'https://account.r2.cloudflarestorage.com/bucket',
      'not-a-url',
      '',
    ]) {
      expect(() => canonicalRequestFor(input({ endpoint }))).toThrow(PresignError);
    }
  });

  it('refuses missing credentials and out-of-range expiries', () => {
    expect(() => canonicalRequestFor(input({ accessKeyId: '' }))).toThrow(PresignError);
    expect(() => canonicalRequestFor(input({ secretAccessKey: '' }))).toThrow(
      PresignError,
    );
    expect(() => canonicalRequestFor(input({ expiresInSeconds: 0 }))).toThrow(
      PresignError,
    );
    expect(() => canonicalRequestFor(input({ expiresInSeconds: 604_801 }))).toThrow(
      PresignError,
    );
  });
});
