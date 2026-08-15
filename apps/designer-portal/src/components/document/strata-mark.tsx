/**
 * The Strata Mark (spec §10; R15 fill-state; R35 progress system).
 *
 * Three lines of descending width — the brand device that also answers "how
 * far along is this?". Two modes:
 *
 *  · STATE (decorative section device): pass `state` — sage = settled,
 *    clay = active, pearl = future. The mark as a quiet divider.
 *
 *  · FILL (progress device, R15 + R35): pass `fill` ([shaping, commitment,
 *    delivery] ∈ [0,1]). Each line carries its own MOVEMENT hue fading back
 *    through time — line 1 Mocha (Shaping), line 2 Clay (Commitment), line 3
 *    Dusty Blue (Delivery) at ~55% opacity (the canonical gradient fade) —
 *    rendered as a left-clipped scaleX(--f) fill over a ghost track. R35's
 *    `mono` flag collapses the three hues back to a single clay fade for pure
 *    brand contexts (wordmark lockup).
 *
 *  · `breathing` (R15): the system's one ambient motion — a slow opacity
 *    swell. ONLY the spine's active marker breathes; the Desk never moves.
 *
 * The indeterminate loader (`.sweeping`) lives in the sibling StrataSweep
 * (ui/strata-sweep.tsx) — it replaces spinners portal-wide (R35).
 */

export type StrataMarkState = 'settled' | 'active' | 'future';

const STATE_COLOR: Record<StrataMarkState, string> = {
  settled: 'var(--color-sage)',
  active: 'var(--color-clay)',
  future: 'var(--color-pearl)',
};

// R35 movement hues, deepest → newest. Line 3 fades to ~0.55 (the gradient).
const MOVEMENT = ['var(--color-mocha)', 'var(--color-clay)', 'var(--color-dusty-blue)'] as const;
const LINE3_OPACITY = 0.55;

// Size variants (R35): overall mark width xs/sm/md/lg/xl = 22/48/88/120/150;
// lines at the canonical 100/80/60 ratio. The ⌘K and tab marks use sm — wide
// enough that result-row progress reads before opening. xs is the spine's
// full-tier strip — the only place seven marks must sit in one row at rest.
const SIZES = {
  xs: { w: 22, bar: 2, gap: 2 },
  sm: { w: 48, bar: 2, gap: 2.5 },
  md: { w: 88, bar: 3, gap: 4 },
  lg: { w: 120, bar: 4, gap: 6 },
  xl: { w: 150, bar: 6, gap: 9 },
} as const;

const RATIO = [1, 0.8, 0.6] as const;
const clamp = (n: number) => Math.min(1, Math.max(0, n));

export function StrataMark({
  state = 'active',
  size = 'sm',
  fill,
  breathing = false,
  mono = false,
  ground = 'light',
  label,
}: {
  state?: StrataMarkState;
  size?: keyof typeof SIZES;
  /** R15/R35: per-line fill fractions [shaping, commitment, delivery]. */
  fill?: [number, number, number];
  /** R15 breath: the active spine marker's one ambient motion. */
  breathing?: boolean;
  /** R35: collapse the three movement hues to a single clay fade (wordmark). */
  mono?: boolean;
  /** Ghost-track tone — `dark` for charcoal grounds (the spine). */
  ground?: 'light' | 'dark';
  /** A11y: when the mark CARRIES meaning (spine active marker, letterhead
   *  progress), give it a text alternative so it isn't silent to AT. Decorative
   *  instances omit this and stay aria-hidden. */
  label?: string;
}) {
  const { w, bar, gap } = SIZES[size];
  const widths = RATIO.map((r) => Math.round(w * r));
  const breath = breathing ? ' doc-breath' : '';
  const track = ground === 'dark' ? 'rgba(250,247,242,0.12)' : 'rgba(44,41,38,0.12)';
  // Meaning-carrying marks announce; decorative ones stay hidden.
  const a11y = label
    ? ({ role: 'img', 'aria-label': label } as const)
    : ({ 'aria-hidden': true } as const);

  if (fill) {
    return (
      <span {...a11y} className={`strata-mark inline-flex flex-col${breath}`} style={{ gap }}>
        {widths.map((lw, i) => {
          const hue = mono ? 'var(--color-clay)' : MOVEMENT[i];
          return (
            <span
              key={i}
              className="strata-line relative inline-block"
              style={{
                width: lw,
                height: bar,
                borderRadius: 999,
                opacity: i === 2 ? LINE3_OPACITY : 1,
                background: track,
              }}
            >
              <span
                className="strata-fill absolute inset-0"
                style={{
                  background: hue,
                  borderRadius: 999,
                  transformOrigin: 'left center',
                  transform: `scaleX(${clamp(fill[i])})`,
                  transition: 'transform 0.6s cubic-bezier(0.4,0,0.2,1)',
                }}
              />
            </span>
          );
        })}
      </span>
    );
  }

  const color = STATE_COLOR[state];
  return (
    <span {...a11y} className={`strata-mark inline-flex flex-col${breath}`} style={{ gap }}>
      {widths.map((lw, i) => (
        <span
          key={i}
          style={{
            width: lw,
            height: bar,
            background: color,
            borderRadius: 999,
            opacity: i === 2 ? LINE3_OPACITY : 1,
          }}
        />
      ))}
    </span>
  );
}
