import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { CommercialDeclineDialog, CommercialDocumentShell } from '../commercial-document-shell';
import { useDeclineCommercialDocument } from '@/hooks/use-commercial-client';
import type { CommercialDocumentBundle } from '@/lib/commercial-documents';

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
    signatures: [], furnishings: null, ...overrides,
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

describe('CommercialDocumentShell', () => {
  it('renders signed design terms, rates, ceiling, retainer, and the separate-purchase boundary', () => {
    render(<CommercialDocumentShell bundle={bundle()} />);
    expect(screen.getByText('Concept and design development')).toBeInTheDocument();
    expect(screen.getByText('$225 / hr')).toBeInTheDocument();
    expect(screen.getByText('$18,000')).toBeInTheDocument();
    expect(screen.getByText('$3,000')).toBeInTheDocument();
    expect(screen.getByText(/require a separate named furnishings authorization/i)).toBeInTheDocument();
  });

  it('states that a client-signed agreement is still awaiting studio countersignature', () => {
    render(<CommercialDocumentShell bundle={bundle({
      document: { ...bundle().document, state: 'client_signed' },
      signatures: [{ party: 'client', signerName: 'Sarah Whitfield', signedAt: '2026-08-02', consentVersion: 'v1', documentFingerprint: 'f1' }],
    })} />);
    expect(screen.getByText(/awaiting the studio countersignature and is not yet effective/i)).toBeInTheDocument();
    expect(screen.getByText(/awaiting countersignature/i)).toBeInTheDocument();
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
