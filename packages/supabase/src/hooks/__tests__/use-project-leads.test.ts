import { beforeEach, describe, expect, it, vi } from 'vitest';

// Each table answers with its own rows; `.maybeSingle()` takes the first.
let tables: Record<string, unknown[]> = {};

const teamReads: Array<{ ids: string[]; order: unknown[] }> = [];
let failedProject: string | null = null;
const teamError = { message: 'team read refused' };

function builder(table = '') {
  let ids: string[] = [];
  let order: unknown[] = [];
  const chain: Record<string, unknown> = {};
  for (const method of ['select', 'eq', 'is']) chain[method] = vi.fn(() => chain);
  chain.in = vi.fn((column: string, values: string[]) => {
    if (column === 'project_id') ids = values;
    return chain;
  });
  chain.order = vi.fn((...args: unknown[]) => { order = args; return chain; });
  chain.from = vi.fn((name: string) => builder(name));
  chain.maybeSingle = () => Promise.resolve({ data: tables[table]?.[0] ?? null, error: null });
  chain.then = (resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) => {
    let data = tables[table] ?? [];
    if (table === 'project_team_members' && ids.length) {
      teamReads.push({ ids, order });
      data = data.filter((row) => ids.includes((row as { project_id: string }).project_id));
      data.sort((a, b) => (b as { assigned_at: string }).assigned_at.localeCompare((a as { assigned_at: string }).assigned_at));
    }
    return Promise.resolve({ data, error: failedProject && ids.includes(failedProject) ? teamError : null }).then(resolve, reject);
  };
  return chain;
}

vi.mock('../../client', () => ({ createBrowserClient: () => builder() }));
vi.mock('@tanstack/react-query', () => ({ useQuery: (config: unknown) => config }));

import { useProjectLead, useProjectLeads, type ProjectLead, type ProjectLeadRead } from '../use-project-leads';

type QueryConfig<T> = { queryFn: () => Promise<T> };

const HOLLOWAY = {
  id: 'holloway',
  studio_id: 'studio-1',
  lead_designer_id: 'leah',
  designer_id: 'jordan',
  created_at: '2026-09-01T00:00:00Z',
};

beforeEach(() => {
  teamReads.length = 0;
  failedProject = null;
  tables = {
    projects: [HOLLOWAY],
    project_team_members: [],
    profiles: [{ id: 'leah', full_name: 'Leah Moreau' }],
  };
});

describe('bounded studio project leads', () => {
  const seed = () => {
    tables.projects = Array.from({ length: 250 }, (_, i) => ({ ...HOLLOWAY, id: `project-${i}` }));
    tables.project_team_members = tables.projects.flatMap((project) => {
      const project_id = (project as { id: string }).id;
      return ['2026-10-01T00:00:00Z', '2026-10-20T00:00:00Z'].map((assigned_at) => ({
        project_id, user_id: assigned_at, role: 'lead_designer', assigned_at, updated_at: assigned_at,
        removed_at: null, user: { full_name: assigned_at },
      }));
    });
  };

  it('bounds 250 projects to three reads while keeping each project newest lead first', async () => {
    seed();
    const map = await (useProjectLeads('studio-1') as unknown as QueryConfig<Map<string, ProjectLead>>).queryFn();
    expect(teamReads.map(({ ids }) => ids.length)).toEqual([100, 100, 50]);
    expect(teamReads.flatMap(({ ids }) => ids)).toEqual((tables.projects as Array<{ id: string }>).map(({ id }) => id));
    expect(teamReads.every(({ order }) => JSON.stringify(order) === JSON.stringify(['assigned_at', { ascending: false }]))).toBe(true);
    expect(map.size).toBe(250);
    expect([...map.values()].every((lead) => lead.leadUserId === '2026-10-20T00:00:00Z')).toBe(true);
  });

  it('propagates the final team chunk error without a partial studio map', async () => {
    seed();
    failedProject = 'project-200';
    await expect((useProjectLeads('studio-1') as unknown as QueryConfig<Map<string, ProjectLead>>).queryFn()).rejects.toBe(teamError);
  });
});

describe('the project lead with no team lead row (SQ-778 N3)', () => {
  it('reads the lead off projects.lead_designer_id and names her', async () => {
    const read = await (useProjectLead('holloway') as unknown as QueryConfig<ProjectLeadRead>).queryFn();
    expect(read.studioId).toBe('studio-1');
    expect(read.lead).toEqual({
      leadUserId: 'leah',
      leadName: 'Leah Moreau',
      assignedAt: '2026-09-01T00:00:00Z',
      fromProject: true,
    });
  });

  it('falls back to the designer when the project names no lead', async () => {
    tables.projects = [{ ...HOLLOWAY, lead_designer_id: null }];
    tables.profiles = [{ id: 'jordan', full_name: 'Jordan Pike' }];
    const read = await (useProjectLead('holloway') as unknown as QueryConfig<ProjectLeadRead>).queryFn();
    expect(read.lead).toMatchObject({ leadUserId: 'jordan', leadName: 'Jordan Pike', fromProject: true });
  });

  it('a team lead row wins over the project column, with no fallback mark', async () => {
    tables.project_team_members = [{
      project_id: 'holloway',
      user_id: 'ana',
      role: 'lead_designer',
      assigned_at: '2026-10-01T00:00:00Z',
      updated_at: '2026-10-01T00:00:00Z',
      removed_at: null,
      user: { full_name: 'Ana Ruiz' },
    }];
    const read = await (useProjectLead('holloway') as unknown as QueryConfig<ProjectLeadRead>).queryFn();
    expect(read.lead?.leadUserId).toBe('ana');
    expect(read.lead?.fromProject).toBeUndefined();
  });

  it('the studio map names the same lead as the single-project read', async () => {
    const map = await (useProjectLeads('studio-1') as unknown as QueryConfig<Map<string, ProjectLead>>).queryFn();
    expect(map.get('holloway')).toMatchObject({ leadUserId: 'leah', leadName: 'Leah Moreau', fromProject: true });
  });
});
