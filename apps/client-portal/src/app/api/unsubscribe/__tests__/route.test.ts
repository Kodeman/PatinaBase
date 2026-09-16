/**
 * @jest-environment node
 *
 * THE SCOPE HAS TO CROSS THE REDIRECT (W4 r5 F2).
 *
 * This route applies the token and then hands the browser to
 * /preferences/unsubscribe. The landing cannot re-derive what the write
 * covered — an account-less recipient's click stops the whole address, not the
 * narrow type her token names — so if `scope` is dropped here the page prints
 * a sentence the record contradicts. The RFC 8058 one-click POST (no browser,
 * no Accept: text/html) must keep answering a bare 200/JSON.
 */
import { NextRequest } from 'next/server';
import { applyUnsubscribeToken } from '@patina/notifications';

import { GET, POST } from '../route';

jest.mock('@patina/supabase/server', () => ({
  createServiceClient: jest.fn(() => ({})),
}));

jest.mock('@patina/notifications', () => ({
  applyUnsubscribeToken: jest.fn(),
}));

const mockApply = applyUnsubscribeToken as jest.Mock;

function request(url: string, init?: RequestInit): NextRequest {
  return new NextRequest(url, init as RequestInit);
}

const BASE = 'http://localhost:3002/api/unsubscribe';

describe('client-portal /api/unsubscribe', () => {
  it('carries the address scope to the landing on the browser POST', async () => {
    mockApply.mockResolvedValue({
      ok: true,
      status: 'applied',
      type: 'po_sent',
      scope: 'address',
      columnUpdated: 'status',
    });

    const res = await POST(
      request(`${BASE}?token=tok`, {
        method: 'POST',
        headers: { accept: 'text/html' },
      }),
    );

    expect(res.status).toBe(303);
    const to = new URL(res.headers.get('location') as string);
    expect(to.pathname).toBe('/preferences/unsubscribe');
    expect(to.searchParams.get('status')).toBe('applied');
    expect(to.searchParams.get('type')).toBe('po_sent');
    expect(to.searchParams.get('scope')).toBe('address');
  });

  it('carries the account scope on the GET', async () => {
    mockApply.mockResolvedValue({
      ok: true,
      status: 'applied',
      type: 'price_drop',
      scope: 'account',
      userId: 'user-1',
      columnUpdated: 'type_price_drop',
    });

    const res = await GET(request(`${BASE}?token=tok`));

    const to = new URL(res.headers.get('location') as string);
    expect(to.searchParams.get('scope')).toBe('account');
  });

  it('sets no scope when the outcome carries none', async () => {
    mockApply.mockResolvedValue({ ok: false, status: 'expired', type: 'po_sent' });

    const res = await GET(request(`${BASE}?token=tok`));

    const to = new URL(res.headers.get('location') as string);
    expect(to.searchParams.get('status')).toBe('expired');
    expect(to.searchParams.has('scope')).toBe(false);
  });

  it('redirects a tokenless GET as malformed without touching the record', async () => {
    const res = await GET(request(BASE));

    expect(mockApply).not.toHaveBeenCalled();
    const to = new URL(res.headers.get('location') as string);
    expect(to.searchParams.get('status')).toBe('malformed');
    expect(to.searchParams.has('scope')).toBe(false);
  });

  it('answers the RFC 8058 one-click POST with a bare 200', async () => {
    mockApply.mockResolvedValue({
      ok: true,
      status: 'applied',
      type: 'po_sent',
      scope: 'address',
    });

    const res = await POST(request(`${BASE}?token=tok`, { method: 'POST' }));

    expect(res.status).toBe(200);
    expect(res.headers.get('location')).toBeNull();
  });

  it('refuses a one-click POST with no token', async () => {
    const res = await POST(request(BASE, { method: 'POST' }));

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({ error: 'missing_token' });
    expect(mockApply).not.toHaveBeenCalled();
  });

  it('reports a read failure as a 500 to the one-click caller', async () => {
    mockApply.mockResolvedValue({ ok: false, status: 'error', message: 'boom' });

    const res = await POST(request(`${BASE}?token=tok`, { method: 'POST' }));

    expect(res.status).toBe(500);
    await expect(res.json()).resolves.toEqual({ error: 'error', message: 'boom' });
  });
});
