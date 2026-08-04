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

  it('accepts the canonical @patina/types agreement with terms and evidence nested on document', () => {
    const bundle = adaptCommercialDocumentBundle({
      document: {
        id: 'ds-canonical',
        projectId: null,
        kind: 'design_services',
        state: 'client_signed',
        title: 'Canonical agreement',
        version: 1,
        waveName: null,
        sentAt: '2026-08-01T00:00:00Z',
        executedAt: null,
        supersededAt: null,
        replacementProposalId: null,
        terms: {
          proposalId: 'ds-canonical',
          scope: 'Design development',
          deliverables: ['Concept package'],
          exclusions: [],
          billingCeilingCents: 1_800_000,
          retainerAmountCents: 300_000,
          retainerActivationPolicy: 'retainer_paid',
          billingCadence: 'monthly',
          currency: 'USD',
          terms: 'Actual time billed monthly.',
          currentRateVersion: 1,
          updatedAt: '2026-08-01T00:00:00Z',
        },
        rates: [{
          id: 'rate-canonical',
          proposalId: 'ds-canonical',
          version: 1,
          roleName: 'Principal',
          hourlyRateCents: 22_500,
          effectiveAt: '2026-08-01T00:00:00Z',
        }],
        signatures: [{
          id: 'signature-canonical',
          proposalId: 'ds-canonical',
          party: 'client',
          signerUserId: 'client-1',
          signerName: 'Jamie Client',
          signedAt: '2026-08-02T00:00:00Z',
          consentVersion: 'v1',
          documentFingerprint: 'fingerprint-canonical',
        }],
      },
      authority: null,
      budgetVersion: null,
      budgetCheckpoint: null,
    });

    expect(bundle?.serviceTerms?.billingCeilingCents).toBe(1_800_000);
    expect(bundle?.rates[0]?.roleName).toBe('Principal');
    expect(bundle?.signatures[0]).toMatchObject({
      party: 'client',
      signerName: 'Jamie Client',
      documentFingerprint: 'fingerprint-canonical',
    });
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

  it('adapts the nested working-budget RPC contract without zeroing the published version', () => {
    const summary = adaptProjectCommercialSummary({
      workingBudget: {
        version: {
          id: 'budget-3',
          projectId: 'project-1',
          version: 3,
          status: 'published',
          lowTotalCents: 5_400_000,
          targetTotalCents: 7_400_000,
          highTotalCents: 9_800_000,
        },
        lines: [{
          roomName: 'Living room',
          category: 'Seating',
          lowCents: 1_000_000,
          targetCents: 1_500_000,
          highCents: 2_000_000,
        }],
        checkpoint: {
          id: 'checkpoint-3',
          status: 'open',
          snapshotFingerprint: 'budget-fingerprint',
          publishedAt: '2026-08-01T00:00:00Z',
        },
        isPurchaseAuthority: false,
      },
    });

    expect(summary.workingBudget).toMatchObject({
      id: 'budget-3',
      version: 3,
      state: 'published',
      targetTotalCents: 7_400_000,
      checkpoint: {
        id: 'checkpoint-3',
        state: 'published',
        evidenceFingerprint: 'budget-fingerprint',
      },
    });
    expect(summary.workingBudget?.lines[0]).toMatchObject({
      roomName: 'Living room',
      targetCents: 1_500_000,
    });
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

  it('maps the flat furnishings-list contract to proposal-addressed client links', () => {
    const summary = adaptProjectCommercialSummary({
      projectId: 'project-1',
      furnishingsAuthorizations: [{
        documentId: 'commercial-document-1',
        proposalId: 'proposal-1',
        waveName: 'Living floor',
        commercialState: 'executed',
        executedAt: '2026-08-02T00:00:00Z',
        items: [{
          id: 'item-1',
          name: 'Sectional',
          quantity: 1,
          clientUnitPriceCents: 1_200_000,
        }],
      }],
    });

    expect(summary.furnishingsAuthorizations[0]).toMatchObject({
      document: {
        id: 'proposal-1',
        projectId: 'project-1',
        kind: 'furnishings_authorization',
        state: 'executed',
      },
      furnishings: {
        items: [{ description: 'Sectional', quantity: 1, clientUnitPriceCents: 1_200_000 }],
      },
    });
  });
});
