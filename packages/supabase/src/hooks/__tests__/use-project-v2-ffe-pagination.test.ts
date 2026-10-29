import { beforeEach, describe, expect, it, vi } from 'vitest';

type Row = { id: string; sort_order: number; created_at: string };
const { from, requests, rows, failure } = vi.hoisted(() => ({
  from: vi.fn(), requests: [] as Array<{ limit: number | null; or: string | null; orders: string[]; filters: unknown[][]; ranged: boolean }>,
  // Ties on sort_order and created_at, so the id tiebreak carries the key.
  rows: Array.from({ length: 2500 }, (_, i) => ({
    id: `line-${String(i).padStart(4, '0')}`,
    sort_order: Math.floor(i / 7),
    created_at: `2026-10-28T00:00:0${Math.floor(i / 3) % 2}.123456+00:00`,
  })).sort((a, b) => a.sort_order - b.sort_order || a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id)),
  failure: { atPage: -1 },
}));
vi.mock('../../client', () => ({ createBrowserClient: () => ({ from }) }));
vi.mock('@tanstack/react-query', () => ({
  useQuery: (options: unknown) => options, useMutation: (options: unknown) => options,
  useQueryClient: () => ({}),
}));
import { useProjectFFEItems } from '../use-project-v2';
const config = () => useProjectFFEItems('project', { roomId: 'room', status: 'draft', itemType: 'furniture', purchaseOrderId: 'po' }) as unknown as {
  queryFn: () => Promise<Row[]>; queryKey: unknown[];
};
const KEY = /^sort_order\.gt\.(\d+),and\(sort_order\.eq\.\1,created_at\.gt\."([^"]+)"\),and\(sort_order\.eq\.\1,created_at\.eq\."\2",id\.gt\.([^)]+)\)$/;
const after = (or: string | null) => {
  if (!or) return rows;
  const [, order, at, id] = or.match(KEY) ?? [];
  if (!id) throw new Error(`unexpected keyset filter ${or}`);
  return rows.filter(row => row.sort_order > Number(order)
    || (row.sort_order === Number(order) && (row.created_at > at! || (row.created_at === at && row.id > id))));
};
beforeEach(() => {
  requests.length = 0; failure.atPage = -1;
  from.mockImplementation(() => {
    let limit: number | null = null, or: string | null = null, ranged = false;
    const orders: string[] = [], filters: unknown[][] = [];
    const builder = {
      select: () => builder,
      eq: (...args: unknown[]) => { filters.push(args); return builder; },
      is: (...args: unknown[]) => { filters.push(args); return builder; },
      or: (value: string) => { or = value; return builder; },
      order: (column: string) => { orders.push(column); return builder; },
      limit: (count: number) => { limit = count; return builder; },
      range: () => { ranged = true; return builder; },
      then: (resolve: (value: unknown) => unknown) => {
        const page = requests.length;
        requests.push({ limit, or, orders: [...orders], filters: [...filters], ranged });
        const data = after(or).slice(0, limit ?? undefined);
        return Promise.resolve({ data, error: page === failure.atPage ? new Error('page refused') : null }).then(resolve);
      },
    };
    return builder;
  });
});
describe('FF&E full-list keyset pagination', () => {
  it('returns 2500 rows in order across keyset pages without duplicates, gaps or OFFSET', async () => {
    const query = config();
    const result = await query.queryFn();
    expect(result).toEqual(rows);
    expect(new Set(result.map(row => row.id)).size).toBe(2500);
    expect(requests).toHaveLength(6);
    expect(requests[0]!.or).toBeNull();
    requests.slice(1).forEach((request, index) => {
      const last = rows[(index + 1) * 500 - 1]!;
      expect(request.or).toBe(`sort_order.gt.${last.sort_order},and(sort_order.eq.${last.sort_order},created_at.gt."${last.created_at}"),`
        + `and(sort_order.eq.${last.sort_order},created_at.eq."${last.created_at}",id.gt.${last.id})`);
    });
    for (const request of requests) {
      expect(request.ranged).toBe(false);
      expect(request.limit).toBe(500);
      expect(request.orders).toEqual(['sort_order', 'created_at', 'id']);
      expect(request.filters).toEqual([['project_id', 'project'], ['removed_at', null], ['project_room_id', 'room'], ['status', 'draft'], ['item_type', 'furniture'], ['purchase_order_id', 'po']]);
    }
    expect(query.queryKey).toEqual(['project-ffe-items', 'project', { roomId: 'room', status: 'draft', itemType: 'furniture', purchaseOrderId: 'po' }]);
  });
  it('rejects a later page failure instead of publishing a partial list', async () => {
    failure.atPage = 2;
    await expect(config().queryFn()).rejects.toThrow('page refused');
  });
});
