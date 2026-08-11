/**
 * @jest-environment node
 */

import { createServerClient } from '@patina/supabase/server';

import {
  fetchClientProjects,
  fetchClientProjectView,
  summariseProjectPhases,
} from '../projects';

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

  it('counts Stage-2 drafts with pending legacy decisions as client attention work', async () => {
    const decisionOr = jest.fn();
    const supabase = {
      auth: {
        getUser: jest.fn().mockResolvedValue({
          data: { user: { id: 'client-1' } },
        }),
      },
      rpc: jest.fn().mockResolvedValue({ data: [], error: null }),
      from: jest.fn((table: string) => {
        if (table === 'projects') {
          const builder = {
            select: jest.fn(),
            eq: jest.fn(),
            order: jest.fn().mockResolvedValue({
              data: [
                {
                  id: 'project-1',
                  name: 'Lake House',
                  status: 'active',
                  project_phases: [],
                },
              ],
              error: null,
            }),
          };
          builder.select.mockReturnValue(builder);
          builder.eq.mockReturnValue(builder);
          return builder;
        }
        if (table === 'client_decisions') {
          const builder = {
            select: jest.fn(),
            or: decisionOr,
            eq: jest.fn().mockResolvedValue({
              data: [
                { project_id: 'project-1' },
                { project_id: 'project-1' },
              ],
              error: null,
            }),
          };
          builder.select.mockReturnValue(builder);
          decisionOr.mockReturnValue(builder);
          return builder;
        }
        if (table === 'comms_thread_participants') {
          const builder = {
            select: jest.fn(),
            eq: jest.fn().mockResolvedValue({ data: [], error: null }),
          };
          builder.select.mockReturnValue(builder);
          return builder;
        }
        throw new Error(`Unexpected table: ${table}`);
      }),
    };
    mockCreateServerClient.mockResolvedValue(supabase);

    await expect(fetchClientProjects()).resolves.toEqual([
      expect.objectContaining({ id: 'project-1', approvalsPending: 2 }),
    ]);
    expect(decisionOr).toHaveBeenCalledWith(
      'status.eq.pending,and(status.eq.draft,approval_contract.eq.project_artifact_v1)',
    );
  });
});

describe('client project phase projection', () => {
  it('keeps a live concurrent thread out of the canonical current phase and main rollups', () => {
    const summary = summariseProjectPhases(
      [
        {
          id: 'main-complete',
          name: 'Discovery',
          phase_key: 'discovery',
          lane: 'main',
          status: 'completed',
          progress: 100,
          sort_order: 0,
          follows_phase_id: null,
        },
        {
          id: 'thread-live',
          name: 'Procurement thread',
          phase_key: 'procurement',
          lane: 'thread',
          status: 'in_progress',
          progress: 100,
          sort_order: 1,
          follows_phase_id: 'main-complete',
        },
        {
          id: 'main-current',
          name: 'Design development',
          phase_key: 'design_development',
          lane: 'main',
          status: 'in_progress',
          progress: 20,
          sort_order: 2,
          follows_phase_id: 'main-complete',
        },
        {
          id: 'main-next',
          name: 'Installation',
          phase_key: 'installation',
          lane: 'main',
          status: 'pending',
          progress: 0,
          sort_order: 3,
          follows_phase_id: 'main-current',
        },
      ],
      'design_development',
    );

    expect(summary.currentPhase?.id).toBe('main-current');
    expect(summary.currentPhaseLabel).toBe('Design development');
    expect(summary.progressPercentage).toBe(40);
    expect(summary.completed).toBe(1);
    expect(summary.mainPhases).toHaveLength(3);
    expect(summary.phases).toHaveLength(4);
  });

  it('chooses next from the canonical current phase edge, not sort order', () => {
    const summary = summariseProjectPhases(
      [
        {
          id: 'main-current',
          name: 'Design development',
          phase_key: 'design_development',
          lane: 'main',
          status: 'in_progress',
          sort_order: 20,
          follows_phase_id: 'main-complete',
        },
        {
          id: 'thread-first',
          name: 'Early procurement',
          phase_key: 'procurement',
          lane: 'thread',
          status: 'pending',
          sort_order: 21,
          follows_phase_id: 'main-current',
        },
        {
          id: 'main-next',
          name: 'Installation',
          phase_key: 'installation',
          lane: 'main',
          status: 'pending',
          sort_order: 99,
          follows_phase_id: 'main-current',
        },
        {
          id: 'main-complete',
          name: 'Discovery',
          phase_key: 'discovery',
          lane: 'main',
          status: 'completed',
          sort_order: 0,
          follows_phase_id: null,
        },
      ],
      'design_development',
    );

    expect(summary.nextPhase?.id).toBe('main-next');
  });
});
