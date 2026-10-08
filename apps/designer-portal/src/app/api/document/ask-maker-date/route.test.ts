/**
 * @jest-environment node
 *
 * US-19 D6 as amended by R37 (FR1 F2) — `Hold for review` writes one
 * `procurement_drafts` row in `awaiting_review` and stops there. A studio
 * member sends or discards it from DraftReview; nothing here sends. The real
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
import * as route from './route';

const { POST } = route;

const USER = '77777777-7777-4777-8777-777777777777';
const STUDIO = '88888888-8888-4888-8888-888888888888';
const PROJECT = '33333333-3333-4333-8333-333333333333';
const LINE = '11111111-1111-4111-8111-111111111111';
const PO = '55555555-5555-4555-8555-555555555555';
const VENDOR = '66666666-6666-4666-8666-666666666666';
const OWNER_STUDIO = '99999999-9999-4999-8999-999999999999';

type Result = { data: unknown; error: unknown };
type Call = [string, unknown[]];

/** A PostgREST builder: every filter returns itself; it resolves to `result`. */
function builder(result: () => Result, calls: Call[]) {
  const chain: Record<string, unknown> = {};
  for (const method of ['select', 'eq', 'is', 'in', 'order', 'insert']) {
    chain[method] = (...args: unknown[]) => {
      calls.push([method, args]);
      return chain;
    };
  }
  chain.maybeSingle = async () => result();
  chain.single = async () => result();
  chain.then = (resolve: (r: Result) => unknown, reject: (e: unknown) => unknown) =>
    Promise.resolve(result()).then(resolve, reject);
  return chain;
}

let user: { id: string } | null;
let lineRow: Record<string, unknown> | null;
/** The line's own vendor record, as the caller's session reads it (R7). */
let vendorRow: Record<string, unknown> | null;
let existingDrafts: Record<string, unknown>[];
let insertResult: Result;
const sessionTables: string[] = [];
const sessionCalls: Call[] = [];
const adminTables: string[] = [];
const adminCalls: Call[] = [];
const rpc = jest.fn();

const HELD_ROW = {
  id: 'draft-1',
  kind: 'maker_eta_request',
  status: 'awaiting_review',
  ffe_item_id: LINE,
  purchase_order_id: PO,
  project_id: PROJECT,
  created_at: '2026-10-07T15:00:00Z',
};

beforeEach(() => {
  jest.clearAllMocks();
  user = { id: USER };
  lineRow = {
    id: LINE,
    project_id: PROJECT,
    name: 'Library ladder and rail, walnut',
    vendor_id: VENDOR,
    vendor_name: 'Woodward & Sons',
    purchase_order_id: PO,
    product: { brand: 'Fixture Chairworks' },
    project: { studio_id: STUDIO, designer_id: USER },
    purchase_order: { id: PO, vendor_id: VENDOR, vendor: { name: 'Woodward & Sons' } },
  };
  vendorRow = null;
  existingDrafts = [];
  insertResult = { data: HELD_ROW, error: null };
  sessionTables.length = 0;
  sessionCalls.length = 0;
  adminTables.length = 0;
  adminCalls.length = 0;
  rpc.mockImplementation(async (name: string) =>
    name === '_primary_studio_for'
      ? { data: OWNER_STUDIO, error: null }
      : { data: 'orders@woodward.test', error: null },
  );

  (createServerClient as jest.Mock).mockResolvedValue({
    auth: { getUser: async () => ({ data: { user }, error: null }) },
    from: (table: string) => {
      sessionTables.push(table);
      return builder(
        () =>
          table === 'project_ffe_items'
            ? { data: lineRow, error: null }
            : table === 'vendors'
              ? { data: vendorRow, error: null }
              : { data: existingDrafts, error: null },
        sessionCalls,
      );
    },
  });
  (createAdminClient as jest.Mock).mockReturnValue({
    from: (table: string) => {
      adminTables.push(table);
      return builder(
        () => (table === 'user_roles' ? { data: [{ role_id: 'designer' }], error: null } : insertResult),
        adminCalls,
      );
    },
    rpc,
  });
});

afterEach(() => jest.useRealTimers());

/** Freeze the clock only; promises and timers stay real. */
function at(iso: string) {
  jest.useFakeTimers({
    now: new Date(iso),
    doNotFake: [
      'nextTick',
      'setImmediate',
      'clearImmediate',
      'setTimeout',
      'clearTimeout',
      'setInterval',
      'clearInterval',
      'queueMicrotask',
    ],
  });
}

const post = (body: unknown) =>
  POST(
    new NextRequest('http://localhost/api/document/ask-maker-date', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  );

const hold = {
  projectId: PROJECT,
  ffeItemId: LINE,
  subject: ' Arrival date: Library ladder and rail · PO WS-214 ',
  body: ' Woodward & Sons,\n\nCould you give us an arrival date for this piece? ',
};

const inserted = () =>
  adminCalls.filter(([method]) => method === 'insert').map(([, args]) => args[0]);

describe('POST /api/document/ask-maker-date', () => {
  it('returns 401 without a session, and writes nothing', async () => {
    user = null;
    const res = await post(hold);
    expect(res.status).toBe(401);
    expect(inserted()).toEqual([]);
  });

  it('refuses a caller who cannot read the line, before anything is written', async () => {
    lineRow = null;
    const res = await post(hold);
    expect(res.status).toBe(403);
    expect(inserted()).toEqual([]);
    expect(rpc).not.toHaveBeenCalled();
    // The proof is the caller's own RLS read (can_buy_for_project) of THIS
    // line on THIS project.
    expect(sessionTables).toContain('project_ffe_items');
    expect(sessionCalls).toEqual(
      expect.arrayContaining([
        ['eq', ['id', LINE]],
        ['eq', ['project_id', PROJECT]],
      ]),
    );
  });

  it('refuses a malformed request before reading or writing', async () => {
    expect((await post({ ...hold, ffeItemId: 'not-a-uuid' })).status).toBe(400);
    expect((await post({ ...hold, body: '   ' })).status).toBe(400);
    expect((await post({ ...hold, subject: 'x'.repeat(201) })).status).toBe(400);
    expect(inserted()).toEqual([]);
    expect(sessionTables).not.toContain('project_ffe_items');
  });

  it('holds one awaiting_review procurement draft on the PO, with the actor and the studio', async () => {
    const res = await post({ ...hold, vendorId: 'someone-else', toEmail: 'x@example.com' });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ draft: HELD_ROW });

    expect(adminTables).toContain('procurement_drafts');
    expect(inserted()).toEqual([
      {
        organization_id: STUDIO,
        project_id: PROJECT,
        kind: 'maker_eta_request',
        status: 'awaiting_review',
        purchase_order_id: PO,
        ffe_item_id: LINE,
        to_email: 'orders@woodward.test',
        subject: 'Arrival date: Library ladder and rail · PO WS-214',
        body: 'Woodward & Sons,\n\nCould you give us an arrival date for this piece?',
        composed_by: USER,
      },
    ]);
    // The recipient is the PO's vendor, resolved server-side (po-send's order),
    // never anything the request carried.
    expect(rpc).toHaveBeenCalledWith('_procurement_vendor_email', {
      p_org: STUDIO,
      p_vendor: VENDOR,
    });
    expect(JSON.stringify(inserted())).not.toContain('x@example.com');
    expect(JSON.stringify(inserted())).not.toContain('someone-else');
  });

  it('never writes the agent queue', async () => {
    await post(hold);
    expect(adminTables).not.toContain('agent_tasks');
    expect(rpc).not.toHaveBeenCalledWith('enqueue_agent_task', expect.anything());
  });

  it("F5: a project with no studio records its owner's primary studio, as purchase_order_studio_id does", async () => {
    lineRow = { ...lineRow, project: { studio_id: null, designer_id: USER } };
    expect((await post(hold)).status).toBe(200);
    expect(rpc).toHaveBeenCalledWith('_primary_studio_for', { p_user: USER });
    expect(rpc).toHaveBeenCalledWith('_procurement_vendor_email', {
      p_org: OWNER_STUDIO,
      p_vendor: VENDOR,
    });
    expect(inserted()[0]).toMatchObject({ organization_id: OWNER_STUDIO, composed_by: USER });
  });

  it('a line with no PO holds a project-level draft about the line', async () => {
    lineRow = {
      ...lineRow,
      vendor_id: null,
      vendor_name: null,
      purchase_order_id: null,
      purchase_order: null,
      product: { brand: 'Fixture Metalworks' },
    };
    const res = await post(hold);
    expect(res.status).toBe(200);
    expect(inserted()[0]).toMatchObject({
      purchase_order_id: null,
      ffe_item_id: LINE,
      to_email: null,
    });
    // No vendor to resolve an address from.
    expect(rpc).not.toHaveBeenCalled();
  });

  describe('R7: the address belongs to the record the printed maker names', () => {
    const HEWN = '44444444-4444-4444-8444-444444444444';

    it("the line's own maker, not the PO's vendor, when the line names another maker", async () => {
      lineRow = { ...lineRow, vendor_id: HEWN, vendor_name: 'Hewn Woodworks' };
      vendorRow = { name: 'Hewn Woodworks' };
      expect((await post(hold)).status).toBe(200);
      expect(rpc).toHaveBeenCalledWith('_procurement_vendor_email', { p_org: STUDIO, p_vendor: HEWN });
      expect(rpc).not.toHaveBeenCalledWith('_procurement_vendor_email', expect.objectContaining({ p_vendor: VENDOR }));
      // The record is read back through the caller's own session.
      expect(sessionTables).toContain('vendors');
      expect(sessionCalls).toEqual(expect.arrayContaining([['eq', ['id', HEWN]]]));
    });

    it('no address when the line vendor record no longer bears the printed name', async () => {
      lineRow = { ...lineRow, vendor_id: HEWN, vendor_name: 'Hewn Woodworks' };
      vendorRow = { name: 'Hewn & Daughters' };
      expect((await post(hold)).status).toBe(200);
      expect(inserted()[0]).toMatchObject({ to_email: null });
      expect(rpc).not.toHaveBeenCalledWith('_procurement_vendor_email', expect.anything());
    });

    it('no address for a maker named by hand with no record, even on a PO', async () => {
      lineRow = { ...lineRow, vendor_id: null, vendor_name: 'Hewn Woodworks' };
      expect((await post(hold)).status).toBe(200);
      expect(inserted()[0]).toMatchObject({ to_email: null, purchase_order_id: PO });
      expect(rpc).not.toHaveBeenCalledWith('_procurement_vendor_email', expect.anything());
    });

    it("the PO's vendor when the line prints the PO's vendor", async () => {
      lineRow = { ...lineRow, vendor_id: null, vendor_name: null };
      expect((await post(hold)).status).toBe(200);
      expect(rpc).toHaveBeenCalledWith('_procurement_vendor_email', { p_org: STUDIO, p_vendor: VENDOR });
      expect(inserted()[0]).toMatchObject({ to_email: 'orders@woodward.test' });
    });
  });

  it('R37: a line with no recorded maker is refused, and nothing is written', async () => {
    lineRow = {
      ...lineRow,
      vendor_id: null,
      vendor_name: null,
      purchase_order_id: null,
      purchase_order: null,
      product: null,
    };
    const res = await post(hold);
    expect(res.status).toBe(422);
    expect(await res.json()).toEqual({ error: 'No maker is recorded on this line.' });
    expect(inserted()).toEqual([]);
  });

  it('F2: a draft already held for the line answers 409 with that row', async () => {
    existingDrafts = [HELD_ROW];
    const res = await post(hold);
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({
      error: 'A date request for this line is already drafted.',
      draft: HELD_ROW,
    });
    expect(inserted()).toEqual([]);
    // Read through the caller's own RLS, on this line's notes only.
    expect(sessionTables).toContain('procurement_drafts');
    expect(sessionCalls).toEqual(
      expect.arrayContaining([
        ['eq', ['kind', 'maker_eta_request']],
        ['eq', ['ffe_item_id', LINE]],
      ]),
    );
  });

  it('F2: a draft claimed by a send in flight is held too', async () => {
    existingDrafts = [{ ...HELD_ROW, status: 'sending' }];
    expect((await post(hold)).status).toBe(409);
    expect(inserted()).toEqual([]);
  });

  it('506-3: a held draft from an earlier day still answers 409 until it is sent or discarded', async () => {
    at('2026-10-09T15:00:00Z');
    existingDrafts = [{ ...HELD_ROW, created_at: '2026-10-07T15:00:00Z' }];
    const res = await post(hold);
    expect(res.status).toBe(409);
    expect((await res.json()).draft).toEqual(existingDrafts[0]);
    expect(inserted()).toEqual([]);
  });

  it('F1: a draft sent earlier the same studio day answers 409 with that draft', async () => {
    at('2026-10-07T21:00:00Z');
    existingDrafts = [
      { ...HELD_ROW, status: 'sent', created_at: '2026-10-07T15:00:00Z', sent_at: '2026-10-07T16:00:00Z' },
    ];
    const res = await post(hold);
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({
      error: 'A date request for this line is already drafted.',
      draft: existingDrafts[0],
    });
    expect(inserted()).toEqual([]);
  });

  it('506-3: a Discard releases the day — discard, then ask again the same day', async () => {
    at('2026-10-07T21:00:00Z');
    existingDrafts = [
      { ...HELD_ROW, status: 'discarded', created_at: '2026-10-07T15:00:00Z', discarded_at: '2026-10-07T15:05:00Z' },
    ];
    const res = await post(hold);
    expect(res.status).toBe(200);
    expect(inserted()).toHaveLength(1);
    expect(inserted()[0]).toMatchObject({ status: 'awaiting_review', ffe_item_id: LINE });
  });

  it('511-R3: the day is the day it was sent, not the day it was drafted', async () => {
    // Drafted yesterday, sent this morning: a second ask today is refused.
    at('2026-10-08T21:00:00Z');
    existingDrafts = [
      { ...HELD_ROW, status: 'sent', created_at: '2026-10-07T15:00:00Z', sent_at: '2026-10-08T15:00:00Z' },
    ];
    expect((await post(hold)).status).toBe(409);

    // Drafted and sent yesterday: today is a new day.
    existingDrafts = [
      { ...HELD_ROW, status: 'sent', created_at: '2026-10-07T15:00:00Z', sent_at: '2026-10-07T16:00:00Z' },
    ];
    expect((await post(hold)).status).toBe(200);
    expect(inserted()).toHaveLength(1);
  });

  it('F6: the day is the studio day in America/Chicago, not the UTC day', async () => {
    // 02:30 UTC on the 8th is 21:30 on the 7th in Chicago: a note sent at
    // 10:00 Chicago on the 7th is the same studio day.
    at('2026-10-08T02:30:00Z');
    existingDrafts = [{ ...HELD_ROW, status: 'sent', sent_at: '2026-10-07T15:00:00Z' }];
    expect((await post(hold)).status).toBe(409);

    // 06:00 UTC on the 8th is 01:00 on the 8th in Chicago; a note sent at
    // 03:00 UTC on the 8th was 22:00 on the 7th there: a new studio day.
    at('2026-10-08T06:00:00Z');
    existingDrafts = [{ ...HELD_ROW, status: 'sent', sent_at: '2026-10-08T03:00:00Z' }];
    expect((await post(hold)).status).toBe(200);
    expect(inserted()).toHaveLength(1);
  });

  it('two presses at once: the one-open-note index refuses the second, answered 409 with the first', async () => {
    let reads = 0;
    (createServerClient as jest.Mock).mockResolvedValue({
      auth: { getUser: async () => ({ data: { user }, error: null }) },
      from: (table: string) =>
        builder(
          () =>
            table === 'project_ffe_items'
              ? { data: lineRow, error: null }
              : { data: reads++ === 0 ? [] : [HELD_ROW], error: null },
          sessionCalls,
        ),
    });
    insertResult = { data: null, error: { code: '23505', message: 'duplicate key' } };
    const res = await post(hold);
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({
      error: 'A date request for this line is already drafted.',
      draft: HELD_ROW,
    });
  });
});

describe('the route module never sends', () => {
  const source = readFileSync(join(__dirname, 'route.ts'), 'utf8');

  it('F4: has no reader of its own; held notes are read under procurement_drafts RLS', () => {
    expect(Object.keys(route).sort()).toEqual(['POST']);
  });

  it('imports nothing that can email or reach the maker', () => {
    const imports = Array.from(source.matchAll(/from\s+['"]([^'"]+)['"]/g), (m) => m[1]);
    expect(imports.sort()).toEqual([
      '@/lib/document/install-reading',
      '@/lib/supabase-admin',
      '@patina/supabase/server',
      'next/server',
    ]);
    expect(source).not.toMatch(/resend|@patina\/email|sendEmail|send-email|functions\.invoke|fetch\(/i);
  });

  it('only ever writes a draft: no queue, no send state', () => {
    expect(source).not.toMatch(
      /agent_tasks|enqueue_agent_task|'queued'|'resurrect'|status:\s*'(sent|sending|discarded)'/,
    );
    expect(source).toContain("status: 'awaiting_review'");
  });
});
