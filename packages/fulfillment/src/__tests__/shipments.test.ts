import { describe, it, expect } from 'vitest';
import {
  canDeliverShipment,
  describeShipmentStatus,
  formatItemSummary,
  formatSlip,
  hasOpenInspectionWindow,
  inspectionCountdown,
  modeLabel,
  requiresAppointment,
  sortShipmentBoard,
} from '../shipments';

describe('modeLabel / requiresAppointment', () => {
  it('labels the three known modes', () => {
    expect(modeLabel('parcel')).toBe('Parcel');
    expect(modeLabel('ltl')).toBe('LTL');
    expect(modeLabel('white_glove')).toBe('White Glove');
  });

  it('echoes back an unrecognized mode rather than throwing', () => {
    expect(modeLabel('freight_forward')).toBe('freight_forward');
  });

  it('requires an appointment only for ltl/white_glove', () => {
    expect(requiresAppointment('parcel')).toBe(false);
    expect(requiresAppointment('ltl')).toBe(true);
    expect(requiresAppointment('white_glove')).toBe(true);
  });
});

describe('formatSlip', () => {
  it('renders the presentation worked example: SEP 10 · +7', () => {
    const slip = formatSlip('2026-09-03', '2026-09-10');
    expect(slip.display).toBe('SEP 10 · +7');
    expect(slip.deltaDays).toBe(7);
    expect(slip.slipped).toBe(true);
  });

  it('renders an early arrival with a negative delta, not slipped', () => {
    const slip = formatSlip('2026-09-10', '2026-09-08');
    expect(slip.display).toBe('SEP 8 · -2');
    expect(slip.deltaDays).toBe(-2);
    expect(slip.slipped).toBe(false);
  });

  it('renders the bare date with no delta when on schedule', () => {
    const slip = formatSlip('2026-09-10', '2026-09-10');
    expect(slip.display).toBe('SEP 10');
    expect(slip.deltaDays).toBe(0);
    expect(slip.slipped).toBe(false);
  });

  it('falls back to the promised date when no current ETA is recorded yet', () => {
    expect(formatSlip('2026-09-10', null)).toEqual({
      display: 'SEP 10',
      deltaDays: null,
      slipped: false,
    });
  });

  it('renders an em dash when neither date is known', () => {
    expect(formatSlip(null, null)).toEqual({ display: '—', deltaDays: null, slipped: false });
  });

  it('renders the current date alone when no promised date exists to diff against', () => {
    expect(formatSlip(null, '2026-09-10')).toEqual({
      display: 'SEP 10',
      deltaDays: null,
      slipped: false,
    });
  });
});

describe('inspectionCountdown', () => {
  const now = Date.UTC(2026, 8, 1, 12, 0, 0); // 2026-09-01T12:00:00Z

  it('returns null when there is no window', () => {
    expect(inspectionCountdown(null, now)).toBeNull();
  });

  it('ceiling-rounds days remaining and flags terracotta at <= 2 days', () => {
    const closesSoon = new Date(now + 30 * 60 * 60 * 1000).toISOString(); // 30h out -> 2 days
    const c = inspectionCountdown(closesSoon, now);
    expect(c).toMatchObject({ isOpen: true, daysRemaining: 2, label: '2 DAYS', terracotta: true });
  });

  it('renders singular "1 DAY"', () => {
    const closesSoon = new Date(now + 6 * 60 * 60 * 1000).toISOString(); // 6h out -> 1 day
    const c = inspectionCountdown(closesSoon, now);
    expect(c).toMatchObject({ isOpen: true, daysRemaining: 1, label: '1 DAY', terracotta: true });
  });

  it('is not terracotta beyond the 2-day threshold', () => {
    const closesLater = new Date(now + 4 * 24 * 60 * 60 * 1000).toISOString();
    const c = inspectionCountdown(closesLater, now);
    expect(c).toMatchObject({ isOpen: true, daysRemaining: 4, terracotta: false });
  });

  it('reports CLOSED once the window has passed', () => {
    const closed = new Date(now - 60 * 60 * 1000).toISOString();
    const c = inspectionCountdown(closed, now);
    expect(c).toMatchObject({ isOpen: false, label: 'CLOSED', terracotta: false });
    expect(c!.daysRemaining).toBeLessThanOrEqual(0);
  });
});

describe('hasOpenInspectionWindow', () => {
  const now = Date.UTC(2026, 8, 1);

  it('is false without a delivery', () => {
    expect(
      hasOpenInspectionWindow({ deliveredAt: null, inspectionClosesAt: '2026-09-05T00:00:00Z' }, now),
    ).toBe(false);
  });

  it('is false without a window', () => {
    expect(
      hasOpenInspectionWindow({ deliveredAt: '2026-08-30T00:00:00Z', inspectionClosesAt: null }, now),
    ).toBe(false);
  });

  it('is true when delivered and the window has not closed', () => {
    expect(
      hasOpenInspectionWindow(
        { deliveredAt: '2026-08-30T00:00:00Z', inspectionClosesAt: '2026-09-05T00:00:00Z' },
        now,
      ),
    ).toBe(true);
  });

  it('is false once the window has closed', () => {
    expect(
      hasOpenInspectionWindow(
        { deliveredAt: '2026-08-20T00:00:00Z', inspectionClosesAt: '2026-08-25T00:00:00Z' },
        now,
      ),
    ).toBe(false);
  });
});

describe('canDeliverShipment — the appointment gate (package S5 accepts-when)', () => {
  it('allows a parcel shipment with no appointment info', () => {
    expect(
      canDeliverShipment({ mode: 'parcel', appointmentConfirmedAt: null, deliveredAt: null }),
    ).toEqual({ allowed: true, reason: null, message: null });
  });

  it('blocks an LTL shipment without a confirmed appointment', () => {
    const gate = canDeliverShipment({ mode: 'ltl', appointmentConfirmedAt: null, deliveredAt: null });
    expect(gate.allowed).toBe(false);
    expect(gate.reason).toBe('appointment_required');
    expect(gate.message).toMatch(/LTL/);
  });

  it('blocks a white_glove shipment without a confirmed appointment', () => {
    const gate = canDeliverShipment({
      mode: 'white_glove',
      appointmentConfirmedAt: null,
      deliveredAt: null,
    });
    expect(gate.allowed).toBe(false);
    expect(gate.reason).toBe('appointment_required');
    expect(gate.message).toMatch(/White Glove/);
  });

  it('allows an LTL shipment once the appointment is confirmed', () => {
    expect(
      canDeliverShipment({
        mode: 'ltl',
        appointmentConfirmedAt: '2026-08-20T00:00:00Z',
        deliveredAt: null,
      }),
    ).toEqual({ allowed: true, reason: null, message: null });
  });

  it('blocks any mode already marked delivered', () => {
    const gate = canDeliverShipment({
      mode: 'parcel',
      appointmentConfirmedAt: null,
      deliveredAt: '2026-08-21T00:00:00Z',
    });
    expect(gate.allowed).toBe(false);
    expect(gate.reason).toBe('already_delivered');
  });
});

describe('describeShipmentStatus', () => {
  const now = Date.UTC(2026, 8, 1);

  it('describes a parcel in transit with a carrier', () => {
    expect(
      describeShipmentStatus(
        { mode: 'parcel', carrier: 'UPS', deliveredAt: null, appointmentConfirmedAt: null, inspectionClosesAt: null },
        now,
      ),
    ).toBe('In transit via UPS');
  });

  it('flags an LTL shipment awaiting its appointment', () => {
    expect(
      describeShipmentStatus(
        { mode: 'ltl', carrier: 'XPO', deliveredAt: null, appointmentConfirmedAt: null, inspectionClosesAt: null },
        now,
      ),
    ).toBe('In transit — awaiting delivery appointment');
  });

  it('describes a delivered shipment with an open window', () => {
    const closesAt = new Date(now + 2 * 24 * 60 * 60 * 1000).toISOString();
    expect(
      describeShipmentStatus(
        {
          mode: 'ltl',
          carrier: 'XPO',
          deliveredAt: '2026-08-30T00:00:00Z',
          appointmentConfirmedAt: '2026-08-25T00:00:00Z',
          inspectionClosesAt: closesAt,
        },
        now,
      ),
    ).toBe('Delivered — inspection window open, 2 days left');
  });

  it('describes a delivered shipment with a closed window', () => {
    expect(
      describeShipmentStatus(
        {
          mode: 'parcel',
          carrier: 'UPS',
          deliveredAt: '2026-08-01T00:00:00Z',
          appointmentConfirmedAt: null,
          inspectionClosesAt: '2026-08-06T00:00:00Z',
        },
        now,
      ),
    ).toBe('Delivered — inspection window closed');
  });
});

describe('sortShipmentBoard', () => {
  const now = Date.UTC(2026, 8, 1);

  it('pins open inspection windows first, soonest-closing first, ahead of everything by ETA', () => {
    const rows = [
      {
        id: 'late-eta',
        deliveredAt: null,
        inspectionClosesAt: null,
        currentEta: '2026-09-20',
        committedShip: '2026-09-10',
      },
      {
        id: 'window-5d',
        deliveredAt: '2026-08-29T00:00:00Z',
        inspectionClosesAt: new Date(now + 5 * 86_400_000).toISOString(),
        currentEta: null,
        committedShip: null,
      },
      {
        id: 'soon-eta',
        deliveredAt: null,
        inspectionClosesAt: null,
        currentEta: '2026-09-05',
        committedShip: '2026-09-05',
      },
      {
        id: 'window-2d',
        deliveredAt: '2026-08-30T00:00:00Z',
        inspectionClosesAt: new Date(now + 2 * 86_400_000).toISOString(),
        currentEta: null,
        committedShip: null,
      },
    ];

    const sorted = sortShipmentBoard(rows, now).map((r) => r.id);
    expect(sorted).toEqual(['window-2d', 'window-5d', 'soon-eta', 'late-eta']);
  });

  it('falls back to committedShip when currentEta is unset, and sorts unknown ETAs last', () => {
    const rows = [
      { id: 'no-eta', deliveredAt: null, inspectionClosesAt: null, currentEta: null, committedShip: null },
      {
        id: 'promised-only',
        deliveredAt: null,
        inspectionClosesAt: null,
        currentEta: null,
        committedShip: '2026-09-02',
      },
    ];
    const sorted = sortShipmentBoard(rows, now).map((r) => r.id);
    expect(sorted).toEqual(['promised-only', 'no-eta']);
  });
});

describe('formatItemSummary', () => {
  it('renders a single item verbatim', () => {
    expect(formatItemSummary(['Walnut Credenza'])).toBe('Walnut Credenza');
  });

  it('renders the first item plus a count for multiple', () => {
    expect(formatItemSummary(['Walnut Credenza', 'Brass Sconce', 'Side Table'])).toBe(
      'Walnut Credenza +2 more',
    );
  });

  it('renders a fallback for an empty line set', () => {
    expect(formatItemSummary([])).toBe('No items');
  });
});
