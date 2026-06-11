import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─────────────────────────────────────────────────────────────────────────────
// Mocks — mirrors the use-procurement rig. W3-T2 (00187) coverage: the
// get_ffe_invoice_coverage RPC hook, the ffe line-row builder, and the
// ffe-invoice-coverage invalidation additions on the money mutations. Only
// the rpc surface is exercised here; table-builder flows (draft create /
// upsert) have their own coverage via the SQL test suite.
// ─────────────────────────────────────────────────────────────────────────────

const supabaseClient = {
  auth: { getUser: vi.fn(), getSession: vi.fn() },
  from: vi.fn(),
  rpc: vi.fn(),
};

vi.mock('@supabase/ssr', () => ({
  createBrowserClient: () => supabaseClient,
}));

const invalidateQueries = vi.fn();
vi.mock('@tanstack/react-query', () => ({
  useQuery: (config: unknown) => config,
  useMutation: (config: unknown) => config,
  useQueryClient: () => ({ invalidateQueries }),
}));

// Import AFTER mocks.
import {
  useFfeInvoiceCoverage,
  buildLineRow,
  useCreateDraftInvoice,
  useIssueInvoice,
  useRecordPayment,
  useVoidInvoice,
  type DraftLineInput,
  type FfeInvoiceCoverageMap,
} from '../use-invoices';

beforeEach(() => {
  vi.clearAllMocks();
});

const invalidatedKeys = () => invalidateQueries.mock.calls.map((c) => c[0].queryKey);

// ─────────────────────────────────────────────────────────────────────────────
// useFfeInvoiceCoverage  (W3-T2 — migration 00187)
// ─────────────────────────────────────────────────────────────────────────────

describe('useFfeInvoiceCoverage', () => {
  interface CoverageConfig {
    queryKey: unknown[];
    queryFn: () => Promise<FfeInvoiceCoverageMap>;
    enabled: boolean;
  }

  it('uses the ["ffe-invoice-coverage", projectId] query key', () => {
    const config = useFfeInvoiceCoverage('proj-1') as unknown as CoverageConfig;
    expect(config.queryKey).toEqual(['ffe-invoice-coverage', 'proj-1']);
  });

  it('calls the get_ffe_invoice_coverage RPC with p_project_id and maps rows to the keyed shape', async () => {
    supabaseClient.rpc.mockResolvedValue({
      data: [
        {
          ffe_item_id: 'item-uninvoiced',
          invoice_id: null,
          invoice_number: null,
          invoice_status: null,
          billed_cents: null,
          coverage: 'uninvoiced',
        },
        {
          ffe_item_id: 'item-invoiced',
          invoice_id: 'inv-1',
          invoice_number: 'INV-0007',
          invoice_status: 'sent',
          billed_cents: 50000,
          coverage: 'invoiced',
        },
        {
          ffe_item_id: 'item-paid',
          invoice_id: 'inv-2',
          invoice_number: 'INV-0008',
          invoice_status: 'paid',
          billed_cents: 80000,
          coverage: 'paid',
        },
      ],
      error: null,
    });

    const config = useFfeInvoiceCoverage('proj-1') as unknown as CoverageConfig;
    const map = await config.queryFn();

    expect(supabaseClient.rpc).toHaveBeenCalledWith('get_ffe_invoice_coverage', {
      p_project_id: 'proj-1',
    });

    // Keyed object (itemId → coverage) — the Order Assistant does
    // coverage[item.id] per FF&E row.
    expect(map['item-uninvoiced']).toEqual({
      coverage: 'uninvoiced',
      invoiceId: null,
      invoiceNumber: null,
      invoiceStatus: null,
      billedCents: null,
    });
    expect(map['item-invoiced']).toEqual({
      coverage: 'invoiced',
      invoiceId: 'inv-1',
      invoiceNumber: 'INV-0007',
      invoiceStatus: 'sent',
      billedCents: 50000,
    });
    expect(map['item-paid']).toEqual({
      coverage: 'paid',
      invoiceId: 'inv-2',
      invoiceNumber: 'INV-0008',
      invoiceStatus: 'paid',
      billedCents: 80000,
    });
    expect(Object.keys(map)).toHaveLength(3);
  });

  it('returns an empty map for empty/null RPC data', async () => {
    supabaseClient.rpc.mockResolvedValue({ data: null, error: null });
    const config = useFfeInvoiceCoverage('proj-1') as unknown as CoverageConfig;
    await expect(config.queryFn()).resolves.toEqual({});
  });

  it('throws when the RPC errors', async () => {
    supabaseClient.rpc.mockResolvedValue({
      data: null,
      error: new Error('permission denied'),
    });
    const config = useFfeInvoiceCoverage('proj-1') as unknown as CoverageConfig;
    await expect(config.queryFn()).rejects.toThrow('permission denied');
  });

  it('is enabled by default with a projectId, gated off by opts.enabled or a missing projectId', () => {
    expect((useFfeInvoiceCoverage('proj-1') as unknown as CoverageConfig).enabled).toBe(true);
    expect(
      (useFfeInvoiceCoverage('proj-1', { enabled: false }) as unknown as CoverageConfig).enabled
    ).toBe(false);
    expect(
      (useFfeInvoiceCoverage('proj-1', { enabled: true }) as unknown as CoverageConfig).enabled
    ).toBe(true);
    expect((useFfeInvoiceCoverage('') as unknown as CoverageConfig).enabled).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// buildLineRow — ffe kind inference + ffe_item_id write (00187)
// ─────────────────────────────────────────────────────────────────────────────

describe('buildLineRow', () => {
  const base: DraftLineInput = {
    description: 'Coverage sofa',
    quantity: 2,
    unitAmountCents: 25000,
  };

  it('writes ffe_item_id and infers kind "ffe" when ffeItemId is present', () => {
    const row = buildLineRow('inv-1', { ...base, ffeItemId: 'item-1' }, 0);
    expect(row).toEqual(
      expect.objectContaining({
        invoice_id: 'inv-1',
        kind: 'ffe',
        ffe_item_id: 'item-1',
        milestone_id: null,
        amount_cents: 50000,
      })
    );
  });

  it('keeps the explicit kind when one is supplied (ffe_item_id still written)', () => {
    const row = buildLineRow('inv-1', { ...base, kind: 'adhoc', ffeItemId: 'item-1' }, 0);
    expect(row.kind).toBe('adhoc');
    expect(row.ffe_item_id).toBe('item-1');
  });

  it('milestone inference wins over ffe when both links are present', () => {
    const row = buildLineRow(
      'inv-1',
      { ...base, milestoneId: 'ms-1', ffeItemId: 'item-1' },
      0
    );
    expect(row.kind).toBe('milestone');
    expect(row.milestone_id).toBe('ms-1');
    expect(row.ffe_item_id).toBe('item-1');
  });

  it('defaults to adhoc with a NULL ffe_item_id when no links are present', () => {
    const row = buildLineRow('inv-1', base, 3);
    expect(row.kind).toBe('adhoc');
    expect(row.ffe_item_id).toBeNull();
    expect(row.milestone_id).toBeNull();
    expect(row.sort_order).toBe(3);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Invalidation additions — money mutations refresh the coverage read-model
// ─────────────────────────────────────────────────────────────────────────────

describe('ffe-invoice-coverage invalidation', () => {
  it('useCreateDraftInvoice onSuccess invalidates the project-scoped coverage key', () => {
    const config = useCreateDraftInvoice() as unknown as {
      onSuccess: (invoice: { project_id: string }) => void;
    };
    config.onSuccess({ project_id: 'proj-1' });
    expect(invalidatedKeys()).toContainEqual(['ffe-invoice-coverage', 'proj-1']);
  });

  it('useIssueInvoice onSuccess invalidates the project-scoped coverage key', () => {
    const config = useIssueInvoice() as unknown as {
      onSuccess: (invoice: unknown, vars: { invoiceId: string; projectId?: string }) => void;
    };
    config.onSuccess({ project_id: 'proj-1' }, { invoiceId: 'inv-1', projectId: 'proj-1' });
    expect(invalidatedKeys()).toContainEqual(['ffe-invoice-coverage', 'proj-1']);
  });

  it('useIssueInvoice falls back to the RPC row project_id when no projectId is passed', () => {
    const config = useIssueInvoice() as unknown as {
      onSuccess: (invoice: unknown, vars: { invoiceId: string; projectId?: string }) => void;
    };
    config.onSuccess({ project_id: 'proj-from-row' }, { invoiceId: 'inv-1' });
    expect(invalidatedKeys()).toContainEqual(['ffe-invoice-coverage', 'proj-from-row']);
  });

  it('useRecordPayment onSuccess invalidates the project-scoped coverage key', () => {
    const config = useRecordPayment() as unknown as {
      onSuccess: (payment: unknown, vars: { invoiceId: string; projectId?: string }) => void;
    };
    config.onSuccess({}, { invoiceId: 'inv-1', projectId: 'proj-1' });
    expect(invalidatedKeys()).toContainEqual(['ffe-invoice-coverage', 'proj-1']);
  });

  it('useRecordPayment without a projectId drops the whole coverage namespace', () => {
    const config = useRecordPayment() as unknown as {
      onSuccess: (payment: unknown, vars: { invoiceId: string; projectId?: string }) => void;
    };
    config.onSuccess({}, { invoiceId: 'inv-1' });
    expect(invalidatedKeys()).toContainEqual(['ffe-invoice-coverage']);
  });

  it('useVoidInvoice onSuccess invalidates the project-scoped coverage key (slot release)', () => {
    const config = useVoidInvoice() as unknown as {
      onSuccess: (invoice: unknown, vars: { invoiceId: string; projectId?: string }) => void;
    };
    config.onSuccess({ project_id: 'proj-1' }, { invoiceId: 'inv-1', projectId: 'proj-1' });
    expect(invalidatedKeys()).toContainEqual(['ffe-invoice-coverage', 'proj-1']);
  });
});
