import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@supabase/ssr', () => ({ createBrowserClient: () => ({}) }));
const invalidateQueries = vi.fn();
vi.mock('@tanstack/react-query', () => ({
  useMutation: (config: unknown) => config,
  useQueryClient: () => ({ invalidateQueries }),
}));

import { useCreateDraftInvoice, useVoidInvoice } from '../use-invoices';

type SuccessConfig = { onSuccess: (invoice: unknown, input: unknown) => void };
const keys = () => invalidateQueries.mock.calls.map(([filters]) => filters.queryKey);

beforeEach(() => { vi.clearAllMocks(); });

describe('mounted Hours invoice refresh', () => {
  it('invalidates own-week and unbilled Hours after a draft claims time', () => {
    const config = useCreateDraftInvoice() as unknown as SuccessConfig;
    config.onSuccess({ project_id: 'project-1' }, { projectId: 'project-1', entryIds: ['hour-1'] });
    expect(keys()).toContainEqual(['document-hours-week']);
    expect(keys()).toContainEqual(['document-hours-unbilled']);
  });

  it.each([undefined, 'project-1'])('invalidates own-week and unbilled Hours after void releases time (project %s)', projectId => {
    const config = useVoidInvoice() as unknown as SuccessConfig;
    config.onSuccess({ project_id: 'project-1' }, { invoiceId: 'invoice-1', projectId });
    expect(keys()).toContainEqual(['document-hours-week']);
    expect(keys()).toContainEqual(['document-hours-unbilled']);
  });
});
