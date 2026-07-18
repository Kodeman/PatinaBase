// CSP regression test for apps/admin-portal/next.config.js.
//
// Root cause of the blocked PO Composer PDF preview (Kody's live prod walk,
// 2026-07-17): `object-src 'none'` silently blocked the same-origin blob:
// <object type="application/pdf"> embed used by po-paper.tsx — Chrome falls
// back to "Your browser can't display the PDF inline" with no console error
// (the preview API route itself was proven perfect: 200, application/pdf,
// a valid PDF body). Fixed to `object-src 'self' blob:'`.
//
// Round 2 (same live walk, same session): with object-src fixed, a
// securitypolicyviolation listener caught a SECOND block —
// `{directive: 'frame-src', blocked: 'blob'}`. Chrome renders
// <object type="application/pdf"> through its internal PDF-viewer frame, so
// frame-src (which had no explicit directive and fell back to default-src
// 'self') also needed to permit the blob. Added an explicit
// `frame-src 'self' blob:`. connect-src was deliberately left untouched — a
// connect-src/blob violation Kody also saw was from his own diagnostic
// `fetch(blobUrl)` in devtools, not from page code.
//
// This test locks BOTH directives at their narrowest fix so a future header
// edit can't silently regress either one.

describe('admin-portal CSP', () => {
  const ORIGINAL_NODE_ENV = process.env.NODE_ENV;
  const ORIGINAL_ANALYZE = process.env.ANALYZE;

  afterEach(() => {
    process.env.NODE_ENV = ORIGINAL_NODE_ENV;
    process.env.ANALYZE = ORIGINAL_ANALYZE;
    jest.resetModules();
  });

  async function getCspValue() {
    jest.resetModules();
    // eslint-disable-next-line global-require, @typescript-eslint/no-require-imports
    const config = require('./next.config.js');
    const headerGroups = await config.headers();
    const cspHeader = headerGroups[0].headers.find((h) => h.key === 'Content-Security-Policy');
    return cspHeader.value;
  }

  it('permits same-origin blob PDF embeds (object-src + frame-src) in production', async () => {
    process.env.NODE_ENV = 'production';
    const csp = await getCspValue();
    expect(csp).toContain("object-src 'self' blob:");
    expect(csp).not.toContain("object-src 'none'");
    expect(csp).toContain("frame-src 'self' blob:");
  });

  it('permits same-origin blob PDF embeds (object-src + frame-src) in development', async () => {
    process.env.NODE_ENV = 'development';
    const csp = await getCspValue();
    expect(csp).toContain("object-src 'self' blob:");
    expect(csp).not.toContain("object-src 'none'");
    expect(csp).toContain("frame-src 'self' blob:");
  });

  it('does not leave connect-src touched by the object-src/frame-src fix', async () => {
    // Kody's diagnostic fetch(blobUrl) tripped a connect-src violation, but
    // page code never fetches blob: URLs — connect-src must stay as-is.
    process.env.NODE_ENV = 'production';
    const csp = await getCspValue();
    expect(csp).not.toMatch(/connect-src[^;]*blob:/);
  });

  it('does not loosen the rest of the policy alongside the object-src/frame-src relaxation', async () => {
    process.env.NODE_ENV = 'production';
    const csp = await getCspValue();
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("base-uri 'self'");
  });
});
