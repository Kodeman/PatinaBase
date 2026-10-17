/**
 * US-37 D6 (SQ-1107): trade cost, markup, margin, retail, price basis and the
 * cost-change flag never reach a client. The database readers project none of
 * them (supabase/tests/ffe/us37_client_pricing_privacy_test.sql); these client
 * mappers must drop them even when a payload carries them.
 */
import type { ProposalItem } from '@patina/supabase';
import type { ShareVisibility } from '@patina/utils';
import {
  adaptClientSelections,
  adaptCommercialDocumentBundle,
} from '../commercial-documents';
import { buildGuestProposalDocumentBundle } from '../guest-proposal-document';
import { clientProposalItems } from '../proposal-product-snapshot';

/** Every object key, at any depth, that names a pricing-private field. */
function privateKeys(value: unknown): string[] {
  const found = new Set<string>();
  const walk = (node: unknown) => {
    if (Array.isArray(node)) {
      node.forEach(walk);
      return;
    }
    if (node === null || typeof node !== 'object') return;
    for (const [key, child] of Object.entries(node)) {
      const flat = key.replace(/_/g, '').toLowerCase();
      if (
        /(tradeprice|tradeunitcost|tradecost|pricetrade|markup|margin|retail|pricebasis|pendingcost|pendingmarkup|costprev|unitcost)/.test(flat)
      ) {
        found.add(key);
      }
      walk(child);
    }
  };
  walk(value);
  return [...found].sort();
}

/** Private pricing values (cost, markup, retail, held cost) found in a serialized payload. */
function privateValues(value: unknown): string[] {
  const text = JSON.stringify(value);
  return ['70000', '71.43', '41.67', '150000', '65000'].filter((needle) => text.includes(needle));
}

/** What a careless or future payload might carry beside the client's price. */
const PRIVATE_PRICING = {
  trade_price_cents: 70_000,
  tradePriceCents: 70_000,
  trade_unit_cost_cents: 70_000,
  tradeUnitCostCents: 70_000,
  markup_percent: 71.43,
  markupPercent: 71.43,
  margin_percent: 41.67,
  marginPercent: 41.67,
  retail_unit_cents: 150_000,
  retailUnitCents: 150_000,
  price_basis: 'markup',
  priceBasis: 'markup',
  pending_cost_prev_cents: 65_000,
  pendingCostPrevCents: 65_000,
  pending_cost_changed_at: '2026-10-17T00:00:00.000Z',
  pendingMarkupHeldPercent: 71.43,
};

describe('client pricing privacy (US-37 D6)', () => {
  it('the scanner sees every private key it is meant to catch', () => {
    expect(privateKeys({ nested: [{ ...PRIVATE_PRICING }] })).toHaveLength(
      Object.keys(PRIVATE_PRICING).length,
    );
  });

  it('proposal document lines drop trade cost, markup and retail', () => {
    const items = clientProposalItems(
      [
        {
          id: 'line-1',
          proposal_id: 'proposal-1',
          name: 'Lounge chair',
          quantity: 2,
          unit_price: 70_000,
          unit_sell_price: 120_000,
          markup_percent: 71.43,
          line_total_cents: 240_000,
          item_type: 'fixed',
          client_product_snapshot: {
            product_id: 'product-1',
            name: 'Lounge chair',
            images: ['chair.jpg'],
            price_retail: 150_000,
          },
        } as unknown as ProposalItem,
        { id: 'line-2', name: 'Placeholder', item_type: 'tbd', unit_price: 1 } as unknown as ProposalItem,
      ],
      false,
    );

    expect(items).toHaveLength(1);
    // A client line's unit_price is its sell price, never the trade cost.
    expect(items[0]).toMatchObject({ unit_price: 120_000, unit_sell_price: 120_000, line_total_cents: 240_000, quantity: 2 });
    expect(items[0].product).toMatchObject({ id: 'product-1', name: 'Lounge chair', price_retail: null });
    expect(privateKeys(items)).toEqual(['price_retail']);
    expect(privateValues(items)).toEqual([]);
  });

  it('the guest proposal bundle drops every private pricing field', () => {
    const visibility: ShareVisibility = {
      pricing: true,
      roomBudgets: true,
      paymentSchedule: true,
      supplierIdentity: true,
      sourceUrls: true,
      itemDetails: true,
      leadTimes: true,
      feedbackEnabled: false,
    };
    const bundle = buildGuestProposalDocumentBundle({
      proposal: {
        title: 'Living room',
        created_at: '2026-10-17T00:00:00.000Z',
        total_amount: 240_000,
        version: 1,
        client: { full_name: 'Jamie' },
        items: [{
          id: 'line-1',
          name: 'Lounge chair',
          quantity: 2,
          line_total_cents: 240_000,
          unit_price: 70_000,
          unit_sell_price: 120_000,
          item_type: 'fixed',
          position: 0,
          ...PRIVATE_PRICING,
          client_product_snapshot: {
            product_id: 'product-1',
            name: 'Lounge chair',
            images: ['chair.jpg'],
            price_retail: 150_000,
            price_trade: 70_000,
            ...PRIVATE_PRICING,
          },
        }],
      },
      sections: [],
      paymentMilestones: [],
      phases: [],
      exclusions: [],
      scopeRooms: [],
      boards: [],
      visibility,
    });

    expect(bundle.proposal.items).toHaveLength(1);
    expect(bundle.proposal.items[0]).toMatchObject({ name: 'Lounge chair', quantity: 2, line_total_cents: 240_000 });
    expect(privateKeys(bundle)).toEqual([]);
    expect(privateValues(bundle)).toEqual([]);
  });

  it('the commercial document bundle drops cost, markup and retail on release lines', () => {
    const bundle = adaptCommercialDocumentBundle({
      document: {
        id: 'fa-1',
        projectId: 'project-1',
        kind: 'furnishings_authorization',
        state: 'executed',
        title: 'Authorization No. 1',
        version: 1,
        documentFingerprint: 'fingerprint-1',
      },
      furnishings: {
        depositRequiredCents: 0,
        depositPaidCents: 0,
        ...PRIVATE_PRICING,
        items: [{
          id: 'line-1',
          name: 'Lounge chair',
          quantity: 2,
          clientUnitPriceCents: 120_000,
          clientLineTotalCents: 240_000,
          ...PRIVATE_PRICING,
        }],
      },
    });

    expect(bundle?.furnishings?.items[0]).toMatchObject({ clientUnitPriceCents: 120_000, quantity: 2 });
    expect(privateKeys(bundle)).toEqual([]);
    expect(privateValues(bundle)).toEqual([]);
  });

  it('the client selections drop cost, markup, retail, basis and the cost-change flag', () => {
    const selections = adaptClientSelections({
      origin: 'commercial',
      selections: [{
        id: 'line-1',
        name: 'Lounge chair',
        quantity: 2,
        clientUnitPriceCents: 120_000,
        clientLineTotalCents: 240_000,
        docCode: 'LR-01',
        ...PRIVATE_PRICING,
      }],
    });

    expect(selections.selections[0]).toMatchObject({ clientUnitPriceCents: 120_000, clientLineTotalCents: 240_000 });
    expect(privateKeys(selections)).toEqual([]);
    expect(privateValues(selections)).toEqual([]);
  });
});
