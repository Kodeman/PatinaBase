import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

/**
 * Regression: a missing RESEND_API_KEY must degrade to a graceful
 * { success: false } result, NOT a thrown exception. When getResendClient()
 * threw outside the try/catch, callers like the admin application-email route
 * surfaced an opaque HTTP 500 instead of a clear 502. See
 * apps/admin-portal/.../applications/[type]/[id]/email/route.ts.
 */
describe('send.ts — missing RESEND_API_KEY is non-throwing', () => {
  const prevKey = process.env.RESEND_API_KEY;

  beforeEach(() => {
    vi.resetModules(); // fresh module → resendClient cache is null
    delete process.env.RESEND_API_KEY;
  });

  afterEach(() => {
    if (prevKey === undefined) delete process.env.RESEND_API_KEY;
    else process.env.RESEND_API_KEY = prevKey;
  });

  it('sendHtmlEmail returns { success:false } mentioning the key', async () => {
    const { sendHtmlEmail } = await import('../send');
    const res = await sendHtmlEmail({
      to: 'recipient@example.com',
      subject: 'hi',
      html: '<p>hello</p>',
    });
    expect(res.success).toBe(false);
    expect(res.error).toMatch(/RESEND_API_KEY/);
  });

  it('sendEmail returns { success:false } mentioning the key', async () => {
    const { sendEmail } = await import('../send');
    const res = await sendEmail({
      to: 'recipient@example.com',
      subject: 'hi',
      // react is irrelevant — the key check fails before it is used
      react: null as never,
    });
    expect(res.success).toBe(false);
    expect(res.error).toMatch(/RESEND_API_KEY/);
  });

  it('sendCompliantEmail (html, transactional) returns { success:false }', async () => {
    const { sendCompliantEmail } = await import('../send');
    const res = await sendCompliantEmail({
      to: 'recipient@example.com',
      subject: 'hi',
      html: '<p>hello</p>',
      category: 'transactional',
    });
    expect(res.success).toBe(false);
    expect(res.error).toMatch(/RESEND_API_KEY/);
  });
});
