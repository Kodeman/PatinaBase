/**
 * The Strata Mark — three lines of descending width (spec v1.1 §10).
 * Section device at small scales: sage = settled, clay = active,
 * pearl = future. Purely decorative.
 */

export type StrataMarkState = 'settled' | 'active' | 'future';

const STATE_COLOR: Record<StrataMarkState, string> = {
  settled: 'var(--color-sage)',
  active: 'var(--color-clay)',
  future: 'var(--color-pearl)',
};

const SIZES = {
  sm: { widths: [14, 10, 6], bar: 2, gap: 2 },
  md: { widths: [22, 15, 9], bar: 2, gap: 3 },
  lg: { widths: [32, 24, 16], bar: 2, gap: 3 },
} as const;

export function StrataMark({
  state = 'active',
  size = 'sm',
}: {
  state?: StrataMarkState;
  size?: keyof typeof SIZES;
}) {
  const { widths, bar, gap } = SIZES[size];
  const color = STATE_COLOR[state];
  return (
    <span aria-hidden className="inline-flex flex-col" style={{ gap }}>
      {widths.map((w, i) => (
        <span key={i} style={{ width: w, height: bar, background: color, borderRadius: 1 }} />
      ))}
    </span>
  );
}
