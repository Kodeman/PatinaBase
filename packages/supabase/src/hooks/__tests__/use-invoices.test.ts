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
  functions: { invoke: vi.fn() },
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
  useUpdateDraftInvoice,
  useUpsertLineItems,
  useDeleteLineItem,
  useIssueInvoice,
  useStartCheckout,
  useInvoicePaymentOptions,
  useNotifyCheckIntent,
  useRecordPayment,
  useVoidInvoice,
  type DraftLineInput,
  type FfeInvoiceCoverageMap,
  InvoiceCheckoutError,
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

  it('useUpdateDraftInvoice onSuccess calls invalidateInvoiceEffects with invoice.project_id', () => {
    const config = useUpdateDraftInvoice() as unknown as {
      onSuccess: (invoice: { project_id: string }) => void;
    };
    config.onSuccess({ project_id: 'proj-1' });
    expect(invalidatedKeys()).toContainEqual(['invoices']);
    expect(invalidatedKeys()).toContainEqual(['ffe-invoice-coverage', 'proj-1']);
    expect(invalidatedKeys()).toContainEqual(['project-financials', 'proj-1']);
  });

  it('useUpsertLineItems onSuccess calls invalidateInvoiceEffects with projectId', () => {
    const config = useUpsertLineItems() as unknown as {
      onSuccess: (
        data: void,
        vars: { invoiceId: string; lines: DraftLineInput[]; projectId?: string }
      ) => void;
    };
    config.onSuccess(undefined, { invoiceId: 'inv-1', lines: [], projectId: 'proj-1' });
    expect(invalidatedKeys()).toContainEqual(['invoices']);
    expect(invalidatedKeys()).toContainEqual(['ffe-invoice-coverage', 'proj-1']);
    expect(invalidatedKeys()).toContainEqual(['project-financials', 'proj-1']);
  });

  it('useUpsertLineItems without projectId drops the whole coverage namespace', () => {
    const config = useUpsertLineItems() as unknown as {
      onSuccess: (
        data: void,
        vars: { invoiceId: string; lines: DraftLineInput[]; projectId?: string }
      ) => void;
    };
    config.onSuccess(undefined, { invoiceId: 'inv-1', lines: [] });
    expect(invalidatedKeys()).toContainEqual(['invoices']);
    expect(invalidatedKeys()).toContainEqual(['ffe-invoice-coverage']);
  });

  it('useDeleteLineItem onSuccess calls invalidateInvoiceEffects with projectId', () => {
    const config = useDeleteLineItem() as unknown as {
      onSuccess: (
        data: void,
        vars: { invoiceId: string; lineItemId: string; projectId?: string }
      ) => void;
    };
    config.onSuccess(undefined, { invoiceId: 'inv-1', lineItemId: 'line-1', projectId: 'proj-1' });
    expect(invalidatedKeys()).toContainEqual(['invoices']);
    expect(invalidatedKeys()).toContainEqual(['ffe-invoice-coverage', 'proj-1']);
    expect(invalidatedKeys()).toContainEqual(['project-financials', 'proj-1']);
  });

  it('useDeleteLineItem without projectId drops the whole coverage namespace', () => {
    const config = useDeleteLineItem() as unknown as {
      onSuccess: (
        data: void,
        vars: { invoiceId: string; lineItemId: string; projectId?: string }
      ) => void;
    };
    config.onSuccess(undefined, { invoiceId: 'inv-1', lineItemId: 'line-1' });
    expect(invalidatedKeys()).toContainEqual(['invoices']);
    expect(invalidatedKeys()).toContainEqual(['ffe-invoice-coverage']);
  });
});

describe('useStartCheckout exact receipt', () => {
  type CheckoutConfig = {
    mutationFn: (input: { invoiceId: string }) => Promise<unknown>;
  };

  it('returns the exact attempt/payment/session evidence from the edge boundary', async () => {
    supabaseClient.functions.invoke.mockResolvedValue({
      data: {
        url: 'https://checkout.stripe.test/cs_1',
        amount_cents: 12_345,
        currency: 'usd',
        checkout_attempt_id: 'attempt-1',
        payment_id: 'payment-1',
        session_id: 'cs_1',
        reused: false,
      },
      error: null,
    });

    const config = useStartCheckout() as unknown as CheckoutConfig;
    await expect(config.mutationFn({ invoiceId: 'invoice-1' })).resolves.toEqual(
      expect.objectContaining({
        amount_cents: 12_345,
        checkout_attempt_id: 'attempt-1',
        payment_id: 'payment-1',
        session_id: 'cs_1',
      }),
    );
  });

  it('preserves a structured processing error and exact attempt evidence', async () => {
    supabaseClient.functions.invoke.mockResolvedValue({
      data: null,
      error: {
        message: 'Edge Function returned a non-2xx status code',
        context: {
          json: vi.fn().mockResolvedValue({
            error: 'payment_processing',
            detail: 'The bank transfer is still processing.',
            amount_cents: 12_345,
            currency: 'usd',
            checkout_attempt_id: 'attempt-1',
            payment_id: 'payment-1',
            session_id: 'cs_1',
          }),
        },
      },
    });

    const config = useStartCheckout() as unknown as CheckoutConfig;
    const thrown = await config.mutationFn({ invoiceId: 'invoice-1' }).catch((error) => error);
    expect(thrown).toBeInstanceOf(InvoiceCheckoutError);
    expect(thrown).toMatchObject({
      code: 'payment_processing',
      amountCents: 12_345,
      checkoutAttemptId: 'attempt-1',
      paymentId: 'payment-1',
      sessionId: 'cs_1',
    });
  });

  it('fails closed when a nominal success omits exact checkout identity', async () => {
    supabaseClient.functions.invoke.mockResolvedValue({
      data: { url: 'https://checkout.stripe.test/cs_legacy' },
      error: null,
    });

    const config = useStartCheckout() as unknown as CheckoutConfig;
    await expect(config.mutationFn({ invoiceId: 'invoice-1' })).rejects.toMatchObject({
      code: 'checkout_malformed_response',
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// useStartCheckout — payment_method pass-through (migration 00428)
// ─────────────────────────────────────────────────────────────────────────────

describe('useStartCheckout payment_method body', () => {
  type CheckoutConfig = {
    mutationFn: (input: {
      invoiceId: string;
      paymentMethod?: 'card' | 'us_bank_account';
    }) => Promise<unknown>;
  };

  const legacyReceipt = {
    url: 'https://checkout.stripe.test/cs_1',
    amount_cents: 12_345,
    currency: 'usd',
    checkout_attempt_id: 'attempt-1',
    payment_id: 'payment-1',
    session_id: 'cs_1',
    reused: false,
  };

  it('includes payment_method in the body when paymentMethod is passed', async () => {
    supabaseClient.functions.invoke.mockResolvedValue({ data: legacyReceipt, error: null });
    const config = useStartCheckout() as unknown as CheckoutConfig;

    await config.mutationFn({ invoiceId: 'invoice-1', paymentMethod: 'us_bank_account' });

    expect(supabaseClient.functions.invoke).toHaveBeenCalledWith('create-checkout-session', {
      body: { invoiceId: 'invoice-1', payment_method: 'us_bank_account' },
    });
  });

  it('omits the payment_method KEY entirely when paymentMethod is undefined (invariant #3, iOS legacy)', async () => {
    supabaseClient.functions.invoke.mockResolvedValue({ data: legacyReceipt, error: null });
    const config = useStartCheckout() as unknown as CheckoutConfig;

    await config.mutationFn({ invoiceId: 'invoice-1' });

    const [, callArgs] = supabaseClient.functions.invoke.mock.calls[0];
    expect(callArgs.body).toEqual({ invoiceId: 'invoice-1' });
    expect('payment_method' in callArgs.body).toBe(false);
  });

  it('round-trips a receipt carrying valid surcharge_cents + payment_method extras', async () => {
    supabaseClient.functions.invoke.mockResolvedValue({
      data: { ...legacyReceipt, surcharge_cents: 375, payment_method: 'card' },
      error: null,
    });
    const config = useStartCheckout() as unknown as CheckoutConfig;

    await expect(
      config.mutationFn({ invoiceId: 'invoice-1', paymentMethod: 'card' })
    ).resolves.toEqual(
      expect.objectContaining({
        surcharge_cents: 375,
        payment_method: 'card',
        amount_cents: 12_345,
      })
    );
  });

  it('rejects with checkout_malformed_response when surcharge_cents is present but not an integer', async () => {
    supabaseClient.functions.invoke.mockResolvedValue({
      data: { ...legacyReceipt, surcharge_cents: 3.5 },
      error: null,
    });
    const config = useStartCheckout() as unknown as CheckoutConfig;

    await expect(config.mutationFn({ invoiceId: 'invoice-1' })).rejects.toMatchObject({
      code: 'checkout_malformed_response',
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// useInvoicePaymentOptions (migration 00428)
// ─────────────────────────────────────────────────────────────────────────────

describe('useInvoicePaymentOptions', () => {
  interface OptionsConfig {
    queryKey: unknown[];
    queryFn: () => Promise<{ card_surcharge_bps: number; check_remit_to: string | null }>;
    enabled: boolean;
  }

  it('uses the ["invoice-payment-options", invoiceId] query key and is enabled only with an id', () => {
    const config = useInvoicePaymentOptions('invoice-1') as unknown as OptionsConfig;
    expect(config.queryKey).toEqual(['invoice-payment-options', 'invoice-1']);
    expect(config.enabled).toBe(true);
    expect((useInvoicePaymentOptions(null) as unknown as OptionsConfig).enabled).toBe(false);
    expect((useInvoicePaymentOptions(undefined) as unknown as OptionsConfig).enabled).toBe(false);
  });

  it('calls get_invoice_payment_options with p_invoice_id and passes through a valid row', async () => {
    supabaseClient.rpc.mockResolvedValue({
      data: { card_surcharge_bps: 250, check_remit_to: '123 Studio Way' },
      error: null,
    });
    const config = useInvoicePaymentOptions('invoice-1') as unknown as OptionsConfig;

    await expect(config.queryFn()).resolves.toEqual({
      card_surcharge_bps: 250,
      check_remit_to: '123 Studio Way',
    });
    expect(supabaseClient.rpc).toHaveBeenCalledWith('get_invoice_payment_options', {
      p_invoice_id: 'invoice-1',
    });
  });

  it('falls back to platform defaults on an RPC error — never throws into the pay path', async () => {
    supabaseClient.rpc.mockResolvedValue({ data: null, error: new Error('permission denied') });
    const config = useInvoicePaymentOptions('invoice-1') as unknown as OptionsConfig;

    await expect(config.queryFn()).resolves.toEqual({
      card_surcharge_bps: 300,
      check_remit_to: null,
    });
  });

  it('falls back to platform defaults on an empty/null response', async () => {
    supabaseClient.rpc.mockResolvedValue({ data: null, error: null });
    const config = useInvoicePaymentOptions('invoice-1') as unknown as OptionsConfig;

    await expect(config.queryFn()).resolves.toEqual({
      card_surcharge_bps: 300,
      check_remit_to: null,
    });
  });

  it('falls back to platform defaults when the RPC throws synchronously', async () => {
    supabaseClient.rpc.mockImplementation(() => {
      throw new Error('network down');
    });
    const config = useInvoicePaymentOptions('invoice-1') as unknown as OptionsConfig;

    await expect(config.queryFn()).resolves.toEqual({
      card_surcharge_bps: 300,
      check_remit_to: null,
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// useNotifyCheckIntent (migration 00428)
// ─────────────────────────────────────────────────────────────────────────────

describe('useNotifyCheckIntent', () => {
  type IntentConfig = {
    mutationFn: (input: { invoiceId: string }) => Promise<unknown>;
  };

  // The wire shape is the edge function's actual 200 body:
  //   { ok, invoiceId, alreadyNotified, emailSent, suppressed }  — camelCase.
  it('invokes invoice-check-intent with { invoiceId } and maps a fresh notification', async () => {
    supabaseClient.functions.invoke.mockResolvedValue({
      data: {
        ok: true,
        invoiceId: 'invoice-1',
        alreadyNotified: false,
        emailSent: true,
        suppressed: false,
      },
      error: null,
    });
    const config = useNotifyCheckIntent() as unknown as IntentConfig;

    await expect(config.mutationFn({ invoiceId: 'invoice-1' })).resolves.toEqual({
      ok: true,
      alreadyNotified: false,
    });
    expect(supabaseClient.functions.invoke).toHaveBeenCalledWith('invoice-check-intent', {
      body: { invoiceId: 'invoice-1' },
    });
  });

  it('maps an idempotent hit (alreadyNotified: true)', async () => {
    supabaseClient.functions.invoke.mockResolvedValue({
      data: {
        ok: true,
        invoiceId: 'invoice-1',
        alreadyNotified: true,
        emailSent: false,
        suppressed: false,
      },
      error: null,
    });
    const config = useNotifyCheckIntent() as unknown as IntentConfig;

    await expect(config.mutationFn({ invoiceId: 'invoice-1' })).resolves.toEqual({
      ok: true,
      alreadyNotified: true,
    });
  });

  // Tolerated fallback: a snake_case body (an older deploy, a replayed
  // fixture) must still read as "already notified" rather than silently
  // inviting a second notification.
  it('falls back to a snake_case already_notified body', async () => {
    supabaseClient.functions.invoke.mockResolvedValue({
      data: { ok: true, already_notified: true },
      error: null,
    });
    const config = useNotifyCheckIntent() as unknown as IntentConfig;

    await expect(config.mutationFn({ invoiceId: 'invoice-1' })).resolves.toEqual({
      ok: true,
      alreadyNotified: true,
    });
  });

  it('unwraps a FunctionsHttpError JSON body (detail preferred over error code)', async () => {
    supabaseClient.functions.invoke.mockResolvedValue({
      data: null,
      error: {
        message: 'Edge Function returned a non-2xx status code',
        context: {
          json: vi.fn().mockResolvedValue({
            error: 'invoice_not_payable',
            detail: 'This invoice is void.',
          }),
        },
      },
    });
    const config = useNotifyCheckIntent() as unknown as IntentConfig;

    await expect(config.mutationFn({ invoiceId: 'invoice-1' })).rejects.toThrow(
      'This invoice is void.'
    );
  });

  it('falls back to the error code, then the generic message, when the body has no detail', async () => {
    supabaseClient.functions.invoke.mockResolvedValue({
      data: null,
      error: {
        message: 'transport failure',
        context: { json: vi.fn().mockResolvedValue({ error: 'invoice_not_payable' }) },
      },
    });
    const config = useNotifyCheckIntent() as unknown as IntentConfig;

    await expect(config.mutationFn({ invoiceId: 'invoice-1' })).rejects.toThrow(
      'invoice_not_payable'
    );
  });

  it('throws on a nominal-success payload carrying an error field', async () => {
    supabaseClient.functions.invoke.mockResolvedValue({
      data: { error: 'invoice_not_found', detail: 'No such invoice.' },
      error: null,
    });
    const config = useNotifyCheckIntent() as unknown as IntentConfig;

    await expect(config.mutationFn({ invoiceId: 'invoice-1' })).rejects.toThrow(
      'No such invoice.'
    );
  });
});
