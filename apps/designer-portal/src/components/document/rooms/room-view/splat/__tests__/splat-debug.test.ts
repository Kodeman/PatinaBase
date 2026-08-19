/**
 * `?splatDebug=1` — the flag, and the scrubber that makes it safe (Rendered Room v2, W2).
 *
 * Two things are worth holding here, and they pull in opposite directions: the flag has
 * to be OFF unless someone typed it (it is the one dev affordance that survives the
 * production build), and when it is on the text it surfaces must not carry a working
 * capability grant. The scrubber tests are therefore written against the real shape of
 * a SigV4 presigned R2 URL, not a toy `?a=b`.
 */

import {
  describeSplatFailure,
  scrubSecrets,
  splatDebugEnabled,
} from '../splat-debug';

const SIGNED =
  'https://abc123.r2.cloudflarestorage.com/scans/room-42/splat.spz' +
  '?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Credential=AKIA%2F20260819%2Fauto%2Fs3%2Faws4_request' +
  '&X-Amz-Date=20260819T000000Z&X-Amz-Expires=900&X-Amz-SignedHeaders=host' +
  '&X-Amz-Signature=deadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef';

describe('splatDebugEnabled', () => {
  it('is on only for the literal 1', () => {
    expect(splatDebugEnabled('?splatDebug=1')).toBe(true);
    expect(splatDebugEnabled('?foo=bar&splatDebug=1')).toBe(true);
  });

  it('is off when absent, bare, or set to anything else', () => {
    expect(splatDebugEnabled('')).toBe(false);
    expect(splatDebugEnabled('?')).toBe(false);
    expect(splatDebugEnabled('?splatDebug')).toBe(false);
    expect(splatDebugEnabled('?splatDebug=0')).toBe(false);
    expect(splatDebugEnabled('?splatDebug=true')).toBe(false);
    expect(splatDebugEnabled('?splatDebugging=1')).toBe(false);
  });

  it('survives the production build — unlike ?splatUrl=, this is the point of it', () => {
    // `dev-splat-url.ts` folds to null under NODE_ENV=production on purpose. This one
    // must not: the failure it exists to read only reproduces in a deployed bundle.
    const previous = process.env.NODE_ENV;
    try {
      Object.defineProperty(process.env, 'NODE_ENV', {
        value: 'production',
        configurable: true,
      });
      expect(splatDebugEnabled('?splatDebug=1')).toBe(true);
    } finally {
      Object.defineProperty(process.env, 'NODE_ENV', {
        value: previous,
        configurable: true,
      });
    }
  });
});

describe('scrubSecrets', () => {
  it('drops the SigV4 query but keeps the origin and the object path', () => {
    const out = scrubSecrets(`Failed to fetch ${SIGNED}`);

    expect(out).not.toMatch(/X-Amz-Signature/i);
    expect(out).not.toContain('deadbeef');
    expect(out).not.toContain('?');
    // Which host answered, and that the object was a .spz, IS the diagnosis.
    expect(out).toContain('https://abc123.r2.cloudflarestorage.com/scans/room-42/splat.spz');
  });

  it('drops a signed query even when the URL around it was already lost', () => {
    expect(scrubSecrets('…&X-Amz-Signature=deadbeef')).not.toContain('deadbeef');
    expect(scrubSecrets('bad request ?token=abc123')).not.toContain('abc123');
  });

  it('scrubs every URL in the text, not just the first', () => {
    const out = scrubSecrets(`${SIGNED} then ${SIGNED}`);
    expect(out).not.toMatch(/X-Amz/i);
  });

  it('leaves text with no URL in it exactly as it was', () => {
    expect(scrubSecrets('Unknown splat file type: undefined')).toBe(
      'Unknown splat file type: undefined',
    );
    expect(scrubSecrets('')).toBe('');
  });
});

describe('describeSplatFailure', () => {
  it('carries the stage through untouched', () => {
    expect(describeSplatFailure('splat-mesh', new Error('boom')).stage).toBe('splat-mesh');
  });

  it('scrubs both the message and the stack', () => {
    const err = new Error(`Response body is null for URL: ${SIGNED}`);
    err.stack = `Error: fetch ${SIGNED}\n    at load (spark.module.js:1:1)`;

    const out = describeSplatFailure('initialize', err);

    expect(out.message).not.toMatch(/X-Amz/i);
    expect(out.stack).not.toMatch(/X-Amz/i);
    expect(out.message).toContain('Response body is null for URL:');
  });

  it('caps the stack at 300 characters so the message stays on the stage', () => {
    const err = new Error('boom');
    err.stack = 'x'.repeat(5000);
    expect(describeSplatFailure('frame', err).stack).toHaveLength(300);
  });

  it('reads a thrown non-Error — Spark throws WASM values that are not Errors', () => {
    expect(describeSplatFailure('splat-mesh', 'plain string').message).toBe('plain string');
    expect(describeSplatFailure('splat-mesh', { code: 7 }).message).toBe('[object Object]');
    expect(describeSplatFailure('splat-mesh', undefined).message).toBe('undefined');
    expect(describeSplatFailure('splat-mesh', 'plain string').stack).toBeNull();
  });

  it('falls back to the Error’s own toString when its message is empty', () => {
    expect(describeSplatFailure('frame', new TypeError('')).message).toBe('TypeError');
  });
});
