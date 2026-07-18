// CSP regression test for apps/admin-portal/next.config.js.
//
// Root cause of the blocked PO Composer PDF preview (Kody's live prod walk,
// 2026-07-17): `object-src 'none'` silently blocked the same-origin blob:
// <object type="application/pdf"> embed used by po-paper.tsx — Chrome falls
// back to "Your browser can't display the PDF inline" with no console error
// (the preview API route itself was proven perfect: 200, application/pdf,
// a valid PDF body). This test locks the directive at the narrowest fix
// (`'self' blob:`) so a future header edit can't silently regress it.

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

  it('permits same-origin blob PDF embeds (object-src) in production', async () => {
    process.env.NODE_ENV = 'production';
    const csp = await getCspValue();
    expect(csp).toContain("object-src 'self' blob:");
    expect(csp).not.toContain("object-src 'none'");
  });

  it('permits same-origin blob PDF embeds (object-src) in development', async () => {
    process.env.NODE_ENV = 'development';
    const csp = await getCspValue();
    expect(csp).toContain("object-src 'self' blob:");
    expect(csp).not.toContain("object-src 'none'");
  });

  it('does not loosen the rest of the policy alongside the object-src relaxation', async () => {
    process.env.NODE_ENV = 'production';
    const csp = await getCspValue();
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("base-uri 'self'");
  });
});
