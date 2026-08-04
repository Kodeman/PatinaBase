import {
  adaptCommercialDocumentBundle,
  adaptProjectCommercialSummary,
  commercialSummaryFromProposal,
} from './commercial-documents';

describe('commercial document client adapter', () => {
  it('preserves accepted legacy proposals as executed legacy documents', () => {
    const summary = commercialSummaryFromProposal({
      id: 'legacy-1',
      project_id: 'project-1',
      title: 'Accepted proposal',
      status: 'accepted',
      version: 2,
      sent_at: '2026-01-02T00:00:00Z',
    } as never);

    expect(summary).toMatchObject({
      id: 'legacy-1',
      kind: 'legacy',
      state: 'executed',
      title: 'Accepted proposal',
      version: 2,
    });
  });

  it('adapts the frozen design-services contract and drops internal money fields', () => {
    const bundle = adaptCommercialDocumentBundle({
      document: {
        id: 'ds-1',
        projectId: null,
        kind: 'design_services',
        state: 'client_signed',
        title: 'Design services agreement',
        version: 1,
        documentFingerprint: 'fingerprint-1',
      },
      serviceTerms: {
        scope: 'Design development',
        deliverables: ['Concept package'],
        exclusions: ['Construction labor'],
        billingCeilingCents: 1_800_000,
        retainerAmountCents: 300_000,
        retainerActivationPolicy: 'retainer_paid',
        billingCadence: 'monthly',
        currency: 'USD',
        terms: 'Actual time is billed monthly.',
        currentRateVersion: 1,
        staffCostCents: 75_000,
        marginPercent: 52,
      },
      rates: [{ id: 'rate-1', version: 1, roleName: 'Principal', hourlyRateCents: 22_500, effectiveAt: '2026-08-01' }],
      signatures: [{ party: 'client', signerName: 'Jamie', signedAt: '2026-08-02', consentVersion: 'v1', documentFingerprint: 'fingerprint-1' }],
      rawTimeNotes: ['Internal note that must never render'],
    });

    expect(bundle?.document).toMatchObject({ kind: 'design_services', state: 'client_signed' });
    expect(bundle?.serviceTerms).toMatchObject({ billingCeilingCents: 1_800_000, retainerAmountCents: 300_000 });
    expect(JSON.stringify(bundle)).not.toContain('staffCost');
    expect(JSON.stringify(bundle)).not.toContain('margin');
    expect(JSON.stringify(bundle)).not.toContain('Internal note');
  });

  it('maps only curated authority activity and ignores raw time-entry details', () => {
    const summary = adaptProjectCommercialSummary({
      authority: {
        id: 'auth-1',
        projectId: 'project-1',
        agreementId: 'ds-1',
        state: 'active',
        currency: 'USD',
        ceilingCents: 1_800_000,
        accruedCents: 600_000,
        remainingCents: 1_200_000,
        rates: [],
        activity: [{ label: 'Concept development', hours: 4, amountCents: 90_000, rawNote: 'Private personnel note', staffCostCents: 20_000 }],
        timeEntries: [{ note: 'Do not leak me' }],
      },
    });

    expect(summary.authority?.activity).toEqual([
      { label: 'Concept development', hours: 4, amountCents: 90_000 },
    ]);
    expect(JSON.stringify(summary)).not.toContain('Private personnel note');
    expect(JSON.stringify(summary)).not.toContain('Do not leak me');
  });

  it('accepts a flat project FF&E summary and nested replacement guidance', () => {
    const furnishings = adaptCommercialDocumentBundle({
      id: 'ffe-1',
      projectId: 'project-1',
      documentKind: 'furnishings_authorization',
      commercialState: 'executed',
      title: 'Living floor authorization',
      waveName: 'Living floor',
      depositRequiredCents: 500_000,
      depositPaidCents: 0,
      items: [{ description: 'Sectional', quantity: 1, clientUnitPriceCents: 1_200_000, currency: 'USD' }],
      replacement: { proposalId: 'ffe-2' },
    });

    expect(furnishings?.document).toMatchObject({
      id: 'ffe-1',
      kind: 'furnishings_authorization',
      waveName: 'Living floor',
      replacementProposalId: 'ffe-2',
    });
    expect(furnishings?.furnishings?.items[0].description).toBe('Sectional');
  });
});
