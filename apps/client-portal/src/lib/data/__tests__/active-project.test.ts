/**
 * @jest-environment node
 */

import { createServerClient } from '@patina/supabase/server';

import { resolveActiveHouse } from '../active-project';

jest.mock('server-only', () => ({}), { virtual: true });

jest.mock('@/lib/env', () => ({
  env: {
    get useProjectFixtures() {
      return process.env.PATINA_TEST_PROJECT_FIXTURES === 'true';
    },
  },
}));

jest.mock('@patina/supabase/server', () => ({
  createServerClient: jest.fn(),
}));

const mockCreateServerClient = createServerClient as jest.Mock;

type TableAnswer = { data: unknown; error?: unknown };

function houseClient(
  tables: Record<string, TableAnswer>,
  options: { user?: { id: string } | null } = {},
) {
  const from = jest.fn((table: string) => ({
    select: jest.fn(() => ({
      in: jest.fn().mockResolvedValue(tables[table] ?? { data: [], error: null }),
    })),
  }));

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
  delete process.env.PATINA_TEST_PROJECT_FIXTURES;
});

describe('resolveActiveHouse — no house named', () => {
  it('reports a signed-out visitor rather than an empty house', async () => {
    mockCreateServerClient.mockResolvedValue(houseClient({}, { user: null }));

    await expect(resolveActiveHouse([])).resolves.toEqual({ status: 'signed-out' });
  });

  it('reports a signed-in client who simply has no project yet', async () => {
    mockCreateServerClient.mockResolvedValue(houseClient({}));

    await expect(resolveActiveHouse([])).resolves.toEqual({
      status: 'ok',
      activeProjectId: null,
    });
  });

  it('treats an auth read that throws as signed out', async () => {
    mockCreateServerClient.mockRejectedValue(new Error('auth unavailable'));

    await expect(resolveActiveHouse([])).resolves.toEqual({ status: 'signed-out' });
  });

  it('treats fixtures mode as signed in', async () => {
    process.env.PATINA_TEST_PROJECT_FIXTURES = 'true';

    await expect(resolveActiveHouse([])).resolves.toEqual({
      status: 'ok',
      activeProjectId: null,
    });
    expect(mockCreateServerClient).not.toHaveBeenCalled();
  });
});

describe('resolveActiveHouse — one house', () => {
  it('opens it without asking the database anything', async () => {
    await expect(resolveActiveHouse(['p1'])).resolves.toEqual({
      status: 'ok',
      activeProjectId: 'p1',
    });
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

    await expect(resolveActiveHouse(['p1', 'p2'])).resolves.toEqual({
      status: 'ok',
      activeProjectId: 'p2',
    });
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

    await expect(resolveActiveHouse(['p1', 'p2'])).resolves.toEqual({
      status: 'ok',
      activeProjectId: 'p2',
    });
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

    await expect(resolveActiveHouse(['p1', 'p2'])).resolves.toEqual({
      status: 'ok',
      activeProjectId: 'p1',
    });
  });

  it('stands on the freshest known house when a read errors, never on an error', async () => {
    mockCreateServerClient.mockResolvedValue(
      houseClient({
        projects: { data: null, error: new Error('projects unavailable') },
        project_notes: { data: [], error: null },
        invoices: { data: [], error: null },
      }),
    );

    await expect(resolveActiveHouse(['p1', 'p2'])).resolves.toEqual({
      status: 'ok',
      activeProjectId: 'p1',
    });
  });

  it('stands on the freshest known house when the client itself throws', async () => {
    mockCreateServerClient.mockRejectedValue(new Error('no connection'));

    await expect(resolveActiveHouse(['p1', 'p2'])).resolves.toEqual({
      status: 'ok',
      activeProjectId: 'p1',
    });
  });

  it('reads nothing in fixtures mode and stands on the first house', async () => {
    process.env.PATINA_TEST_PROJECT_FIXTURES = 'true';

    await expect(resolveActiveHouse(['p1', 'p2'])).resolves.toEqual({
      status: 'ok',
      activeProjectId: 'p1',
    });
    expect(mockCreateServerClient).not.toHaveBeenCalled();
  });
});
