import { beforeEach, describe, expect, it, vi } from 'vitest';

// US-34 N6b: a write invalidates the keys it changed. The whole ['projects']
// key also refetches the studio project list (`useProjects`), which a
// configuration placement or revision never changes. Money writes keep every
// key that prints totals.

const rpc = vi.fn();
vi.mock('@supabase/ssr', () => ({
  createBrowserClient: () => ({ rpc }),
}));

const invalidateQueries = vi.fn();
vi.mock('@tanstack/react-query', () => ({
  useQuery: (config: unknown) => config,
  useMutation: (config: unknown) => config,
  useQueryClient: () => ({ invalidateQueries }),
}));

import {
  usePlaceProductConfiguration,
  useReviseProjectFFEConfiguration,
} from '../use-product-configurations';
import { useAddInvoiceBillingLines } from '../use-buying-phase2';

const invalidatedKeys = () => invalidateQueries.mock.calls.map(([value]) => value.queryKey);

beforeEach(() => {
  rpc.mockReset();
  invalidateQueries.mockReset();
});

describe('invalidation narrowing (N6b)', () => {
  it('placing a configuration refreshes its own project, not the studio project list', async () => {
    const mutation = usePlaceProductConfiguration() as any;
    await mutation.onSuccess(
      { productId: 'sectional-1' },
      { projectId: 'project-1', configurationId: 'configuration-1' },
    );

    const keys = invalidatedKeys();
    expect(keys).toContainEqual(['projects', 'project-1']);
    expect(keys).not.toContainEqual(['projects']);
    // The priced line moves the project's totals: every read that prints them.
    expect(keys).toEqual(
      expect.arrayContaining([
        ['project-ffe-items', 'project-1'],
        ['project', 'project-1'],
        ['spec-books', 'workbench', 'project-1'],
        ['procurement-items'],
      ]),
    );
  });

  it('revising a line configuration refreshes its own project, not the studio project list', async () => {
    const mutation = useReviseProjectFFEConfiguration() as any;
    await mutation.onSuccess({ projectId: 'project-1', configurationId: 'configuration-2' });

    const keys = invalidatedKeys();
    expect(keys).toContainEqual(['projects', 'project-1']);
    expect(keys).not.toContainEqual(['projects']);
    expect(keys).toEqual(
      expect.arrayContaining([
        ['project-ffe-items', 'project-1'],
        ['project', 'project-1'],
        ['spec-books', 'workbench', 'project-1'],
        ['procurement-items'],
      ]),
    );
  });

  it('adding billing lines to an invoice keeps every invoice read that prints totals', () => {
    const mutation = useAddInvoiceBillingLines() as any;
    mutation.onSuccess([], { invoiceId: 'invoice-1', projectId: 'project-1', lines: [] });

    const keys = invalidatedKeys();
    // Project-scoped where the key allows it.
    expect(keys).toContainEqual(['ffe-invoice-coverage', 'project-1']);
    expect(keys).toContainEqual(['project-financials', 'project-1']);
    expect(keys).not.toContainEqual(['ffe-invoice-coverage']);
    // A money act: the folio, the project's invoices and the Accounts book all
    // print the recomputed totals, so the invoices family stays whole.
    expect(keys).toContainEqual(['invoices']);
  });
});
