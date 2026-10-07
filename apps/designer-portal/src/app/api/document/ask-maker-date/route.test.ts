/**
 * @jest-environment node
 *
 * US-19 D6 — Ask the maker for a date holds a draft and stops there. The real
 * `getAuthenticatedDesignerAdmin` runs against mocked Supabase clients, so the
 * 401 and the role check are the route's own.
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import { NextRequest } from 'next/server';

jest.mock('@patina/supabase/server', () => ({ createServerClient: jest.fn() }));
jest.mock('@patina/supabase/client', () => ({ createAdminClient: jest.fn() }));

import { createServerClient } from '@patina/supabase/server';
import { createAdminClient } from '@patina/supabase/client';
import { GET, POST } from './route';

const PROJECT = '33333333-3333-4333-8333-333333333333';
const LINE = '11111111-1111-4111-8111-111111111111';
const PO = '55555555-5555-4555-8555-555555555555';
const VENDOR = '66666666-6666-4666-8666-666666666666';

type Result = { data: unknown; error: unknown };
type Call = [string, unknown[]];

/** A PostgREST builder: every filter returns itself; it resolves to `result`. */
function builder(result: Result, calls: Call[]) {
  const chain: Record<string, unknown> = {};
  for (const method of ['select', 'eq', 'is', 'in', 'order']) {
    chain[method] = (...args: unknown[]) => {
      calls.push([method, args]);
      return chain;
    };
  }
  chain.maybeSingle = async () => result;
  chain.then = (resolve: (r: Result) => unknown, reject: (e: unknown) => unknown) =>
    Promise.resolve(result).then(resolve, reject);
  return chain;
}

let user: { id: string } | null;
let lineRow: unknown;
let projectRow: unknown;
let heldTasks: unknown[];
const sessionTables: string[] = [];
const sessionCalls: Call[] = [];
const adminTables: string[] = [];
const adminCalls: Call[] = [];
const rpc = jest.fn();

beforeEach(() => {
  jest.clearAllMocks();
  user = { id: 'designer-1' };
  lineRow = {
    id: LINE,
    project_id: PROJECT,
    name: 'Library ladder and rail, walnut',
    vendor_id: VENDOR,
    vendor_name: 'Woodward & Sons',
    purchase_order_id: PO,
    purchase_order: { id: PO, vendor_id: VENDOR, vendor_po_number: 'WS-214', confirmed_eta: '2026-10-02' },
  };
  projectRow = { id: PROJECT };
  heldTasks = [];
  sessionTables.length = 0;
  sessionCalls.length = 0;
  adminTables.length = 0;
  adminCalls.length = 0;
  rpc.mockResolvedValue({
    data: { id: 'task-1', created_at: '2026-10-07T15:00:00Z', status: 'awaiting_review' },
    error: null,
  });

  (createServerClient as jest.Mock).mockResolvedValue({
    auth: { getUser: async () => ({ data: { user }, error: null }) },
    from: (table: string) => {
      sessionTables.push(table);
      return builder(
        { data: table === 'project_ffe_items' ? lineRow : projectRow, error: null },
        sessionCalls,
      );
    },
  });
  (createAdminClient as jest.Mock).mockReturnValue({
    from: (table: string) => {
      adminTables.push(table);
      return builder(
        table === 'user_roles'
          ? { data: [{ role_id: 'designer' }], error: null }
          : { data: heldTasks, error: null },
        adminCalls,
      );
    },
    rpc,
  });
});

const post = (body: unknown) =>
  POST(
    new NextRequest('http://localhost/api/document/ask-maker-date', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  );
const get = (projectId = PROJECT) =>
  GET(new NextRequest(`http://localhost/api/document/ask-maker-date?projectId=${projectId}`));

const hold = {
  projectId: PROJECT,
  ffeItemId: LINE,
  subject: ' Arrival date: Library ladder and rail · PO WS-214 ',
  body: ' Hello Woodward & Sons,\n\nCould you give us an arrival date for this piece? ',
};

describe('POST /api/document/ask-maker-date', () => {
  it('returns 401 without a session, and writes nothing', async () => {
    user = null;
    const res = await post(hold);
    expect(res.status).toBe(401);
    expect(rpc).not.toHaveBeenCalled();
  });

  it('refuses a caller who cannot read the line, before the queue is touched', async () => {
    lineRow = null;
    const res = await post(hold);
    expect(res.status).toBe(403);
    expect(rpc).not.toHaveBeenCalled();
    // The proof is the caller's own RLS read of THIS line on THIS project.
    expect(sessionTables).toContain('project_ffe_items');
    expect(sessionCalls).toEqual(
      expect.arrayContaining([
        ['eq', ['id', LINE]],
        ['eq', ['project_id', PROJECT]],
      ]),
    );
  });

  it('enqueues one awaiting_review maker_eta_request with the maker from the record', async () => {
    const res = await post({ ...hold, vendorId: 'someone-else', makerEmail: 'x@example.com' });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ taskId: 'task-1', askedAt: '2026-10-07T15:00:00Z' });

    expect(rpc).toHaveBeenCalledTimes(1);
    const [fn, args] = rpc.mock.calls[0];
    expect(fn).toBe('enqueue_agent_task');
    expect(args).toMatchObject({
      p_task_type: 'maker_eta_request',
      p_status: 'awaiting_review',
      p_entity_type: 'project_ffe_item',
      p_entity_id: LINE,
      p_on_conflict: 'ignore',
      p_payload: {
        project_id: PROJECT,
        ffe_item_id: LINE,
        purchase_order_id: PO,
        vendor_po_number: 'WS-214',
        vendor_id: VENDOR,
        maker_name: 'Woodward & Sons',
        subject: 'Arrival date: Library ladder and rail · PO WS-214',
        body: 'Hello Woodward & Sons,\n\nCould you give us an arrival date for this piece?',
      },
    });
    expect(args.p_idempotency_key).toMatch(new RegExp(`^maker_eta_request:${LINE}:\\d{4}-\\d{2}-\\d{2}$`));
    expect(JSON.stringify(args)).not.toContain('x@example.com');
    expect(JSON.stringify(args)).not.toContain('someone-else');
  });

  it('refuses a malformed request before reading or writing', async () => {
    expect((await post({ ...hold, ffeItemId: 'not-a-uuid' })).status).toBe(400);
    expect((await post({ ...hold, body: '   ' })).status).toBe(400);
    expect((await post({ ...hold, subject: 'x'.repeat(201) })).status).toBe(400);
    expect(rpc).not.toHaveBeenCalled();
    expect(sessionTables).not.toContain('project_ffe_items');
  });
});

describe('GET /api/document/ask-maker-date', () => {
  it('returns 401 without a session', async () => {
    user = null;
    expect((await get()).status).toBe(401);
    expect(adminTables).not.toContain('agent_tasks');
  });

  it('refuses a caller who cannot read the project, before the queue is read', async () => {
    projectRow = null;
    expect((await get()).status).toBe(403);
    expect(adminTables).not.toContain('agent_tasks');
  });

  it("reads back this project's held maker notes only", async () => {
    heldTasks = [
      {
        id: 'task-1',
        entity_id: LINE,
        created_at: '2026-10-07T15:00:00Z',
        payload: { project_id: PROJECT, maker_name: 'Woodward & Sons', subject: 'S', body: 'B' },
      },
    ];
    const res = await get();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      drafts: [
        {
          taskId: 'task-1',
          ffeItemId: LINE,
          askedAt: '2026-10-07T15:00:00Z',
          makerName: 'Woodward & Sons',
          subject: 'S',
          body: 'B',
        },
      ],
    });
    expect(adminCalls).toEqual(
      expect.arrayContaining([
        ['eq', ['task_type', 'maker_eta_request']],
        ['eq', ['status', 'awaiting_review']],
        ['eq', ['payload->>project_id', PROJECT]],
      ]),
    );
  });
});

describe('the route module never sends', () => {
  const source = readFileSync(join(__dirname, 'route.ts'), 'utf8');

  it('imports nothing that can email or reach the maker', () => {
    const imports = Array.from(source.matchAll(/from\s+['"]([^'"]+)['"]/g), (m) => m[1]);
    expect(imports.sort()).toEqual(['@/lib/supabase-admin', '@patina/supabase/server', 'next/server']);
    expect(source).not.toMatch(/resend|@patina\/email|sendEmail|send-email|functions\.invoke|fetch\(/i);
  });

  it('only ever writes a draft: never a queued task, never a resurrect', () => {
    expect(source).not.toContain("'queued'");
    expect(source).not.toContain("'resurrect'");
    expect(source).toContain("p_status: 'awaiting_review'");
  });
});
