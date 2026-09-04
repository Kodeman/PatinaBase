import type { DirectOrder } from '@patina/supabase';

import { toClosedOrders, toRoadOrders } from '../road-orders';

function order(overrides: Partial<DirectOrder> = {}): DirectOrder {
  return {
    id: 'ord-1',
    client_id: 'client-1',
    product_id: 'prod-1',
    product_name: 'Brass floor lamp',
    quantity: 1,
    unit_price_cents: 42_000,
    amount_cents: 42_000,
    currency: 'USD',
    status: 'pending_payment',
    stripe_checkout_session_id: null,
    stripe_payment_intent_id: null,
    shipping: null,
    created_at: '2026-08-01T10:00:00Z',
    paid_at: null,
    project_id: 'project-1',
    ...overrides,
  };
}

describe('toRoadOrders', () => {
  it('stands an unpaid piece at the first stop, payable', () => {
    const [piece] = toRoadOrders([order()], 'project-1');

    expect(piece).toMatchObject({
      id: 'ord-1',
      name: 'Brass floor lamp',
      amountCents: 42_000,
      stageIndex: 0,
      payable: true,
    });
  });

  it('moves a paid piece to the maker, and to transit once it has a tracking number', () => {
    expect(toRoadOrders([order({ status: 'paid', paid_at: '2026-08-02' })], 'project-1')[0])
      .toMatchObject({ stageIndex: 1, payable: false });

    expect(
      toRoadOrders(
        [order({ status: 'paid', shipping: { tracking_number: '1Z999' } })],
        'project-1',
      )[0],
    ).toMatchObject({ stageIndex: 3 });
  });

  it('will not offer to pay for a piece already in flight, and says it is in flight', () => {
    const [piece] = toRoadOrders([order({ stripe_payment_intent_id: 'pi_1' })], 'project-1');

    expect(piece).toMatchObject({ payable: false, inFlight: true, settled: false });
  });

  it('marks a piece raised against no house', () => {
    expect(toRoadOrders([order({ project_id: null })], 'project-1')[0].houseless).toBe(true);
    expect(toRoadOrders([order()], 'project-1')[0].houseless).toBe(false);
  });

  it('keeps this house’s orders and the ones raised against no house', () => {
    const kept = toRoadOrders(
      [
        order({ id: 'mine', project_id: 'project-1' }),
        order({ id: 'houseless', project_id: null }),
        order({ id: 'elsewhere', project_id: 'project-2' }),
      ],
      'project-1',
    );

    expect(kept.map((piece) => piece.id)).toEqual(['mine', 'houseless']);
  });

  it('drops what is not coming, and holds nothing when nothing was bought', () => {
    expect(
      toRoadOrders(
        [order({ status: 'canceled' }), order({ id: 'r', status: 'refunded' })],
        'project-1',
      ),
    ).toEqual([]);
    expect(toRoadOrders(undefined, 'project-1')).toEqual([]);
  });
});

describe('toClosedOrders', () => {
  it('keeps what is not coming, in /orders’ own words, newest first', () => {
    const closed = toClosedOrders(
      [
        order({ id: 'ref', status: 'refunded', created_at: '2026-08-01T10:00:00Z' }),
        order({ id: 'can', status: 'canceled', created_at: '2026-08-09T10:00:00Z' }),
        order({ id: 'moving', status: 'pending_payment' }),
      ],
      'project-1',
    );

    expect(closed.map((piece) => [piece.id, piece.word])).toEqual([
      ['can', 'Canceled'],
      ['ref', 'Refunded'],
    ]);
  });

  it('keeps another house’s closed orders out of this one', () => {
    expect(
      toClosedOrders([order({ status: 'refunded', project_id: 'project-2' })], 'project-1'),
    ).toEqual([]);
    expect(toClosedOrders(undefined, 'project-1')).toEqual([]);
  });
});
