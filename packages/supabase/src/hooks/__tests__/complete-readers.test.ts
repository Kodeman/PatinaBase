import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  tables: {} as Record<string, Array<Record<string, any>>>,
  requests: [] as Array<{ table: string; from: number; to: number; orders: string[]; ids?: string[]; select?: string }>,
  failure: { table: '', from: -1 },
  writes: [] as Array<Record<string, unknown>>,
}));
vi.mock('../../client', () => ({
  createBrowserClient: () => ({
    rpc: async () => ({ data: { id: 'book', project_id: 'project' }, error: null }),
    from: (table: string) => {
      let from = 0, to = 999, limit = 1000, cursor = '', ids: string[] | undefined, idColumn = '', selection = '';
      const orders: string[] = [];
      const query = {
        select: (value: string) => { selection = value; return query; },
        eq: () => query,
        is: () => query,
        in: (key: string, value: string[]) => { idColumn = key; ids = value; return query; },
        order: (column: string) => { orders.push(column); return query; },
        gt: (_key: string, value: string) => { cursor = value; return query; },
        limit: (value: number) => { limit = value; to = value - 1; return query; },
        range: (start: number, end: number) => { from = start; to = end; return query; },
        update: (value: Record<string, unknown>) => { state.writes.push(value); return query; },
        delete: () => query,
        single: async () => ({ data: { id: 'invoice', status: 'draft', tax_rate: 0 }, error: null }),
        maybeSingle: async () => ({ data: { id: 'po', project_id: 'project', vendor_id: 'vendor' }, error: null }),
        then: (resolve: (value: unknown) => unknown) => {
          state.requests.push({ table, from, to, orders: [...orders], ids, select: selection });
          let rows = state.tables[table] ?? [];
          if (ids) rows = rows.filter(row => ids!.includes(String(row[idColumn])));
          if (cursor) rows = rows.filter(row => String(row.id) > cursor);
          const page = rows.slice(from, Math.min(to + 1, from + limit));
          return Promise.resolve({ data: page, error: table === state.failure.table && from === state.failure.from ? new Error('later page refused') : null }).then(resolve);
        },
      };
      return query;
    },
  }),
}));
vi.mock('@tanstack/react-query', () => ({
  useQuery: (options: unknown) => options,
  useMutation: (options: unknown) => options,
  useQueryClient: () => ({}),
}));
import { useProjectRoomPlacements } from '../use-pieces';
import { useProcurementItems, useFfePlacementReceipts } from '../use-procurement';
import { useProjectSubmittals, useStudioPurchases, usePoCostLines, useProjectPoCostLines, useProcurementDrafts, usePoAckBasis } from '../use-buying-phase2';
import { useProjectFfeImportRows } from '../use-add-to-the-job';
import { useSpecBookWorkbench } from '../use-spec-books';
import { useDeleteLineItem, useUpsertLineItems } from '../use-invoices';

const rows = (n: number) => Array.from({ length: n }, (_, i) => ({
  id: `row-${String(i).padStart(5, '0')}`, project_id: 'project', ffe_item_id: `row-${String(i).padStart(5, '0')}`,
  placement_id: 'placement', product_id: 'product', quantity: 1, amount_cents: 1,
  sort_order: i, created_at: '2026-01-01', row_ordinal: i,
}));
const query = (value: unknown) => value as { queryFn: () => Promise<any>; queryKey: unknown[] };
beforeEach(() => {
  state.tables = {};
  state.requests.length = 0;
  state.writes.length = 0;
  state.failure = { table: '', from: -1 };
});

describe('complete line readers', () => {
  it.each([
    ['placements', 'project_ffe_placements', () => useProjectRoomPlacements('project')],
    ['procurement', 'project_ffe_items', () => useProcurementItems({ projectId: 'project' })],
    ['purchases', 'studio_purchases', () => useStudioPurchases({ projectId: 'project' })],
    ['PO cost lines', 'po_cost_lines', () => usePoCostLines('po')],
    ['project cost lines', 'po_cost_lines', () => useProjectPoCostLines('project')],
    ['submittals', 'ffe_line_submittals', () => useProjectSubmittals('project')],
    ['drafts', 'procurement_drafts', () => useProcurementDrafts('project')],
    ['staged import', 'project_ffe_import_rows', () => useProjectFfeImportRows('batch')],
  ] as const)('%s retrieves 2500 rows with id ordering and rejects a later page', async (_name, table, hook) => {
    state.tables[table] = rows(2500);
    const read = query(hook());
    expect((await read.queryFn()).length).toBe(2500);
    expect(state.requests.filter(r => r.table === table).map(r => [r.from, r.to]))
      .toEqual([[0, 999], [1000, 1999], [2000, 2999]]);
    expect(state.requests.filter(r => r.table === table).every(r => r.orders.at(-1) === 'id')).toBe(true);
    state.failure = { table, from: 1000 };
    await expect(read.queryFn()).rejects.toThrow('later page refused');
  });

  it('reads 2500 PO acknowledgment lines and rejects a later-page failure', async () => {
    state.tables.project_ffe_items = rows(2500);
    const read = query(usePoAckBasis('po'));
    expect((await read.queryFn()).lines).toHaveLength(2500);
    expect(state.requests.filter(r => r.table === 'project_ffe_items').map(r => r.from)).toEqual([0, 1000, 2000]);
    state.failure = { table: 'project_ffe_items', from: 1000 };
    await expect(read.queryFn()).rejects.toThrow('later page refused');
  });

  it('sums 2500 placement receipts across three pages', async () => {
    state.tables.project_ffe_placement_receipts = rows(2500);
    const read = query(useFfePlacementReceipts(['placement']));
    expect((await read.queryFn()).placement).toBe(2500);
    expect(state.requests.map(r => r.from)).toEqual([0, 1000, 2000]);
  });

  it.each(['delete', 'upsert'] as const)('%s recalculates a draft from all 2500 invoice lines and rejects later failure', async (action) => {
    state.tables.invoice_line_items = rows(2500);
    const mutation = (action === 'delete' ? useDeleteLineItem() : useUpsertLineItems()) as unknown as {
      mutationFn: (args: unknown) => Promise<void>;
    };
    const args = action === 'delete' ? { invoiceId: 'invoice', lineItemId: 'old' } : { invoiceId: 'invoice', lines: [] };
    await mutation.mutationFn(args);
    expect(state.writes.at(-1)).toMatchObject({ subtotal_cents: 2500, total_cents: 2500 });
    expect(state.requests.filter(r => r.table === 'invoice_line_items' && r.select === 'id, amount_cents').map(r => r.from)).toEqual([0, 1000, 2000]);
    state.failure = { table: 'invoice_line_items', from: 1000 };
    await expect(mutation.mutationFn(args)).rejects.toThrow('later page refused');
  });

  it('keysets 2500 computed-image items and chunks all spec IDs', async () => {
    state.tables.project_ffe_items = rows(2500);
    state.tables.project_ffe_specs = rows(2500);
    state.tables.spec_book_item_settings = rows(2500);
    const read = query(useSpecBookWorkbench('project'));
    const result = await read.queryFn();
    expect(result.items).toHaveLength(2500);
    expect(result.items.filter((item: { spec: unknown }) => !!item.spec)).toHaveLength(2500);
    expect(result.items.filter((item: { setting: unknown }) => !!item.setting)).toHaveLength(2500);
    const itemReads = state.requests.filter(r => r.table === 'project_ffe_items');
    expect(itemReads).toHaveLength(3);
    expect(itemReads.every(r => r.orders.at(-1) === 'id' && r.select?.includes('primary_image_url'))).toBe(true);
    const specReads = state.requests.filter(r => r.table === 'project_ffe_specs');
    expect(specReads.length).toBe(25);
    expect(specReads.every(r => (r.ids?.length ?? 0) <= 100)).toBe(true);
  });
});
