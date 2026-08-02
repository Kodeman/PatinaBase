import {
  EMPTY_COMMISSION_BRIEF,
  assertCommissionTransition,
  assessSnapshotSafety,
  buildCustomRequirements,
  canEditCommissionRevision,
  canIssueCommission,
  commissionBriefFromRequirements,
  formatConfigurationSnapshotForClipboard,
  hasCommissionBriefErrors,
  summarizeCommissionSnapshot,
  validateCommissionBrief,
} from './custom-commission-model';

const cabinetryBrief = {
  ...EMPTY_COMMISSION_BRIEF,
  projectId: 'project-1',
  name: 'Library wall cabinetry',
  scope: 'Wall-to-wall white oak cabinetry with integrated desk.',
  dimensions: {
    width: '156',
    depth: '24',
    height: '108',
    unit: 'in' as const,
    siteNotes: 'Field verify after flooring is installed.',
  },
  material: 'rift-sawn white oak',
  finish: 'hand-rubbed clear oil',
  fabricatorVendorId: 'vendor-northstar',
  fabricator: 'Northstar Millwork',
  drawingReferences: ['A-602 rev 3', 'SK-14 desk reveal'],
  allowance: '28500',
  priceOnRequest: false,
  quote: {
    reference: 'NSM-Q-1042-R2',
    amount: '31,840',
    validUntil: '2026-09-15',
    leadTimeWeeks: '14',
  },
  designerApproval: 'approved' as const,
  clientApproval: 'approved' as const,
};

describe('custom commission lifecycle', () => {
  it('carries a cabinetry draft through quote, approval, and issued lock', () => {
    expect(hasCommissionBriefErrors(validateCommissionBrief(cabinetryBrief))).toBe(false);
    const requirements = buildCustomRequirements(cabinetryBrief);

    expect(assertCommissionTransition('draft', 'submitted')).toBe('submitted');
    expect(assertCommissionTransition('submitted', 'quoted')).toBe('quoted');
    expect(assertCommissionTransition('quote_received', 'client_review')).toBe(
      'client_review',
    );
    expect(assertCommissionTransition('client_review', 'approved')).toBe('approved');
    expect(canIssueCommission(cabinetryBrief)).toBe(true);
    expect(canEditCommissionRevision('approved')).toBe(false);

    const summary = summarizeCommissionSnapshot({
      name: cabinetryBrief.name,
      revision_number: 2,
      configuration_hash: 'sha256:cabinetry-r2',
      custom_requirements: requirements,
    });
    expect(summary).toMatchObject({
      title: 'Library wall cabinetry',
      dimensions: '156 × 24 × 108 in',
      materialFinish: 'rift-sawn white oak · hand-rubbed clear oil',
      fabricator: 'Northstar Millwork',
      quote: '$31,840',
      drawingCount: 2,
      revision: 2,
      hash: 'sha256:cabinetry-r2',
    });
  });

  it('round-trips durable custom requirements without losing quote or drawings', () => {
    const requirements = buildCustomRequirements(cabinetryBrief);
    const restored = commissionBriefFromRequirements(requirements, {
      projectId: cabinetryBrief.projectId,
      name: cabinetryBrief.name,
    });
    expect(restored).toMatchObject({
      projectId: 'project-1',
      name: 'Library wall cabinetry',
      material: 'rift-sawn white oak',
      finish: 'hand-rubbed clear oil',
      drawingReferences: ['A-602 rev 3', 'SK-14 desk reveal'],
      allowance: '28500.00',
      quote: { amount: '31840.00', leadTimeWeeks: '14' },
    });
  });

  it('forces a new approval when a working revision differs from the approved hash', () => {
    expect(
      assessSnapshotSafety({
        workingHash: 'sha256:rev-3',
        approvedHash: 'sha256:rev-2',
      }),
    ).toEqual({
      kind: 'requires_reapproval',
      message: 'This revision changed after approval. Reapprove it before issuing or ordering.',
    });
    expect(() => assertCommissionTransition('approved', 'quoted')).toThrow(
      /cannot move directly/,
    );
    expect(
      canIssueCommission({ ...cabinetryBrief, clientApproval: 'pending' }),
    ).toBe(false);
  });

  it('keeps an issued snapshot immutable even when the Library source changes', () => {
    expect(
      assessSnapshotSafety({
        workingHash: 'sha256:library-new',
        approvedHash: 'sha256:issued-order',
        lockedAt: '2026-08-02T18:00:00Z',
      }),
    ).toEqual({
      kind: 'issued',
      message: 'Issued snapshot locked. Library edits will not change this order.',
    });
  });

  it('summarizes ordinary variant and modular snapshots for procurement', () => {
    expect(
      summarizeCommissionSnapshot({
        snapshotHash: 'sha256:sectional-1',
        snapshot: {
          productName: 'Field Sectional',
          configurationMode: 'configured',
          schemaRevision: 4,
          variant: { name: 'Right chaise' },
          selections: [
            { groupName: 'Upholstery', valueLabel: 'Oatmeal linen' },
          ],
          components: [
            { name: 'Armless seat', quantity: 2 },
            { name: 'Right chaise', quantity: 1 },
          ],
          retailPriceCents: 895000,
          tradePriceCents: 610000,
          leadTimeWeeks: 12,
          dimensions: { width: '124 in', depth: '72 in', height: '31 in' },
        },
      }),
    ).toMatchObject({
      title: 'Field Sectional · Right chaise',
      dimensions: '124 in × 72 in × 31 in',
      materialFinish:
        'Upholstery: Oatmeal linen · Armless seat ×2 · Right chaise',
      quote: '$8,950 · 12 week lead time',
      revision: 4,
      hash: 'sha256:sectional-1',
    });
  });

  it('formats the locked project spec snapshot for a vendor-facing manifest', () => {
    expect(
      formatConfigurationSnapshotForClipboard({
        spec: {
          configurationId: 'configuration-1',
          configurationSnapshotHash: 'sha256:sectional-1',
          configurationLockedAt: '2026-08-02T18:00:00Z',
          configurationSnapshot: {
            productName: 'Field Sectional',
            configurationMode: 'configured',
            schemaRevision: 4,
            selections: [
              { groupName: 'Upholstery', valueLabel: 'Oatmeal linen' },
            ],
            components: [{ name: 'Armless seat', quantity: 2 }],
            retailPriceCents: 895000,
            tradePriceCents: 610000,
            leadTimeWeeks: 12,
            dimensions: null,
          },
        },
      }),
    ).toEqual(
      expect.arrayContaining([
        'Configuration: Field Sectional',
        'Selection: Upholstery: Oatmeal linen · Armless seat ×2',
        'Snapshot: sha256:sectional-1',
        'State: issued snapshot (locked)',
      ]),
    );
  });

  it('summarizes the canonical custom brief carried beside a configuration snapshot', () => {
    expect(
      summarizeCommissionSnapshot({
        name: 'Library wall cabinetry',
        revisionNumber: 3,
        snapshotHash: 'sha256:cabinetry-3',
        customBrief: {
          summary: 'Library wall cabinetry',
          measurements: [
            { label: 'width', value: 156, unit: 'in' },
            { label: 'depth', value: 24, unit: 'in' },
            { label: 'height', value: 108, unit: 'in' },
          ],
          materials: ['rift-sawn white oak'],
          finish: 'clear oil',
          fabricatorName: 'Northstar Millwork',
          allowanceCents: 2850000,
          drawings: [{ name: 'A-602', url: '/drawings/a-602.pdf' }],
        },
        quote: { tradePriceCents: 3184000 },
        snapshot: {
          productName: 'Cabinetry template',
          configurationMode: 'custom',
          selections: [],
          components: [],
        },
      }),
    ).toMatchObject({
      title: 'Library wall cabinetry',
      dimensions: '156 in × 24 in × 108 in',
      materialFinish: 'rift-sawn white oak · clear oil',
      fabricator: 'Northstar Millwork',
      quote: '$31,840',
      drawingCount: 1,
      revision: 3,
      hash: 'sha256:cabinetry-3',
    });
  });
});
