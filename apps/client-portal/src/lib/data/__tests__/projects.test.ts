/**
 * @jest-environment node
 */

import { createServerClient } from '@patina/supabase/server';

import { fetchClientProjects, fetchClientProjectView } from '../projects';

jest.mock('server-only', () => ({}), { virtual: true });

jest.mock('react', () => {
  const actual = jest.requireActual('react');
  return { ...actual, cache: (fn: unknown) => fn };
});

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

function projectClient(result: { data: unknown; error: unknown }) {
  const builder: Record<string, jest.Mock> = {};
  builder.eq = jest.fn(() => builder);
  builder.order = jest.fn().mockResolvedValue(result);
  builder.maybeSingle = jest.fn().mockResolvedValue(result);

  return {
    auth: {
      getUser: jest.fn().mockResolvedValue({
        data: { user: { id: 'client-1' } },
      }),
    },
    from: jest.fn(() => ({
      select: jest.fn(() => builder),
    })),
  };
}

describe('client project reads', () => {
  beforeEach(() => {
    delete process.env.PATINA_TEST_PROJECT_FIXTURES;
  });

  it('rethrows a project-list query error instead of substituting sample projects', async () => {
    const queryError = new Error('projects unavailable');
    mockCreateServerClient.mockResolvedValue(
      projectClient({ data: null, error: queryError }),
    );

    await expect(fetchClientProjects()).rejects.toBe(queryError);
  });

  it('returns null for a successful missing project read', async () => {
    mockCreateServerClient.mockResolvedValue(
      projectClient({ data: null, error: null }),
    );

    await expect(fetchClientProjectView('missing-project')).resolves.toBeNull();
  });

  it('rethrows a project-detail query error instead of treating it as not found', async () => {
    const queryError = new Error('project unavailable');
    mockCreateServerClient.mockResolvedValue(
      projectClient({ data: null, error: queryError }),
    );

    await expect(fetchClientProjectView('project-1')).rejects.toBe(queryError);
  });

  it('uses sample projects only when the explicit fixture mode is enabled', async () => {
    process.env.PATINA_TEST_PROJECT_FIXTURES = 'true';

    await expect(fetchClientProjects()).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'project-lakefront-condo' }),
      ]),
    );
    expect(mockCreateServerClient).not.toHaveBeenCalled();
  });
});
