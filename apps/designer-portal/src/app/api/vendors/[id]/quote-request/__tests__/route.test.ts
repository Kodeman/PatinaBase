/**
 * @jest-environment node
 *
 * C-29: a quote request may name its job, the job's lines and when the answer
 * is due. The route writes them on the draft row (00707 keeps the lines inside
 * a job the caller can buy for) and refuses lines with no job before writing.
 */
import { NextRequest } from 'next/server';

jest.mock('@patina/supabase/server', () => ({ createServerClient: jest.fn() }));

import { createServerClient } from '@patina/supabase/server';
import { POST } from '../route';

const VENDOR = '44444444-4444-4444-8444-444444444444';
const PROJECT = '33333333-3333-4333-8333-333333333333';
const LINE = '11111111-1111-4111-8111-111111111111';

const insert = jest.fn();
const fetchMock = jest.fn();

function mockSupabase() {
  insert.mockReturnValue({
    select: () => ({
      single: async () => ({ data: { id: 'req-1', status: 'draft', created_at: '2026-10-06T10:00:00Z' }, error: null }),
    }),
  });
  (createServerClient as jest.Mock).mockResolvedValue({
    auth: {
      getUser: async () => ({ data: { user: { id: 'designer-1' } }, error: null }),
      getSession: async () => ({ data: { session: { access_token: 'token' } } }),
    },
    from: (table: string) => {
      expect(table).toBe('vendor_quote_requests');
      return { insert };
    },
  });
}

const post = (body: unknown) =>
  POST(
    new NextRequest(`http://localhost/api/vendors/${VENDOR}/quote-request`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ id: VENDOR }) },
  );

beforeEach(() => {
  jest.clearAllMocks();
  mockSupabase();
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://supabase.test';
  fetchMock.mockResolvedValue(new Response(JSON.stringify({ ok: true, sentAt: '2026-10-06T10:00:01Z' })));
  global.fetch = fetchMock as unknown as typeof fetch;
});

it('writes the job, its lines and the due date on the draft, then sends it', async () => {
  const res = await post({
    message: ' Price the pair, please. ',
    projectId: PROJECT,
    ffeItemIds: [LINE],
    dueOn: '2026-10-20',
  });
  expect(res.status).toBe(201);
  expect(insert).toHaveBeenCalledWith({
    vendor_id: VENDOR,
    designer_id: 'designer-1',
    scope: null,
    timeline: null,
    message: 'Price the pair, please.',
    project_id: PROJECT,
    ffe_item_ids: [LINE],
    due_on: '2026-10-20',
  });
  expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ quoteRequestId: 'req-1', mode: 'send' });
});

it('keeps a request with no job as it always was', async () => {
  await post({ message: 'Price it', scope: 'Two sofas' });
  expect(insert).toHaveBeenCalledWith(
    expect.objectContaining({ scope: 'Two sofas', project_id: null, ffe_item_ids: [], due_on: null }),
  );
});

it('refuses lines with no job, and a malformed due date, before writing anything', async () => {
  const noJob = await post({ message: 'Price it', ffeItemIds: [LINE] });
  expect(noJob.status).toBe(400);
  expect(await noJob.json()).toEqual({ error: 'Choose the job before naming its lines' });
  const badDate = await post({ message: 'Price it', dueOn: 'next week' });
  expect(badDate.status).toBe(400);
  expect(insert).not.toHaveBeenCalled();
  expect(fetchMock).not.toHaveBeenCalled();
});
