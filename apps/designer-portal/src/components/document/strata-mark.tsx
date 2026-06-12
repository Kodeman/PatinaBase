/**
 * The Strata Mark — three lines of descending width (spec v1.1 §10).
 * Section device at small scales: sage = settled, clay = active,
 * pearl = future. Purely decorative.
 *
 * R15 fill-state: pass `fill` ([shaping, commitment, delivery] ∈ [0,1]) and
 * the mark becomes a progress device — each line renders as a ghost track
 * with a filled clay portion. Static only; the breath is Slice 6.
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
  fill,
}: {
  state?: StrataMarkState;
  size?: keyof typeof SIZES;
  /** R15: per-line fill fractions [shaping, commitment, delivery]. */
  fill?: [number, number, number];
}) {
  const { widths, bar, gap } = SIZES[size];
  const color = STATE_COLOR[state];

  if (fill) {
    return (
      <span aria-hidden className="inline-flex flex-col" style={{ gap }}>
        {widths.map((w, i) => (
          <span
            key={i}
            className="relative inline-block"
            style={{ width: w, height: bar, borderRadius: 1 }}
          >
            <span
              className="absolute inset-0"
              style={{ background: 'var(--color-clay)', opacity: 0.22, borderRadius: 1 }}
            />
            <span
              className="absolute bottom-0 left-0 top-0"
              style={{
                width: `${Math.round(Math.min(1, Math.max(0, fill[i])) * 100)}%`,
                background: 'var(--color-clay)',
                borderRadius: 1,
              }}
            />
          </span>
        ))}
      </span>
    );
  }

  return (
    <span aria-hidden className="inline-flex flex-col" style={{ gap }}>
      {widths.map((w, i) => (
        <span key={i} style={{ width: w, height: bar, background: color, borderRadius: 1 }} />
      ))}
    </span>
  );
}
