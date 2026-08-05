const rpc = jest.fn();
const invoke = jest.fn();
const invalidateQueries = jest.fn();
const fromMock = jest.fn();

jest.mock('@patina/supabase', () => ({
  commercialKeys: {
    all: ['commercial-documents'],
    document: (id: string) => ['commercial-documents', id],
    authority: (id: string) => ['project-authority', id],
    budget: (id: string) => ['working-budget', id],
    waves: (id: string) => ['furnishings-authorizations', id],
    instruments: (id: string) => ['furnishings-authorizations', id],
  },
  createBrowserClient: () => ({ rpc, functions: { invoke }, from: fromMock }),
}));

jest.mock('@tanstack/react-query', () => ({
  useMutation: (config: unknown) => config,
  useQuery: (config: unknown) => config,
  useQueryClient: () => ({ invalidateQueries, setQueryData: jest.fn() }),
}));

import {
  commercialDocumentKeys,
  useCreateTradeScope,
  useEngageTradeScope,
  useIssueTradeDrawInvoice,
  useMarkTradeScopeInProgress,
  useRecordSubstantialCompletion,
  useRecordTradeBid,
  useSaveTradeScopeDraft,
  useSelectTradeBid,
  useSendTradeScope,
  useSetTradeScopeParty,
  useTradeScopes,
  useVoidTradeScope,
} from '../use-commercial-documents';

type Mutation<TInput, TResult = unknown> = {
  mutationFn: (input: TInput) => Promise<TResult>;
  onSuccess?: (result: TResult, input: TInput) => unknown;
};

type Query<TResult> = {
  queryKey: readonly unknown[];
  enabled: boolean;
  queryFn: () => Promise<TResult>;
};

const invalidatedKeys = () =>
  invalidateQueries.mock.calls.map((call) => JSON.stringify(call[0]?.queryKey));

describe('designer trade scope hooks', () => {
  beforeEach(() => {
    rpc.mockReset();
    invoke.mockReset();
    invalidateQueries.mockReset();
    fromMock.mockReset();
  });

  it('keys the trade list on its own key and maps the list RPC', async () => {
    expect(commercialDocumentKeys.tradeScopes('project-1')).toEqual([
      'trade-scopes',
      'project-1',
    ]);

    rpc.mockResolvedValue({
      data: [
        {
          documentId: 'pcd-1',
          proposalId: 'proposal-1',
          number: 1,
          title: 'Drapery fabrication & install',
          state: 'executed',
          progressState: 'engaged',
          partyDisplayName: 'Atelier Marchand',
          clientPriceCents: 680_000,
          depositInvoiceId: 'invoice-1',
          depositPaid: true,
          sectionRoomIds: ['room-1'],
          draws: [],
        },
      ],
      error: null,
    });

    const query = useTradeScopes('project-1') as unknown as Query<unknown[]>;
    expect(query.queryKey).toEqual(['trade-scopes', 'project-1']);
    const scopes = await query.queryFn();

    expect(rpc).toHaveBeenCalledWith('list_trade_scopes', {
      p_project_id: 'project-1',
    });
    expect(scopes[0]).toMatchObject({
      number: 1,
      partyDisplayName: 'Atelier Marchand',
      progressState: 'engaged',
    });
  });

  it('names a scope before it can hold anything', async () => {
    rpc.mockResolvedValue({
      data: {
        proposalId: 'proposal-1',
        documentId: 'pcd-1',
        projectId: 'project-1',
      },
      error: null,
    });
    const mutation = useCreateTradeScope('project-1') as unknown as Mutation<string>;

    await expect(mutation.mutationFn(' ')).rejects.toThrow('Name this scope of work.');

    const created = await mutation.mutationFn('  Drapery fabrication  ');
    expect(rpc).toHaveBeenCalledWith('create_trade_scope', {
      p_project_id: 'project-1',
      p_title: 'Drapery fabrication',
    });
    expect(created).toEqual({
      proposalId: 'proposal-1',
      documentId: 'pcd-1',
      projectId: 'project-1',
    });
  });

  it('refuses an incomplete create receipt rather than half-opening a sheet', async () => {
    rpc.mockResolvedValue({ data: { proposalId: 'proposal-1' }, error: null });
    const mutation = useCreateTradeScope('project-1') as unknown as Mutation<string>;
    await expect(mutation.mutationFn('Drapery')).rejects.toThrow(/came back incomplete/);
  });

  it('replaces the draft body: terms, then sections, then draws', async () => {
    const calls: string[] = [];
    const chain = (table: string) => ({
      update: () => {
        calls.push(`update:${table}`);
        return { eq: async () => ({ error: null }) };
      },
      delete: () => {
        calls.push(`delete:${table}`);
        return { eq: async () => ({ error: null }) };
      },
      insert: async (rows: unknown[]) => {
        calls.push(`insert:${table}:${(rows as unknown[]).length}`);
        return { error: null };
      },
    });
    fromMock.mockImplementation((table: string) => chain(table));

    const mutation = useSaveTradeScopeDraft('project-1') as unknown as Mutation<
      Parameters<ReturnType<typeof useSaveTradeScopeDraft>['mutationFn']>[0],
      { proposalId: string }
    >;

    await (mutation.mutationFn as any)({
      proposalId: 'proposal-1',
      clientPriceCents: 680_000,
      terms: ' Prices are fixed. ',
      sections: [
        {
          projectRoomId: 'room-1',
          roomName: 'Living',
          prose: 'Five windows.',
          allocationCents: 490_000,
        },
        // An empty room is dropped rather than written as a blank section.
        {
          projectRoomId: null,
          roomName: 'Throughout',
          prose: '   ',
          allocationCents: null,
        },
      ],
      draws: [
        {
          label: 'Deposit',
          percentage: 50,
          amountCents: 340_000,
          gatesOnAcceptance: false,
        },
        {
          label: 'Final',
          percentage: 50,
          amountCents: 340_000,
          gatesOnAcceptance: true,
        },
      ],
    });

    expect(calls).toEqual([
      'update:trade_scope_terms',
      'delete:trade_scope_sections',
      'insert:trade_scope_sections:1',
      'delete:trade_scope_draws',
      'insert:trade_scope_draws:2',
    ]);
  });

  it('records a bid as a studio row, refusing a nameless or priceless one', async () => {
    const single = jest.fn().mockResolvedValue({ data: { id: 'bid-1' }, error: null });
    const insert = jest.fn().mockReturnValue({ select: () => ({ single }) });
    fromMock.mockReturnValue({ insert });

    const mutation = useRecordTradeBid('project-1') as unknown as Mutation<any>;

    await expect(
      mutation.mutationFn({
        proposalId: 'proposal-1',
        partyId: '',
        partyDisplayName: 'x',
        amountCents: 100,
      }),
    ).rejects.toThrow('Choose whose number this is.');

    await expect(
      mutation.mutationFn({
        proposalId: 'proposal-1',
        partyId: 'party-1',
        partyDisplayName: 'Atelier Marchand',
        amountCents: 0,
      }),
    ).rejects.toThrow('Record what they quoted.');

    await mutation.mutationFn({
      proposalId: 'proposal-1',
      partyId: 'party-1',
      partyDisplayName: 'Atelier Marchand',
      amountCents: 415_000,
      note: ' No install date ',
    });

    expect(fromMock).toHaveBeenCalledWith('trade_scope_bids');
    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({
        proposal_id: 'proposal-1',
        party_id: 'party-1',
        party_display_name: 'Atelier Marchand',
        amount_cents: 415_000,
        status: 'quoted',
        source: 'recorded',
        note: 'No install date',
      }),
    );
  });

  it('sets the party and selects a bid through their RPCs', async () => {
    rpc.mockResolvedValue({ data: { ok: true }, error: null });

    const setParty = useSetTradeScopeParty('project-1') as unknown as Mutation<any>;
    await setParty.mutationFn({ proposalId: 'proposal-1', partyId: 'party-1' });
    expect(rpc).toHaveBeenCalledWith('set_trade_scope_party', {
      p_proposal_id: 'proposal-1',
      p_party_id: 'party-1',
    });

    const selectBid = useSelectTradeBid('project-1') as unknown as Mutation<any>;
    await selectBid.mutationFn({ proposalId: 'proposal-1', bidId: 'bid-1' });
    expect(rpc).toHaveBeenCalledWith('select_trade_bid', { p_bid_id: 'bid-1' });
  });

  it('releases on the same send rail as a furnishings authorization, and notifies trade_scope_sent', async () => {
    rpc.mockImplementation((name: string) => {
      if (name === 'get_commercial_document_send_snapshot') {
        return Promise.resolve({
          data: { documentFingerprint: 'fingerprint-1' },
          error: null,
        });
      }
      return Promise.resolve({
        data: {
          sentAt: '2026-08-04T12:00:00Z',
          proposalSendDispatchId: 'dispatch-1',
        },
        error: null,
      });
    });
    invoke.mockImplementation((name: string) => {
      if (name === 'proposal-send') {
        return Promise.resolve({ data: { delivery_state: 'delivered' }, error: null });
      }
      // commercial-document-notify
      return Promise.resolve({ data: { ok: true }, error: null });
    });

    const mutation = useSendTradeScope('project-1') as unknown as Mutation<string>;
    const result = (await mutation.mutationFn('proposal-1')) as Record<string, unknown>;

    expect(rpc).toHaveBeenCalledWith('send_commercial_document', {
      p_proposal_id: 'proposal-1',
      p_expected_fingerprint: 'fingerprint-1',
      p_personal_message: null,
      p_valid_until: null,
    });
    expect(invoke).toHaveBeenCalledWith('proposal-send', {
      body: {
        proposalId: 'proposal-1',
        sentAt: '2026-08-04T12:00:00Z',
        dispatchId: 'dispatch-1',
      },
    });
    // The send-confirmation notify — mirrors the executed/budget_published
    // pattern: fired after the write commits, keyed on the proposal id.
    expect(invoke).toHaveBeenCalledWith('commercial-document-notify', {
      body: { documentId: 'proposal-1', transition: 'trade_scope_sent' },
    });
    expect(result._emailDispatched).toBe(true);
    expect(result.notificationDelivery).toBe('delivered');
  });

  it('keeps a committed send while reporting an unconfirmed email, and still attempts the trade_scope_sent notify', async () => {
    rpc.mockImplementation((name: string) =>
      name === 'get_commercial_document_send_snapshot'
        ? Promise.resolve({ data: { documentFingerprint: 'f-1' }, error: null })
        : Promise.resolve({
            data: { sentAt: 's', proposalSendDispatchId: 'd' },
            error: null,
          }),
    );
    invoke.mockRejectedValue(new Error('edge down'));

    const mutation = useSendTradeScope('project-1') as unknown as Mutation<string>;
    const result = (await mutation.mutationFn('proposal-1')) as Record<string, unknown>;

    expect(result._emailDispatched).toBe(false);
    expect(result._emailRetryable).toBe(true);
    expect(result.sentAt).toBe('s');
    // The transport failure on proposal-send must not throw the mutation, and
    // the notify is still attempted (and itself degrades to pending_retry
    // rather than throwing) — non-blocking on both counts.
    expect(invoke).toHaveBeenCalledWith('commercial-document-notify', {
      body: { documentId: 'proposal-1', transition: 'trade_scope_sent' },
    });
    expect(result.notificationDelivery).toBe('pending_retry');
  });

  it('engages through the RPC and moves the schedule', async () => {
    rpc.mockResolvedValue({ data: { ok: true }, error: null });
    const mutation = useEngageTradeScope('project-1') as unknown as Mutation<string>;

    await mutation.mutationFn('proposal-1');
    expect(rpc).toHaveBeenCalledWith('engage_trade_scope', {
      p_proposal_id: 'proposal-1',
    });

    await mutation.onSuccess?.(undefined, 'proposal-1');
    const keys = invalidatedKeys();
    expect(keys).toContain(JSON.stringify(['project-ffe-items', 'project-1']));
    expect(keys).toContain(JSON.stringify(['trade-scopes', 'project-1']));
    expect(keys).toContain(JSON.stringify(['trade-scope', 'proposal-1']));
    expect(keys).toContain(JSON.stringify(['working-budget', 'project-1']));
  });

  it('records the two studio progress acts', async () => {
    rpc.mockResolvedValue({ data: { ok: true }, error: null });

    const inProgress = useMarkTradeScopeInProgress(
      'project-1',
    ) as unknown as Mutation<string>;
    await inProgress.mutationFn('proposal-1');
    expect(rpc).toHaveBeenCalledWith('mark_trade_scope_in_progress', {
      p_proposal_id: 'proposal-1',
    });

    const completion = useRecordSubstantialCompletion(
      'project-1',
    ) as unknown as Mutation<string>;
    await completion.mutationFn('proposal-1');
    expect(rpc).toHaveBeenCalledWith('record_trade_scope_substantial_completion', {
      p_proposal_id: 'proposal-1',
    });
  });

  it('issues a draw by its id, notifies trade_draw_ready keyed on the draw, and refreshes the project money', async () => {
    rpc.mockResolvedValue({ data: { invoiceId: 'invoice-2' }, error: null });
    invoke.mockResolvedValue({ data: { ok: true }, error: null });
    const mutation = useIssueTradeDrawInvoice('project-1') as unknown as Mutation<any>;

    const result = (await mutation.mutationFn({
      proposalId: 'proposal-1',
      drawId: 'draw-2',
    })) as Record<string, unknown>;
    expect(rpc).toHaveBeenCalledWith('issue_trade_draw_invoice', {
      p_draw_id: 'draw-2',
    });
    // Event-scoped like budget_published's checkpointId: eventId is the draw,
    // not the proposal, so a second draw on the same scope keys separately.
    expect(invoke).toHaveBeenCalledWith('commercial-document-notify', {
      body: { documentId: 'proposal-1', transition: 'trade_draw_ready', eventId: 'draw-2' },
    });
    expect(result.notificationDelivery).toBe('delivered');
    expect(result.invoiceId).toBe('invoice-2');

    await mutation.onSuccess?.(undefined, {
      proposalId: 'proposal-1',
      drawId: 'draw-2',
    });
    expect(invalidatedKeys()).toContain(
      JSON.stringify(['trade-scope', 'proposal-1']),
    );
  });

  it('does not fail the draw issuance when the trade_draw_ready notify cannot be confirmed', async () => {
    rpc.mockResolvedValue({ data: { invoiceId: 'invoice-3' }, error: null });
    invoke.mockRejectedValue(new Error('edge down'));
    const mutation = useIssueTradeDrawInvoice('project-1') as unknown as Mutation<any>;

    const result = (await mutation.mutationFn({
      proposalId: 'proposal-1',
      drawId: 'draw-3',
    })) as Record<string, unknown>;

    expect(result.invoiceId).toBe('invoice-3');
    expect(result.notificationDelivery).toBe('pending_retry');
  });

  it('demands a real reason before voiding, then releases the schedule', async () => {
    rpc.mockResolvedValue({ data: { ok: true }, error: null });
    const mutation = useVoidTradeScope('project-1') as unknown as Mutation<any>;

    await expect(
      mutation.mutationFn({ proposalId: 'proposal-1', reason: 'no' }),
    ).rejects.toThrow(/meaningful reason/);

    await mutation.mutationFn({
      proposalId: 'proposal-1',
      reason: 'Client moved the drapery out of this phase.',
    });
    expect(rpc).toHaveBeenCalledWith('void_trade_scope', {
      p_proposal_id: 'proposal-1',
      p_reason: 'Client moved the drapery out of this phase.',
    });

    await mutation.onSuccess?.(undefined, {
      proposalId: 'proposal-1',
      reason: 'Client moved the drapery out of this phase.',
    });
    expect(invalidatedKeys()).toContain(
      JSON.stringify(['project-ffe-items', 'project-1']),
    );
  });
});
