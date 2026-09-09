/**
 * @jest-environment node
 *
 * sendTheLetter's project-access guard (route.ts:368-391): a projectId in the
 * body must not let a caller unrelated to that project's studio drive a
 * cross-studio send. Mirrors is_active_org_member (00556) — role <> 'guest'
 * AND organizations.status = 'active' — since this route only holds a
 * service-role adminClient and cannot call that RPC directly (it reads
 * auth.uid(), which is null under the service role).
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { sendTheLetter } from '../route';

function chainable(
  terminalResult: { data?: unknown; error?: unknown },
  /** When given, reads (maybeSingle) answer this and writes (single) answer
   *  terminalResult — the roster-lookup-then-insert path needs the two apart. */
  readResult?: { data?: unknown; error?: unknown },
) {
  const builder: any = {};
  for (const method of ['select', 'eq', 'neq', 'in', 'limit', 'order', 'insert', 'update', 'upsert']) {
    builder[method] = jest.fn(() => builder);
  }
  builder.maybeSingle = jest.fn(() => Promise.resolve(readResult ?? terminalResult));
  builder.single = jest.fn(() => Promise.resolve(terminalResult));
  builder.then = (resolve: (v: unknown) => unknown) => resolve(terminalResult);
  return builder;
}

const callerUser = { id: 'designer-1', email: 'designer@example.com' };

const baseArgs = {
  callerUser,
  clientEmail: 'dave@okonkwo.net',
  clientName: 'Dave Okonkwo',
  source: 'direct' as const,
  notes: undefined,
  existingRow: null,
  note: null,
};

function makeAdminClient(tables: Record<string, any>) {
  return {
    from: jest.fn((table: string) => {
      if (table in tables) return tables[table];
      throw new Error(`Unexpected table in test: ${table}`);
    }),
  };
}

/** The tables a run that clears the access guard needs to complete the send. */
function downstreamTables() {
  return {
    profiles: chainable({ data: null, error: null }),
    designer_clients: chainable({ data: { id: 'dc-1' }, error: null }),
    client_activity_log: chainable({ data: null, error: null }),
  };
}

beforeEach(() => {
  global.fetch = jest.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ profileId: null, kind: 'invite' }),
  });
});

describe('sendTheLetter — project-access guard', () => {
  it('allows the caller who owns the project (designer_id match)', async () => {
    const adminClient = makeAdminClient({
      projects: chainable({
        data: { id: 'proj-1', designer_id: callerUser.id, studio_id: null },
        error: null,
      }),
      ...downstreamTables(),
    });

    const res = await sendTheLetter({ ...baseArgs, adminClient, projectId: 'proj-1' });

    expect(res.status).toBe(200);
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it('allows an active, non-guest member of the project studio', async () => {
    const organizationMembers = chainable({ data: { user_id: callerUser.id }, error: null });
    const organizations = chainable({ data: { status: 'active' }, error: null });
    const adminClient = makeAdminClient({
      projects: chainable({
        data: { id: 'proj-1', designer_id: 'some-other-designer', studio_id: 'studio-1' },
        error: null,
      }),
      organization_members: organizationMembers,
      organizations,
      ...downstreamTables(),
    });

    const res = await sendTheLetter({ ...baseArgs, adminClient, projectId: 'proj-1' });

    expect(res.status).toBe(200);
    expect(organizationMembers.eq).toHaveBeenCalledWith('status', 'active');
    expect(organizationMembers.neq).toHaveBeenCalledWith('role', 'guest');
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it('refuses a caller unrelated to another studio\'s project — 400, not 404 or 403', async () => {
    const adminClient = makeAdminClient({
      projects: chainable({
        data: { id: 'proj-1', designer_id: 'some-other-designer', studio_id: 'studio-1' },
        error: null,
      }),
      organization_members: chainable({ data: null, error: null }),
    });

    const res = await sendTheLetter({ ...baseArgs, adminClient, projectId: 'proj-1' });

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('Project not found');
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('a suspended studio confers no access, even to an otherwise-active member', async () => {
    const adminClient = makeAdminClient({
      projects: chainable({
        data: { id: 'proj-1', designer_id: 'some-other-designer', studio_id: 'studio-1' },
        error: null,
      }),
      organization_members: chainable({ data: { user_id: callerUser.id }, error: null }),
      organizations: chainable({ data: { status: 'suspended' }, error: null }),
    });

    const res = await sendTheLetter({ ...baseArgs, adminClient, projectId: 'proj-1' });

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('Project not found');
  });

  it('500s when the project lookup errors, rather than treating it as "not found"', async () => {
    const adminClient = makeAdminClient({
      projects: chainable({ data: null, error: { message: 'connection reset' } }),
    });

    const res = await sendTheLetter({ ...baseArgs, adminClient, projectId: 'proj-1' });

    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toContain('connection reset');
  });

  it('skips the guard entirely when the send carries no project', async () => {
    const adminClient = makeAdminClient(downstreamTables());

    const res = await sendTheLetter({ ...baseArgs, adminClient, projectId: null });

    expect(res.status).toBe(200);
  });
});

/**
 * Add Person sends an email-only body (no designerClientId), so an email
 * already on the roster used to fall into the insert and hit
 * idx_designer_clients_unique_email — a 500, and no letter.
 */
describe('sendTheLetter — a known roster email is reused, never re-inserted', () => {
  it('reuses the existing designer_clients row and sends with its id', async () => {
    const designerClients = chainable({ data: { id: 'dc-existing' }, error: null });
    const adminClient = makeAdminClient({
      profiles: chainable({ data: null, error: null }),
      designer_clients: designerClients,
      client_activity_log: chainable({ data: null, error: null }),
    });

    const res = await sendTheLetter({ ...baseArgs, adminClient, projectId: null });

    expect(res.status).toBe(200);
    expect(designerClients.insert).not.toHaveBeenCalled();
    expect(await res.json()).toEqual(
      expect.objectContaining({ designerClientId: 'dc-existing' }),
    );
    const [, init] = (global.fetch as jest.Mock).mock.calls[0];
    expect(JSON.parse(init.body).designerClientId).toBe('dc-existing');
  });

  it('still inserts when the email is new to this designer', async () => {
    const designerClients = chainable(
      { data: { id: 'dc-new' }, error: null },
      { data: null, error: null },
    );
    const adminClient = makeAdminClient({
      profiles: chainable({ data: null, error: null }),
      designer_clients: designerClients,
      client_activity_log: chainable({ data: null, error: null }),
    });

    const res = await sendTheLetter({ ...baseArgs, adminClient, projectId: null });

    expect(res.status).toBe(200);
    expect(designerClients.insert).toHaveBeenCalledTimes(1);
    expect(await res.json()).toEqual(
      expect.objectContaining({ designerClientId: 'dc-new' }),
    );
  });

  it('surfaces a failed roster read rather than inserting over it', async () => {
    const designerClients = chainable(
      { data: null, error: null },
      { data: null, error: { message: 'read blew up' } },
    );
    const adminClient = makeAdminClient({
      profiles: chainable({ data: null, error: null }),
      designer_clients: designerClients,
      client_activity_log: chainable({ data: null, error: null }),
    });

    const res = await sendTheLetter({ ...baseArgs, adminClient, projectId: null });

    expect(res.status).toBe(500);
    expect(designerClients.insert).not.toHaveBeenCalled();
  });

  it('an explicit designerClientId still wins — no roster lookup at all', async () => {
    const designerClients = chainable({ data: { id: 'dc-other' }, error: null });
    const adminClient = makeAdminClient({
      profiles: chainable({ data: null, error: null }),
      designer_clients: designerClients,
      client_activity_log: chainable({ data: null, error: null }),
    });

    const res = await sendTheLetter({
      ...baseArgs,
      adminClient,
      projectId: null,
      existingRow: { id: 'dc-r73' },
    });

    expect(res.status).toBe(200);
    expect(designerClients.insert).not.toHaveBeenCalled();
    const [, init] = (global.fetch as jest.Mock).mock.calls[0];
    expect(JSON.parse(init.body).designerClientId).toBe('dc-r73');
  });
});
