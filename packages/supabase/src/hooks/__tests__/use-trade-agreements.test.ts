import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─────────────────────────────────────────────────────────────────────────────
// Mocks — the use-agreement-parts rig. useQuery/useMutation are identity
// functions, so a hook call returns its own config object and the test reads
// the key, runs the queryFn, and invokes the mutationFn and onSuccess directly.
// Everything here goes through `rpc` or `functions.invoke`; no table is read.
// ─────────────────────────────────────────────────────────────────────────────

const rpc = vi.fn();
const invoke = vi.fn();

const supabaseClient = {
  auth: { getUser: vi.fn(), getSession: vi.fn() },
  functions: { invoke },
  from: vi.fn(),
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
  mapTradeAgreement,
  tradeAgreementKeys,
  useCreateTradeAgreement,
  useSendTradeAgreement,
  useTradeAgreements,
  useVoidTradeAgreement,
  type TradeAgreementRow,
} from '../use-trade-agreements';

const row: TradeAgreementRow = {
  id: 'ta-1',
  project_id: 'project-1',
  studio_id: 'studio-1',
  source_proposal_id: 'agreement-1',
  contact_id: 'contact-1',
  contact_display_name: 'Kestrel Cabinetry',
  contact_company_name: 'Kestrel Cabinetry LLC',
  contact_email: 'shop@kestrel.example',
  trade: 'Cabinetry',
  title: 'Cabinetry & millwork',
  scope: 'Fabricate and install…',
  price_cents: 3800000,
  currency: 'USD',
  schedule: { startOn: '2026-10-01', durationDays: 21, sequencing: 'After rough-in' },
  retainage_bps: 500,
  pay_when_paid_days: 7,
  insurance_certificate_required: true,
  lien_waiver_policy: 'conditional_then_unconditional',
  flow_down_clause_key: null,
  sov_line_ids: ['cabinetryAndMillwork'],
  state: 'sent',
  sent_at: '2026-09-07T12:00:00.000Z',
  signed_at: null,
  voided_at: null,
  created_at: '2026-09-07T11:00:00.000Z',
  sub_signature: null,
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('mapTradeAgreement', () => {
  it('maps all eight essentials onto the domain shape', () => {
    const mapped = mapTradeAgreement(row);
    expect(mapped.scope).toBe('Fabricate and install…');
    expect(mapped.priceCents).toBe(3800000);
    expect(mapped.sovLineIds).toEqual(['cabinetryAndMillwork']);
    expect(mapped.schedule).toEqual({
      startOn: '2026-10-01',
      durationDays: 21,
      sequencing: 'After rough-in',
    });
    expect(mapped.retainageBps).toBe(500);
    expect(mapped.payWhenPaidDays).toBe(7);
    expect(mapped.insuranceCertificateRequired).toBe(true);
    expect(mapped.lienWaiverPolicy).toBe('conditional_then_unconditional');
    // R16 — the flow-down clause is counsel-gated and stays NULL this wave.
    expect(mapped.flowDownClauseKey).toBeNull();
  });

  it('reads an absent schedule as three open questions, not a crash', () => {
    expect(mapTradeAgreement({ ...row, schedule: null }).schedule).toEqual({
      startOn: null,
      durationDays: null,
      sequencing: null,
    });
  });
});

describe('useTradeAgreements', () => {
  it('keys on the project and reads through the RPC', async () => {
    rpc.mockResolvedValue({ data: [row], error: null });
    const config = useTradeAgreements('project-1') as any;
    expect(config.queryKey).toEqual(tradeAgreementKeys.list('project-1'));
    await expect(config.queryFn()).resolves.toEqual([mapTradeAgreement(row)]);
    expect(rpc).toHaveBeenCalledWith('list_trade_agreements', { p_project_id: 'project-1' });
  });

  it('does not run without a project', () => {
    expect((useTradeAgreements(null) as any).enabled).toBe(false);
  });
});

describe('useCreateTradeAgreement', () => {
  it('sends every essential in the payload and returns the new id', async () => {
    rpc.mockResolvedValue({ data: 'ta-2', error: null });
    const config = useCreateTradeAgreement('project-1') as any;
    const id = await config.mutationFn({
      projectId: 'project-1',
      contactId: 'contact-1',
      sourceProposalId: 'agreement-1',
      title: ' Cabinetry & millwork ',
      trade: ' Cabinetry ',
      scope: ' Fabricate and install… ',
      priceCents: 3800000,
      schedule: { startOn: '2026-10-01', durationDays: 21, sequencing: null },
      retainageBps: 500,
      payWhenPaidDays: 7,
      insuranceCertificateRequired: true,
      lienWaiverPolicy: 'conditional_then_unconditional',
      sovLineIds: ['cabinetryAndMillwork'],
    });
    expect(id).toBe('ta-2');
    const args = rpc.mock.calls[0][1] as any;
    expect(args.p_project_id).toBe('project-1');
    expect(args.p_contact_id).toBe('contact-1');
    expect(args.p_payload.title).toBe('Cabinetry & millwork');
    expect(args.p_payload.scope).toBe('Fabricate and install…');
    expect(args.p_payload.trade).toBe('Cabinetry');
    expect(args.p_payload.retainageBps).toBe(500);
    expect(args.p_payload.payWhenPaidDays).toBe(7);
    expect(args.p_payload.insuranceCertificateRequired).toBe(true);
    expect(args.p_payload.lienWaiverPolicy).toBe('conditional_then_unconditional');
    expect(args.p_payload.sovLineIds).toEqual(['cabinetryAndMillwork']);
  });
});

describe('useSendTradeAgreement', () => {
  it('goes through the edge function — the browser never mints a token', async () => {
    invoke.mockResolvedValue({ data: { recipient: 'shop@kestrel.example', emailSent: true }, error: null });
    const config = useSendTradeAgreement('project-1') as any;
    await expect(config.mutationFn('ta-1')).resolves.toEqual({
      recipient: 'shop@kestrel.example',
      emailSent: true,
    });
    expect(invoke).toHaveBeenCalledWith('trade-agreement-send', {
      body: { agreementId: 'ta-1', mode: 'send' },
    });
  });

  it('reads a missing email into a fixable sentence', async () => {
    invoke.mockResolvedValue({
      data: null,
      error: {
        context: {
          json: async () => ({ error: 'no_recipient' }),
        },
      },
    });
    const config = useSendTradeAgreement('project-1') as any;
    await expect(config.mutationFn('ta-1')).rejects.toThrow(
      'No email on file for this trade — add one to their contact and try again.'
    );
  });

  it('never surfaces the raw SDK string when there is no JSON body', async () => {
    invoke.mockResolvedValue({
      data: null,
      error: new Error('Edge Function returned a non-2xx status code'),
    });
    const config = useSendTradeAgreement('project-1') as any;
    await expect(config.mutationFn('ta-1')).rejects.toThrow(
      'The Trade Agreement could not be sent. Check the trade’s email and try again.'
    );
  });
});

describe('useVoidTradeAgreement', () => {
  it('calls the RPC with the reason and invalidates the project list', async () => {
    rpc.mockResolvedValue({ data: null, error: null });
    const config = useVoidTradeAgreement('project-1') as any;
    await config.mutationFn({ agreementId: 'ta-1', reason: ' scope changed ' });
    expect(rpc).toHaveBeenCalledWith('void_trade_agreement', {
      p_agreement_id: 'ta-1',
      p_reason: 'scope changed',
    });
    config.onSuccess();
    expect(invalidateQueries).toHaveBeenCalledWith({
      queryKey: tradeAgreementKeys.list('project-1'),
    });
  });

  it('surfaces the refusal on a signed agreement', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'a signed agreement is superseded, never voided' } });
    const config = useVoidTradeAgreement('project-1') as any;
    await expect(config.mutationFn({ agreementId: 'ta-1', reason: '' })).rejects.toEqual({
      message: 'a signed agreement is superseded, never voided',
    });
  });
});
