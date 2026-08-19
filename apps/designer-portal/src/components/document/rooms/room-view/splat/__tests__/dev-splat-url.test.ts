/**
 * The dev-only `?splatUrl=` override (Rendered Room v2, W2).
 *
 * Two things are load-bearing and both are asserted here: the parse is TOTAL (it runs
 * on whatever a designer happens to have in their address bar), and the guard is real
 * — same-origin paths only, and nothing at all in a production bundle.
 *
 * `process.env.NODE_ENV` is inlined by the bundler at build time, so the production
 * behaviour cannot be exercised by the ordinary import; the last block re-imports the
 * module under an overridden NODE_ENV in an isolated registry to prove the guard is
 * the constant it claims to be.
 */

import { devSplatUrlOverride } from '../dev-splat-url';

describe('devSplatUrlOverride', () => {
  it('reads a same-origin path', () => {
    expect(devSplatUrlOverride('?splatUrl=/fixtures/splat/room-fixture.ply')).toBe(
      '/fixtures/splat/room-fixture.ply',
    );
  });

  it('reads it alongside other parameters, in any position', () => {
    expect(devSplatUrlOverride('?mode=orbit&splatUrl=/a.ply&x=1')).toBe('/a.ply');
  });

  it('decodes a percent-encoded value', () => {
    expect(devSplatUrlOverride('?splatUrl=%2Ffixtures%2Fa%20b.ply')).toBe('/fixtures/a b.ply');
  });

  it('is null when the parameter is absent or empty', () => {
    expect(devSplatUrlOverride('')).toBeNull();
    expect(devSplatUrlOverride('?')).toBeNull();
    expect(devSplatUrlOverride('?mode=plan')).toBeNull();
    expect(devSplatUrlOverride('?splatUrl=')).toBeNull();
  });

  it('refuses an absolute URL — the portal fetches no third-party host, even in dev', () => {
    expect(devSplatUrlOverride('?splatUrl=https://evil.example/x.ply')).toBeNull();
    expect(devSplatUrlOverride('?splatUrl=http://localhost:9999/x.ply')).toBeNull();
    // Protocol-relative is still absolute.
    expect(devSplatUrlOverride('?splatUrl=//evil.example/x.ply')).toBeNull();
    // …and so is anything that isn't rooted at our own origin.
    expect(devSplatUrlOverride('?splatUrl=fixtures/x.ply')).toBeNull();
    expect(devSplatUrlOverride('?splatUrl=data:application/octet-stream,AAAA')).toBeNull();
  });

  it('survives a malformed query string rather than throwing into a render', () => {
    expect(devSplatUrlOverride('?%')).toBeNull();
    expect(devSplatUrlOverride('????')).toBeNull();
  });
});

describe('devSplatUrlOverride — the production guard', () => {
  const original = process.env.NODE_ENV;

  afterEach(() => {
    Object.defineProperty(process.env, 'NODE_ENV', { value: original, configurable: true });
    jest.resetModules();
  });

  it('returns null for every input when NODE_ENV is production', () => {
    Object.defineProperty(process.env, 'NODE_ENV', { value: 'production', configurable: true });
    jest.resetModules();
    const { devSplatUrlOverride: prod } = require('../dev-splat-url');

    expect(prod('?splatUrl=/fixtures/splat/room-fixture.ply')).toBeNull();
    expect(prod('?splatUrl=/anything.ply')).toBeNull();
  });
});
