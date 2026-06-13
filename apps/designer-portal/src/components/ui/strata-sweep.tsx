/**
 * StrataSweep (R35) — the system's indeterminate loader, replacing spinners
 * portal-wide. The brand's three-line Strata silhouette, its lines filling in
 * sequence (Shaping → Commitment → Delivery) then fading and restarting:
 * time accumulating and beginning again, the Whisper Bar's quiet cousin.
 *
 * Motion lives in globals.css (`.strata-sweep` + the strata-sweep-* keyframes);
 * prefers-reduced-motion stills it to a static partial. Movement hues match
 * the Strata Mark (line 3 softened — the canonical gradient fade).
 */

const MOVEMENT = ['var(--color-mocha)', 'var(--color-clay)', 'var(--color-dusty-blue)'] as const;
const RATIO = [1, 0.8, 0.6] as const;

// Loader sizes: xs = button-icon (replaces a 16px spinner); sm = inline;
// md = modal/slide-over; lg = full-screen overlay (the live scan).
const SIZES = {
  xs: { w: 18, bar: 2, gap: 2 },
  sm: { w: 32, bar: 2.5, gap: 3 },
  md: { w: 64, bar: 3, gap: 4 },
  lg: { w: 104, bar: 4, gap: 6 },
} as const;

export function StrataSweep({
  size = 'sm',
  ground = 'light',
  label = 'Loading',
  className = '',
}: {
  size?: keyof typeof SIZES;
  /** Ghost-track tone — `dark` for charcoal grounds. */
  ground?: 'light' | 'dark';
  /** Accessible status label for screen readers. */
  label?: string;
  className?: string;
}) {
  const { w, bar, gap } = SIZES[size];
  const widths = RATIO.map((r) => Math.round(w * r));
  const track = ground === 'dark' ? 'rgba(250,247,242,0.12)' : 'rgba(44,41,38,0.12)';

  return (
    <span
      role="status"
      aria-label={label}
      className={`strata-sweep inline-flex flex-col ${className}`}
      style={{ gap }}
    >
      {widths.map((lw, i) => (
        <span
          key={i}
          className="strata-line relative inline-block"
          style={{
            width: lw,
            height: bar,
            borderRadius: 999,
            opacity: i === 2 ? 0.55 : 1,
            background: track,
          }}
        >
          {/* The fill — scaleX + animation driven by globals .strata-sweep. */}
          <span
            className="strata-fill absolute inset-0"
            style={{ background: MOVEMENT[i], borderRadius: 999 }}
          />
        </span>
      ))}
    </span>
  );
}
