import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useCompletedProjectsWithoutReview } from '../use-reviews';

vi.mock('../../client', () => ({ createBrowserClient: () => ({ from }) }));
vi.mock('@tanstack/react-query', () => ({
  useQuery: (options: unknown) => options,
  useMutation: (options: unknown) => options,
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}));

let projects: Array<{ id: string; designer_id: string; client_id: string | null }>;
let chunks: string[][];
let reviewed: Array<{ project_id: string }>;
let readClients: (ids: string[]) => Promise<{ data: unknown[] | null; error: unknown }>;
const designerFilters: string[][] = [];
interface Query {
  select: (...args: unknown[]) => Query;
  order: (...args: unknown[]) => Query;
  eq: (...args: unknown[]) => Query;
  in: (column: string, values: string[]) => Query;
  then: (resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) => Promise<unknown>;
}
const from = (table: string) => {
  let ids: string[] = [];
  const query: Query = {
    select: vi.fn(() => query),
    order: vi.fn(() => query),
    eq: vi.fn(() => query),
    in: vi.fn((column: string, values: string[]) => {
      if (column === 'client_id') ids = values;
      if (column === 'designer_id') designerFilters.push(values);
      return query;
    }),
    then: (resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) => {
      if (table === 'projects') return Promise.resolve({ data: projects, error: null }).then(resolve, reject);
      if (table === 'client_reviews') return Promise.resolve({ data: reviewed, error: null }).then(resolve, reject);
      chunks.push(ids);
      return readClients(ids).then(resolve, reject);
    },
  };
  return query;
};
const run = () => (useCompletedProjectsWithoutReview() as unknown as {
  queryFn: () => Promise<Array<{ id: string; designer_clients: Array<{ id: string }> }>>;
}).queryFn();

beforeEach(() => {
  projects = Array.from({ length: 250 }, (_, i) => ({ id: `project-${i}`, designer_id: 'designer', client_id: `client-${i}` }));
  chunks = [];
  reviewed = [];
  designerFilters.length = 0;
  readClients = async (ids) => ({ data: ids.map((client_id) => ({ id: `dc-${client_id}`, designer_id: 'designer', client_id })), error: null });
});

describe('useCompletedProjectsWithoutReview bounded client lookup', () => {
  it('reads 250 client IDs in three chunks and merges the matching relationships', async () => {
    const result = await run();
    expect(chunks.map((chunk) => chunk.length)).toEqual([100, 100, 50]);
    expect(chunks.flat()).toEqual(projects.map((project) => project.client_id));
    expect(result.map((project) => project.designer_clients[0].id)).toEqual(projects.map((project) => `dc-${project.client_id}`));
    expect(designerFilters).toEqual([['designer'], ['designer'], ['designer']]);
    expect(useCompletedProjectsWithoutReview()).toMatchObject({ queryKey: ['completed-projects-without-review'] });
  });

  it('preserves project order, reviewed exclusion and the exact designer/client inner match', async () => {
    reviewed = [{ project_id: 'project-100' }];
    readClients = async (ids) => ({ data: ids.flatMap((client_id) => client_id === 'client-200' ? [] : [
      { id: `dc-${client_id}`, designer_id: 'designer', client_id },
      { id: 'wrong-designer', designer_id: 'other', client_id },
    ]), error: null });
    const result = await run();
    expect(result.map((project) => project.id)).toEqual(projects.filter((project) => !['project-100', 'project-200'].includes(project.id)).map((project) => project.id));
    expect(result.every((project) => project.designer_clients[0].id !== 'wrong-designer')).toBe(true);
  });

  it('propagates an error from the final client chunk', async () => {
    const error = { message: 'client read refused' };
    readClients = async (ids) => ({ data: [], error: ids.includes('client-200') ? error : null });
    await expect(run()).rejects.toBe(error);
  });

  it('skips the client lookup for empty projects or projects without client IDs', async () => {
    projects = [];
    expect(await run()).toEqual([]);
    projects = [{ id: 'orphan', designer_id: 'designer', client_id: null }];
    expect(await run()).toEqual([]);
    expect(chunks).toEqual([]);
  });
});
