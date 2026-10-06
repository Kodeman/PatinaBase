/**
 * C-24: the COM yardage helper's arithmetic (lib/document/com-yardage.ts).
 * It shows every step, the steps sum to the total, and the workroom's own
 * figure wins over the chart.
 */

import { formatTenths, readYardage } from '@/lib/document/com-yardage';

const sum = (steps: { tenths: number }[]) => steps.reduce((total, s) => total + s.tenths, 0);

describe('readYardage', () => {
  it('reads nothing without a chart or a workroom figure', () => {
    expect(readYardage({})).toBeNull();
    expect(readYardage({ chartYards: 0, widthIn: 54 })).toBeNull();
  });

  it('adds only the cutting overage to a 54" plain', () => {
    const reading = readYardage({ chartYards: 14, widthIn: 54 })!;
    expect(reading.source).toBe('chart');
    expect(reading.steps).toEqual([
      { label: 'Chart (54" plain)', tenths: 140 },
      { label: 'Cutting and flaws (+10%)', tenths: 14 },
    ]);
    expect(reading.totalTenths).toBe(154);
    expect(reading.orderYards).toBe(16);
  });

  it('adds +30% for a large repeat before the overage (D1-04: 14 yd, 27" repeat)', () => {
    const reading = readYardage({ chartYards: 14, widthIn: 54, repeatIn: 27 })!;
    expect(reading.steps.map((s) => [s.label, s.tenths])).toEqual([
      ['Chart (54" plain)', 140],
      ['Repeat 27" (+30%)', 42],
      ['Cutting and flaws (+10%)', 18],
    ]);
    expect(reading.totalTenths).toBe(200);
    expect(reading.orderYards).toBe(20);
    expect(reading.sentence).toBe(
      "The chart's 14 yd comes to 20 yd, ordered as 20 yd. The workroom's own figure wins — type it over this.",
    );
  });

  it('adds +15% for a repeat up to 14"', () => {
    const reading = readYardage({ chartYards: 10, repeatIn: 14 })!;
    expect(reading.steps[1]).toEqual({ label: 'Repeat 14" (+15%)', tenths: 15 });
  });

  it('scales narrow goods to 54", unless railroaded', () => {
    const narrow = readYardage({ chartYards: 12, widthIn: 48 })!;
    expect(narrow.steps[1]).toEqual({ label: 'Narrow goods (48" wide)', tenths: 15 });
    expect(narrow.totalTenths).toBe(sum(narrow.steps));
    expect(narrow.orderYards).toBe(15); // 12 + 1.5 + 1.4 = 14.9 → 15

    const railroaded = readYardage({ chartYards: 12, widthIn: 48, railroaded: true })!;
    expect(railroaded.steps.map((s) => s.label)).not.toContain('Narrow goods (48" wide)');
    expect(railroaded.orderYards).toBe(14); // 12 + 1.2 = 13.2 → 14
  });

  it('prints steps that always sum to the total it prints', () => {
    const reading = readYardage({ chartYards: 13.3, widthIn: 52, repeatIn: 19 })!;
    expect(reading.totalTenths).toBe(sum(reading.steps));
    expect(reading.orderYards).toBe(Math.ceil(reading.totalTenths / 10));
  });

  it("lets the workroom's figure win, plus 10% for cutting (the specimen's Hale)", () => {
    const reading = readYardage({
      chartYards: 14,
      repeatIn: 27,
      workroomYards: 17,
      workroomName: 'Hale',
    })!;
    expect(reading.source).toBe('workroom');
    expect(reading.steps).toEqual([
      { label: "Hale's figure", tenths: 170 },
      { label: 'Cutting and flaws (+10%)', tenths: 17 },
    ]);
    expect(reading.orderYards).toBe(19);
    expect(reading.sentence).toBe(
      "Hale asked for 17 yd. With 10% for cutting that is 18.7 yd, ordered as 19 yd. Hale's number wins.",
    );
  });

  it('formats tenths without a trailing .0', () => {
    expect(formatTenths(170)).toBe('17');
    expect(formatTenths(187)).toBe('18.7');
  });
});
