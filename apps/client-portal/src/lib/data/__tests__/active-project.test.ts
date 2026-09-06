/**
 * @jest-environment node
 */

import { createServerClient } from '@patina/supabase/server';

import { env } from '@/lib/env';

import { resolveActiveHouse, resolveHouseForInstrument } from '../active-project';

jest.mock('server-only', () => ({}), { virtual: true });

// `env.useProjectFixtures` is the real module's only relevant export here, and
// it is a plain boolean (`isDevelopment && NEXT_PUBLIC_CLIENT_PORTAL_DATA_MODE
// === 'fixtures'`) — mocked as a boolean the tests set, never as a predicate
// the product does not have.
jest.mock('@/lib/env', () => ({ env: { useProjectFixtures: false } }));

const mockEnv = env as { useProjectFixtures: boolean };

jest.mock('@patina/supabase/server', () => ({
  createServerClient: jest.fn(),
}));

const mockCreateServerClient = createServerClient as jest.Mock;

type TableAnswer = { data: unknown; error?: unknown };

function houseClient(
  tables: Record<string, TableAnswer>,
  options: { user?: { id: string } | null } = {},
) {
  // Both shapes the module builds: `.select().in()` and, for `projects`,
  // `.select().eq().in()`.
  const from = jest.fn((table: string) => {
    const answer = () => Promise.resolve(tables[table] ?? { data: [], error: null });
    const inFn = jest.fn(answer);
    return {
      select: jest.fn(() => ({
        in: inFn,
        eq: jest.fn(() => ({ in: inFn })),
      })),
    };
  });

  return {
    auth: {
      getUser: jest.fn().mockResolvedValue({
        data: { user: options.user === undefined ? { id: 'client-1' } : options.user },
      }),
    },
    from,
  };
}

beforeEach(() => {
  mockEnv.useProjectFixtures = false;
});

describe('resolveActiveHouse — no house named', () => {
  it('answers "no house" without asking the auth server anything', async () => {
    // `/` is protected: middleware already proved the session, so an empty
    // list means a client with no project — never a signed-out visitor.
    await expect(resolveActiveHouse([])).resolves.toBeNull();
    expect(mockCreateServerClient).not.toHaveBeenCalled();
  });
});

describe('resolveActiveHouse — one house', () => {
  it('opens it without asking the database anything', async () => {
    await expect(resolveActiveHouse(['p1'])).resolves.toBe('p1');
    expect(mockCreateServerClient).not.toHaveBeenCalled();
  });
});

describe('resolveActiveHouse — several houses', () => {
  it('opens the house whose note is the most recent movement anywhere', async () => {
    mockCreateServerClient.mockResolvedValue(
      houseClient({
        projects: {
          data: [
            { id: 'p1', updated_at: '2026-08-20T00:00:00.000Z' },
            { id: 'p2', updated_at: '2026-06-01T00:00:00.000Z' },
          ],
          error: null,
        },
        project_notes: {
          data: [{ project_id: 'p2', sent_at: '2026-08-25T00:00:00.000Z' }],
          error: null,
        },
        invoices: { data: [], error: null },
      }),
    );

    await expect(resolveActiveHouse(['p1', 'p2'])).resolves.toBe('p2');
  });

  it('lets an invoice movement carry the house', async () => {
    mockCreateServerClient.mockResolvedValue(
      houseClient({
        projects: {
          data: [
            { id: 'p1', updated_at: '2026-08-20T00:00:00.000Z' },
            { id: 'p2', updated_at: '2026-06-01T00:00:00.000Z' },
          ],
          error: null,
        },
        project_notes: { data: [], error: null },
        invoices: {
          data: [{ project_id: 'p2', updated_at: '2026-09-02T00:00:00.000Z' }],
          error: null,
        },
      }),
    );

    await expect(resolveActiveHouse(['p1', 'p2'])).resolves.toBe('p2');
  });

  it('scopes the projects read by owner as well as by id', async () => {
    const client = houseClient({
      projects: { data: [], error: null },
      project_notes: { data: [], error: null },
      invoices: { data: [], error: null },
    });
    mockCreateServerClient.mockResolvedValue(client);

    await resolveActiveHouse(['p1', 'p2']);

    const projectsSelect = client.from.mock.results.find(
      (_result, index) => client.from.mock.calls[index][0] === 'projects',
    )!.value.select;
    expect(projectsSelect).toHaveBeenCalledWith('id, updated_at');
    expect(projectsSelect.mock.results[0].value.eq).toHaveBeenCalledWith(
      'client_id',
      'client-1',
    );
  });

  it('stands on the freshest known house when the session cannot be read', async () => {
    mockCreateServerClient.mockResolvedValue(houseClient({}, { user: null }));

    await expect(resolveActiveHouse(['p1', 'p2'])).resolves.toBe('p1');
  });

  it('ignores a row for a house the client did not ask about', async () => {
    mockCreateServerClient.mockResolvedValue(
      houseClient({
        projects: {
          data: [
            { id: 'p1', updated_at: '2026-08-20T00:00:00.000Z' },
            { id: 'p2', updated_at: '2026-06-01T00:00:00.000Z' },
          ],
          error: null,
        },
        project_notes: {
          data: [{ project_id: 'p9', sent_at: '2099-01-01T00:00:00.000Z' }],
          error: null,
        },
        invoices: { data: [], error: null },
      }),
    );

    await expect(resolveActiveHouse(['p1', 'p2'])).resolves.toBe('p1');
  });

  it('stands on the freshest known house when a read errors, never on an error', async () => {
    mockCreateServerClient.mockResolvedValue(
      houseClient({
        projects: { data: null, error: new Error('projects unavailable') },
        project_notes: { data: [], error: null },
        invoices: { data: [], error: null },
      }),
    );

    await expect(resolveActiveHouse(['p1', 'p2'])).resolves.toBe('p1');
  });

  it('stands on the freshest known house when the client itself throws', async () => {
    mockCreateServerClient.mockRejectedValue(new Error('no connection'));

    await expect(resolveActiveHouse(['p1', 'p2'])).resolves.toBe('p1');
  });

  it('reads nothing in fixtures mode and stands on the first house', async () => {
    mockEnv.useProjectFixtures = true;

    await expect(resolveActiveHouse(['p1', 'p2'])).resolves.toBe('p1');
    expect(mockCreateServerClient).not.toHaveBeenCalled();
  });
});


/* ── The house an approval belongs to ───────────────────────────────────────
   `/decisions/<id>` folds to `/` carrying `?decision=`. `/` on its own opens
   the house that moved last, so a client with two houses was sent to the wrong
   doorstep for an approval standing on the other one. A Stage-2 approval is
   outside the client read model, so its house comes from the sanitized list
   the doorstep itself is built from; a legacy option choice is an ordinary
   readable row. ─────────────────────────────────────────────────────────── */

function decisionClient(options: {
  reviews?: { data: unknown; error?: unknown };
  legacy?: { data: unknown; error?: unknown };
}) {
  const rpc = jest.fn(async () => options.reviews ?? { data: [], error: null });
  const maybeSingle = jest.fn(async () => options.legacy ?? { data: null, error: null });
  const from = jest.fn(() => {
    const chain: Record<string, unknown> = {};
    chain.select = jest.fn(() => chain);
    chain.eq = jest.fn(() => chain);
    chain.in = jest.fn(() => chain);
    chain.maybeSingle = maybeSingle;
    return chain;
  });
  return { rpc, from, maybeSingle };
}

describe('resolveHouseForInstrument — the approval names its house', () => {
  it('reads a Stage-2 approval house from the sanitized list', async () => {
    const client = decisionClient({
      reviews: {
        data: [
          { decisionId: 'dec-1', projectId: 'p1' },
          { decisionId: 'dec-9', projectId: 'p2' },
        ],
        error: null,
      },
    });
    mockCreateServerClient.mockResolvedValue(client);

    await expect(
      resolveHouseForInstrument(['p1', 'p2'], { decisionId: 'dec-9' }),
    ).resolves.toBe('p2');
    expect(client.rpc).toHaveBeenCalledWith('list_my_project_decision_reviews');
    expect(client.from).not.toHaveBeenCalled();
  });

  it('falls through to the legacy row when the sanitized list does not hold it', async () => {
    const client = decisionClient({
      reviews: { data: [], error: null },
      legacy: { data: { project_id: 'p2' }, error: null },
    });
    mockCreateServerClient.mockResolvedValue(client);

    await expect(
      resolveHouseForInstrument(['p1', 'p2'], { decisionId: 'dec-9' }),
    ).resolves.toBe('p2');
    expect(client.from).toHaveBeenCalledWith('client_decisions');
  });

  it('never names a house outside the client\'s own list', async () => {
    const client = decisionClient({
      reviews: { data: [{ decisionId: 'dec-9', projectId: 'p7' }], error: null },
    });
    mockCreateServerClient.mockResolvedValue(client);

    await expect(
      resolveHouseForInstrument(['p1', 'p2'], { decisionId: 'dec-9' }),
    ).resolves.toBeNull();
  });

  it('leaves the active house standing when nothing resolves the approval', async () => {
    const client = decisionClient({
      reviews: { data: [], error: null },
      legacy: { data: null, error: null },
    });
    mockCreateServerClient.mockResolvedValue(client);

    await expect(
      resolveHouseForInstrument(['p1', 'p2'], { decisionId: 'dec-9' }),
    ).resolves.toBeNull();
  });

  it('reads nothing at all for a client with one house', async () => {
    await expect(
      resolveHouseForInstrument(['p1'], { decisionId: 'dec-9' }),
    ).resolves.toBeNull();
    expect(mockCreateServerClient).not.toHaveBeenCalled();
  });
});

/* ── The house a letter belongs to ──────────────────────────────────────────
   A studio invoice (ruling S1) names no house at all, so `.in('project_id')`
   would never match it and `/?invoice=<id>` would fall to the last-moved
   house, whose letterbox is not holding it. It resolves to the adopted house
   instead — the lowest project id the client can open, the same rule the
   house itself applies to money with no house of its own. ───────────────── */

function invoiceClient(options: {
  invoice?: { data: unknown; error?: unknown };
  user?: { id: string } | null;
}) {
  const maybeSingle = jest.fn(async () => options.invoice ?? { data: null, error: null });
  const eq = jest.fn(() => ({ maybeSingle }));
  const select = jest.fn(() => ({ eq }));
  const from = jest.fn(() => ({ select }));
  const getUser = jest.fn(async () => ({
    data: { user: options.user === undefined ? { id: 'client-1' } : options.user },
  }));
  return { from, select, eq, maybeSingle, auth: { getUser } };
}

describe('resolveHouseForInstrument — the letter names its house', () => {
  it('stands a studio invoice in the adopted house, not the last-moved one', async () => {
    // `fetchClientProjects` orders by freshness, so p2 is the active house.
    // The letter belongs to neither, and the adopted house is the lowest id.
    const client = invoiceClient({
      invoice: { data: { project_id: null, client_id: 'client-1' }, error: null },
    });
    mockCreateServerClient.mockResolvedValue(client);

    await expect(
      resolveHouseForInstrument(['p2', 'p1'], { invoiceId: 'inv-31' }),
    ).resolves.toBe('p1');
    expect(client.select).toHaveBeenCalledWith('project_id, client_id');
  });

  it('answers for a client with ONE house, which the house-count rule would skip', async () => {
    const client = invoiceClient({
      invoice: { data: { project_id: null, client_id: 'client-1' }, error: null },
    });
    mockCreateServerClient.mockResolvedValue(client);

    await expect(
      resolveHouseForInstrument(['p1'], { invoiceId: 'inv-31' }),
    ).resolves.toBe('p1');
  });

  it('refuses a studio invoice drawn for another household', async () => {
    const client = invoiceClient({
      invoice: { data: { project_id: null, client_id: 'someone-else' }, error: null },
    });
    mockCreateServerClient.mockResolvedValue(client);

    await expect(
      resolveHouseForInstrument(['p2', 'p1'], { invoiceId: 'inv-31' }),
    ).resolves.toBeNull();
  });

  it('refuses a studio invoice when the session cannot be read', async () => {
    const client = invoiceClient({
      invoice: { data: { project_id: null, client_id: 'client-1' }, error: null },
      user: null,
    });
    mockCreateServerClient.mockResolvedValue(client);

    await expect(
      resolveHouseForInstrument(['p2', 'p1'], { invoiceId: 'inv-31' }),
    ).resolves.toBeNull();
  });

  it('still names the house a project invoice belongs to', async () => {
    mockCreateServerClient.mockResolvedValue(
      invoiceClient({
        invoice: { data: { project_id: 'p2', client_id: 'client-1' }, error: null },
      }),
    );

    await expect(
      resolveHouseForInstrument(['p1', 'p2'], { invoiceId: 'inv-9' }),
    ).resolves.toBe('p2');
  });

  it('never names a house outside the client\'s own list', async () => {
    mockCreateServerClient.mockResolvedValue(
      invoiceClient({
        invoice: { data: { project_id: 'p9', client_id: 'client-1' }, error: null },
      }),
    );

    await expect(
      resolveHouseForInstrument(['p1', 'p2'], { invoiceId: 'inv-9' }),
    ).resolves.toBeNull();
  });

  it('leaves the active house standing when the letter resolves to nothing', async () => {
    mockCreateServerClient.mockResolvedValue(invoiceClient({}));

    await expect(
      resolveHouseForInstrument(['p1', 'p2'], { invoiceId: 'inv-9' }),
    ).resolves.toBeNull();
  });

  it('reads nothing at all for a client with no house', async () => {
    await expect(
      resolveHouseForInstrument([], { invoiceId: 'inv-31' }),
    ).resolves.toBeNull();
    expect(mockCreateServerClient).not.toHaveBeenCalled();
  });
});
