import { beforeEach, describe, expect, it, vi } from 'vitest';

const client = { from: vi.fn() };
vi.mock('@supabase/ssr', () => ({ createBrowserClient: () => client }));
vi.mock('@tanstack/react-query', () => ({ useQuery: (config: unknown) => config }));
import { useDamageClaims, useReceivingInspections } from '../use-procurement';

const date = '2026-10-25T12:00:00.000Z';
const row = (n: number, project = 'job') => ({
  id: String(n).padStart(8, '0'), created_at: date, project,
  purchase_order: { project_id: project, vendor_id: 'maker' },
  inspection: { purchase_order: { project_id: project, vendor_id: 'maker' } },
});
let rows: ReturnType<typeof row>[];
let calls: Array<{ orders: string[]; filters: Array<[string, unknown]>; cursor?: string; select?: string }>;
let failSecond: boolean;
beforeEach(() => {
  rows = Array.from({ length: 1005 }, (_, n) => row(n + 1));
  // A whole capped page from another project must not hide this job.
  rows.push(...Array.from({ length: 1001 }, (_, n) => row(n + 2000, 'other-job')));
  calls = []; failSecond = false;
  client.from.mockImplementation(() => {
    const call: typeof calls[number] = { orders: [], filters: [] };
    calls.push(call);
    const query: any = {
      select: (s: string) => { call.select = s; return query; },
      order: (key: string, options: unknown) => { expect(options).toEqual({ ascending: false }); call.orders.push(key); return query; },
      eq: (key: string, value: unknown) => { call.filters.push([key, value]); return query; },
      not: () => query,
      or: (cursor: string) => { call.cursor = cursor; return query; },
      limit: async (size: number) => {
        if (failSecond && calls.length === 2) return { error: new Error('second page refused') };
        let candidates = rows.filter(r => !call.filters.some(([key, value]) => key.endsWith('project_id') && r.project !== value));
        if (call.cursor) {
          const match = call.cursor.match(/^created_at.lt.([^,]+),and\(created_at.eq.([^,]+),id.lt.([^\)]+)\)$/)!;
          expect(match, 'cursor includes tied created_at and id').not.toBeNull();
          candidates = candidates.filter(r => r.created_at < match[1] || (r.created_at === match[2] && r.id < match[3]));
        }
        candidates.sort((a, b) => b.created_at.localeCompare(a.created_at) || b.id.localeCompare(a.id));
        const data = candidates.slice(0, Math.min(size, 1000));
        if (calls.length === 1) rows.push(row(9000)); // concurrent leading insert after page one
        return { data, error: null };
      },
      then: (resolve: (value: unknown) => unknown) => query.limit(1000).then(resolve),
    };
    return query;
  });
});

describe.each([
  ['inspection', () => useReceivingInspections({ projectId: 'job' }), 'purchase_order.project_id'],
  ['claim', () => useDamageClaims({ projectId: 'job', state: 'drafted' }), 'inspection.purchase_order.project_id'],
] as const)('%s complete native reads', (_name, hook, projectKey) => {
  it('keyset pages 1005 tied rows without duplicates or skips after a leading insert', async () => {
    const result = await (hook() as unknown as { queryFn: () => Promise<any[]> }).queryFn();
    expect(result.map(r => r.id)).toEqual(Array.from({ length: 1005 }, (_, n) => row(1005 - n).id));
    expect(new Set(result.map(r => r.id)).size).toBe(1005);
    expect(calls).toHaveLength(2);
    for (const call of calls) {
      expect(call.orders).toEqual(['created_at', 'id']);
      expect(call.filters).toContainEqual([projectKey, 'job']);
      expect(call.select).toContain('!inner(');
    }
    if (_name === 'claim') expect(calls[0].filters).toContainEqual(['state', 'drafted']);
  });
  it('rejects a later page failure instead of presenting an incomplete count', async () => {
    failSecond = true;
    await expect((hook() as unknown as { queryFn: () => Promise<any[]> }).queryFn()).rejects.toThrow('second page refused');
  });
});
