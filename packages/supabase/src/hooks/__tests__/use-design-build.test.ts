import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─────────────────────────────────────────────────────────────────────────────
// Mocks — the use-agreement-parts rig. useQuery/useMutation are identity
// functions, so a hook call returns its own config object and the test reads
// the key, runs the queryFn, and invokes the mutationFn and onSuccess directly.
//
// Two read shapes: `.select().eq().order()` for the draw ledger and
// `.select().order()` for the notices. One write shape:
// `.insert().select().single()`.
// ─────────────────────────────────────────────────────────────────────────────

const orderAfterEq = vi.fn();
const eq = vi.fn(() => ({ order: orderAfterEq }));
const orderDirect = vi.fn();
const select = vi.fn(() => ({ eq, order: orderDirect }));
const single = vi.fn();
const selectAfterInsert = vi.fn(() => ({ single }));
const insert = vi.fn(() => ({ select: selectAfterInsert }));
const from = vi.fn(() => ({ select, insert }));
const rpc = vi.fn();

const supabaseClient = {
  auth: { getUser: vi.fn(), getSession: vi.fn() },
  functions: { invoke: vi.fn() },
  from,
  rpc,
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
  designBuildKeys,
  mapAgreementDraw,
  useAgreementDraws,
  useAgreementJurisdictionNotices,
  useIssueAgreementDrawInvoice,
  useRecordAgreementDrawLienWaiver,
  type AgreementDrawRow,
} from '../use-design-build';

const drawRow: AgreementDrawRow = {
  id: 'draw-2',
  proposal_id: 'agreement-1',
  draw_key: 'rough_in',
  sort_order: 2,
  label: 'Rough-in',
  gross_cents: 2524020,
  retainage_cents: 126201,
  net_cents: 2397819,
  is_retainage_release: false,
  invoice_id: 'invoice-2',
  issued_at: '2026-09-07T12:00:00.000Z',
  created_at: null,
  updated_at: null,
  invoices: { id: 'invoice-2', status: 'sent' },
  agreement_draw_lien_waivers: [
    {
      id: 'waiver-1',
      draw_id: 'draw-2',
      contact_id: 'contact-1',
      contact_display_name: 'Kestrel Cabinetry',
      waiver_type: 'conditional_progress',
      through_date: '2026-09-30',
      amount_cents: 2397819,
      storage_path: null,
      received_at: '2026-09-07T13:00:00.000Z',
      recorded_by: 'designer-1',
      created_at: null,
    },
  ],
};

beforeEach(() => {
  vi.clearAllMocks();
  eq.mockReturnValue({ order: orderAfterEq });
  select.mockReturnValue({ eq, order: orderDirect });
  selectAfterInsert.mockReturnValue({ single });
  insert.mockReturnValue({ select: selectAfterInsert });
  from.mockReturnValue({ select, insert });
});

describe('mapAgreementDraw', () => {
  it('carries the invoice status and the waivers onto the domain shape', () => {
    expect(mapAgreementDraw(drawRow)).toEqual({
      id: 'draw-2',
      proposalId: 'agreement-1',
      drawKey: 'rough_in',
      sortOrder: 2,
      label: 'Rough-in',
      grossCents: 2524020,
      retainageCents: 126201,
      netCents: 2397819,
      isRetainageRelease: false,
      invoiceId: 'invoice-2',
      invoiceStatus: 'sent',
      issuedAt: '2026-09-07T12:00:00.000Z',
      lienWaivers: [
        {
          id: 'waiver-1',
          drawId: 'draw-2',
          contactId: 'contact-1',
          contactDisplayName: 'Kestrel Cabinetry',
          waiverType: 'conditional_progress',
          throughDate: '2026-09-30',
          amountCents: 2397819,
          storagePath: null,
          receivedAt: '2026-09-07T13:00:00.000Z',
        },
      ],
    });
  });

  it('reads an unbilled, unwaived draw as null status and no waivers', () => {
    const bare = { ...drawRow, invoice_id: null, invoices: null, agreement_draw_lien_waivers: null };
    const mapped = mapAgreementDraw(bare);
    expect(mapped.invoiceId).toBeNull();
    expect(mapped.invoiceStatus).toBeNull();
    expect(mapped.lienWaivers).toEqual([]);
  });
});

describe('useAgreementDraws', () => {
  it('keys on the agreement and reads the ledger in schedule order', async () => {
    orderAfterEq.mockResolvedValue({ data: [drawRow], error: null });
    const config = useAgreementDraws('agreement-1') as any;
    expect(config.queryKey).toEqual(designBuildKeys.draws('agreement-1'));
    await expect(config.queryFn()).resolves.toEqual([mapAgreementDraw(drawRow)]);
    expect(from).toHaveBeenCalledWith('agreement_draw_invoices');
    expect(eq).toHaveBeenCalledWith('proposal_id', 'agreement-1');
    expect(orderAfterEq).toHaveBeenCalledWith('sort_order', { ascending: true });
  });

  it('does not run without an agreement', () => {
    expect((useAgreementDraws(null) as any).enabled).toBe(false);
  });
});

describe('useAgreementJurisdictionNotices', () => {
  it('answers only the notices counsel has cleared (R11)', async () => {
    orderDirect.mockResolvedValue({
      data: [
        { state: 'WI', kind: 'cancellation_notice', title: 'a', body: 'b', citation: 'c', enabled: false },
        { state: 'MN', kind: 'cancellation_notice', title: 'd', body: 'e', citation: 'f', enabled: true },
      ],
      error: null,
    });
    const config = useAgreementJurisdictionNotices() as any;
    const notices = await config.queryFn();
    expect(notices.map((n: { state: string }) => n.state)).toEqual(['MN']);
  });

  it('answers empty — never attachable — when the read fails', async () => {
    orderDirect.mockResolvedValue({ data: null, error: { message: 'relation does not exist' } });
    const config = useAgreementJurisdictionNotices() as any;
    await expect(config.queryFn()).resolves.toEqual([]);
  });
});

describe('useIssueAgreementDrawInvoice', () => {
  it('calls the RPC with the agreement and the draw key', async () => {
    rpc.mockResolvedValue({
      data: {
        drawKey: 'deposit',
        label: 'Deposit at signing',
        amountCents: 841340,
        retainageCents: 0,
        netCents: 841340,
        invoiceId: 'invoice-1',
        invoiceStatus: 'sent',
        payToken: 'abc',
      },
      error: null,
    });
    const config = useIssueAgreementDrawInvoice('agreement-1') as any;
    const result = await config.mutationFn('deposit');
    expect(rpc).toHaveBeenCalledWith('issue_agreement_draw_invoice', {
      p_proposal_id: 'agreement-1',
      p_draw_key: 'deposit',
    });
    expect(result.payToken).toBe('abc');
  });

  it('surfaces the refusal rather than returning a half-billed draw', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'draw 1 is not paid in full' } });
    const config = useIssueAgreementDrawInvoice('agreement-1') as any;
    await expect(config.mutationFn('rough_in')).rejects.toEqual({
      message: 'draw 1 is not paid in full',
    });
  });

  it('invalidates the ledger and the invoice list it just moved', () => {
    const config = useIssueAgreementDrawInvoice('agreement-1') as any;
    config.onSuccess();
    expect(invalidateQueries).toHaveBeenCalledWith({
      queryKey: designBuildKeys.draws('agreement-1'),
    });
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ['invoices'] });
  });
});

describe('useRecordAgreementDrawLienWaiver', () => {
  it('snapshots the trade’s name onto the record', async () => {
    single.mockResolvedValue({ data: drawRow.agreement_draw_lien_waivers![0], error: null });
    const config = useRecordAgreementDrawLienWaiver('agreement-1') as any;
    await config.mutationFn({
      drawId: 'draw-2',
      contactId: 'contact-1',
      contactDisplayName: '  Kestrel Cabinetry  ',
      waiverType: 'conditional_progress',
      throughDate: '2026-09-30',
      amountCents: 2397819,
      storagePath: null,
      receivedAt: '2026-09-07T13:00:00.000Z',
      recordedBy: 'designer-1',
    });
    expect(from).toHaveBeenCalledWith('agreement_draw_lien_waivers');
    const payload = insert.mock.calls[0][0] as any;
    expect(payload.contact_display_name).toBe('Kestrel Cabinetry');
    expect(payload.recorded_by).toBe('designer-1');
    expect(payload.waiver_type).toBe('conditional_progress');
  });
});
