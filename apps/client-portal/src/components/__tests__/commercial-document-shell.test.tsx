import { render, screen } from '@testing-library/react';
import { CommercialDocumentShell } from '../commercial-document-shell';
import type { CommercialDocumentBundle } from '@/lib/commercial-documents';

function bundle(overrides: Partial<CommercialDocumentBundle> = {}): CommercialDocumentBundle {
  return {
    document: {
      id: 'ds-1', projectId: null, kind: 'design_services', state: 'sent',
      title: 'Whitfield design services', version: 1, waveName: null, sentAt: null,
      executedAt: null, supersededAt: null, replacementProposalId: null,
      documentFingerprint: 'fingerprint-1',
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
    render(<CommercialDocumentShell bundle={bundle({
      document: { ...bundle().document, kind: 'furnishings_authorization', state: 'executed', projectId: 'p1', waveName: 'Living floor' },
      serviceTerms: null,
      furnishings: {
        checkpointId: 'b3', depositRequiredCents: 1_000_000, depositPaidCents: 250_000,
        items: [{ description: 'Meadow linen sectional', quantity: 1, clientUnitPriceCents: 1_480_000, currency: 'USD' }],
      },
    })} />);
    expect(screen.getByText('Living floor')).toBeInTheDocument();
    expect(screen.getByText('Meadow linen sectional')).toBeInTheDocument();
    expect(screen.getByText(/\$7,500 remains due/i)).toBeInTheDocument();
    expect(screen.getByText(/does not alter the design-services agreement/i)).toBeInTheDocument();
  });

  it('guides superseded documents to their replacement', () => {
    render(<CommercialDocumentShell bundle={bundle({
      document: { ...bundle().document, state: 'superseded', replacementProposalId: 'ds-2' },
    })} />);
    expect(screen.getByRole('link', { name: /open the current edition/i })).toHaveAttribute('href', '/proposals/ds-2');
  });
});
