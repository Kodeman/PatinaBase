/**
 * @jest-environment node
 */
import { NextRequest } from 'next/server';

import { POST } from '../accept/route';

beforeEach(() => {
  global.fetch = jest.fn();
});

function req(body: unknown) {
  return new NextRequest('http://localhost/api/auth/invite/accept', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

it('R6 — no session is required; the token IS the credential', async () => {
  (global.fetch as jest.Mock).mockResolvedValue({
    ok: true,
    status: 200,
    headers: new Headers({ 'Content-Type': 'application/json' }),
    text: async () => JSON.stringify({ actionLink: 'https://x/verify' }),
  });
  const res = await POST(req({ token: 'tok1' }));
  expect(res.status).toBe(200);
  expect(await res.json()).toEqual({ actionLink: 'https://x/verify' });
  const [url, init] = (global.fetch as jest.Mock).mock.calls[0];
  expect(url).toMatch(/\/client-invite\/accept$/);
  expect(init.headers.Authorization).toMatch(/^Bearer /);
  expect(JSON.parse(init.body)).toEqual({ token: 'tok1' });
});

it('refuses a request with no token', async () => {
  const res = await POST(req({}));
  expect(res.status).toBe(400);
  expect(global.fetch).not.toHaveBeenCalled();
});

it('refuses a body it cannot read', async () => {
  const bad = new NextRequest('http://localhost/api/auth/invite/accept', {
    method: 'POST',
    body: 'not json',
  });
  const res = await POST(bad);
  expect(res.status).toBe(400);
  expect(global.fetch).not.toHaveBeenCalled();
});

it('passes the function’s verdict through unchanged', async () => {
  (global.fetch as jest.Mock).mockResolvedValue({
    ok: false,
    status: 410,
    headers: new Headers({ 'Content-Type': 'application/json' }),
    text: async () => JSON.stringify({ error: 'expired' }),
  });
  const res = await POST(req({ token: 'tok1' }));
  expect(res.status).toBe(410);
  expect(await res.json()).toEqual({ error: 'expired' });
});
