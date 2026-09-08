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
  type TradeAgreementListItem,
} from '../use-trade-agreements';

/**
 * A literal copy of `list_trade_agreements`' own key list (00579's
 * `jsonb_build_object`), in its order. If the RPC's projection changes, this
 * array is what has to change with it — and every key in it must reach the
 * mapped shape or be accounted for below.
 */
const RPC_KEYS = [
  'id',
  'title',
  'trade',
  'contactId',
  'contactDisplayName',
  'contactCompanyName',
  'contactEmail',
  'scope',
  'priceCents',
  'currency',
  'schedule',
  'retainageBps',
  'payWhenPaidDays',
  'insuranceCertificateRequired',
  'lienWaiverPolicy',
  'sovLineIds',
  'sourceProposalId',
  'state',
  'sentAt',
  'signedAt',
  'voidedAt',
  'hasLiveLink',
  'signature',
] as const;

const item: TradeAgreementListItem = {
  id: 'ta-1',
  title: 'Cabinetry & millwork',
  trade: 'Cabinetry',
  contactId: 'contact-1',
  contactDisplayName: 'Kestrel Cabinetry',
  contactCompanyName: 'Kestrel Cabinetry LLC',
  contactEmail: 'shop@kestrel.example',
  scope: 'Fabricate and install…',
  priceCents: 3800000,
  currency: 'USD',
  schedule: { startOn: '2026-10-01', durationDays: 21, sequencing: 'After rough-in' },
  retainageBps: 500,
  payWhenPaidDays: 7,
  insuranceCertificateRequired: true,
  lienWaiverPolicy: 'conditional_then_unconditional',
  sovLineIds: ['cabinetryAndMillwork'],
  sourceProposalId: 'agreement-1',
  state: 'sent',
  sentAt: '2026-09-07T12:00:00.000Z',
  signedAt: null,
  voidedAt: null,
  hasLiveLink: true,
  signature: null,
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('mapTradeAgreement', () => {
  it('reads the camelCase DTO the RPC publishes — every key it names', () => {
    // The fixture IS the RPC's key list; a snake_case reader would leave
    // every one of these undefined and the row would render "$NaN" with no
    // acts on it.
    expect(Object.keys(item).sort()).toEqual([...RPC_KEYS].sort());

    const mapped = mapTradeAgreement(item, 'project-1');
    expect(mapped.id).toBe('ta-1');
    expect(mapped.title).toBe('Cabinetry & millwork');
    expect(mapped.trade).toBe('Cabinetry');
    expect(mapped.contactId).toBe('contact-1');
    expect(mapped.contactDisplayName).toBe('Kestrel Cabinetry');
    expect(mapped.contactCompanyName).toBe('Kestrel Cabinetry LLC');
    expect(mapped.contactEmail).toBe('shop@kestrel.example');
    expect(mapped.scope).toBe('Fabricate and install…');
    expect(mapped.priceCents).toBe(3800000);
    expect(mapped.currency).toBe('USD');
    expect(mapped.schedule).toEqual({
      startOn: '2026-10-01',
      durationDays: 21,
      sequencing: 'After rough-in',
    });
    expect(mapped.retainageBps).toBe(500);
    expect(mapped.payWhenPaidDays).toBe(7);
    expect(mapped.insuranceCertificateRequired).toBe(true);
    expect(mapped.lienWaiverPolicy).toBe('conditional_then_unconditional');
    expect(mapped.sovLineIds).toEqual(['cabinetryAndMillwork']);
    expect(mapped.sourceProposalId).toBe('agreement-1');
    expect(mapped.state).toBe('sent');
    expect(mapped.sentAt).toBe('2026-09-07T12:00:00.000Z');
    expect(mapped.signedAt).toBeNull();
    expect(mapped.voidedAt).toBeNull();
    expect(mapped.hasLiveLink).toBe(true);
    expect(mapped.subSignature).toBeNull();
    // The projection carries no project id; the caller's is the only one.
    expect(mapped.projectId).toBe('project-1');
  });

  it('carries the state and the price the row acts on', () => {
    // The two the studio-side row reads before it offers Send or Withdraw.
    const draft = mapTradeAgreement({ ...item, state: 'draft' }, 'project-1');
    expect(draft.state).toBe('draft');
    expect(Number.isNaN(draft.priceCents)).toBe(false);
  });

  it("reads the sub's receipt off `signature`", () => {
    const signed = mapTradeAgreement(
      {
        ...item,
        state: 'signed',
        signedAt: '2026-09-08T09:00:00.000Z',
        signature: { signedName: 'Dana Ruiz', signedAt: '2026-09-08T09:00:00.000Z' },
      },
      'project-1'
    );
    expect(signed.subSignature).toEqual({
      signedName: 'Dana Ruiz',
      signedAt: '2026-09-08T09:00:00.000Z',
    });
  });

  it('reads an absent schedule as three open questions, not a crash', () => {
    expect(mapTradeAgreement({ ...item, schedule: null }, 'project-1').schedule).toEqual({
      startOn: null,
      durationDays: null,
      sequencing: null,
    });
  });
});

describe('useTradeAgreements', () => {
  it('keys on the project and reads through the RPC', async () => {
    rpc.mockResolvedValue({ data: [item], error: null });
    const config = useTradeAgreements('project-1') as any;
    expect(config.queryKey).toEqual(tradeAgreementKeys.list('project-1'));
    await expect(config.queryFn()).resolves.toEqual([
      mapTradeAgreement(item, 'project-1'),
    ]);
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

  /* W3R2-09 — the studio is told what happened, and never told the name of an
     environment variable. The walk watched `RESEND_API_KEY environment
     variable is required` print into the composer under a row that had already
     reached `sent`: the paper WAS recorded, only the letter did not go. */
  it('maps a dispatch failure to a studio sentence, and prints no provider detail', async () => {
    invoke.mockResolvedValue({
      data: null,
      error: {
        context: {
          json: async () => ({
            error: 'send_failed',
            detail: 'RESEND_API_KEY environment variable is required',
          }),
        },
      },
    });
    const config = useSendTradeAgreement('project-1') as any;
    await expect(config.mutationFn('ta-1')).rejects.toThrow(
      'The agreement is recorded. The message could not be sent. Try again.',
    );
    await expect(config.mutationFn('ta-1')).rejects.not.toThrow(
      /RESEND_API_KEY/,
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
