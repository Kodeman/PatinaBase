import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { CommercialDeclineDialog, CommercialDocumentShell } from '../commercial-document-shell';
import { useDeclineCommercialDocument } from '@/hooks/use-commercial-client';
import {
  adaptCommercialDocumentBundle,
  type CommercialAgreementPart,
  type CommercialDocumentBundle,
} from '@/lib/commercial-documents';

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
    parts: [],
    composed: null,
    signatures: [], furnishings: null, tradeScope: null, ...overrides,
  };
}

function part(
  overrides: Partial<CommercialAgreementPart> & Pick<CommercialAgreementPart, 'kind' | 'title'>,
): CommercialAgreementPart {
  return {
    id: `part-${overrides.kind}`,
    position: 1,
    variant: null,
    partKey: `custom.${overrides.kind}`,
    payload: {},
    required: false,
    ...overrides,
  };
}

/**
 * The nine standard parts, in the order `materialize_standard_parts` seeds
 * them (build/waves/w1/build-sheet.md §2.4), carrying the same figures the
 * seven-facet fixture above carries — so a reader can put the two renderings
 * side by side and see that the money did not move, only its arrangement.
 */
const NINE_PARTS: CommercialAgreementPart[] = [
  part({ id: 'p1', position: 1, partKey: 'patina.services', kind: 'clause', title: 'Services', required: true, payload: { body: 'Concept and design development\nfor the whole house.' } }),
  part({ id: 'p2', position: 2, partKey: 'patina.deliverables', kind: 'list', title: 'Deliverables', payload: { items: [
    { id: 'i1', text: 'Concept package', note: 'Two revisions included.' },
    { id: 'i2', text: 'Site visit', optional: true },
    { id: 'i3', text: '' },
  ] } }),
  part({ id: 'p3', position: 3, partKey: 'patina.exclusions', kind: 'list', title: 'Exclusions', payload: { items: [{ id: 'x1', text: 'Furnishings' }] } }),
  part({ id: 'p4', position: 4, partKey: 'patina.role_rates', kind: 'schedule', variant: 'rate_card', title: 'Role rates', payload: { roles: [
    { roleName: 'Principal designer', hourlyRateCents: 22_500, sortOrder: 2 },
    { roleName: 'Studio director', hourlyRateCents: 32_500, sortOrder: 1 },
    { roleName: '', hourlyRateCents: 10_000, sortOrder: 3 },
  ] } }),
  part({ id: 'p5', position: 5, partKey: 'patina.ceiling', kind: 'schedule', variant: 'ceiling', title: 'Ceiling', payload: { cents: 1_800_000 } }),
  part({ id: 'p6', position: 6, partKey: 'patina.deposit', kind: 'schedule', variant: 'procurement', title: 'Furnishings deposit', payload: { depositPercent: 50, termsOfSale: 'Net 30 from invoice date.' } }),
  part({ id: 'p7', position: 7, partKey: 'patina.retainer', kind: 'schedule', variant: 'retainer', title: 'Retainer', payload: { cents: 300_000, creditRule: 'credited', activationPolicy: 'retainer_paid' } }),
  part({ id: 'p8', position: 8, partKey: 'patina.cadence', kind: 'schedule', variant: 'cadence', title: 'Billing cadence', payload: { cadence: 'monthly' } }),
  part({ id: 'p9', position: 9, partKey: 'patina.terms', kind: 'clause', title: 'Terms', required: true, payload: { body: 'Actual time billed monthly.' } }),
];

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
   * FLAG-OFF BYTE-IDENTITY — Wave 1 of "The Agreement, Composed".
   *
   * A design services agreement that carries no parts is the only shape any
   * document can take today, and the only shape a flag-off document can take
   * tomorrow. Its rendered tree must not move by one attribute when
   * `DesignServicesBody` learns its parts branch. This snapshot was WRITTEN
   * AGAINST THE PRE-BRANCH COMPONENT and is never regenerated: if the parts
   * path ever leaks into the parts-less path, this is the test that fails.
   */
  it('renders a parts-less design services agreement byte-identically to today', () => {
    const { container } = render(<CommercialDocumentShell bundle={bundle()} />);
    expect(container.firstChild).toMatchSnapshot();
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

  it('stamps a fully executed document instead of ticking it green', () => {
    const { container } = render(<CommercialDocumentShell bundle={bundle({
      document: { ...bundle().document, state: 'executed', executedAt: '2026-08-03T00:00:00Z' },
    })} />);

    const stamp = screen.getByTestId('commercial-document-executed-stamp');
    expect(stamp).toHaveAttribute('data-stamp-state', 'signed');
    expect(stamp).toHaveTextContent(/^SIGNED August \d+, 2026$/);
    // The last green on the client surface: no sage, no checkmark, no fill.
    expect(container.innerHTML).not.toMatch(/sage/i);
    expect(container.querySelector('svg.lucide-circle-check-big')).toBeNull();
  });

  it('stamps a paper-signed execution upright, as a mark made elsewhere', () => {
    render(<CommercialDocumentShell bundle={bundle({
      document: { ...bundle().document, state: 'executed', executedAt: '2026-08-03T00:00:00Z' },
      signatures: [
        {
          party: 'client', signerName: 'Sarah Whitfield', signedAt: '2026-08-05T14:20:00Z', consentVersion: 'v1',
          documentFingerprint: 'f1', signedOnPaper: true, paperSignedOn: '2026-01-15',
          paperScanDocumentId: null,
        },
      ],
    })} />);

    const stamp = screen.getByTestId('commercial-document-executed-stamp');
    expect(stamp).toHaveAttribute('data-stamp-state', 'signed_on_paper');
    expect(stamp).toHaveTextContent('ON PAPER');
    expect(stamp.style.getPropertyValue('--stamp-rotation')).toBe('0deg');
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

  /* ── The composed agreement (Wave 1, flag `agreement-parts`) ─────────────── */

  describe('an agreement whose bundle carries parts', () => {
    it('renders the parts in position order and drops today’s seven fixed sections', () => {
      render(<CommercialDocumentShell bundle={bundle({ parts: NINE_PARTS })} />);

      expect(screen.getByTestId('agreement-parts-body')).toBeInTheDocument();
      expect(
        screen.getAllByTestId('agreement-part').map((el) => el.getAttribute('data-part-key')),
      ).toEqual([
        'patina.services',
        'patina.deliverables',
        'patina.exclusions',
        'patina.role_rates',
        'patina.ceiling',
        'patina.deposit',
        'patina.retainer',
        'patina.cadence',
        'patina.terms',
      ]);
      // Today's body is gone: its "Rates & design authorization" heading and its
      // "Design authorization ceiling" row belong to the seven-facet path only.
      expect(screen.queryByText('Rates & design authorization')).not.toBeInTheDocument();
      expect(screen.queryByText('Design authorization ceiling')).not.toBeInTheDocument();
      // The composed titles are what the client reads instead.
      expect(screen.getByText('Role rates')).toBeInTheDocument();
      expect(screen.getByText('Ceiling')).toBeInTheDocument();
    });

    it('orders by position even when the RPC hands them over out of order', () => {
      const shuffled = [NINE_PARTS[4], NINE_PARTS[0], NINE_PARTS[8], NINE_PARTS[2]];
      render(<CommercialDocumentShell bundle={bundle({ parts: shuffled })} />);
      expect(
        screen.getAllByTestId('agreement-part').map((el) => el.getAttribute('data-position')),
      ).toEqual(['1', '3', '5', '9']);
    });

    it('carries the separate-purchase boundary exactly once', () => {
      render(<CommercialDocumentShell bundle={bundle({ parts: NINE_PARTS })} />);
      expect(
        screen.getAllByText(/require a separate named furnishings authorization/i),
      ).toHaveLength(1);
    });

    it('prints a clause body as written, with its line breaks intact', () => {
      render(<CommercialDocumentShell bundle={bundle({ parts: [NINE_PARTS[0]] })} />);
      const body = screen.getByText(/Concept and design development/);
      expect(body).toHaveClass('whitespace-pre-wrap');
    });

    it('prints list items with their notes and marks the optional ones', () => {
      render(<CommercialDocumentShell bundle={bundle({ parts: [NINE_PARTS[1]] })} />);
      expect(screen.getByText(/Concept package/)).toBeInTheDocument();
      expect(screen.getByText('Two revisions included.')).toBeInTheDocument();
      expect(screen.getByText(/Site visit \(optional\)/)).toBeInTheDocument();
    });

    /**
     * R21 — `materialize_standard_parts` seeds `patina.terms` as
     * `{ body: COALESCE(terms, '') }` over a nullable column, and
     * deliverables/exclusions from arrays that default to `[]`, so a first
     * composed agreement carries prose parts with nothing in them. Today's body
     * omits the whole section for each (`{terms.terms && …}`); so does this one.
     */
    it('draws nothing at all for a clause part with no body', () => {
      render(<CommercialDocumentShell bundle={bundle({
        parts: [
          part({ id: 'empty', position: 1, partKey: 'patina.terms', kind: 'clause', title: 'Terms', required: true, payload: { body: '' } }),
          part({ id: 'kept', position: 2, partKey: 'patina.services', kind: 'clause', title: 'Services', required: true, payload: { body: 'Concept and design development.' } }),
        ],
      })} />);
      expect(
        screen.getAllByTestId('agreement-part').map((el) => el.getAttribute('data-part-key')),
      ).toEqual(['patina.services']);
      expect(screen.queryByText('Terms')).not.toBeInTheDocument();
    });

    it('draws nothing at all for a list part with no item that carries text', () => {
      render(<CommercialDocumentShell bundle={bundle({
        parts: [
          part({ id: 'empty-list', position: 1, partKey: 'patina.deliverables', kind: 'list', title: 'Deliverables', payload: { items: [] } }),
          part({ id: 'blank-list', position: 2, partKey: 'patina.exclusions', kind: 'list', title: 'Exclusions', payload: { items: [{ id: 'x', text: '' }] } }),
        ],
      })} />);
      expect(screen.queryAllByTestId('agreement-part')).toHaveLength(0);
      expect(screen.queryByText('Deliverables')).not.toBeInTheDocument();
      expect(screen.queryByText('Exclusions')).not.toBeInTheDocument();
      // The boundary is the body's own, not a part's — it still prints.
      expect(
        screen.getByText(/require a separate named furnishings authorization/i),
      ).toBeInTheDocument();
    });

    it('records a rate card with no roles rather than standing a bare title on the page', () => {
      render(<CommercialDocumentShell bundle={bundle({
        parts: [part({ partKey: 'patina.role_rates', kind: 'schedule', variant: 'rate_card', title: 'Role rates', payload: { roles: [] } })],
      })} />);
      expect(screen.getByText('Role rates')).toBeInTheDocument();
      expect(screen.getByText('Recorded with your agreement.')).toBeInTheDocument();
    });

    it('prints role rates in sortOrder, not payload order', () => {
      render(<CommercialDocumentShell bundle={bundle({ parts: [NINE_PARTS[3]] })} />);
      const roles = screen.getAllByText(/designer$|^Studio director$/).map((el) => el.textContent);
      expect(roles).toEqual(['Studio director', 'Principal designer']);
      expect(screen.getByText('$325 / hr')).toBeInTheDocument();
      expect(screen.getByText('$225 / hr')).toBeInTheDocument();
    });

    it('states an absent ceiling in words rather than printing $0', () => {
      render(<CommercialDocumentShell bundle={bundle({
        parts: [part({ partKey: 'patina.ceiling', kind: 'schedule', variant: 'ceiling', title: 'Ceiling', payload: { cents: null } })],
      })} />);
      expect(
        screen.getByText('No ceiling — professional time is billed as it is worked.'),
      ).toBeInTheDocument();
      expect(screen.queryByText('$0')).not.toBeInTheDocument();
    });

    it('prints a ceiling figure when the part carries one', () => {
      render(<CommercialDocumentShell bundle={bundle({ parts: [NINE_PARTS[4]] })} />);
      expect(screen.getByText('$18,000')).toBeInTheDocument();
    });

    /**
     * R21, and the case the very first composed agreement in production takes:
     * `proposal_service_terms.retainer_amount_cents` is NOT NULL DEFAULT 0
     * (00412) and `billing_ceiling_cents` starts at 0 on a fresh agreement, so
     * `materialize_standard_parts` seeds `{ cents: 0 }` into both. Zero is an
     * amount nobody wrote. The homeowner reads today's words for it, on both
     * paths — never `$0`.
     */
    it('names a ceiling written as zero unset, in today’s words, rather than printing $0', () => {
      render(<CommercialDocumentShell bundle={bundle({
        parts: [part({ partKey: 'patina.ceiling', kind: 'schedule', variant: 'ceiling', title: 'Ceiling', payload: { cents: 0 } })],
      })} />);
      expect(screen.getByText('Not yet set')).toBeInTheDocument();
      expect(screen.queryByText('$0')).not.toBeInTheDocument();
      // Zero is not the uncapped sentence either — that belongs to NULL alone.
      expect(
        screen.queryByText('No ceiling — professional time is billed as it is worked.'),
      ).not.toBeInTheDocument();
    });

    it('names a retainer written as zero unset, and withholds the activation sentence', () => {
      render(<CommercialDocumentShell bundle={bundle({
        parts: [part({ partKey: 'patina.retainer', kind: 'schedule', variant: 'retainer', title: 'Retainer', payload: { cents: 0, activationPolicy: 'retainer_paid' } })],
      })} />);
      expect(screen.getByText('Not yet set')).toBeInTheDocument();
      expect(screen.queryByText('$0')).not.toBeInTheDocument();
      expect(
        screen.queryByText('Design work begins after the fully executed agreement and retainer payment.'),
      ).not.toBeInTheDocument();
      expect(
        screen.queryByText('Due under the terms of the fully executed agreement.'),
      ).not.toBeInTheDocument();
    });

    it('names a flat fee written as zero unset rather than printing $0', () => {
      render(<CommercialDocumentShell bundle={bundle({
        parts: [part({ kind: 'schedule', variant: 'flat', title: 'Flat fee', payload: { cents: 0 } })],
      })} />);
      expect(screen.getByText('Not yet set')).toBeInTheDocument();
      expect(screen.queryByText('$0')).not.toBeInTheDocument();
    });

    it('never prints a 0% deposit, and keeps the terms of sale that were written', () => {
      render(<CommercialDocumentShell bundle={bundle({
        parts: [part({ partKey: 'patina.deposit', kind: 'schedule', variant: 'procurement', title: 'Furnishings deposit', payload: { depositPercent: 0, termsOfSale: 'Net 30 from invoice date.' } })],
      })} />);
      expect(screen.queryByText('0% deposit')).not.toBeInTheDocument();
      expect(screen.getByText('Net 30 from invoice date.')).toBeInTheDocument();
    });

    it('records a deposit part written as zero with nothing else beside it', () => {
      render(<CommercialDocumentShell bundle={bundle({
        parts: [part({ kind: 'schedule', variant: 'procurement', title: 'Furnishings deposit', payload: { depositPercent: 0 } })],
      })} />);
      expect(screen.queryByText('0% deposit')).not.toBeInTheDocument();
      expect(screen.getByText('Recorded with your agreement.')).toBeInTheDocument();
    });

    /**
     * The whole nine-part set as `materialize_standard_parts` seeds it on a
     * brand-new agreement: no ceiling, no retainer, no rate card typed yet. Not
     * one zero reaches the page as a figure.
     */
    it('prints no figure at all for a freshly composed agreement whose money is untyped', () => {
      render(<CommercialDocumentShell bundle={bundle({
        parts: [
          part({ id: 'z1', position: 1, partKey: 'patina.ceiling', kind: 'schedule', variant: 'ceiling', title: 'Ceiling', payload: { cents: 0 } }),
          part({ id: 'z2', position: 2, partKey: 'patina.retainer', kind: 'schedule', variant: 'retainer', title: 'Retainer', payload: { cents: 0, activationPolicy: 'immediate' } }),
          part({ id: 'z3', position: 3, partKey: 'patina.deposit', kind: 'schedule', variant: 'procurement', title: 'Furnishings deposit', payload: { depositPercent: 0 } }),
        ],
      })} />);
      expect(screen.getAllByText('Not yet set')).toHaveLength(2);
      expect(screen.queryByText('$0')).not.toBeInTheDocument();
      expect(screen.queryByText('0% deposit')).not.toBeInTheDocument();
    });

    it('prints the retainer figure with the activation sentence its policy names', () => {
      render(<CommercialDocumentShell bundle={bundle({ parts: [NINE_PARTS[6]] })} />);
      expect(screen.getByText('$3,000')).toBeInTheDocument();
      expect(
        screen.getByText('Design work begins after the fully executed agreement and retainer payment.'),
      ).toBeInTheDocument();
    });

    it('falls back to the immediate activation sentence for any other policy', () => {
      render(<CommercialDocumentShell bundle={bundle({
        parts: [part({ kind: 'schedule', variant: 'retainer', title: 'Retainer', payload: { cents: 100_000, activationPolicy: 'immediate' } })],
      })} />);
      expect(
        screen.getByText('Due under the terms of the fully executed agreement.'),
      ).toBeInTheDocument();
    });

    it('records a retainer part with no figure rather than printing one', () => {
      render(<CommercialDocumentShell bundle={bundle({
        parts: [part({ kind: 'schedule', variant: 'retainer', title: 'Retainer', payload: {} })],
      })} />);
      expect(screen.getByText('Recorded with your agreement.')).toBeInTheDocument();
      expect(screen.queryByText('$0')).not.toBeInTheDocument();
    });

    it('prints the cadence and the written-authorization sentence', () => {
      render(<CommercialDocumentShell bundle={bundle({ parts: [NINE_PARTS[7]] })} />);
      expect(screen.getByText('monthly')).toBeInTheDocument();
      expect(
        screen.getByText('Additional work requires written authorization before it can be invoiced.'),
      ).toBeInTheDocument();
    });

    it('prints the furnishings deposit percent and any terms of sale beside it', () => {
      render(<CommercialDocumentShell bundle={bundle({ parts: [NINE_PARTS[5]] })} />);
      expect(screen.getByText('50% deposit')).toBeInTheDocument();
      expect(screen.getByText('Net 30 from invoice date.')).toBeInTheDocument();
      expect(screen.getByText('Terms of sale')).toBeInTheDocument();
    });

    it('records a deposit part that names neither a percent nor a term', () => {
      render(<CommercialDocumentShell bundle={bundle({
        parts: [part({ kind: 'schedule', variant: 'procurement', title: 'Furnishings deposit', payload: {} })],
      })} />);
      expect(screen.getByText('Recorded with your agreement.')).toBeInTheDocument();
    });

    it('prints a flat fee, and records one that names no figure', () => {
      render(<CommercialDocumentShell bundle={bundle({
        parts: [
          part({ id: 'flat-1', position: 1, kind: 'schedule', variant: 'flat', title: 'Flat fee', payload: { cents: 950_000 } }),
          part({ id: 'flat-2', position: 2, kind: 'schedule', variant: 'flat', title: 'Second fee', payload: {} }),
        ],
      })} />);
      expect(screen.getByText('$9,500')).toBeInTheDocument();
      expect(screen.getByText('Recorded with your agreement.')).toBeInTheDocument();
    });

    it('prints per-phase rows, and an em dash for a phase with no figure', () => {
      render(<CommercialDocumentShell bundle={bundle({
        parts: [part({
          kind: 'schedule', variant: 'per_phase', title: 'Fee by phase',
          payload: { phases: [
            { key: 'sd', label: 'Schematic design', cents: 400_000 },
            { key: 'dd', label: 'Design development', cents: null },
            { key: 'blank', label: '', cents: 100 },
          ] },
        })],
      })} />);
      expect(screen.getByText('Schematic design')).toBeInTheDocument();
      expect(screen.getByText('$4,000')).toBeInTheDocument();
      expect(screen.getByText('—')).toBeInTheDocument();
    });

    it('records a per-phase part with no phases at all', () => {
      render(<CommercialDocumentShell bundle={bundle({
        parts: [part({ kind: 'schedule', variant: 'per_phase', title: 'Fee by phase', payload: {} })],
      })} />);
      expect(screen.getByText('Recorded with your agreement.')).toBeInTheDocument();
    });

    /**
     * The eight record-only schedule variants (R9) and any variant a later wave
     * adds. The client reads that the part is part of the agreement; the client
     * never reads its payload as JSON.
     */
    it('records a schedule variant this build does not draw, without printing its payload', () => {
      render(<CommercialDocumentShell bundle={bundle({
        parts: [part({ kind: 'schedule', variant: 'cost_plus', title: 'Cost plus', payload: { basis: 'cost + 18%' } })],
      })} />);
      expect(screen.getByText('Cost plus')).toBeInTheDocument();
      expect(screen.getByText('Recorded with your agreement.')).toBeInTheDocument();
      expect(screen.queryByText(/cost \+ 18%/)).not.toBeInTheDocument();
    });

    it('records an unknown kind as a titled line rather than throwing', () => {
      render(<CommercialDocumentShell bundle={bundle({
        parts: [part({ kind: 'phases', variant: null, title: 'Phases', payload: { phases: [] } })],
      })} />);
      expect(screen.getByText('Phases')).toBeInTheDocument();
      expect(screen.getByText('Recorded with your agreement.')).toBeInTheDocument();
    });

    /**
     * Wave 1 seeds no attachment. The renderer implements the leaf anyway,
     * because a Wave 2 template emits one onto a page this build already
     * shipped — and because a half-implemented leaf is how the studio's copy
     * and the client's copy drift apart.
     */
    it('sets attachments below every other part, lettered, each with its own rule', () => {
      render(<CommercialDocumentShell bundle={bundle({
        parts: [
          part({ id: 'att-b', position: 1, kind: 'attachment', title: 'Wisconsin notice', payload: { body: 'Notice body.', acknowledgeRequired: true } }),
          part({ id: 'clause-z', position: 9, kind: 'clause', title: 'Terms', payload: { body: 'Terms body.' } }),
          part({ id: 'att-c', position: 2, kind: 'attachment', title: 'Photography release', payload: { body: 'Release body.', acknowledgeRequired: false } }),
        ],
      })} />);

      expect(
        screen.getAllByTestId('agreement-part').map((el) => el.getAttribute('data-kind')),
      ).toEqual(['clause', 'attachment', 'attachment']);
      expect(screen.getByText(/ATTACHMENT A · Wisconsin notice/)).toBeInTheDocument();
      expect(screen.getByText(/ATTACHMENT B · Photography release/)).toBeInTheDocument();
      // Display only in Wave 1 — a sentence, never a control.
      expect(screen.getByText('I received this')).toBeInTheDocument();
      expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
    });

    it('never draws an attestation part', () => {
      render(<CommercialDocumentShell bundle={bundle({
        parts: [
          part({ id: 'att-1', position: 1, kind: 'attestation', title: 'Wisconsin registration', payload: { number: 'A-1234', state: 'WI' } }),
          part({ id: 'clause-1', position: 2, kind: 'clause', title: 'Services', payload: { body: 'Body.' } }),
        ],
      })} />);
      expect(screen.getAllByTestId('agreement-part')).toHaveLength(1);
      expect(screen.queryByText('Wisconsin registration')).not.toBeInTheDocument();
      expect(screen.queryByText('A-1234')).not.toBeInTheDocument();
    });

    it('draws nothing but the boundary for a part set with no drawable leaves', () => {
      render(<CommercialDocumentShell bundle={bundle({
        parts: [part({ kind: 'attestation', title: 'Wisconsin registration', payload: {} })],
      })} />);
      expect(screen.queryAllByTestId('agreement-part')).toHaveLength(0);
      expect(
        screen.getByText(/require a separate named furnishings authorization/i),
      ).toBeInTheDocument();
    });

    it('survives a malformed payload on every leaf without throwing', () => {
      render(<CommercialDocumentShell bundle={bundle({
        parts: [
          part({ id: 'p1', position: 1, kind: 'clause', title: 'Services', payload: { body: 42 } }),
          part({ id: 'p2', position: 2, kind: 'list', title: 'Deliverables', payload: { items: 'not-a-list' } }),
          part({ id: 'p3', position: 3, kind: 'schedule', variant: 'rate_card', title: 'Role rates', payload: { roles: [{ hourlyRateCents: 'lots' }] } }),
          part({ id: 'p4', position: 4, kind: 'schedule', variant: 'ceiling', title: 'Ceiling', payload: { cents: 'none' } }),
          part({ id: 'p5', position: 5, kind: 'schedule', variant: 'cadence', title: 'Billing cadence', payload: {} }),
        ],
      })} />);
      // The two prose parts read as empty and take their sections with them
      // (R21); the three schedule leaves keep their titles and say what they
      // can. Nothing throws, and no payload is printed as JSON.
      expect(
        screen.getAllByTestId('agreement-part').map((el) => el.getAttribute('data-part-key')),
      ).toEqual(['custom.schedule', 'custom.schedule', 'custom.schedule']);
      expect(screen.queryByText('Services')).not.toBeInTheDocument();
      expect(screen.queryByText('Deliverables')).not.toBeInTheDocument();
      expect(screen.getByText('Role rates')).toBeInTheDocument();
      // A ceiling whose figure is unreadable is an absent ceiling, not $0.
      expect(
        screen.getByText('No ceiling — professional time is billed as it is worked.'),
      ).toBeInTheDocument();
      expect(screen.queryByText('$0')).not.toBeInTheDocument();
      expect(screen.queryByText('NaN')).not.toBeInTheDocument();
    });

    it('still prints the signature ledger and the footer around the composed body', () => {
      render(<CommercialDocumentShell bundle={bundle({
        parts: NINE_PARTS,
        document: { ...bundle().document, state: 'executed', executedAt: '2026-08-10T12:00:00Z' },
        signatures: [{
          party: 'client', signerName: 'Sarah Whitfield', signedAt: '2026-08-09T12:00:00Z',
          consentVersion: 'v1', documentFingerprint: 'f1', signedOnPaper: false,
          paperSignedOn: null, paperScanDocumentId: null,
        }],
      })} />);
      expect(screen.getByTestId('commercial-document-executed')).toBeInTheDocument();
      expect(screen.getByText('Sarah Whitfield')).toBeInTheDocument();
    });
  });

  /**
   * R17 at the client edge. Which body a homeowner reads is the bundle's
   * answer when it gives one, and the part count only when it does not —
   * `parts.length` is the wrong question in both directions:
   *
   *   - hide every part and the array arrives empty, so counting would revert
   *     the homeowner to today's body and print the scope, rates, ceiling,
   *     retainer and cadence the studio had just hidden;
   *   - un-compose the agreement and the rows stay in the table, so counting
   *     would keep the composed body on a document the studio is editing in
   *     the seven-facet room. That is how the `agreement-parts` kill switch
   *     reaches a homeowner, who has no flag of her own to read.
   */
  describe('which body the bundle says to read', () => {
    it('keeps a composed agreement composed when every part is hidden from the client', () => {
      render(<CommercialDocumentShell bundle={bundle({ composed: true, parts: [] })} />);

      expect(screen.getByTestId('agreement-parts-body')).toBeInTheDocument();
      // Nothing the studio hid comes back through today's body.
      expect(screen.queryByText('Concept and design development')).not.toBeInTheDocument();
      expect(screen.queryByText('Rates & design authorization')).not.toBeInTheDocument();
      expect(screen.queryByText('Design authorization ceiling')).not.toBeInTheDocument();
      expect(screen.queryByText('$18,000')).not.toBeInTheDocument();
      expect(screen.queryByText('$3,000')).not.toBeInTheDocument();
      expect(screen.queryByText('Principal designer')).not.toBeInTheDocument();
      // The agreement is still an agreement: the boundary is said once.
      expect(
        screen.getAllByText(/require a separate named furnishings authorization/i),
      ).toHaveLength(1);
    });

    it('returns the homeowner to today’s body when the bundle says the agreement is no longer composed', () => {
      render(<CommercialDocumentShell bundle={bundle({ composed: false, parts: NINE_PARTS })} />);

      expect(screen.queryByTestId('agreement-parts-body')).not.toBeInTheDocument();
      expect(screen.queryAllByTestId('agreement-part')).toHaveLength(0);
      expect(screen.getByText('Rates & design authorization')).toBeInTheDocument();
      expect(screen.getByText('Concept and design development')).toBeInTheDocument();
    });

    it('leaves the choice to the part count when the bundle says nothing, which is every document today', () => {
      const { unmount } = render(
        <CommercialDocumentShell bundle={bundle({ composed: null, parts: NINE_PARTS })} />,
      );
      expect(screen.getByTestId('agreement-parts-body')).toBeInTheDocument();
      unmount();

      render(<CommercialDocumentShell bundle={bundle({ composed: null, parts: [] })} />);
      expect(screen.queryByTestId('agreement-parts-body')).not.toBeInTheDocument();
      expect(screen.getByText('Rates & design authorization')).toBeInTheDocument();
    });
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
