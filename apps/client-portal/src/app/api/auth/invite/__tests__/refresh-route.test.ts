/**
 * @jest-environment node
 */
import { NextRequest } from 'next/server';

import { POST } from '../refresh/route';

beforeEach(() => {
  global.fetch = jest.fn().mockResolvedValue({
    ok: true,
    status: 200,
    headers: new Headers({ 'Content-Type': 'application/json' }),
    text: async () => JSON.stringify({ ok: true }),
  });
});

function req(body: unknown) {
  return new NextRequest('http://localhost/api/auth/invite/refresh', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

it('forwards the token with the service role — the caller is not signed in yet', async () => {
  const res = await POST(req({ token: 'tok1' }));
  expect(res.status).toBe(200);
  const [url, init] = (global.fetch as jest.Mock).mock.calls[0];
  expect(url).toMatch(/\/client-invite\/refresh$/);
  expect(init.headers.Authorization).toMatch(/^Bearer /);
  expect(JSON.parse(init.body)).toEqual({ token: 'tok1' });
});

it('answers ok for a missing token — the page is never an oracle', async () => {
  const res = await POST(req({}));
  expect(res.status).toBe(200);
  expect(await res.json()).toEqual({ ok: true });
  expect(global.fetch).not.toHaveBeenCalled();
});

it('answers ok for an unreadable body', async () => {
  const bad = new NextRequest('http://localhost/api/auth/invite/refresh', {
    method: 'POST',
    body: 'not json',
  });
  const res = await POST(bad);
  expect(res.status).toBe(200);
  expect(global.fetch).not.toHaveBeenCalled();
});

it('answers ok even when the upstream call throws', async () => {
  (global.fetch as jest.Mock).mockRejectedValue(new Error('unreachable'));
  jest.spyOn(console, 'error').mockImplementation(() => {});
  const res = await POST(req({ token: 'tok1' }));
  expect(res.status).toBe(200);
  expect(await res.json()).toEqual({ ok: true });
});
