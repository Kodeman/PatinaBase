/**
 * C-24 (D1-04, M4): the COM yardage helper. It turns a maker's yardage chart
 * into yards to order and shows every step, because it is arithmetic, not a
 * decision. The workroom's own figure wins: once typed, it replaces the
 * chart's adjustments and only the cutting overage is added to it.
 *
 * The shop rule (r3 §3.6):
 * - A chart is stated for 54" plain fabric.
 * - Narrow goods: under 54" wide needs proportionally more yards, unless the
 *   fabric is railroaded (its width then runs up the piece, not across it).
 * - Repeat: +15% for a vertical repeat up to 14", +30% for a larger one.
 * - Overage: +10% for cutting and flaws.
 * - Order the whole yard at or above the total.
 *
 * Every step is rounded to a tenth of a yard before it is added, so the
 * printed steps always sum to the printed total.
 */

export const CHART_WIDTH_IN = 54;
export const SMALL_REPEAT_MAX_IN = 14;
export const SMALL_REPEAT_SHARE = 0.15;
export const LARGE_REPEAT_SHARE = 0.3;
export const CUTTING_SHARE = 0.1;

export interface YardageInput {
  /** The maker's chart figure, for 54" plain fabric. */
  chartYards?: number | null;
  /** The fabric's width in inches. */
  widthIn?: number | null;
  /** The vertical repeat in inches; 0 or empty for a plain. */
  repeatIn?: number | null;
  railroaded?: boolean | null;
  /** The workroom's confirmed figure. It wins over the chart. */
  workroomYards?: number | null;
  /** Whose figure it is, for the sentence ("Hale asked for 17 yd"). */
  workroomName?: string | null;
}

export interface YardageStep {
  label: string;
  /** Tenths of a yard: the base for the first step, an addition after. */
  tenths: number;
}

export interface YardageReading {
  source: 'chart' | 'workroom';
  steps: YardageStep[];
  /** The exact total, in tenths of a yard. */
  totalTenths: number;
  /** Whole yards to order. */
  orderYards: number;
  sentence: string;
}

const positive = (value: number | null | undefined): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value > 0;

const tenthsOf = (yards: number) => Math.round(yards * 10);

/** 170 → "17", 187 → "18.7". */
export function formatTenths(tenths: number): string {
  return tenths % 10 === 0 ? String(tenths / 10) : (tenths / 10).toFixed(1);
}

const percent = (share: number) => `${Math.round(share * 100)}%`;

/** Null when there is nothing to work from: no chart and no workroom figure. */
export function readYardage(input: YardageInput): YardageReading | null {
  if (positive(input.workroomYards)) {
    const who = input.workroomName?.trim() || 'The workroom';
    const base = tenthsOf(input.workroomYards);
    const cutting = tenthsOf((base / 10) * CUTTING_SHARE);
    const total = base + cutting;
    const orderYards = Math.ceil(total / 10);
    return {
      source: 'workroom',
      steps: [
        { label: `${who}'s figure`, tenths: base },
        { label: `Cutting and flaws (+${percent(CUTTING_SHARE)})`, tenths: cutting },
      ],
      totalTenths: total,
      orderYards,
      sentence: `${who} asked for ${formatTenths(base)} yd. With ${percent(
        CUTTING_SHARE,
      )} for cutting that is ${formatTenths(total)} yd, ordered as ${orderYards} yd. ${
        who === 'The workroom' ? "The workroom's" : `${who}'s`
      } number wins.`,
    };
  }

  if (!positive(input.chartYards)) return null;

  const base = tenthsOf(input.chartYards);
  const steps: YardageStep[] = [{ label: `Chart (${CHART_WIDTH_IN}" plain)`, tenths: base }];
  let running = base;

  if (positive(input.widthIn) && input.widthIn < CHART_WIDTH_IN && !input.railroaded) {
    const narrow = tenthsOf((running / 10) * (CHART_WIDTH_IN / input.widthIn - 1));
    steps.push({ label: `Narrow goods (${input.widthIn}" wide)`, tenths: narrow });
    running += narrow;
  }

  if (positive(input.repeatIn)) {
    const share = input.repeatIn <= SMALL_REPEAT_MAX_IN ? SMALL_REPEAT_SHARE : LARGE_REPEAT_SHARE;
    const repeat = tenthsOf((running / 10) * share);
    steps.push({ label: `Repeat ${input.repeatIn}" (+${percent(share)})`, tenths: repeat });
    running += repeat;
  }

  const cutting = tenthsOf((running / 10) * CUTTING_SHARE);
  steps.push({ label: `Cutting and flaws (+${percent(CUTTING_SHARE)})`, tenths: cutting });
  running += cutting;

  const orderYards = Math.ceil(running / 10);
  return {
    source: 'chart',
    steps,
    totalTenths: running,
    orderYards,
    sentence: `The chart's ${formatTenths(base)} yd comes to ${formatTenths(
      running,
    )} yd, ordered as ${orderYards} yd. The workroom's own figure wins — type it over this.`,
  };
}
