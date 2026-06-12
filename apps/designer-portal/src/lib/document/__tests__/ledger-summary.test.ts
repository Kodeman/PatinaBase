import { ordersThroughput, hoursUtilization } from '../ledger-summary';

const NOW = new Date('2026-06-12T12:00:00Z');
const ymd = (d: number) => new Date(NOW.getTime() + d * 86_400_000).toISOString().slice(0, 10);

describe('ordersThroughput (Orders front-matter, R5)', () => {
  it('counts open POs, excluding delivered/cancelled', () => {
    const pos = [
      { status: 'confirmed', confirmed_eta: null, sent_at: 's', acknowledged_at: 'a' },
      { status: 'shipped', confirmed_eta: null, sent_at: 's', acknowledged_at: 'a' },
      { status: 'delivered', confirmed_eta: null, sent_at: 's', acknowledged_at: 'a' },
      { status: 'cancelled', confirmed_eta: null, sent_at: 's', acknowledged_at: 'a' },
    ];
    const open = ordersThroughput(pos, NOW).find((s) => s.label === 'Open');
    expect(open?.value).toBe('2');
  });

  it('arriving this week = confirmed_eta within the next 7 days, live POs only', () => {
    const pos = [
      { status: 'shipped', confirmed_eta: ymd(3), sent_at: 's', acknowledged_at: 'a' }, // in
      { status: 'confirmed', confirmed_eta: ymd(10), sent_at: 's', acknowledged_at: 'a' }, // out (>7d)
      { status: 'delivered', confirmed_eta: ymd(2), sent_at: 's', acknowledged_at: 'a' }, // out (settled)
    ];
    const arriving = ordersThroughput(pos, NOW).find((s) => s.label === 'Arriving this week');
    expect(arriving?.value).toBe('1');
  });

  it('surfaces unsent + no-ack only when present', () => {
    const pos = [
      { status: 'draft', confirmed_eta: null, sent_at: null, acknowledged_at: null }, // unsent
      { status: 'confirmed', confirmed_eta: null, sent_at: 's', acknowledged_at: null }, // no ack
    ];
    const stats = ordersThroughput(pos, NOW);
    expect(stats.find((s) => s.label === 'Unsent')?.value).toBe('1');
    expect(stats.find((s) => s.label === 'No ack')?.value).toBe('1');
  });

  it('a clean book shows only Open', () => {
    const pos = [{ status: 'confirmed', confirmed_eta: null, sent_at: 's', acknowledged_at: 'a' }];
    expect(ordersThroughput(pos, NOW).map((s) => s.label)).toEqual(['Open']);
  });
});

describe('hoursUtilization (Hours front-matter, R5)', () => {
  it('sums total + billable and the billable share', () => {
    const u = hoursUtilization([
      { duration_minutes: 60, billable: true },
      { duration_minutes: 30, billable: false },
      { duration_minutes: 90 }, // default-billable
    ]);
    expect(u.totalMinutes).toBe(180);
    expect(u.billableMinutes).toBe(150);
    expect(u.billablePct).toBe(83);
  });

  it('null share when nothing is logged', () => {
    expect(hoursUtilization([]).billablePct).toBeNull();
  });
});
