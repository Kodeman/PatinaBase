import { render, screen, within } from '@testing-library/react';

import { CommercialDocumentShell } from '../commercial-document-shell';
import {
  adaptCommercialDocumentBundle,
  type CommercialAgreementPart,
  type CommercialDocumentBundle,
} from '@/lib/commercial-documents';
import { scheduleOfValues, readPricingBasis } from '@/components/commercial/design-build-body';

jest.mock('@/hooks/use-commercial-client', () => ({
  useDeclineCommercialDocument: jest.fn(() => ({ mutateAsync: jest.fn(), isPending: false })),
}));

/* ── THE HALVORSEN KITCHEN AND MUDROOM ───────────────────────────────────────
   Every figure below is `source/fixtures.json`'s, to the cent, and the derived
   ones are asserted against that file's own `expected` block rather than
   against whatever this renderer happens to produce. The same table is pinned
   in SQL (`design_build_test.sql`, SQL-T6) and in the designer's own
   arithmetic (`design-build-arithmetic.test.ts`), so the database, the studio
   and the homeowner cannot drift from one another by a penny.

   Cost basis   $71,300      Fee 18%   $12,834      GMP   $84,134
   Schedule of values, pro-rated (closed book):
     44840 · 11210 · 8496 · 7434 · 4720 · 4130 · 3304   →  84134 dollars
   ────────────────────────────────────────────────────────────────────────── */

const COST_LINES = [
  { id: 'cabinetryAndMillwork', label: 'Cabinetry & millwork', category: 'sub', basisCents: 3_800_000 },
  { id: 'electrical', label: 'Electrical', category: 'sub', basisCents: 950_000 },
  { id: 'plumbing', label: 'Plumbing', category: 'sub', basisCents: 720_000 },
  { id: 'generalConditions', label: 'General conditions / site', category: 'general_conditions', basisCents: 630_000 },
  { id: 'tile', label: 'Tile allowance', category: 'allowance', basisCents: 400_000 },
  { id: 'plumbingFixtures', label: 'Plumbing fixtures allowance', category: 'allowance', basisCents: 350_000 },
  { id: 'lighting', label: 'Lighting allowance', category: 'allowance', basisCents: 280_000 },
];

const EXPECTED_SOV_CENTS = [4_484_000, 1_121_000, 849_600, 743_400, 472_000, 413_000, 330_400];
const GMP_CENTS = 8_413_400;

function part(
  overrides: Partial<CommercialAgreementPart> &
    Pick<CommercialAgreementPart, 'kind' | 'title' | 'id' | 'position' | 'partKey'>,
): CommercialAgreementPart {
  return { variant: null, payload: {}, required: false, ...overrides };
}

/**
 * THE ROW THE STUDIO AUTHORS — `proposal_agreement_parts.payload`, with the
 * cost lines, the fee and the cost basis on it. No client surface is ever
 * handed this; the composer and the derivation tests read it.
 */
function authoredPricingBasis(
  subDisclosure: 'open_book' | 'closed_book',
): CommercialAgreementPart {
  return part({
    id: 'p1',
    position: 1,
    partKey: 'patina.pricing_basis',
    kind: 'schedule',
    variant: 'pricing_basis',
    title: 'Pricing basis',
    required: true,
    payload: {
      basis: 'cost_plus_gmp',
      feeBps: 1800,
      costBasisCents: 7_130_000,
      gmpCents: GMP_CENTS,
      nteCents: null,
      fixedCents: null,
      subDisclosure,
      costLines: COST_LINES,
    },
  });
}

/**
 * R41 — THE PRODUCTION SHAPE. What `get_client_commercial_document_bundle`
 * actually sends, having run the authored row through
 * `_agreement_redact_client_payload`: `contractSumCents` and
 * `scheduleOfValues` projected in both disclosures, and — under anything but
 * open book, which is the shipping default — the cost lines, the fee, the sub
 * markup and the cost basis withheld.
 *
 * Every render assertion below reads this, because a fixture that carried the
 * authored row proved the door against a shape production cannot produce.
 */
function pricingBasis(
  subDisclosure: 'open_book' | 'closed_book',
): CommercialAgreementPart {
  const authored = authoredPricingBasis(subDisclosure);
  const scheduleOfValues =
    subDisclosure === 'open_book'
      ? [
          ...COST_LINES.map((line) => ({
            id: line.id,
            label: line.label,
            cents: line.basisCents,
          })),
          { id: '__fee', label: 'Design and construction fee', cents: 1_283_400 },
        ]
      : COST_LINES.map((line, index) => ({
          id: line.id,
          label: line.label,
          cents: EXPECTED_SOV_CENTS[index],
        }));

  const projected = {
    ...authored.payload,
    contractSumCents: GMP_CENTS,
    scheduleOfValues,
  };
  if (subDisclosure === 'open_book') {
    return { ...authored, payload: projected };
  }
  const {
    costLines: _costLines,
    feeBps: _feeBps,
    costBasisCents: _costBasisCents,
    subMarkupBps: _subMarkupBps,
    ...redacted
  } = projected;
  return { ...authored, payload: redacted };
}

const DRAWS_PART = part({
  id: 'p2',
  position: 2,
  partKey: 'patina.draws',
  kind: 'schedule',
  variant: 'draws',
  title: 'Draw schedule',
  required: true,
  payload: {
    retainageBps: 500,
    draws: [
      { key: 'deposit', label: 'Deposit at signing', sortOrder: 0, pct: 10, retainageApplies: false },
      { key: 'roughIn', label: 'Rough-in', sortOrder: 1, pct: 30, retainageApplies: true },
    ],
  },
});

const ALLOWANCES_PART = part({
  id: 'p3',
  position: 3,
  partKey: 'patina.allowances',
  kind: 'schedule',
  variant: 'allowances',
  title: 'Allowances',
  payload: {
    allowances: [
      { id: 'tile', label: 'Tile', amountCents: 400_000, overageRule: 'change_order', underageRule: 'credit' },
      { id: 'lighting', label: 'Lighting', amountCents: 280_000, overageRule: 'client_credit', underageRule: 'retain' },
    ],
  },
});

const DISCLOSURE_CLAUSE = part({
  id: 'p4',
  position: 4,
  partKey: 'patina.sub_disclosure',
  kind: 'clause',
  title: 'Who is doing the work',
  required: true,
  payload: { body: 'The studio holds each trade agreement directly.' },
});

const TERMS_CLAUSE = part({
  id: 'p5',
  position: 5,
  partKey: 'patina.terms',
  kind: 'clause',
  title: 'Terms',
  required: true,
  payload: { body: 'Draws are due on presentation.' },
});

const LIEN_WAIVER_ATTACHMENT = part({
  id: 'p6',
  position: 6,
  partKey: 'patina.lien_waiver_form',
  kind: 'attachment',
  title: 'Lien waiver form',
  payload: { body: 'Conditional on progress payment.', acknowledgeRequired: true },
});

/** The ledger the send transaction wrote, and the client reads. */
const LEDGER_DRAWS = [
  {
    drawKey: 'deposit',
    label: 'Deposit at signing',
    sortOrder: 0,
    grossCents: 841_340,
    retainageCents: 0,
    netCents: 841_340,
    isRetainageRelease: false,
    invoiceStatus: 'paid',
    paidAt: '2026-09-08T00:00:00.000Z',
    lienWaiver: null,
  },
  {
    drawKey: 'roughIn',
    label: 'Rough-in',
    sortOrder: 1,
    grossCents: 2_524_020,
    retainageCents: 126_201,
    netCents: 2_397_819,
    isRetainageRelease: false,
    invoiceStatus: 'sent',
    paidAt: null,
    lienWaiver: { type: 'conditional_progress', receivedAt: '2026-09-20T00:00:00.000Z' },
  },
  {
    drawKey: 'final',
    label: 'Final · retainage release',
    sortOrder: 4,
    grossCents: 378_603,
    retainageCents: 0,
    netCents: 378_603,
    isRetainageRelease: true,
    invoiceStatus: null,
    paidAt: null,
    lienWaiver: null,
  },
];

const SUBS = [
  { displayName: 'Ridgeline Cabinetry', companyName: 'Ridgeline Co.', trade: 'Cabinetry & millwork', awardedPriceCents: 3_800_000 },
  { displayName: 'Vance Electric', companyName: null, trade: 'Electrical', awardedPriceCents: 950_000 },
];

function bundle(
  subDisclosure: 'open_book' | 'closed_book' = 'closed_book',
  overrides: Partial<CommercialDocumentBundle> = {},
): CommercialDocumentBundle {
  return {
    document: {
      id: 'db-1',
      projectId: null,
      kind: 'design_build',
      state: 'sent',
      title: 'Halvorsen kitchen and mudroom',
      version: 1,
      waveName: null,
      sentAt: '2026-09-07T00:00:00.000Z',
      executedAt: null,
      supersededAt: null,
      replacementProposalId: null,
      documentFingerprint: 'fingerprint-db',
      totalAmountCents: GMP_CENTS,
      depositPercent: 0,
    },
    serviceTerms: {
      scope: null,
      deliverables: [],
      exclusions: [],
      billingCeilingCents: null,
      retainerAmountCents: 0,
      retainerActivationPolicy: 'immediate',
      billingCadence: 'monthly',
      currency: 'USD',
      terms: null,
      currentRateVersion: 1,
    },
    rates: [],
    parts: [
      pricingBasis(subDisclosure),
      DRAWS_PART,
      ALLOWANCES_PART,
      DISCLOSURE_CLAUSE,
      TERMS_CLAUSE,
      LIEN_WAIVER_ATTACHMENT,
    ],
    composed: true,
    consentSentence: null,
    why: null,
    executionSnapshot: null,
    signatures: [],
    furnishings: null,
    tradeScope: null,
    designBuild: { draws: LEDGER_DRAWS, retainageHeldCents: 126_201, subs: SUBS },
    ...overrides,
  };
}

describe('the schedule of values is derived, to the cent', () => {
  it('pro-rates the fee across every line under closed book, and sums to the price', () => {
    const lines = scheduleOfValues(readPricingBasis(authoredPricingBasis('closed_book')));

    expect(lines.map((line) => line.cents)).toEqual(EXPECTED_SOV_CENTS);
    expect(lines.reduce((sum, line) => sum + line.cents, 0)).toBe(GMP_CENTS);
  });

  it('shows the trades at cost and the fee as its own line under open book', () => {
    const lines = scheduleOfValues(readPricingBasis(authoredPricingBasis('open_book')));

    expect(lines.map((line) => line.cents)).toEqual([
      ...COST_LINES.map((line) => line.basisCents),
      1_283_400,
    ]);
    expect(lines.reduce((sum, line) => sum + line.cents, 0)).toBe(GMP_CENTS);
  });

  /**
   * The last row takes the remainder. A price that does not divide evenly
   * still sums to the cent — never to a cent over or under, and never through
   * a float that would put a third decimal on the paper.
   */
  it('gives the remainder to the last line rather than losing it', () => {
    const uneven = part({
      id: 'p1',
      position: 1,
      partKey: 'patina.pricing_basis',
      kind: 'schedule',
      variant: 'pricing_basis',
      title: 'Pricing basis',
      payload: {
        basis: 'cost_plus_gmp',
        feeBps: 1733,
        gmpCents: 1_000_001,
        subDisclosure: 'closed_book',
        costLines: [
          { id: 'a', label: 'A', category: 'sub', basisCents: 333_333 },
          { id: 'b', label: 'B', category: 'sub', basisCents: 333_333 },
          { id: 'c', label: 'C', category: 'sub', basisCents: 333_334 },
        ],
      },
    });
    const lines = scheduleOfValues(readPricingBasis(uneven));

    expect(lines.reduce((sum, line) => sum + line.cents, 0)).toBe(1_000_001);
    expect(lines.every((line) => Number.isInteger(line.cents))).toBe(true);
  });

  it('derives the price from the fee when the basis states no ceiling', () => {
    const costPlus = readPricingBasis(
      part({
        id: 'p1',
        position: 1,
        partKey: 'patina.pricing_basis',
        kind: 'schedule',
        variant: 'pricing_basis',
        title: 'Pricing basis',
        payload: {
          basis: 'cost_plus',
          feeBps: 1800,
          subDisclosure: 'closed_book',
          costLines: COST_LINES,
        },
      }),
    );

    expect(costPlus.costBasisCents).toBe(7_130_000);
    expect(costPlus.contractSumCents).toBe(GMP_CENTS);
    expect(costPlus.feeCents).toBe(1_283_400);
  });

  it('draws no schedule at all from a basis nobody has priced', () => {
    const unpriced = readPricingBasis(
      part({
        id: 'p1',
        position: 1,
        partKey: 'patina.pricing_basis',
        kind: 'schedule',
        variant: 'pricing_basis',
        title: 'Pricing basis',
        payload: { basis: 'cost_plus_gmp', costLines: [] },
      }),
    );

    expect(unpriced.contractSumCents).toBeNull();
    expect(scheduleOfValues(unpriced)).toEqual([]);
  });
});

describe('the turnkey paper, as the homeowner reads it', () => {
  it('names the kind in the portal’s own words', () => {
    render(<CommercialDocumentShell bundle={bundle()} />);

    expect(screen.getByText('Design-build agreement')).toBeInTheDocument();
  });

  it('renders the parts in the designer’s order', () => {
    render(<CommercialDocumentShell bundle={bundle()} />);

    const keys = screen
      .getAllByTestId('agreement-part')
      .map((node) => node.getAttribute('data-part-key'));
    expect(keys).toEqual([
      'patina.pricing_basis',
      'patina.draws',
      'patina.allowances',
      'patina.sub_disclosure',
      'patina.terms',
      'patina.lien_waiver_form',
    ]);
  });

  it('prints the price the bundle projected, to the cent', () => {
    render(<CommercialDocumentShell bundle={bundle()} />);

    expect(screen.getByTestId('design-build-contract-sum')).toHaveTextContent(
      'Guaranteed maximum price',
    );
    expect(screen.getByTestId('design-build-contract-sum')).toHaveTextContent('$84,134');
  });

  /* R41 — a plain cost-plus prime names no ceiling, so once the redaction has
     taken the cost basis and the fee the projected `contractSumCents` is the
     only price the payload carries. Reading it is the difference between the
     paper's own number and "Not yet set" over a priced construction contract. */
  it('prints a plain cost-plus price from the projection alone', () => {
    const projectedOnly = part({
      id: 'p1',
      position: 1,
      partKey: 'patina.pricing_basis',
      kind: 'schedule',
      variant: 'pricing_basis',
      title: 'Pricing basis',
      required: true,
      payload: {
        basis: 'cost_plus',
        subDisclosure: 'closed_book',
        contractSumCents: GMP_CENTS,
        scheduleOfValues: [{ id: 'construction', label: 'Construction', cents: GMP_CENTS }],
      },
    });
    render(
      <CommercialDocumentShell
        bundle={bundle('closed_book', { parts: [projectedOnly, TERMS_CLAUSE] })}
      />,
    );

    expect(screen.getByTestId('design-build-contract-sum')).toHaveTextContent('$84,134');
    expect(screen.queryByText('Not yet set')).not.toBeInTheDocument();
    expect(screen.getByTestId('design-build-sov-total')).toHaveTextContent('$84,134');
  });

  it('draws the schedule of values, pro-rated, summing to the price', () => {
    render(<CommercialDocumentShell bundle={bundle()} />);

    const sov = screen.getByTestId('design-build-sov');
    expect(sov).toHaveAttribute('data-disclosure', 'closed_book');
    expect(within(sov).getAllByTestId('design-build-sov-line')).toHaveLength(7);
    expect(within(sov).getByText('$44,840')).toBeInTheDocument();
    expect(screen.getByTestId('design-build-sov-total')).toHaveTextContent('$84,134');
  });

  /* R13, STATED EXACTLY (RC-4, ruled round 1 — see client-notes.md §11).
     Under closed book no trade's price is PRINTED: not as a schedule-of-values
     line at cost, not beside a name. The line the homeowner reads is $44,840,
     the cabinetry line with the fee spread into it.

     What this test does NOT claim — and an earlier comment here wrongly did —
     is that $38,000 is unrecoverable. It is recoverable by arithmetic, and
     necessarily so: this is a cost-plus-GMP prime, the fee is one of its
     terms, and the allowance parts state their amounts AT COST because a
     homeowner cannot be asked to respect a change-order threshold she is not
     shown ($4,000 tile, printed, against its $4,720 schedule line — the
     multiplier, from two numbers she must have). Closed book on this page is
     therefore a presentation rule, not an information barrier: it withholds
     the per-trade price ROW and every bid, in both modes, at every state. A
     genuinely non-invertible schedule would have to be authored rather than
     derived from the cost lines, which is a backend change and not Wave 3's. */
  it('prints no trade’s own price under closed book, and no bid in either mode', () => {
    render(<CommercialDocumentShell bundle={bundle('closed_book')} />);

    expect(screen.queryAllByTestId('design-build-sub-price')).toHaveLength(0);
    expect(screen.queryByText('$38,000')).not.toBeInTheDocument();
    expect(screen.queryByText('$9,500')).not.toBeInTheDocument();
    // The trades themselves are named — she meets them, she just does not
    // meet their bids.
    expect(screen.getByTestId('design-build-subs')).toHaveTextContent('Ridgeline Cabinetry');
    expect(screen.getByTestId('design-build-subs')).toHaveTextContent('Vance Electric');
  });

  /* The other half of the same ruling, re-pinned against the shape the RPC
     sends. An open book states the cost basis and the fee, because that is
     what the clause elected; a closed book states neither, because
     `_agreement_redact_client_payload` never sends them — and the keepsake
     asserts the same absence (`design_build_test.sql`, T17: "the keepsake
     obeys the same disclosure the door did"). If the disclosure rule ever
     flips, this test is the one that fails first. */
  it('states the cost basis and the fee under open book, and neither under closed', () => {
    const open = render(<CommercialDocumentShell bundle={bundle('open_book')} />);
    expect(screen.getByText('Cost basis')).toBeInTheDocument();
    expect(screen.getByText('$71,300')).toBeInTheDocument();
    expect(screen.getByText('Fee 18%')).toBeInTheDocument();
    open.unmount();

    render(<CommercialDocumentShell bundle={bundle('closed_book')} />);
    expect(screen.queryByText('Cost basis')).not.toBeInTheDocument();
    expect(screen.queryByText('$71,300')).not.toBeInTheDocument();
    expect(screen.queryByText('Fee 18%')).not.toBeInTheDocument();
  });

  it('discloses the awarded prices under open book, and only those', () => {
    render(<CommercialDocumentShell bundle={bundle('open_book')} />);

    const prices = screen.getAllByTestId('design-build-sub-price').map((n) => n.textContent);
    expect(prices).toEqual(['$38,000', '$9,500']);
    expect(screen.getByTestId('design-build-sov')).toHaveAttribute(
      'data-disclosure',
      'open_book',
    );
  });

  /**
   * The bid ledger reaches no client surface in either mode. It has no key on
   * the DTO — and a bundle that grew one anyway loses it at the adapter, which
   * maps the shape it knows and discards the rest.
   */
  it('renders no bid, in either mode, however the bundle is padded', () => {
    for (const mode of ['closed_book', 'open_book'] as const) {
      const padded = adaptCommercialDocumentBundle({
        document: { proposalId: 'db-1', kind: 'design_build', state: 'sent', title: 'Halvorsen' },
        parts: [pricingBasis(mode)],
        designBuild: {
          draws: [],
          retainageHeldCents: 0,
          subs: [
            {
              displayName: 'Ridgeline Cabinetry',
              trade: 'Cabinetry',
              awardedPriceCents: mode === 'open_book' ? 3_800_000 : null,
              // Nothing below this line may survive the adapter.
              bids: [{ vendor: 'Alder Millwork', priceCents: 4_100_000 }],
              losingBidCents: 4_100_000,
              bidCount: 3,
            },
          ],
        },
      });

      expect(padded).not.toBeNull();
      const sub = padded!.designBuild!.subs[0] as unknown as Record<string, unknown>;
      expect(Object.keys(sub).sort()).toEqual([
        'awardedPriceCents',
        'companyName',
        'displayName',
        'trade',
      ]);

      const view = render(<CommercialDocumentShell bundle={padded!} />);
      expect(screen.queryByText(/Alder Millwork/)).not.toBeInTheDocument();
      expect(screen.queryByText(/\$41,000/)).not.toBeInTheDocument();
      view.unmount();
    }
  });

  it('draws the draw ledger the database keeps, net of retainage', () => {
    render(<CommercialDocumentShell bundle={bundle()} />);

    const nets = screen.getAllByTestId('design-build-draw-net').map((n) => n.textContent);
    expect(nets).toEqual(['$8,413.40', '$23,978.19', '$3,786.03']);
    expect(screen.getByTestId('design-build-retainage-held')).toHaveTextContent('$1,262.01');
    expect(screen.getByText(/Lien waiver received/)).toBeInTheDocument();
  });

  it('says a draw’s state in the house’s own words', () => {
    render(<CommercialDocumentShell bundle={bundle()} />);

    const draws = screen.getAllByTestId('design-build-draw');
    expect(draws[0]).toHaveTextContent('Paid');
    expect(draws[1]).toHaveTextContent('Sent');
    expect(draws[2]).toHaveTextContent('Not yet billed');
  });

  /* Before a ledger exists the shares are shown and no figure is invented for
     them — the browser never recomputes what the send transaction wrote. */
  it('shows shares, not invented figures, when the bundle carries no ledger', () => {
    render(<CommercialDocumentShell bundle={bundle('closed_book', { designBuild: null })} />);

    const draws = screen.getAllByTestId('design-build-draw');
    expect(draws).toHaveLength(2);
    expect(draws[0]).toHaveTextContent('10%');
    expect(screen.queryAllByTestId('design-build-draw-net')).toHaveLength(0);
    expect(screen.queryByTestId('design-build-subs')).not.toBeInTheDocument();
  });

  it('says what happens when an allowance runs over or under', () => {
    render(<CommercialDocumentShell bundle={bundle()} />);

    const allowances = screen.getAllByTestId('design-build-allowance');
    expect(allowances).toHaveLength(2);
    expect(allowances[0]).toHaveTextContent('needs a change order first');
    expect(allowances[0]).toHaveTextContent('comes back to you');
    expect(allowances[1]).toHaveTextContent('added to your account');
    expect(allowances[1]).toHaveTextContent('stays with the studio');
  });

  it('sets the attachment below the paper, lettered, with its acknowledgment', () => {
    render(<CommercialDocumentShell bundle={bundle()} />);

    const attachments = screen.getByTestId('agreement-attachments');
    expect(attachments).toHaveTextContent('ATTACHMENT A · Lien waiver form');
    expect(attachments).toHaveTextContent('I received this');
  });

  /* The services boundary sentence is false of a paper that prices the trades,
     and printing it would tell the homeowner this agreement covers design
     services only. */
  it('never closes with the design-services boundary sentence', () => {
    render(<CommercialDocumentShell bundle={bundle()} />);

    expect(
      screen.queryByText(/This agreement authorizes design services only/),
    ).not.toBeInTheDocument();
    expect(screen.getByText(/covers the work described above/)).toBeInTheDocument();
    expect(screen.queryByTestId('agreement-parts-body')).not.toBeInTheDocument();
  });

  /* A turnkey prime is countersigned, so once her name is on it the ledger
     still owes her the studio's. `commercial-document-shell.tsx` decides that
     by excluding the two one-act kinds; `design_build` is on the countersigned
     side by ruling, not by accident. */
  it('still promises the countersignature that makes it effective', () => {
    render(
      <CommercialDocumentShell
        bundle={bundle('closed_book', {
          document: { ...bundle().document, state: 'client_signed' },
          signatures: [
            {
              party: 'client',
              signerName: 'Ana Halvorsen',
              signedAt: '2026-09-07T15:00:00.000Z',
              consentVersion: 'v1',
              documentFingerprint: 'fingerprint-db',
              signedOnPaper: false,
              paperSignedOn: null,
              paperScanDocumentId: null,
              consentSentence: null,
            },
          ],
        })}
      />,
    );

    expect(screen.getByText('Awaiting countersignature')).toBeInTheDocument();
  });

  /* An attestation is between a studio and its state. It never reaches the
     client's copy, whatever the composer hung on the agreement. */
  it('never draws the studio’s licensing attestation', () => {
    const withAttestation = bundle();
    render(
      <CommercialDocumentShell
        bundle={{
          ...withAttestation,
          parts: [
            ...withAttestation.parts,
            part({
              id: 'p7',
              position: 7,
              partKey: 'patina.licensing_attestation',
              kind: 'attestation',
              title: 'Licensing attestation',
              payload: { credentialType: 'WI Dwelling Contractor', number: '1234567' },
            }),
          ],
        }}
      />,
    );

    expect(screen.queryByText(/Licensing attestation/)).not.toBeInTheDocument();
    expect(screen.queryByText(/1234567/)).not.toBeInTheDocument();
  });
});
