import { beforeEach, describe, expect, it, vi } from 'vitest';

type Row = { id: string; sort_order: number; created_at: string; removed_at: string };
type Order = [string, { ascending: boolean }];
type Request = { range: number[] | null; limit: number | null; or: string | null; orders: Order[]; filters: unknown[][]; offset: number };

const { from, requests, base, failure } = vi.hoisted(() => {
  // Canonical UUIDs whose order differs from generation order; sort_order and
  // created_at tie often, so the id tiebreak carries the cursor.
  const base = Array.from({ length: 2501 }, (_, i) => {
    const scrambled = (Math.imul(i + 1, 2654435761) >>> 0).toString(16).padStart(8, '0');
    return {
      id: `${scrambled}-0000-4000-8000-${String(i).padStart(12, '0')}`,
      sort_order: (scrambled.charCodeAt(0) * 31 + i) % 357,
      created_at: `2026-10-28T00:00:00.${i % 2 ? '123456' : '000007'}+00:00`,
      removed_at: `2026-10-27T00:00:00.${String(i % 997).padStart(6, '0')}+00:00`,
    };
  });
  return { from: vi.fn(), requests: [] as Request[], base, failure: { at: -1, size: 2500 } };
});
vi.mock('../../client', () => ({ createBrowserClient: () => ({ from }) }));
vi.mock('@tanstack/react-query', () => ({
  useQuery: (options: unknown) => options, useMutation: (options: unknown) => options,
  useQueryClient: () => ({}),
}));
import { useProjectFFEItems } from '../use-project-v2';
import { useRemovedProjectLines } from '../use-pieces';
import { useFfePairLines } from '../use-buying-phase2';

const ASC: Order[] = [['sort_order', { ascending: true }], ['created_at', { ascending: true }], ['id', { ascending: true }]];
const compare = (orders: Order[]) => (a: Row, b: Row) => {
  for (const [column, { ascending }] of orders) {
    const x = a[column as keyof Row], y = b[column as keyof Row];
    if (x !== y) return (x < y ? -1 : 1) * (ascending ? 1 : -1);
  }
  return 0;
};
const expected = (orders: Order[], size = failure.size) => [...base.slice(0, size)].sort(compare(orders));
const KEY = /^sort_order\.gt\.(\d+),and\(sort_order\.eq\.\1,created_at\.gt\."([^"]+)"\),and\(sort_order\.eq\.\1,created_at\.eq\."\2",id\.gt\.([^)]+)\)$/;
const afterCursor = (row: Row, or: string) => {
  const [, order, at, id] = or.match(KEY) ?? [];
  if (!id) throw new Error(`unexpected keyset filter ${or}`);
  return row.sort_order > Number(order)
    || (row.sort_order === Number(order) && (row.created_at > at! || (row.created_at === at && row.id > id)));
};
const config = () => useProjectFFEItems('project', { roomId: 'room', status: 'draft', itemType: 'furniture', purchaseOrderId: 'po' }) as unknown as {
  queryFn: () => Promise<Row[]>; queryKey: unknown[];
};
const cursor = (row: Row) => `sort_order.gt.${row.sort_order},and(sort_order.eq.${row.sort_order},created_at.gt."${row.created_at}"),`
  + `and(sort_order.eq.${row.sort_order},created_at.eq."${row.created_at}",id.gt.${row.id})`;

beforeEach(() => {
  requests.length = 0; failure.at = -1; failure.size = 2500;
  from.mockImplementation(() => {
    let range: number[] | null = null, limit: number | null = null, or: string | null = null;
    const orders: Order[] = [], filters: unknown[][] = [];
    const builder = {
      select: () => builder,
      eq: (...args: unknown[]) => { filters.push(args); return builder; },
      is: (...args: unknown[]) => { filters.push(args); return builder; },
      not: (...args: unknown[]) => { filters.push(args); return builder; },
      or: (value: string) => { or = value; return builder; },
      order: (column: string, options: { ascending: boolean }) => { orders.push([column, options]); return builder; },
      limit: (count: number) => { limit = count; return builder; },
      range: (start: number, end: number) => { range = [start, end]; return builder; },
      then: (resolve: (value: unknown) => unknown) => {
        const sorted = expected(orders);
        const remaining = or ? sorted.filter(row => afterCursor(row, or!)) : sorted;
        const offset = range ? range[0]! : sorted.length - remaining.length;
        const data = range ? sorted.slice(range[0], range[1]! + 1) : remaining.slice(0, limit ?? undefined);
        requests.push({ range: range && [...range], limit, or, orders: [...orders], filters: [...filters], offset });
        return Promise.resolve({ data, error: offset === failure.at ? new Error('page refused') : null }).then(resolve);
      },
    };
    return builder;
  });
});

describe('FF&E full-list keyset pagination', () => {
  it.each([0, 499, 500, 501, 2001])('preserves complete stable IDs at the %i-row boundary', async (size) => {
    failure.size = size;
    const result = await config().queryFn();
    expect(result.map(row => row.id)).toEqual(expected(ASC, size).map(row => row.id));
    expect(new Set(result.map(row => row.id)).size).toBe(size);
    expect(requests).toHaveLength(Math.floor(size / 500) + 1);
    expect(requests.map(request => request.offset)).toEqual(requests.map((_, page) => page * 500));
  });

  it('returns 2500 rows in order across keyset pages without duplicates, gaps or OFFSET', async () => {
    const query = config();
    const result = await query.queryFn();
    const rows = expected(ASC);
    expect(result).toEqual(rows);
    expect(new Set(result.map(row => row.id)).size).toBe(2500);
    expect(requests).toHaveLength(6);
    expect(requests[0]!.or).toBeNull();
    // The raw PostgREST value, microseconds and offset included, is the cursor.
    requests.slice(1).forEach((request, index) => expect(request.or).toBe(cursor(rows[(index + 1) * 500 - 1]!)));
    expect(requests[1]!.or).toContain(`created_at.eq."${rows[499]!.created_at}"`);
    expect(rows[499]!.created_at).toMatch(/\.\d{6}\+00:00$/);
    for (const request of requests) {
      expect(request.range).toBeNull();
      expect(request.limit).toBe(500);
      expect(request.orders).toEqual(ASC);
      expect(request.filters).toEqual([['project_id', 'project'], ['removed_at', null], ['project_room_id', 'room'], ['status', 'draft'], ['item_type', 'furniture'], ['purchase_order_id', 'po']]);
    }
    expect(query.queryKey).toEqual(['project-ffe-items', 'project', { roomId: 'room', status: 'draft', itemType: 'furniture', purchaseOrderId: 'po' }]);
  });

  it('rejects a later page failure instead of publishing a partial list', async () => {
    failure.at = 1000;
    await expect(config().queryFn()).rejects.toThrow('page refused');
  });
});

describe('other full-list FF&E readers (offset paging)', () => {
  it.each([
    ['removed', () => useRemovedProjectLines('project'), [['removed_at', { ascending: false }], ['id', { ascending: true }]] as Order[], [['project_id', 'project'], ['removed_at', 'is', null]], ['project-ffe-removed', 'project']],
    ['pair', () => useFfePairLines('project'), ASC, [['project_id', 'project'], ['removed_at', null]], ['project-ffe-items', 'project', 'pair-lines']],
  ] as const)('returns all 2500 %s lines with stable paging and rejects partial failures', async (_name, hook, orders, filters, key) => {
    const query = hook() as unknown as { queryFn: () => Promise<Row[]>; queryKey: unknown[] };
    expect(await query.queryFn()).toEqual(expected(orders));
    expect(requests.map(request => request.range)).toEqual([[0, 999], [1000, 1999], [2000, 2999]]);
    expect(query.queryKey).toEqual(key);
    for (const request of requests) {
      expect(request.orders).toEqual(orders);
      expect(request.filters).toEqual(filters);
    }
    failure.at = 1000;
    await expect(query.queryFn()).rejects.toThrow('page refused');
  });
});
