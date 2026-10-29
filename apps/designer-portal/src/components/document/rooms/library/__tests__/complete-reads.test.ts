import { useAuthorizationLineDrift } from '@/hooks/use-commercial-documents';
import { usePieceUsage } from '../use-piece-usage';

let mockTables: Record<string, Array<Record<string, unknown>>> = {};
let mockReads: Array<{ table: string; ids: string[]; from: number; to: number; orders: string[] }> = [];

jest.mock('@tanstack/react-query', () => ({
  useQuery: (config: unknown) => config,
  useMutation: (config: unknown) => config,
  useQueryClient: () => ({}),
}));
jest.mock('@patina/supabase', () => ({
  fetchAllRows: jest.requireActual('@patina/supabase').fetchAllRows,
  boundedIn: jest.requireActual('@patina/supabase').boundedIn,
  createBrowserClient: () => ({
    from: (table: string) => {
      let ids: string[] = [], field = '', from = 0, to = 999;
      const orders: string[] = [];
      const builder = {
        select: () => builder,
        in: (key: string, value: string[]) => { field = key; ids = value; return builder; },
        is: () => builder,
        order: (key: string) => { orders.push(key); return builder; },
        range: (start: number, end: number) => { from = start; to = end; return builder; },
        then: (resolve: (value: unknown) => unknown) => {
          mockReads.push({ table, ids, from, to, orders: [...orders] });
          const rows = (mockTables[table] ?? []).filter(row => !ids.length || ids.includes(String(row[field])));
          return Promise.resolve({ data: rows.slice(from, to + 1), error: null }).then(resolve);
        },
      };
      return builder;
    },
  }),
}));

const query = (value: unknown) => value as { queryFn: () => Promise<unknown> };
beforeEach(() => { mockTables = {}; mockReads = []; });

test('piece usage reads 2500 project lines and all project documents', async () => {
  mockTables.project_ffe_items = Array.from({ length: 2500 }, (_, i) => ({
    id: `line-${i}`, product_id: 'product', project_id: `project-${i}`, project: { name: `Job ${i}` },
  }));
  mockTables.document_state = Array.from({ length: 2500 }, (_, i) => ({
    project_id: `project-${i}`, client_name: `Client ${i}`, active_section: 'project',
  }));
  const result = await query(usePieceUsage(['product'])).queryFn() as Record<string, Array<unknown>>;
  expect(result.product).toHaveLength(2500);
  expect(mockReads.filter(r => r.table === 'project_ffe_items').map(r => [r.from, r.to]))
    .toEqual([[0, 999], [1000, 1999], [2000, 2999]]);
  expect(mockReads.filter(r => r.table === 'project_ffe_items').every(r => r.orders.at(-1) === 'id')).toBe(true);
  expect(mockReads.filter(r => r.table === 'document_state').length).toBe(25);
  expect(mockReads.every(r => r.ids.length <= 100)).toBe(true);
});

test('authorization details transport 2500 IDs in bounded chunks', async () => {
  mockTables.project_ffe_items = Array.from({ length: 2500 }, (_, i) => ({
    id: `line-${i}`, line_total_cents: i, status: 'draft',
  }));
  const ids = mockTables.project_ffe_items.map(row => String(row.id));
  const result = await query(useAuthorizationLineDrift(ids)).queryFn() as Map<string, unknown>;
  expect(result.size).toBe(2500);
  const reads = mockReads.filter(r => r.table === 'project_ffe_items');
  expect(reads).toHaveLength(25);
  expect(reads.every(r => r.ids.length <= 100)).toBe(true);
});
