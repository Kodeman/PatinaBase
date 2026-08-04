import {
  buildProposalItemFromPick,
  toClientSafeSelection,
} from './build-proposal-item-from-pick';
import type { ProductPickResult } from '@/components/portal/proposals/product-picker-modal';

const SELECTIONS = [
  {
    optionGroupId: 'group-size',
    optionValueId: 'value-king',
    groupCode: 'size',
    valueCode: 'king',
    groupName: 'Size',
    valueLabel: 'King',
    retailPriceDeltaCents: 40000,
    tradePriceDeltaCents: 24000,
    leadTimeDeltaWeeks: 2,
    allowsCom: false,
  },
  {
    optionGroupId: 'group-fabric',
    optionValueId: 'value-com',
    groupCode: 'fabric',
    valueCode: 'com',
    groupName: 'Fabric',
    valueLabel: "Customer's Own Material",
    retailPriceDeltaCents: 0,
    tradePriceDeltaCents: 0,
    leadTimeDeltaWeeks: 0,
    allowsCom: true,
  },
];

const pick = (overrides: Partial<ProductPickResult> = {}): ProductPickResult => ({
  productId: 'bed-1',
  name: 'Ledge Bed',
  imageUrl: null,
  priceCents: 400000,
  vendorName: 'Atelier Whitfield',
  scopeRoomId: 'room-1',
  ...overrides,
});

const configuredPick = (
  selectionOverrides: Record<string, unknown> = {},
): ProductPickResult =>
  pick({
    configurationMode: 'variant',
    configurationSelection: {
      savedConfigurationId: null,
      variantId: 'variant-king',
      optionValueIds: ['value-king', 'value-com'],
      selections: SELECTIONS,
      components: [],
      retailPriceCents: 440000,
      tradePriceCents: 264000,
      leadTimeWeeks: 12,
      snapshot: null,
      label: "King · Customer's Own Material",
      ...selectionOverrides,
    },
  });

const opts = { ffeCategorySlug: 'seating', existingDocCodes: [] as Array<string | null> };

describe('buildProposalItemFromPick', () => {
  it('prices a configured pick at its RESOLVED specification, not the list row', () => {
    const line = buildProposalItemFromPick(configuredPick(), opts);
    expect(line.unitPrice).toBe(440000);
    expect(line.leadTimeWeeks).toBe(12);
    expect(line.customFields?.configuration.label).toBe(
      "King · Customer's Own Material",
    );
  });

  it('prices a standard pick off the product row and carries no envelope', () => {
    const line = buildProposalItemFromPick(pick(), opts);
    expect(line.unitPrice).toBe(400000);
    expect(line.leadTimeWeeks).toBeNull();
    expect(line.customFields).toBeNull();
  });

  it('records a skipped pick as an envelope that admits the debt', () => {
    const line = buildProposalItemFromPick(
      pick({ configurationMode: 'variant', configurationSkipped: true }),
      opts,
    );
    expect(line.unitPrice).toBe(400000);
    expect(line.customFields?.configuration).toMatchObject({
      mode: 'variant',
      skipped: true,
      label: null,
      selections: [],
      retailPriceCents: null,
    });
  });

  it('carries the COM fabric through to the line, where the PO can find it', () => {
    const line = buildProposalItemFromPick(
      configuredPick({
        comDetails: {
          optionValueId: 'value-com',
          fabricName: 'Belgian Linen 12',
          mill: 'Rogers & Goffigon',
          yardage: 14,
        },
      }),
      opts,
    );
    expect(line.customFields?.configuration.comDetails).toEqual({
      optionValueId: 'value-com',
      fabricName: 'Belgian Linen 12',
      mill: 'Rogers & Goffigon',
      yardage: 14,
    });
  });

  it('leaves comDetails null when the designer specified no fabric', () => {
    const line = buildProposalItemFromPick(configuredPick(), opts);
    expect(line.customFields?.configuration.comDetails).toBeNull();
  });

  // ── The privacy invariant (PRIV-3) ────────────────────────────────────────
  // `proposal_items.custom_fields` travels into a CLIENT document and, on
  // activation (00269), into the project. Trade cost is the studio's own
  // number: it is stripped here, at the boundary, not filtered downstream.

  it('emits no trade money anywhere in the envelope', () => {
    const line = buildProposalItemFromPick(
      configuredPick({
        comDetails: { fabricName: 'Belgian Linen 12', yardage: 14 },
      }),
      opts,
    );
    const json = JSON.stringify(line.customFields);
    expect(json).not.toContain('trade');
    expect(json).not.toContain('Trade');
    // The specific numbers, too — a rename must not smuggle them back.
    expect(json).not.toContain('264000');
    expect(json).not.toContain('24000');
  });

  it('keeps what identifies the choice and drops what prices it', () => {
    expect(toClientSafeSelection(SELECTIONS[0])).toEqual({
      optionGroupId: 'group-size',
      optionValueId: 'value-king',
      groupCode: 'size',
      valueCode: 'king',
      groupName: 'Size',
      valueLabel: 'King',
      leadTimeDeltaWeeks: 2,
      allowsCom: false,
    });
  });

  it('keeps the resolved RETAIL total — the money a client may see', () => {
    const line = buildProposalItemFromPick(configuredPick(), opts);
    expect(line.customFields?.configuration.retailPriceCents).toBe(440000);
    expect(line.customFields?.configuration.variantId).toBe('variant-king');
    expect(line.customFields?.configuration.optionValueIds).toEqual([
      'value-king',
      'value-com',
    ]);
  });

  // ── The rest of the mapping ───────────────────────────────────────────────

  it('denormalizes the pick onto a fixed line with a suggested doc code', () => {
    const line = buildProposalItemFromPick(pick(), {
      ffeCategorySlug: 'seating',
      existingDocCodes: ['CH-01'],
    });
    expect(line).toMatchObject({
      productId: 'bed-1',
      name: 'Ledge Bed',
      quantity: 1,
      vendorName: 'Atelier Whitfield',
      itemType: 'fixed',
      scopeRoomId: 'room-1',
      ffeCategory: 'seating',
    });
    // Sequenced past the seating code already in the document.
    expect(line.docCode).toBe('CH-02');
  });

  it('treats a missing price and an unassigned room as zero and null', () => {
    const line = buildProposalItemFromPick(
      pick({ priceCents: null, vendorName: null, scopeRoomId: null }),
      { ffeCategorySlug: null, existingDocCodes: [] },
    );
    expect(line.unitPrice).toBe(0);
    expect(line.vendorName).toBeUndefined();
    expect(line.scopeRoomId).toBeNull();
    expect(line.ffeCategory).toBeUndefined();
  });
});
