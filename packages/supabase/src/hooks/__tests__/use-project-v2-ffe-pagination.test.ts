import { beforeEach, describe, expect, it, vi } from 'vitest';

const { from, requests, rows, failure } = vi.hoisted(() => ({
  from: vi.fn(), requests: [] as Array<{ range: number[]; orders: string[]; filters: unknown[][] }>,
  rows: Array.from({ length: 2500 }, (_, i) => ({ id: `line-${i}` })),
  failure: { at: -1 },
}));
vi.mock('../../client', () => ({ createBrowserClient: () => ({ from }) }));
vi.mock('@tanstack/react-query', () => ({
  useQuery: (options: unknown) => options, useMutation: (options: unknown) => options,
  useQueryClient: () => ({}),
}));
import { useProjectFFEItems } from '../use-project-v2';
import { useRemovedProjectLines } from '../use-pieces';
import { useFfePairLines } from '../use-buying-phase2';
const config = () => useProjectFFEItems('project', { roomId: 'room', status: 'draft', itemType: 'furniture', purchaseOrderId: 'po' }) as unknown as {
  queryFn: () => Promise<typeof rows>; queryKey: unknown[];
};
beforeEach(() => {
  requests.length = 0; failure.at = -1;
  from.mockImplementation(() => {
    let range = [0, 999];
    const orders: string[] = [], filters: unknown[][] = [];
    const builder = {
      select: () => builder,
      eq: (...args: unknown[]) => { filters.push(args); return builder; },
      is: (...args: unknown[]) => { filters.push(args); return builder; },
      not: (...args: unknown[]) => { filters.push(args); return builder; },
      order: (column: string) => { orders.push(column); return builder; },
      range: (start: number, end: number) => { range = [start, end]; return builder; },
      then: (resolve: (value: unknown) => unknown) => {
        requests.push({ range: [...range], orders: [...orders], filters: [...filters] });
        return Promise.resolve({ data: rows.slice(range[0], range[1] + 1), error: range[0] === failure.at ? new Error('page refused') : null }).then(resolve);
      },
    };
    return builder;
  });
});
describe('FF&E full-list pagination', () => {
  it('returns 2500 rows across three stable pages without duplicates or gaps', async () => {
    const query = config();
    const result = await query.queryFn();
    expect(result).toEqual(rows);
    expect(new Set(result.map(row => row.id)).size).toBe(2500);
    expect(requests.map(request => request.range)).toEqual([[0, 999], [1000, 1999], [2000, 2999]]);
    for (const request of requests) {
      expect(request.orders).toEqual(['sort_order', 'created_at', 'id']);
      expect(request.filters).toEqual([['project_id', 'project'], ['removed_at', null], ['project_room_id', 'room'], ['status', 'draft'], ['item_type', 'furniture'], ['purchase_order_id', 'po']]);
    }
    expect(query.queryKey).toEqual(['project-ffe-items', 'project', { roomId: 'room', status: 'draft', itemType: 'furniture', purchaseOrderId: 'po' }]);
  });
  it.each([
    ['removed', () => useRemovedProjectLines('project'), ['removed_at', 'id'], [['project_id', 'project'], ['removed_at', 'is', null]], ['project-ffe-removed', 'project']],
    ['pair', () => useFfePairLines('project'), ['sort_order', 'created_at', 'id'], [['project_id', 'project'], ['removed_at', null]], ['project-ffe-items', 'project', 'pair-lines']],
  ] as const)('returns all 2500 %s lines with stable paging and rejects partial failures', async (_name, hook, orders, filters, key) => {
    const query = hook() as unknown as { queryFn: () => Promise<typeof rows>; queryKey: unknown[] };
    expect(await query.queryFn()).toEqual(rows);
    expect(requests.map(request => request.range)).toEqual([[0, 999], [1000, 1999], [2000, 2999]]);
    expect(query.queryKey).toEqual(key);
    for (const request of requests) {
      expect(request.orders).toEqual(orders);
      expect(request.filters).toEqual(filters);
    }
    failure.at = 1000;
    await expect(query.queryFn()).rejects.toThrow('page refused');
  });
  it('rejects a later page failure instead of publishing a partial list', async () => {
    failure.at = 1000;
    await expect(config().queryFn()).rejects.toThrow('page refused');
  });
});
