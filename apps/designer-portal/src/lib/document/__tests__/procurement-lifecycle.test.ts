/**
 * R7 — the fifteen-step procurement lifecycle, both rails.
 *
 * The tests that matter are the ones about ABSENCE: a step with no fact must
 * never read as settled, and `no-record` must never be confused with `future`.
 */

import {
  deriveFulfillmentLifecycle,
  liveStep,
  nextGate,
  procurementStepLabel,
  PROCUREMENT_LIFECYCLE_GATES,
  PROCUREMENT_LIFECYCLE_STEPS,
  type ProcurementLifecycleReading,
  type ProcurementLifecycleStepKey,
  type ProcurementStepState,
} from '@patina/types';
import {
  deriveProcurementLifecycle,
  procurementExpected,
  type ProcurementLifecycleInput,
} from '../procurement-lifecycle';

const base: ProcurementLifecycleInput = {
  status: 'specified',
  quantity: 1,
  received_quantity: null,
  last_status_change_at: null,
  purchase_order: null,
  item_claims: null,
};

/** The state of one step, by key. */
function stateOf(
  reading: ProcurementLifecycleReading,
  key: ProcurementLifecycleStepKey,
): ProcurementStepState {
  return reading.steps.find((s) => s.key === key)!.state;
}

function evidenceOf(
  reading: ProcurementLifecycleReading,
  key: ProcurementLifecycleStepKey,
) {
  return reading.steps.find((s) => s.key === key)!.evidence;
}

function gateOf(reading: ProcurementLifecycleReading, key: string) {
  return reading.gates.find((g) => g.key === key)!;
}

// ════════════════════════════════════════════════════════════════════════════
// The contract itself
// ════════════════════════════════════════════════════════════════════════════

describe('the lifecycle contract (R7)', () => {
  it('is fifteen steps, in order, with the ratified names verbatim', () => {
    expect(PROCUREMENT_LIFECYCLE_STEPS.map((s) => s.label)).toEqual([
      'Cleared to produce',
      'Released to maker',
      'Acknowledged',
      'Awaiting inputs',
      'Released',
      'In production',
      'Ready to ship',
      'In transit',
      'Received / inspect',
      'Accepted or issue',
      'Stored',
      'Install released',
      'Installed',
      'Punch / service',
      'Closed',
    ]);
    expect(PROCUREMENT_LIFECYCLE_STEPS.map((s) => s.ordinal)).toEqual([
      1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15,
    ]);
  });

  it('is three gates, interrupting after steps 4, 9 and 11', () => {
    expect(
      PROCUREMENT_LIFECYCLE_GATES.map((g) => [g.label, g.afterStep]),
    ).toEqual([
      ['Complete to produce', 4],
      ['Received and dispositioned', 9],
      ['Warehouse + site ready', 11],
    ]);
  });

  it('never renders a commercial actor in a step name (№7)', () => {
    const forbidden = /authoriz|purchase order|po issued|buyer|invoice|funds/i;
    for (const step of PROCUREMENT_LIFECYCLE_STEPS) {
      expect(step.label).not.toMatch(forbidden);
    }
    for (const gate of PROCUREMENT_LIFECYCLE_GATES) {
      expect(gate.label).not.toMatch(forbidden);
    }
  });

  it('resolves a label from a key', () => {
    expect(procurementStepLabel('in_transit')).toBe('In transit');
    expect(procurementStepLabel('cleared_to_produce')).toBe(
      'Cleared to produce',
    );
  });
});

// ════════════════════════════════════════════════════════════════════════════
// Rail B — evidence mapping, step by step
// ════════════════════════════════════════════════════════════════════════════

describe('Rail B · step evidence (deriveProcurementLifecycle)', () => {
  it('tags the reading as the studio rail', () => {
    expect(deriveProcurementLifecycle(base).rail).toBe('studio');
  });

  it('01 settles when a PO exists and every deposit is paid', () => {
    const r = deriveProcurementLifecycle({
      ...base,
      purchase_order: {
        payments: [
          { kind: 'deposit', state: 'paid', paid_date: '2026-05-02' },
          { kind: 'balance', state: 'pending' },
        ],
      },
    });
    expect(stateOf(r, 'cleared_to_produce')).toBe('live');
    expect(evidenceOf(r, 'cleared_to_produce')).toEqual({
      at: '2026-05-02',
      source: 'po_payments.kind=deposit state=paid',
    });
  });

  it('01 settles VACUOUSLY when the terms carry no deposit at all', () => {
    const r = deriveProcurementLifecycle({
      ...base,
      purchase_order: { payments: [{ kind: 'balance', state: 'pending' }] },
    });
    expect(stateOf(r, 'cleared_to_produce')).toBe('live');
    expect(evidenceOf(r, 'cleared_to_produce')?.source).toBe(
      'purchase_orders (terms carry no deposit)',
    );
  });

  it('01 does NOT settle while a deposit is unpaid', () => {
    const r = deriveProcurementLifecycle({
      ...base,
      purchase_order: {
        payments: [{ kind: 'deposit', state: 'due', due_date: '2026-05-01' }],
      },
    });
    expect(stateOf(r, 'cleared_to_produce')).toBe('future');
  });

  it('01 treats a REFUNDED deposit as not paid (00277 added the value)', () => {
    const r = deriveProcurementLifecycle({
      ...base,
      purchase_order: { payments: [{ kind: 'deposit', state: 'refunded' }] },
    });
    expect(stateOf(r, 'cleared_to_produce')).toBe('future');
  });

  it('01 does not settle with no PO at all — there is nothing to clear', () => {
    expect(
      stateOf(deriveProcurementLifecycle(base), 'cleared_to_produce'),
    ).toBe('future');
  });

  it('02 settles on purchase_orders.sent_at', () => {
    const r = deriveProcurementLifecycle({
      ...base,
      purchase_order: { sent_at: '2026-05-03' },
    });
    expect(evidenceOf(r, 'released_to_maker')).toEqual({
      at: '2026-05-03',
      source: 'purchase_orders.sent_at',
    });
  });

  it('03 settles on purchase_orders.acknowledged_at', () => {
    const r = deriveProcurementLifecycle({
      ...base,
      purchase_order: { sent_at: '2026-05-03', acknowledged_at: '2026-05-06' },
    });
    expect(stateOf(r, 'released_to_maker')).toBe('settled');
    expect(evidenceOf(r, 'acknowledged')).toEqual({
      at: '2026-05-06',
      source: 'purchase_orders.acknowledged_at',
    });
  });

  it('05 and 06 both settle from the one in_production fact, dated by the item', () => {
    const r = deriveProcurementLifecycle({
      ...base,
      status: 'production',
      last_status_change_at: '2026-05-20',
      purchase_order: { status: 'in_production' },
    });
    expect(evidenceOf(r, 'released')).toEqual({
      at: '2026-05-20',
      source: 'purchase_orders.status=in_production',
    });
    expect(stateOf(r, 'released')).toBe('settled');
    expect(stateOf(r, 'in_production')).toBe('live');
  });

  it("05/06 also read the item machine's own 'production' status", () => {
    const r = deriveProcurementLifecycle({ ...base, status: 'production' });
    expect(stateOf(r, 'in_production')).toBe('live');
  });

  it('08 settles on status=shipped and carries confirmed_eta as its date', () => {
    const r = deriveProcurementLifecycle({
      ...base,
      status: 'shipped',
      purchase_order: { status: 'shipped', confirmed_eta: '2026-06-11' },
    });
    expect(evidenceOf(r, 'in_transit')).toEqual({
      at: '2026-06-11',
      source: 'purchase_orders.status=shipped + confirmed_eta',
    });
  });

  it('08 names a bare shipped source when no ETA was ever confirmed', () => {
    const r = deriveProcurementLifecycle({
      ...base,
      purchase_order: { status: 'shipped' },
    });
    expect(evidenceOf(r, 'in_transit')?.source).toBe(
      'purchase_orders.status=shipped',
    );
  });

  it('09 settles on delivered_date', () => {
    const r = deriveProcurementLifecycle({
      ...base,
      purchase_order: { status: 'delivered', delivered_date: '2026-06-14' },
    });
    expect(evidenceOf(r, 'received_inspect')).toEqual({
      at: '2026-06-14',
      source: 'purchase_orders.delivered_date',
    });
  });

  it('09 also settles from the item machine when the PO carries no date', () => {
    const r = deriveProcurementLifecycle({
      ...base,
      status: 'delivered',
      last_status_change_at: '2026-06-15',
    });
    expect(evidenceOf(r, 'received_inspect')?.source).toBe(
      'project_ffe_items.status=delivered',
    );
  });

  it('10 settles from the inspection count written back to the item', () => {
    const r = deriveProcurementLifecycle({
      ...base,
      quantity: 2,
      received_quantity: 2,
      purchase_order: { delivered_date: '2026-06-14' },
    });
    expect(evidenceOf(r, 'accepted_or_issue')?.source).toBe(
      'project_ffe_items.received_quantity',
    );
  });

  it('10 settles from an item-grain claim, dated by the claim (00196)', () => {
    const r = deriveProcurementLifecycle({
      ...base,
      received_quantity: 1,
      item_claims: [{ state: 'drafted', created_at: '2026-06-16' }],
    });
    expect(evidenceOf(r, 'accepted_or_issue')).toEqual({
      at: '2026-06-16',
      source: 'damage_claims.ffe_item_id',
    });
  });

  it('13 settles on the item machine reaching installed', () => {
    const r = deriveProcurementLifecycle({
      ...base,
      status: 'installed',
      last_status_change_at: '2026-07-01',
    });
    expect(evidenceOf(r, 'installed')).toEqual({
      at: '2026-07-01',
      source: 'project_ffe_items.status=installed',
    });
  });
});

// ════════════════════════════════════════════════════════════════════════════
// no-record vs future — the honesty rule
// ════════════════════════════════════════════════════════════════════════════

describe('Rail B · no-record is not future (the honesty rule)', () => {
  const unevidenced: ProcurementLifecycleStepKey[] = [
    'awaiting_inputs',
    'ready_to_ship',
    'stored',
    'install_released',
    'punch_service',
    'closed',
  ];

  it('reads every unevidenced step as FUTURE on an untouched line', () => {
    const r = deriveProcurementLifecycle(base);
    for (const key of unevidenced) expect(stateOf(r, key)).toBe('future');
    expect(r.steps.every((s) => s.state === 'future')).toBe(true);
  });

  it('reads 04 as NO-RECORD once the trail has moved past it', () => {
    const r = deriveProcurementLifecycle({
      ...base,
      status: 'production',
      purchase_order: { status: 'in_production' },
    });
    // step 04 sits behind the live step 06 and has no fact on this rail
    expect(stateOf(r, 'awaiting_inputs')).toBe('no-record');
    // step 07 sits ahead of it and is simply not reached yet
    expect(stateOf(r, 'ready_to_ship')).toBe('future');
  });

  it('reads 07 as NO-RECORD once the line is in transit', () => {
    const r = deriveProcurementLifecycle({
      ...base,
      purchase_order: { status: 'shipped' },
    });
    expect(stateOf(r, 'ready_to_ship')).toBe('no-record');
    expect(stateOf(r, 'stored')).toBe('future');
  });

  it('reads 11 and 12 as NO-RECORD behind an installed line, 14/15 as future', () => {
    const r = deriveProcurementLifecycle({ ...base, status: 'installed' });
    expect(stateOf(r, 'stored')).toBe('no-record');
    expect(stateOf(r, 'install_released')).toBe('no-record');
    expect(stateOf(r, 'punch_service')).toBe('future');
    expect(stateOf(r, 'closed')).toBe('future');
  });

  it('never invents an earlier step: a delivered line whose PO was never sent reads 02 as no-record', () => {
    const r = deriveProcurementLifecycle({
      ...base,
      purchase_order: { delivered_date: '2026-06-14' },
    });
    expect(stateOf(r, 'released_to_maker')).toBe('no-record');
    expect(stateOf(r, 'acknowledged')).toBe('no-record');
    expect(evidenceOf(r, 'released_to_maker')).toBeUndefined();
  });

  it('carries no evidence object on any unsettled step', () => {
    const r = deriveProcurementLifecycle({
      ...base,
      purchase_order: { status: 'shipped' },
    });
    for (const step of r.steps) {
      if (step.state === 'future' || step.state === 'no-record') {
        expect(step.evidence).toBeUndefined();
      } else {
        expect(step.evidence).toBeDefined();
      }
    }
  });
});

// ════════════════════════════════════════════════════════════════════════════
// The one-live-step invariant
// ════════════════════════════════════════════════════════════════════════════

describe('exactly one step may be live', () => {
  const cases: [string, ProcurementLifecycleInput][] = [
    ['untouched', base],
    ['cleared only', { ...base, purchase_order: { payments: [] } }],
    ['sent', { ...base, purchase_order: { sent_at: '2026-05-03' } }],
    [
      'acknowledged',
      {
        ...base,
        purchase_order: {
          sent_at: '2026-05-03',
          acknowledged_at: '2026-05-06',
        },
      },
    ],
    [
      'in production',
      {
        ...base,
        status: 'production',
        purchase_order: { status: 'in_production' },
      },
    ],
    ['in transit', { ...base, purchase_order: { status: 'shipped' } }],
    [
      'delivered',
      { ...base, purchase_order: { delivered_date: '2026-06-14' } },
    ],
    [
      'inspected with a claim',
      {
        ...base,
        received_quantity: 1,
        item_claims: [{ state: 'drafted' }],
        purchase_order: { delivered_date: '2026-06-14' },
      },
    ],
    ['installed', { ...base, status: 'installed' }],
  ];

  it.each(cases)('never renders two live steps — %s', (_name, input) => {
    const r = deriveProcurementLifecycle(input);
    expect(r.steps.filter((s) => s.state === 'live')).toHaveLength(
      _name === 'untouched' ? 0 : 1,
    );
  });

  it('makes the HIGHEST evidenced step the live one', () => {
    const r = deriveProcurementLifecycle({
      ...base,
      status: 'production',
      purchase_order: {
        sent_at: '2026-05-03',
        acknowledged_at: '2026-05-06',
        status: 'in_production',
        payments: [],
      },
    });
    expect(liveStep(r)?.key).toBe('in_production');
    expect(stateOf(r, 'cleared_to_produce')).toBe('settled');
    expect(stateOf(r, 'acknowledged')).toBe('settled');
  });

  it('leaves NOTHING live on an untouched line', () => {
    expect(liveStep(deriveProcurementLifecycle(base))).toBeNull();
  });
});

// ════════════════════════════════════════════════════════════════════════════
// Gate predicates
// ════════════════════════════════════════════════════════════════════════════

describe('gate G1 · Complete to produce', () => {
  it('settles on acknowledgment plus cleared deposits', () => {
    const r = deriveProcurementLifecycle({
      ...base,
      purchase_order: {
        sent_at: '2026-05-03',
        acknowledged_at: '2026-05-06',
        payments: [{ kind: 'deposit', state: 'paid', paid_date: '2026-05-02' }],
      },
    });
    expect(gateOf(r, 'complete_to_produce').state).toBe('settled');
  });

  it('settles VACUOUSLY when the PO carries no deposit rows at all', () => {
    const r = deriveProcurementLifecycle({
      ...base,
      purchase_order: { acknowledged_at: '2026-05-06', payments: [] },
    });
    expect(gateOf(r, 'complete_to_produce').state).toBe('settled');
  });

  it('names the missing acknowledgment when the trail is standing at it', () => {
    const r = deriveProcurementLifecycle({
      ...base,
      status: 'production',
      purchase_order: { status: 'in_production', payments: [] },
    });
    expect(gateOf(r, 'complete_to_produce')).toMatchObject({
      state: 'open',
      qualifier: 'awaiting acknowledgment',
    });
  });

  it('names an outstanding deposit once acknowledged', () => {
    const r = deriveProcurementLifecycle({
      ...base,
      status: 'production',
      purchase_order: {
        acknowledged_at: '2026-05-06',
        status: 'in_production',
        payments: [{ kind: 'deposit', state: 'due' }],
      },
    });
    expect(gateOf(r, 'complete_to_produce')).toMatchObject({
      state: 'open',
      qualifier: 'deposit outstanding',
    });
  });

  it('reads UNREACHED, not open, before the trail arrives', () => {
    expect(
      gateOf(deriveProcurementLifecycle(base), 'complete_to_produce').state,
    ).toBe('unreached');
  });
});

describe('gate G2 · Received and dispositioned', () => {
  const delivered = { delivered_date: '2026-06-14' };

  it('settles on a full-count inspection with no open claim', () => {
    const r = deriveProcurementLifecycle({
      ...base,
      quantity: 2,
      received_quantity: 2,
      purchase_order: delivered,
    });
    expect(gateOf(r, 'received_and_dispositioned').state).toBe('settled');
  });

  it('stays OPEN on a short receipt', () => {
    const r = deriveProcurementLifecycle({
      ...base,
      quantity: 4,
      received_quantity: 3,
      purchase_order: delivered,
    });
    expect(gateOf(r, 'received_and_dispositioned')).toMatchObject({
      state: 'open',
      qualifier: 'short receipt',
    });
  });

  it('stays OPEN while a drafted claim is unresolved', () => {
    const r = deriveProcurementLifecycle({
      ...base,
      quantity: 1,
      received_quantity: 1,
      item_claims: [{ state: 'drafted' }],
      purchase_order: delivered,
    });
    expect(gateOf(r, 'received_and_dispositioned')).toMatchObject({
      state: 'open',
      qualifier: 'open claim',
    });
  });

  it('stays OPEN while a notified claim is unresolved', () => {
    const r = deriveProcurementLifecycle({
      ...base,
      quantity: 1,
      received_quantity: 1,
      item_claims: [{ state: 'vendor_notified' }],
      purchase_order: delivered,
    });
    expect(gateOf(r, 'received_and_dispositioned').state).toBe('open');
  });

  it('settles once the claim resolves', () => {
    const r = deriveProcurementLifecycle({
      ...base,
      quantity: 1,
      received_quantity: 1,
      item_claims: [{ state: 'resolved' }],
      purchase_order: delivered,
    });
    expect(gateOf(r, 'received_and_dispositioned').state).toBe('settled');
  });

  it('names the awaited inspection when the goods landed but nothing was logged', () => {
    const r = deriveProcurementLifecycle({
      ...base,
      purchase_order: delivered,
    });
    expect(gateOf(r, 'received_and_dispositioned')).toMatchObject({
      state: 'open',
      qualifier: 'awaiting inspection',
    });
  });
});

describe('gate G3 · Warehouse + site ready', () => {
  it('is UNREACHED before the trail gets there — never falsely open', () => {
    expect(
      gateOf(deriveProcurementLifecycle(base), 'warehouse_and_site_ready')
        .state,
    ).toBe('unreached');
  });

  it('reads NO-RECORD once the line is installed — never settled', () => {
    const r = deriveProcurementLifecycle({ ...base, status: 'installed' });
    expect(gateOf(r, 'warehouse_and_site_ready').state).toBe('no-record');
  });

  it('carries no qualifier, because there is no term to name', () => {
    const r = deriveProcurementLifecycle({ ...base, status: 'installed' });
    expect(gateOf(r, 'warehouse_and_site_ready').qualifier).toBeUndefined();
  });
});

describe('nextGate', () => {
  it('is the nearest unsettled gate', () => {
    const r = deriveProcurementLifecycle({
      ...base,
      status: 'production',
      purchase_order: { status: 'in_production', payments: [] },
    });
    expect(nextGate(r)?.key).toBe('complete_to_produce');
  });

  it('moves on once the first gate settles', () => {
    const r = deriveProcurementLifecycle({
      ...base,
      status: 'production',
      purchase_order: {
        acknowledged_at: '2026-05-06',
        status: 'in_production',
        payments: [],
      },
    });
    expect(nextGate(r)?.key).toBe('received_and_dispositioned');
  });
});

// ════════════════════════════════════════════════════════════════════════════
// Expected — ledger density, existing data only
// ════════════════════════════════════════════════════════════════════════════

describe('procurementExpected', () => {
  it('prefers the confirmed ETA', () => {
    expect(
      procurementExpected({
        confirmed_eta: '2026-08-22',
        payments: [{ kind: 'balance', state: 'due', due_date: '2026-07-01' }],
      }),
    ).toBe('2026-08-22');
  });

  it('falls back to the nearest unpaid payment date', () => {
    expect(
      procurementExpected({
        payments: [
          { kind: 'balance', state: 'due', due_date: '2026-09-01' },
          { kind: 'deposit', state: 'pending', due_date: '2026-07-01' },
        ],
      }),
    ).toBe('2026-07-01');
  });

  it('ignores paid and refunded rows', () => {
    expect(
      procurementExpected({
        payments: [
          { kind: 'deposit', state: 'paid', due_date: '2026-05-01' },
          { kind: 'balance', state: 'refunded', due_date: '2026-06-01' },
        ],
      }),
    ).toBeNull();
  });

  it('expects nothing rather than guessing', () => {
    expect(procurementExpected(null)).toBeNull();
    expect(procurementExpected(undefined)).toBeNull();
  });
});

// ════════════════════════════════════════════════════════════════════════════
// Rail A — the Patina fulfilment ledger
// ════════════════════════════════════════════════════════════════════════════

describe('Rail A · line_state chain (deriveFulfillmentLifecycle)', () => {
  it('tags the reading as the patina rail', () => {
    expect(deriveFulfillmentLifecycle({ line_state: 'intake' }).rail).toBe(
      'patina',
    );
  });

  it.each([
    ['transmitted', 'released_to_maker'],
    ['acknowledged', 'acknowledged'],
    ['in_production', 'in_production'],
    ['shipped', 'in_transit'],
    ['delivered', 'received_inspect'],
  ] as [string, ProcurementLifecycleStepKey][])(
    'maps %s onto %s as the live step',
    (line_state, key) => {
      const r = deriveFulfillmentLifecycle({ line_state });
      expect(liveStep(r)?.key).toBe(key);
    },
  );

  it('settles step 15 on `settled` and leaves NOTHING live — the trail is closed', () => {
    const r = deriveFulfillmentLifecycle({ line_state: 'settled' });
    expect(stateOf(r, 'closed')).toBe('settled');
    expect(liveStep(r)).toBeNull();
  });

  it('treats intake and split as bookkeeping — no step is drawn', () => {
    for (const line_state of ['intake', 'split']) {
      const r = deriveFulfillmentLifecycle({ line_state });
      expect(r.steps.every((s) => s.state === 'future')).toBe(true);
    }
  });

  it('settles the whole chain behind the current state', () => {
    const r = deriveFulfillmentLifecycle({ line_state: 'shipped' });
    expect(stateOf(r, 'released_to_maker')).toBe('settled');
    expect(stateOf(r, 'acknowledged')).toBe('settled');
    expect(stateOf(r, 'in_production')).toBe('settled');
    expect(stateOf(r, 'in_transit')).toBe('live');
  });

  it('dates ONLY the current state, because the row carries one date', () => {
    const r = deriveFulfillmentLifecycle({
      line_state: 'in_production',
      line_state_entered_at: '2026-05-20',
    });
    expect(evidenceOf(r, 'in_production')?.at).toBe('2026-05-20');
    expect(evidenceOf(r, 'acknowledged')?.at).toBe('');
    expect(evidenceOf(r, 'acknowledged')?.source).toBe(
      'fulfillment_order_items.line_state=acknowledged',
    );
  });

  it('reads the unevidenced steps behind the trail as no-record, not settled', () => {
    const r = deriveFulfillmentLifecycle({ line_state: 'delivered' });
    expect(stateOf(r, 'cleared_to_produce')).toBe('no-record');
    expect(stateOf(r, 'awaiting_inputs')).toBe('no-record');
    expect(stateOf(r, 'released')).toBe('no-record');
    expect(stateOf(r, 'ready_to_ship')).toBe('no-record');
  });

  it('draws NOTHING on the trail for a cancelled line — it is off-trail', () => {
    const r = deriveFulfillmentLifecycle({ line_state: 'cancelled' });
    expect(r.steps.every((s) => s.state === 'future')).toBe(true);
    expect(liveStep(r)).toBeNull();
  });

  it('prefers the shipment dates over the undated chain', () => {
    const r = deriveFulfillmentLifecycle({
      line_state: 'delivered',
      shipments: [{ shipped_at: '2026-06-01', delivered_at: '2026-06-11' }],
    });
    expect(evidenceOf(r, 'in_transit')).toEqual({
      at: '2026-06-01',
      source: 'fulfillment_shipments.shipped_at',
    });
    expect(evidenceOf(r, 'received_inspect')).toEqual({
      at: '2026-06-11',
      source: 'fulfillment_shipments.delivered_at',
    });
  });
});

describe('Rail A · exceptions read at step 10', () => {
  it('reads an open exception as the issue half of Accepted or issue', () => {
    const r = deriveFulfillmentLifecycle({
      line_state: 'delivered',
      exceptions: [{ status: 'open', type: 'damage', opened_at: '2026-06-12' }],
    });
    expect(evidenceOf(r, 'accepted_or_issue')).toEqual({
      at: '2026-06-12',
      source: 'fulfillment_exceptions.damage',
    });
    expect(liveStep(r)?.key).toBe('accepted_or_issue');
  });

  it('counts pending_leah as still open', () => {
    const r = deriveFulfillmentLifecycle({
      line_state: 'delivered',
      exceptions: [{ status: 'pending_leah', type: 'delay' }],
    });
    expect(stateOf(r, 'accepted_or_issue')).toBe('live');
    expect(gateOf(r, 'received_and_dispositioned')).toMatchObject({
      state: 'open',
      qualifier: 'open exception',
    });
  });

  it('does not claim acceptance once the exception resolves', () => {
    const r = deriveFulfillmentLifecycle({
      line_state: 'delivered',
      exceptions: [{ status: 'resolved', type: 'damage' }],
    });
    // acceptance has no Rail A fact — the step stays unclaimed…
    expect(stateOf(r, 'accepted_or_issue')).toBe('future');
    // …but the gate settles, because nothing is outstanding.
    expect(gateOf(r, 'received_and_dispositioned').state).toBe('settled');
  });
});

describe('Rail A · gates', () => {
  it('reads G1 as no-record past step 04 — the rail has no inputs fact', () => {
    const r = deriveFulfillmentLifecycle({ line_state: 'shipped' });
    expect(gateOf(r, 'complete_to_produce').state).toBe('no-record');
  });

  it('settles G2 on delivery with no open exception', () => {
    const r = deriveFulfillmentLifecycle({ line_state: 'delivered' });
    expect(gateOf(r, 'received_and_dispositioned').state).toBe('settled');
  });

  it('holds G2 open before delivery', () => {
    const r = deriveFulfillmentLifecycle({ line_state: 'shipped' });
    expect(gateOf(r, 'received_and_dispositioned').state).toBe('unreached');
  });

  it('never settles G3 on either rail', () => {
    for (const line_state of ['intake', 'shipped', 'delivered', 'settled']) {
      expect(
        gateOf(
          deriveFulfillmentLifecycle({ line_state }),
          'warehouse_and_site_ready',
        ).state,
      ).not.toBe('settled');
    }
  });
});

// ════════════════════════════════════════════════════════════════════════════
// One contract, two rails
// ════════════════════════════════════════════════════════════════════════════

describe('both rails answer the same shape', () => {
  it('always returns all fifteen steps and all three gates, in order', () => {
    const readings = [
      deriveProcurementLifecycle(base),
      deriveProcurementLifecycle({ ...base, status: 'installed' }),
      deriveFulfillmentLifecycle({ line_state: 'intake' }),
      deriveFulfillmentLifecycle({ line_state: 'settled' }),
    ];
    for (const r of readings) {
      expect(r.steps.map((s) => s.ordinal)).toEqual([
        1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15,
      ]);
      expect(r.gates.map((g) => g.afterStep)).toEqual([4, 9, 11]);
    }
  });
});
