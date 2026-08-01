import type { ShareVisibility } from '@patina/utils';
import {
  buildGuestProposalDocumentBundle,
  GUEST_BOARD_SELECT,
  GUEST_EXCLUSION_SELECT,
  GUEST_PAYMENT_MILESTONE_SELECT,
  GUEST_PHASE_SELECT,
  GUEST_PROPOSAL_SELECT,
  GUEST_SCOPE_ROOM_PRIVATE_SELECT,
  GUEST_SCOPE_ROOM_SELECT,
  GUEST_SECTION_SELECT,
} from '../guest-proposal-document';

const fullVisibility: ShareVisibility = {
  pricing: true,
  roomBudgets: true,
  paymentSchedule: true,
  supplierIdentity: true,
  sourceUrls: true,
  itemDetails: true,
  leadTimes: true,
  feedbackEnabled: false,
};

const raw = {
  proposal: {
    id: 'raw-proposal-id',
    project_id: 'raw-project-id',
    client_id: 'raw-client-id',
    designer_id: 'raw-designer-id',
    dispatch_id: 'raw-dispatch-id',
    cc_email: 'private-cc@example.com',
    signed_ip: '203.0.113.8',
    decline_reason: 'private decline',
    client_feedback: 'private feedback',
    title: 'Living room proposal',
    created_at: '2026-07-31T12:00:00.000Z',
    total_amount: 125_000,
    version: 3,
    client: {
      id: 'raw-client-id',
      full_name: 'Avery Client',
      email: 'private-client@example.com',
    },
    items: [
      {
        id: 'raw-item-id',
        proposal_id: 'raw-proposal-id',
        product_id: 'hidden-product-id',
        vendor_id: 'hidden-vendor-id',
        name: 'Lounge chair',
        image_url: 'https://cdn.example/chair.jpg',
        quantity: 2,
        item_type: 'fixed',
        line_total_cents: 125_000,
        unit_price: 400,
        unit_sell_price: 625,
        markup_percent: 56.25,
        internal_notes: 'designer-only note',
        vendor_name: 'Maker Co.',
        lead_time_weeks: 12,
        client_product_snapshot: {
          product_id: 'hidden-product-id',
          name: 'Lounge chair',
          images: ['https://cdn.example/catalog-chair.jpg'],
          brand: 'Maker Co.',
          source_url: 'https://trade.example/chair',
          dimensions: { width: 34 },
          materials: ['oak'],
          price_retail: 625,
          price_trade: 400,
          has_teaching: true,
          private_catalog_note: 'do not serialize',
        },
      },
      {
        name: 'TBD designer scaffold',
        image_url: null,
        quantity: 1,
        item_type: 'tbd',
        position: 99,
        line_total_cents: 999_999,
        internal_notes: 'never send TBD scaffolding',
      },
    ],
  },
  sections: [
    {
      id: 'raw-section-id',
      proposal_id: 'raw-proposal-id',
      title: 'Concept',
      type: 'concept',
      body: 'A calm material story.',
      metadata: {
        mood_board_urls: ['https://cdn.example/mood.jpg'],
        color_palette: [{ hex: '#d8c9b8', private_formula: 'secret' }],
        internal_direction: 'designer-only',
      },
      created_at: 'private timestamp',
    },
    {
      title: 'Investment',
      type: 'investment',
      body: 'Internal margin narrative',
      metadata: { cost_basis: 800 },
    },
  ],
  paymentMilestones: [
    {
      id: 'raw-milestone-id',
      proposal_id: 'raw-proposal-id',
      label: 'Deposit',
      percentage: 50,
      amount_cents: 62_500,
      trigger_condition: 'On signature',
      internal_notes: 'private milestone note',
    },
  ],
  phases: [
    {
      id: 'raw-phase-id',
      proposal_id: 'raw-proposal-id',
      name: 'Procurement',
      duration_weeks: 8,
      internal_notes: 'private phase note',
    },
  ],
  exclusions: [
    {
      id: 'raw-exclusion-id',
      proposal_id: 'raw-proposal-id',
      description: 'Structural engineering',
      category: 'Consultants',
      internal_notes: 'private exclusion note',
    },
  ],
  scopeRooms: [
    {
      id: 'raw-room-id',
      proposal_id: 'raw-proposal-id',
      room_id: 'raw-live-room-id',
      name: 'Living room',
      room_type: 'living_room',
      budget_cents: 125_000,
      internal_notes: 'private room note',
    },
  ],
  boards: [
    {
      id: 'raw-board-id',
      proposal_id: 'raw-proposal-id',
      name: 'Warm modern',
      canvas_width: 1200,
      canvas_height: 800,
      background_color: '#f5f3ee',
      status: 'active',
      internal_notes: 'private board note',
      proposal_board_items: [
        {
          id: 'raw-board-item-id',
          board_id: 'raw-board-id',
          product_id: 'hidden-product-id',
          type: 'product',
          x: 10,
          y: 20,
          width: 240,
          height: 220,
          z_index: 1,
          rotation: 0,
          image_url: 'https://cdn.example/chair.jpg',
          content: 'internal product annotation',
          data: {
            name: 'Lounge chair',
            image_url: 'https://cdn.example/chair.jpg',
            price_cents: 125_000,
            cost_cents: 80_000,
            vendor_name: 'Maker Co.',
            lead_time_weeks: 12,
            source_url: 'https://trade.example/chair',
            internal_notes: 'private board item note',
          },
        },
      ],
    },
  ],
};

function build(visibility: ShareVisibility) {
  return buildGuestProposalDocumentBundle({ ...raw, visibility });
}

function collectKeys(value: unknown, keys = new Set<string>()): Set<string> {
  if (Array.isArray(value)) {
    value.forEach((entry) => collectKeys(entry, keys));
    return keys;
  }
  if (!value || typeof value !== 'object') return keys;
  Object.entries(value).forEach(([key, entry]) => {
    keys.add(key);
    collectKeys(entry, keys);
  });
  return keys;
}

describe('guest proposal document boundary', () => {
  it('uses explicit source projections without table wildcards or live product joins', () => {
    const selects = [
      GUEST_PROPOSAL_SELECT,
      GUEST_SECTION_SELECT,
      GUEST_PAYMENT_MILESTONE_SELECT,
      GUEST_PHASE_SELECT,
      GUEST_EXCLUSION_SELECT,
      GUEST_SCOPE_ROOM_SELECT,
      GUEST_SCOPE_ROOM_PRIVATE_SELECT,
      GUEST_BOARD_SELECT,
    ];

    for (const select of selects) expect(select).not.toContain('*');
    expect(GUEST_PROPOSAL_SELECT).not.toContain('product:products');
    expect(GUEST_PROPOSAL_SELECT).not.toContain('price_trade');
  });

  it('serializes only allowlisted client fields even under full visibility', () => {
    const bundle = build(fullVisibility);
    const serialized = JSON.stringify(bundle);
    const keys = collectKeys(bundle);

    expect(bundle.proposal).toMatchObject({
      id: 'shared-proposal',
      designer_id: 'shared-studio',
      title: 'Living room proposal',
      total_amount: 125_000,
      client: { full_name: 'Avery Client' },
    });
    expect(bundle.proposal.items[0]).toMatchObject({
      id: 'shared-item-0',
      line_total_cents: 125_000,
      vendor_name: 'Maker Co.',
      lead_time_weeks: 12,
      product: {
        id: 'shared-product-0',
        brand: 'Maker Co.',
        source_url: 'https://trade.example/chair',
        record_completeness_hidden: true,
      },
    });
    expect(bundle.proposal.items).toHaveLength(1);
    expect(bundle.paymentMilestones).toHaveLength(1);
    expect(bundle.scopeRooms[0].budget_cents).toBe(125_000);
    expect(bundle.resolvedBoards[0].items[0].data).toEqual({
      name: 'Lounge chair',
      image_url: 'https://cdn.example/chair.jpg',
      price_cents: 125_000,
      vendor_name: 'Maker Co.',
      lead_time_weeks: 12,
      source_url: 'https://trade.example/chair',
    });

    for (const forbiddenKey of [
      'project_id',
      'client_id',
      'dispatch_id',
      'cc_email',
      'signed_ip',
      'decline_reason',
      'client_feedback',
      'proposal_id',
      'product_id',
      'vendor_id',
      'unit_price',
      'unit_sell_price',
      'markup_percent',
      'internal_notes',
      'price_trade',
      'price_retail',
      'dimensions',
      'materials',
      'cost_cents',
    ]) {
      expect(keys).not.toContain(forbiddenKey);
    }

    for (const forbiddenValue of [
      'raw-proposal-id',
      'raw-project-id',
      'raw-client-id',
      'raw-designer-id',
      'hidden-product-id',
      'private-cc@example.com',
      'private-client@example.com',
      '203.0.113.8',
      'designer-only note',
      'do not serialize',
      'TBD designer scaffold',
      'never send TBD scaffolding',
    ]) {
      expect(serialized).not.toContain(forbiddenValue);
    }

    expect(bundle.sections[0].metadata).toEqual({
      mood_board_urls: ['https://cdn.example/mood.jpg'],
      color_palette: [{ hex: '#d8c9b8' }],
    });
    expect(bundle.sections[1]).toMatchObject({ body: null, metadata: {} });
  });

  it('omits every disabled item, pricing, schedule, room-budget, and board block', () => {
    const bundle = build({
      ...fullVisibility,
      pricing: false,
      roomBudgets: false,
      paymentSchedule: false,
      supplierIdentity: false,
      sourceUrls: false,
      itemDetails: false,
      leadTimes: false,
    });

    expect(bundle.proposal.items).toEqual([]);
    expect(bundle.paymentMilestones).toEqual([]);
    expect(bundle.scopeRooms[0]).toEqual({ name: 'Living room', room_type: 'living_room' });
    expect(bundle.resolvedBoards).toEqual([]);
    // The proposal visibility law deliberately keeps the signed investment total
    // at every tier; only line pricing is controlled by `pricing`.
    expect(bundle.proposal.total_amount).toBe(125_000);
  });

  it('removes selectively hidden values before the server-to-client boundary', () => {
    const bundle = build({
      ...fullVisibility,
      pricing: false,
      roomBudgets: false,
      paymentSchedule: false,
      supplierIdentity: false,
      sourceUrls: false,
      leadTimes: false,
    });
    const item = bundle.proposal.items[0];
    const boardData = bundle.resolvedBoards[0].items[0].data;

    expect(item).toEqual({
      id: 'shared-item-0',
      name: 'Lounge chair',
      image_url: 'https://cdn.example/chair.jpg',
      quantity: 2,
      item_type: 'fixed',
      product: {
        id: 'shared-product-0',
        name: 'Lounge chair',
        images: ['https://cdn.example/catalog-chair.jpg'],
        record_completeness_hidden: true,
      },
    });
    expect(boardData).toEqual({
      name: 'Lounge chair',
      image_url: 'https://cdn.example/chair.jpg',
    });
  });
});
