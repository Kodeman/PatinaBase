import { describe, it, expect } from 'vitest';
import { computeVendorScorecard, emptyVendorScorecard } from '../scorecard';

describe('emptyVendorScorecard', () => {
  it('n=0 and every rate null — the seed reality (spec §7 EmptyState case)', () => {
    expect(emptyVendorScorecard('vendor-1', 90)).toEqual({
      vendorId: 'vendor-1',
      windowDays: 90,
      n: 0,
      medianAckHours: null,
      onTimeShipRate: null,
      damageRate: null,
      fillRate: null,
      exceptionRateByCause: {},
    });
  });
});

describe('computeVendorScorecard', () => {
  it('zero POs -> every rate null, n=0 (never a fabricated 0%)', () => {
    const sc = computeVendorScorecard('vendor-1', 90, { pos: [], shipments: [], exceptions: [], orderItemCount: 0 });
    expect(sc.n).toBe(0);
    expect(sc.medianAckHours).toBeNull();
    expect(sc.onTimeShipRate).toBeNull();
    expect(sc.damageRate).toBeNull();
    expect(sc.fillRate).toBeNull();
  });

  it('median ack time over POs with both timestamps; POs missing one are excluded', () => {
    const sc = computeVendorScorecard('vendor-1', 90, {
      pos: [
        { id: 'po-1', transmitted_at: '2026-06-01T00:00:00Z', acked_at: '2026-06-01T24:00:00Z', committed_ship: null }, // 24h
        { id: 'po-2', transmitted_at: '2026-06-02T00:00:00Z', acked_at: '2026-06-03T00:00:00Z', committed_ship: null }, // 24h
        { id: 'po-3', transmitted_at: '2026-06-04T00:00:00Z', acked_at: '2026-06-08T00:00:00Z', committed_ship: null }, // 96h
        { id: 'po-4', transmitted_at: '2026-06-05T00:00:00Z', acked_at: null, committed_ship: null }, // not yet acked — excluded
      ],
      shipments: [],
      exceptions: [],
      orderItemCount: 0,
    });
    expect(sc.n).toBe(4);
    expect(sc.medianAckHours).toBe(24); // [24,24,96] -> median 24
  });

  it('on-time ship rate: shipped_at date <= committed_ship date counts as on time', () => {
    const sc = computeVendorScorecard('vendor-1', 90, {
      pos: [
        { id: 'po-1', transmitted_at: null, acked_at: null, committed_ship: '2026-06-10' },
        { id: 'po-2', transmitted_at: null, acked_at: null, committed_ship: '2026-06-10' },
        { id: 'po-3', transmitted_at: null, acked_at: null, committed_ship: '2026-06-10' }, // no shipment -> excluded from rate
      ],
      shipments: [
        { po_id: 'po-1', shipped_at: '2026-06-09T12:00:00Z' }, // on time
        { po_id: 'po-2', shipped_at: '2026-06-12T12:00:00Z' }, // late
      ],
      exceptions: [],
      orderItemCount: 0,
    });
    expect(sc.onTimeShipRate).toBe(0.5);
  });

  it('damage rate: damage exceptions / n POs', () => {
    const sc = computeVendorScorecard('vendor-1', 90, {
      pos: [
        { id: 'po-1', transmitted_at: null, acked_at: null, committed_ship: null },
        { id: 'po-2', transmitted_at: null, acked_at: null, committed_ship: null },
        { id: 'po-3', transmitted_at: null, acked_at: null, committed_ship: null },
        { id: 'po-4', transmitted_at: null, acked_at: null, committed_ship: null },
      ],
      shipments: [],
      exceptions: [
        { po_id: 'po-1', type: 'damage', cause_code: 'freight_mishandling' },
        { po_id: 'po-2', type: 'delay', cause_code: null },
      ],
      orderItemCount: 0,
    });
    expect(sc.damageRate).toBe(0.25);
  });

  it('fill rate: 1 - (backorder+substitution exceptions / order item count)', () => {
    const sc = computeVendorScorecard('vendor-1', 90, {
      pos: [{ id: 'po-1', transmitted_at: null, acked_at: null, committed_ship: null }],
      shipments: [],
      exceptions: [
        { po_id: 'po-1', type: 'backorder', cause_code: null },
      ],
      orderItemCount: 10,
    });
    expect(sc.fillRate).toBe(0.9);
  });

  it('exception rate by cause, falling back to type when cause_code is unset (still-open exception)', () => {
    const sc = computeVendorScorecard('vendor-1', 90, {
      pos: [
        { id: 'po-1', transmitted_at: null, acked_at: null, committed_ship: null },
        { id: 'po-2', transmitted_at: null, acked_at: null, committed_ship: null },
      ],
      shipments: [],
      exceptions: [
        { po_id: 'po-1', type: 'damage', cause_code: 'freight_mishandling' },
        { po_id: 'po-2', type: 'delay', cause_code: null },
      ],
      orderItemCount: 0,
    });
    expect(sc.exceptionRateByCause).toEqual({ freight_mishandling: 0.5, delay: 0.5 });
  });
});
