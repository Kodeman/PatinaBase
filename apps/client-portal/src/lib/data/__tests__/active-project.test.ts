/**
 * @jest-environment node
 */

import { createServerClient } from '@patina/supabase/server';

import { env } from '@/lib/env';

import { resolveActiveHouse } from '../active-project';

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
