import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { CommercialDeclineDialog, CommercialDocumentShell } from '../commercial-document-shell';
import { useDeclineCommercialDocument } from '@/hooks/use-commercial-client';
import { adaptCommercialDocumentBundle, type CommercialDocumentBundle } from '@/lib/commercial-documents';

jest.mock('@/hooks/use-commercial-client', () => ({
  useDeclineCommercialDocument: jest.fn(),
}));

const mockUseDeclineCommercialDocument = useDeclineCommercialDocument as jest.Mock;

function bundle(overrides: Partial<CommercialDocumentBundle> = {}): CommercialDocumentBundle {
  return {
    document: {
      id: 'ds-1', projectId: null, kind: 'design_services', state: 'sent',
      title: 'Whitfield design services', version: 1, waveName: null, sentAt: null,
      executedAt: null, supersededAt: null, replacementProposalId: null,
      documentFingerprint: 'fingerprint-1',
      totalAmountCents: 0, depositPercent: 0,
    },
    serviceTerms: {
      scope: 'Concept and design development', deliverables: ['Concept package'],
      exclusions: ['Furnishings'], billingCeilingCents: 1_800_000,
      retainerAmountCents: 300_000, retainerActivationPolicy: 'retainer_paid',
      billingCadence: 'monthly', currency: 'USD', terms: 'Actual time billed monthly.',
      currentRateVersion: 1,
    },
    rates: [{ id: 'r1', version: 1, roleName: 'Principal designer', hourlyRateCents: 22_500, effectiveAt: '2026-08-01' }],
    signatures: [], furnishings: null, tradeScope: null, ...overrides,
  };
}

/**
 * An executed furnishings authorization over two rooms. Deliberately includes
 * an allowance (Room rug) whose 200,000 ceiling does not divide evenly by its
 * quantity, so `quantity × clientUnitPriceCents` (199,998) and
 * `clientLineTotalCents` (200,000) disagree — the case that decides which one
 * the document is allowed to print. Σ clientLineTotalCents = 2,000,000 =
 * document.totalAmountCents, the invariant the terms strip rests on.
 */
function furnishingsBundle(): CommercialDocumentBundle {
  const base = bundle();
  return {
    ...base,
    document: {
      ...base.document,
      kind: 'furnishings_authorization',
      state: 'executed',
      projectId: 'p1',
      waveName: 'Living floor',
      totalAmountCents: 2_000_000,
      depositPercent: 50,
    },
    serviceTerms: null,
    furnishings: {
      checkpointId: 'b3',
      depositRequiredCents: 1_000_000,
      depositPaidCents: 250_000,
      items: [
        {
          description: 'Meadow linen sectional', roomName: 'Living room', quantity: 1,
          clientUnitPriceCents: 1_480_000, clientLineTotalCents: 1_480_000, currency: 'USD',
        },
        {
          description: 'Room rug', roomName: 'Living room', quantity: 3,
          clientUnitPriceCents: 66_666, clientLineTotalCents: 200_000, currency: 'USD',
        },
        {
          description: 'Writing desk', roomName: 'Study', quantity: 1,
          clientUnitPriceCents: 320_000, clientLineTotalCents: 320_000, currency: 'USD',
        },
      ],
    },
  };
}

/** An executed trade scope: two sections, three draws (deposit, midpoint, final-on-acceptance). */
function tradeScopeBundle(): CommercialDocumentBundle {
  const base = bundle();
  return {
    ...base,
    document: {
      ...base.document,
      kind: 'trade_scope',
      state: 'executed',
      projectId: 'p1',
      title: 'Whitfield tile work',
      totalAmountCents: 0,
      depositPercent: 0,
    },
    serviceTerms: null,
    tradeScope: {
      party: { displayName: 'Marcus Hale', company: 'Hale Tile & Stone', trade: 'tile' },
      clientPriceCents: 1_200_000,
      currency: 'USD',
      sections: [
        { roomName: 'Primary bath', prose: 'Strip and reset the shower floor in honed marble.', allocationCents: 700_000, sortOrder: 0 },
        { roomName: 'Powder room', prose: 'Reset the entry hex tile to match the original pattern.', allocationCents: 500_000, sortOrder: 1 },
      ],
      draws: [
        { id: 'draw-1', label: 'Deposit', percentage: 25, amountCents: 300_000, sortOrder: 0, gatesOnAcceptance: false, invoiceId: 'inv-1', invoiceStatus: 'paid', invoicePaidCents: 300_000 },
        { id: 'draw-2', label: 'Midpoint', percentage: 40, amountCents: 480_000, sortOrder: 1, gatesOnAcceptance: false, invoiceId: null, invoiceStatus: null, invoicePaidCents: 0 },
        { id: 'draw-3', label: 'Final', percentage: 30, amountCents: 360_000, sortOrder: 2, gatesOnAcceptance: true, invoiceId: null, invoiceStatus: null, invoicePaidCents: 0 },
      ],
      progress: {
        state: 'in_progress', engagedAt: '2026-07-01T00:00:00Z',
        substantialCompletionAt: null, acceptedAt: null, acceptedSignedName: null,
        acceptedOnPaper: false, acceptanceScanDocumentId: null,
      },
      depositInvoiceId: 'inv-1',
    },
  };
}

describe('CommercialDocumentShell', () => {
  it('renders signed design terms, rates, ceiling, retainer, and the separate-purchase boundary', () => {
    render(<CommercialDocumentShell bundle={bundle()} />);
    expect(screen.getByText('Concept and design development')).toBeInTheDocument();
    expect(screen.getByText('$225 / hr')).toBeInTheDocument();
    expect(screen.getByText('$18,000')).toBeInTheDocument();
    expect(screen.getByText('$3,000')).toBeInTheDocument();
    expect(screen.getByText(/require a separate named furnishings authorization/i)).toBeInTheDocument();
  });

  /**
   * The surface the client actually reads. Nothing blocks a send with the
   * ceiling or retainer untouched, and both default to 0 — so an unwritten
   * figure would arrive here formatted as a real authorized amount ("$0"), on
   * the one audience that has no way to know it was never set.
   */
  it('names an unset ceiling and retainer instead of printing $0 at the client', () => {
    render(<CommercialDocumentShell bundle={bundle({
      serviceTerms: {
        ...bundle().serviceTerms!,
        billingCeilingCents: 0,
        retainerAmountCents: 0,
        retainerActivationPolicy: 'immediate',
      },
    })} />);
    expect(screen.getAllByText('Not yet set')).toHaveLength(2);
    expect(screen.queryByText('$0')).not.toBeInTheDocument();
    // The activation clause describes a retainer that does not exist yet.
    expect(
      screen.queryByText(/Due under the terms of the fully executed agreement/i),
    ).not.toBeInTheDocument();
  });

  it('still prints a real, positive ceiling and retainer as currency', () => {
    render(<CommercialDocumentShell bundle={bundle()} />);
    expect(screen.getByText('$18,000')).toBeInTheDocument();
    expect(screen.getByText('$3,000')).toBeInTheDocument();
    expect(screen.queryByText('Not yet set')).not.toBeInTheDocument();
    expect(
      screen.getByText(/Design work begins after the fully executed agreement and retainer payment/i),
    ).toBeInTheDocument();
  });

  it('states that a client-signed agreement is still awaiting studio countersignature', () => {
    render(<CommercialDocumentShell bundle={bundle({
      document: { ...bundle().document, state: 'client_signed' },
      signatures: [{
        party: 'client', signerName: 'Sarah Whitfield', signedAt: '2026-08-02', consentVersion: 'v1',
        documentFingerprint: 'f1', signedOnPaper: false, paperSignedOn: null,
        paperScanDocumentId: null,
      }],
    })} />);
    expect(screen.getByText(/awaiting the studio countersignature and is not yet effective/i)).toBeInTheDocument();
    expect(screen.getByText(/awaiting countersignature/i)).toBeInTheDocument();
  });

  it('states that a paper client signature is still awaiting studio countersignature, in paper-aware copy', () => {
    render(<CommercialDocumentShell bundle={bundle({
      document: { ...bundle().document, state: 'client_signed' },
      signatures: [{
        party: 'client', signerName: 'Sarah Whitfield', signedAt: '2026-08-05T14:20:00Z', consentVersion: 'v1',
        documentFingerprint: 'f1', signedOnPaper: true, paperSignedOn: '2026-01-15',
        paperScanDocumentId: null,
      }],
    })} />);
    expect(
      screen.getByText(/studio recorded your signed paper original/i),
    ).toBeInTheDocument();
    expect(screen.getByText(/on paper/i)).toBeInTheDocument();
  });

  /**
   * The defect this fixture exists for: the studio typed the record up on
   * 5 August; the client signed the printed copy on 15 January. The client's
   * own copy has to say January, because that is when they signed. The record
   * moment is real and stays on the page — demoted, and labelled as what it is.
   */
  it('prints the day on the paper as the signing date, and demotes the day it was recorded', () => {
    render(<CommercialDocumentShell bundle={bundle({
      document: { ...bundle().document, state: 'client_signed' },
      signatures: [{
        party: 'client', signerName: 'Sarah Whitfield', signedAt: '2026-08-05T14:20:00Z', consentVersion: 'v1',
        documentFingerprint: 'f1', signedOnPaper: true, paperSignedOn: '2026-01-15',
        paperScanDocumentId: null,
      }],
    })} />);
    expect(screen.getByText(/^Signed January 15, 2026 · on paper$/)).toBeInTheDocument();
    expect(screen.getByText(/^recorded August 5, 2026$/)).toBeInTheDocument();
    // And never the record date dressed up as the signature date.
    expect(screen.queryByText(/^Signed August 5, 2026/)).not.toBeInTheDocument();
  });

  it('leaves a portal signature with the one date it has, unlabelled and undemoted', () => {
    render(<CommercialDocumentShell bundle={bundle({
      document: { ...bundle().document, state: 'client_signed' },
      signatures: [{
        party: 'client', signerName: 'Sarah Whitfield', signedAt: '2026-08-05T14:20:00Z', consentVersion: 'v1',
        documentFingerprint: 'f1', signedOnPaper: false, paperSignedOn: null,
        paperScanDocumentId: null,
      }],
    })} />);
    expect(screen.getByText(/^Signed August 5, 2026$/)).toBeInTheDocument();
    expect(screen.queryByText(/recorded /)).not.toBeInTheDocument();
    expect(screen.queryByText(/on paper/i)).not.toBeInTheDocument();
  });

  it('states a fully executed document was signed on paper, and links the signed original when a scan is attached', () => {
    render(<CommercialDocumentShell bundle={bundle({
      document: { ...bundle().document, state: 'executed', executedAt: '2026-08-03T00:00:00Z' },
      signatures: [
        {
          party: 'client', signerName: 'Sarah Whitfield', signedAt: '2026-08-05T14:20:00Z', consentVersion: 'v1',
          documentFingerprint: 'f1', signedOnPaper: true, paperSignedOn: '2026-01-15',
          paperScanDocumentId: 'doc-scan-1',
        },
        {
          party: 'studio', signerName: 'Morgan Designer', signedAt: '2026-08-03', consentVersion: 'v1',
          documentFingerprint: 'f2', signedOnPaper: false, paperSignedOn: null,
          paperScanDocumentId: null,
        },
      ],
    })} />);
    expect(screen.getByText(/^Fully executed/)).toHaveTextContent(
      'Signed on paper · recorded by the studio.',
    );
    expect(
      screen.getByRole('button', { name: /view the signed original/i }),
    ).toBeInTheDocument();
  });

  it('renders a named FF&E authorization and deposit handoff without reopening design services', () => {
    render(<CommercialDocumentShell bundle={furnishingsBundle()} />);
    expect(screen.getByText('Living floor')).toBeInTheDocument();
    expect(screen.getByText('Meadow linen sectional')).toBeInTheDocument();
    expect(screen.getByText(/\$7,500 remains due/i)).toBeInTheDocument();
    expect(screen.getByText(/does not alter the design-services agreement/i)).toBeInTheDocument();
  });

  // The document a client signs is read alongside the rooms it furnishes. A
  // flat list asks them to work out for themselves which pieces are the study.
  it('files the named lines under room headings, in the order the RPC sent them', () => {
    render(<CommercialDocumentShell bundle={furnishingsBundle()} />);
    const headings = screen.getAllByTestId('authorization-room-heading').map((h) => h.textContent);
    expect(headings).toEqual(['Living room', 'Study']);

    const groups = screen.getAllByTestId('authorization-room-group');
    expect(groups).toHaveLength(2);
    expect(groups[0]).toHaveTextContent('Meadow linen sectional');
    expect(groups[0]).toHaveTextContent('Room rug');
    expect(groups[1]).toHaveTextContent('Writing desk');
    expect(groups[1]).not.toHaveTextContent('Meadow linen sectional');
  });

  it('states the terms — total, deposit, percent — under the named lines', () => {
    render(<CommercialDocumentShell bundle={furnishingsBundle()} />);
    expect(screen.getByTestId('authorization-terms-strip')).toHaveTextContent(
      'Total $20,000 · Deposit $10,000 (50%) on signature',
    );
  });

  it('omits the terms strip when the instrument asks for no deposit', () => {
    const base = furnishingsBundle();
    render(<CommercialDocumentShell bundle={{
      ...base,
      document: { ...base.document, depositPercent: 0 },
      furnishings: { ...base.furnishings!, depositRequiredCents: 0, depositPaidCents: 0 },
    }} />);
    expect(screen.queryByTestId('authorization-terms-strip')).not.toBeInTheDocument();
  });

  // An allowance is snapshotted at its ceiling, and its unit price is that
  // ceiling divided by quantity with integer truncation — so quantity × unit
  // understates it. The line total is the authoritative figure and is what
  // reconciles to the document's own total.
  it('prices each line from its line total, not quantity × unit price', () => {
    render(<CommercialDocumentShell bundle={furnishingsBundle()} />);
    // Room rug: 3 × 66,666 = 199,998 ≠ the 200,000 ceiling actually signed.
    expect(screen.getByText('$2,000')).toBeInTheDocument();
    expect(screen.queryByText('$1,999')).not.toBeInTheDocument();
    expect(screen.getByText('Authorized furnishings').parentElement).toHaveTextContent('$20,000');
  });

  it('files a line with no room under a General heading rather than dropping it', () => {
    const base = furnishingsBundle();
    render(<CommercialDocumentShell bundle={{
      ...base,
      furnishings: {
        ...base.furnishings!,
        items: [{ ...base.furnishings!.items[0], roomName: '' }],
      },
    }} />);
    expect(screen.getByTestId('authorization-room-heading')).toHaveTextContent('General');
    expect(screen.getByText('Meadow linen sectional')).toBeInTheDocument();
  });

  it('labels a trade scope, states who performs it, and never shows a countersignature wait', () => {
    render(<CommercialDocumentShell bundle={tradeScopeBundle()} />);
    expect(screen.getByText('Trade scope')).toBeInTheDocument();
    expect(screen.getByTestId('trade-scope-party')).toHaveTextContent('Performed by Marcus Hale, tile · Hale Tile & Stone');
    expect(screen.queryByText(/awaiting countersignature/i)).not.toBeInTheDocument();
  });

  // The blocker this fences end-to-end: the adapter used to read a nested
  // `tradeScope.party` object the RPC never sends, so the signed document
  // silently rendered "Performed by " with no name. This drives a payload
  // shaped EXACTLY like get_client_commercial_document_bundle's tradeScope
  // arm (flat partyDisplayName/partyCompanyName/partyTrade, 00423) through
  // the real adapter before the shell ever sees it — not a hand-typed
  // TradeScopeAuthorization — so the producer/consumer seam is proven, not
  // just each half in isolation.
  it('names the performing party when driven from the real RPC shape (flat party keys), not a hand-typed fixture', () => {
    const rawBundle = {
      document: {
        id: 'trade-4',
        projectId: 'p1',
        documentKind: 'trade_scope',
        commercialState: 'executed',
        title: 'Whitfield tile work',
      },
      tradeScope: {
        documentId: 'pcd-4',
        partyDisplayName: 'Marcus Hale',
        partyCompanyName: 'Hale Tile & Stone',
        partyTrade: 'tile',
        clientPriceCents: 1_200_000,
        currency: 'USD',
        sections: [
          { id: 'sec-1', roomId: 'room-1', roomName: 'Primary bath', prose: 'Strip and reset the shower floor.', allocationCents: 1_200_000, sortOrder: 0 },
        ],
        draws: [
          { id: 'draw-1', label: 'Deposit', percentage: 100, amountCents: 1_200_000, sortOrder: 0, gatesOnAcceptance: false, invoiceId: null, invoiceStatus: null, invoicePaidCents: 0 },
        ],
        progress: { state: 'in_progress', engagedAt: '2026-07-01T00:00:00Z', substantialCompletionAt: null, acceptedAt: null, acceptedSignedName: null },
      },
    };
    const adapted = adaptCommercialDocumentBundle(rawBundle);
    expect(adapted).not.toBeNull();

    render(<CommercialDocumentShell bundle={adapted!} />);
    expect(screen.getByTestId('trade-scope-party')).toHaveTextContent(
      'Performed by Marcus Hale, tile · Hale Tile & Stone',
    );
  });

  it('renders each section under its own room heading with the exact priced prose', () => {
    render(<CommercialDocumentShell bundle={tradeScopeBundle()} />);
    const headings = screen.getAllByTestId('trade-scope-section-heading').map((h) => h.textContent);
    expect(headings).toEqual(['Primary bath', 'Powder room']);
    expect(screen.getByText('Strip and reset the shower floor in honed marble.')).toBeInTheDocument();
    expect(screen.getByText('Reset the entry hex tile to match the original pattern.')).toBeInTheDocument();
  });

  it('states the scope total, the deposit (draw one), and the on-acceptance figure (final draw)', () => {
    render(<CommercialDocumentShell bundle={tradeScopeBundle()} />);
    const figures = screen.getByTestId('trade-scope-figures');
    expect(figures).toHaveTextContent('Scope total');
    expect(figures).toHaveTextContent('$12,000');
    expect(figures).toHaveTextContent('Deposit');
    expect(figures).toHaveTextContent('$3,000');
    expect(figures).toHaveTextContent('On acceptance');
    // Final draw amount appears exactly twice: once in the figures strip,
    // once again in the draw schedule below it.
    expect(screen.getAllByText('$3,600')).toHaveLength(2);
  });

  it('lists every draw in the schedule and marks the one due on acceptance', () => {
    render(<CommercialDocumentShell bundle={tradeScopeBundle()} />);
    expect(screen.getByText('Midpoint')).toBeInTheDocument();
    expect(screen.getByText('$4,800')).toBeInTheDocument();
    expect(screen.getByText('Due on acceptance')).toBeInTheDocument();
  });

  it('never renders a bid ledger on a trade scope', () => {
    render(<CommercialDocumentShell bundle={tradeScopeBundle()} />);
    expect(screen.queryByText(/bid/i)).not.toBeInTheDocument();
  });

  it('renders no acceptance section before the client has accepted', () => {
    render(<CommercialDocumentShell bundle={tradeScopeBundle()} />);
    expect(screen.queryByTestId('trade-scope-acceptance')).not.toBeInTheDocument();
  });

  it('states who accepted the finished work and when, once accepted online', () => {
    const base = tradeScopeBundle();
    render(<CommercialDocumentShell bundle={{
      ...base,
      tradeScope: {
        ...base.tradeScope!,
        progress: {
          ...base.tradeScope!.progress,
          state: 'accepted',
          acceptedAt: '2026-08-01T00:00:00Z',
          acceptedSignedName: 'Sarah Whitfield',
        },
      },
    }} />);
    const acceptance = screen.getByTestId('trade-scope-acceptance');
    expect(acceptance).toHaveTextContent(/^AcceptanceAccepted by Sarah Whitfield on .+, 2026\.$/);
    expect(acceptance).not.toHaveTextContent('Recorded by your studio');
  });

  it('states a paper-recorded acceptance was recorded by the studio, and links the signed original when a scan is attached', () => {
    const base = tradeScopeBundle();
    render(<CommercialDocumentShell bundle={{
      ...base,
      tradeScope: {
        ...base.tradeScope!,
        progress: {
          ...base.tradeScope!.progress,
          state: 'accepted',
          acceptedAt: '2026-08-01T00:00:00Z',
          acceptedSignedName: 'Sarah Whitfield',
          acceptedOnPaper: true,
          acceptanceScanDocumentId: 'scan-doc-9',
        },
      },
    }} />);
    const acceptance = screen.getByTestId('trade-scope-acceptance');
    expect(acceptance).toHaveTextContent(
      /^AcceptanceAccepted by Sarah Whitfield on .+, 2026\. Recorded by your studio from a signed paper original\./,
    );
    expect(
      screen.getByRole('button', { name: /view the signed original/i }),
    ).toBeInTheDocument();
  });

  it('states a paper-recorded acceptance without a scan link when no scan was attached', () => {
    const base = tradeScopeBundle();
    render(<CommercialDocumentShell bundle={{
      ...base,
      tradeScope: {
        ...base.tradeScope!,
        progress: {
          ...base.tradeScope!.progress,
          state: 'accepted',
          acceptedAt: '2026-08-01T00:00:00Z',
          acceptedSignedName: 'Sarah Whitfield',
          acceptedOnPaper: true,
          acceptanceScanDocumentId: null,
        },
      },
    }} />);
    expect(screen.getByTestId('trade-scope-acceptance')).toHaveTextContent('Recorded by your studio');
    expect(
      screen.queryByRole('button', { name: /view the signed original/i }),
    ).not.toBeInTheDocument();
  });

  /**
   * The off-by-one, pinned. A paper acceptance stores the day as midnight UTC
   * (00425: `accepted_at = p_paper_signed_on::timestamptz`), so every reader
   * west of UTC used to print the day before — a client in Los Angeles told
   * their February 10 acceptance happened on February 9.
   */
  describe('west of UTC', () => {
    const originalTz = process.env.TZ;
    beforeEach(() => {
      process.env.TZ = 'America/Los_Angeles';
    });
    afterEach(() => {
      process.env.TZ = originalTz;
    });

    it('prints a paper acceptance on the day it was accepted, not the day before', () => {
      const base = tradeScopeBundle();
      render(<CommercialDocumentShell bundle={{
        ...base,
        tradeScope: {
          ...base.tradeScope!,
          progress: {
            ...base.tradeScope!.progress,
            state: 'accepted',
            acceptedAt: '2026-02-10T00:00:00Z',
            acceptedSignedName: 'Sarah Whitfield',
            acceptedOnPaper: true,
            acceptanceScanDocumentId: null,
          },
        },
      }} />);
      expect(screen.getByTestId('trade-scope-acceptance')).toHaveTextContent(
        'Accepted by Sarah Whitfield on February 10, 2026.',
      );
      expect(screen.getByTestId('trade-scope-acceptance')).not.toHaveTextContent('February 9');
    });

    it('prints a paper signature on the day it was signed, not the day before', () => {
      render(<CommercialDocumentShell bundle={bundle({
        document: { ...bundle().document, state: 'client_signed' },
        signatures: [{
          party: 'client', signerName: 'Sarah Whitfield', signedAt: '2026-08-05T14:20:00Z',
          consentVersion: 'v1', documentFingerprint: 'f1', signedOnPaper: true,
          paperSignedOn: '2026-02-10', paperScanDocumentId: null,
        }],
      })} />);
      expect(screen.getByText(/^Signed February 10, 2026 · on paper$/)).toBeInTheDocument();
    });
  });

  it('guides superseded documents to their replacement', () => {
    render(<CommercialDocumentShell bundle={bundle({
      document: { ...bundle().document, state: 'superseded', replacementProposalId: 'ds-2' },
    })} />);
    expect(screen.getByRole('link', { name: /open the current edition/i })).toHaveAttribute('href', '/proposals/ds-2');
  });

  it('states a declined document was withdrawn, in brand voice, without an alarm treatment', () => {
    render(<CommercialDocumentShell bundle={bundle({
      document: { ...bundle().document, state: 'declined' },
    })} />);
    expect(
      screen.getByText('This document was withdrawn and no longer asks anything of you.'),
    ).toBeInTheDocument();
  });

  it('states a superseded document was withdrawn, in the same brand-voice phrase as declined', () => {
    render(<CommercialDocumentShell bundle={bundle({
      document: { ...bundle().document, state: 'superseded', replacementProposalId: null },
    })} />);
    expect(
      screen.getByText(/^This document was withdrawn and no longer asks anything of you\./),
    ).toBeInTheDocument();
    expect(screen.getByText(/Ask your studio for the current edition/)).toBeInTheDocument();
  });
});

describe('CommercialDeclineDialog', () => {
  beforeEach(() => {
    mockUseDeclineCommercialDocument.mockReturnValue({
      mutateAsync: jest.fn().mockResolvedValue({ ok: true }),
      isPending: false,
    });
  });

  it('wires the reason field and confirm action to useDeclineCommercialDocument for this proposal/project', async () => {
    const mutateAsync = jest.fn().mockResolvedValue({ ok: true });
    mockUseDeclineCommercialDocument.mockReturnValue({ mutateAsync, isPending: false });
    const onOpenChange = jest.fn();
    const onDeclined = jest.fn();

    render(
      <CommercialDeclineDialog
        proposalId="ds-1"
        projectId="project-1"
        open
        onOpenChange={onOpenChange}
        onDeclined={onDeclined}
      />,
    );

    expect(useDeclineCommercialDocument).toHaveBeenCalledWith('ds-1', 'project-1');

    fireEvent.change(screen.getByTestId('commercial-decline-reason'), {
      target: { value: 'Going a different direction' },
    });
    fireEvent.click(screen.getByTestId('commercial-decline-confirm'));

    await waitFor(() => expect(mutateAsync).toHaveBeenCalledWith('Going a different direction'));
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
    expect(onDeclined).toHaveBeenCalled();
  });

  it('surfaces the mutation error instead of closing the dialog', async () => {
    const mutateAsync = jest.fn().mockRejectedValue(new Error('not_found'));
    mockUseDeclineCommercialDocument.mockReturnValue({ mutateAsync, isPending: false });
    const onOpenChange = jest.fn();

    render(
      <CommercialDeclineDialog proposalId="ds-1" projectId="project-1" open onOpenChange={onOpenChange} />,
    );

    fireEvent.click(screen.getByTestId('commercial-decline-confirm'));

    expect(await screen.findByRole('alert')).toHaveTextContent('not_found');
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
  });
});
