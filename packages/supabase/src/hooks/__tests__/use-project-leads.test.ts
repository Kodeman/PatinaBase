import { beforeEach, describe, expect, it, vi } from 'vitest';

// Each table answers with its own rows; `.maybeSingle()` takes the first.
let tables: Record<string, unknown[]> = {};

function builder() {
  let table = '';
  const chain: Record<string, unknown> = {};
  for (const method of ['select', 'eq', 'in', 'is', 'order']) chain[method] = vi.fn(() => chain);
  chain.from = vi.fn((name: string) => {
    table = name;
    return chain;
  });
  chain.maybeSingle = () => Promise.resolve({ data: tables[table]?.[0] ?? null, error: null });
  chain.then = (resolve: (value: unknown) => unknown) =>
    Promise.resolve({ data: tables[table] ?? [], error: null }).then(resolve);
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
  tables = {
    projects: [HOLLOWAY],
    project_team_members: [],
    profiles: [{ id: 'leah', full_name: 'Leah Moreau' }],
  };
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
