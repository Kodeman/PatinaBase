import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useClients } from '../use-clients';
import { boundedIn } from '../../lib/bounded-in';

vi.mock('../../client', () => ({ createBrowserClient: () => ({ from }) }));
vi.mock('@tanstack/react-query', () => ({
  useQuery: (options: unknown) => options,
  useMutation: (options: unknown) => options,
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}));

let rows: Array<{ id: string; client_id: string | null }>;
let chunks: string[][];
let readProjects: (ids: string[]) => Promise<{ data: unknown[] | null; error: unknown }>;
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
      return query;
    }),
    then: (resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) => {
      if (table === 'designer_clients') return Promise.resolve({ data: rows, error: null }).then(resolve, reject);
      chunks.push(ids);
      return readProjects(ids).then(resolve, reject);
    },
  };
  return query;
};
const run = () => (useClients() as unknown as { queryFn: () => Promise<Array<{ last_project_name: string | null }>> }).queryFn();

beforeEach(() => {
  rows = Array.from({ length: 250 }, (_, i) => ({ id: `relationship-${i}`, client_id: `client-${i}` }));
  chunks = [];
  readProjects = async (ids) => ({ data: ids.map((client_id) => ({ client_id, name: client_id, updated_at: '2026-10-24T00:00:00Z' })), error: null });
});

describe('useClients bounded project lookup', () => {
  it('reads 250 unique client IDs in three chunks and merges every client', async () => {
    const result = await run();
    expect(chunks.map((chunk) => chunk.length)).toEqual([100, 100, 50]);
    expect(chunks.flat()).toEqual(rows.map((row) => row.client_id));
    expect(result.map((row) => row.last_project_name)).toEqual(rows.map((row) => row.client_id));
  });

  it('chooses the newest updated_at across unordered chunks and completion order', async () => {
    readProjects = async (ids) => {
      if (ids[0] === 'client-0') await new Promise((resolve) => setTimeout(resolve, 5));
      return { data: [
        { client_id: 'client-0', name: ids[0] === 'client-100' ? 'Newest' : 'Older first', updated_at: ids[0] === 'client-100' ? '2026-10-25T00:00:00Z' : '2026-10-23T00:00:00Z' },
        { client_id: 'client-0', name: 'Older last', updated_at: '2026-10-22T00:00:00Z' },
      ], error: null };
    };
    expect((await run())[0].last_project_name).toBe('Newest');
  });

  it('propagates a later chunk error instead of returning partial clients', async () => {
    const error = { message: 'project read refused' };
    readProjects = async (ids) => ({ data: [], error: ids.includes('client-200') ? error : null });
    await expect(run()).rejects.toBe(error);
  });

  it('deduplicates IDs and preserves null enrichment and query identity', async () => {
    rows = [{ id: 'a', client_id: 'same' }, { id: 'b', client_id: 'same' }, { id: 'c', client_id: null }];
    expect(useClients({ status: 'active' })).toMatchObject({ queryKey: ['designer-clients', { status: 'active' }] });
    expect((await run()).map((row) => row.last_project_name)).toEqual(['same', 'same', null]);
    expect(chunks).toEqual([['same']]);
    rows = [];
    chunks = [];
    expect(await run()).toEqual([]);
    expect(chunks).toEqual([]);
  });
});

describe('boundedIn scheduling', () => {
  it('limits concurrent reads to four and keeps merged chunk order', async () => {
    let active = 0;
    let peak = 0;
    const ids = Array.from({ length: 950 }, (_, i) => String(i));
    const result = await boundedIn(ids, async (chunk) => {
      active++;
      peak = Math.max(peak, active);
      await new Promise((resolve) => setTimeout(resolve, Number(chunk[0]) === 0 ? 10 : 1));
      active--;
      expect(chunk.length).toBeLessThanOrEqual(100);
      return { data: chunk, error: null };
    });
    expect(peak).toBe(4);
    expect(result).toEqual(ids);
  });
});
