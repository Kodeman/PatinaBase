/**
 * Ink stamp (spec v1.1 §10): DM Mono 600 uppercase, 1.5px state-color
 * border, 3px radius, −1.5° rotation, transparent fill. The rotation is
 * the entire skeuomorphism budget for state. `ink` optionally darkens the
 * text against paper while the border keeps the brand color.
 *
 * R126 — the filled variant, the first of the three places B's colour survives.
 * One recipe: the state's own canon pigment composited over --doc-paper to a
 * common ~1.18:1 (the --fill-*-tint tokens), a 1.5px border in that state's own
 * -ink, and a CHARCOAL word at 11.7:1. State is hue; legibility is charcoal.
 * The filled stamp keeps the −1.5° tilt the mockup draws on every stamp.
 */

/** The states that carry a fill (FINAL §2, plus DELIVERED). One pigment per
 *  state, spent on BOTH the tint and the border, so no two filled stamps share
 *  an edge.
 *
 *  S5 — `delivered` is the fifth, in sage, because collapsing arrived goods
 *  onto ORDERED's clay plate told a designer scanning for what is still on
 *  order that delivered and installed lines were still coming. Sage is canon's
 *  settled pigment and the fill is cut to the same ~1.18:1 as the other four,
 *  so it joins their plane rather than outranking them. */
export type StampTone =
  | 'ordered'
  | 'delivered'
  | 'decision'
  | 'damaged'
  | 'anchor';

const TONE_FILL: Record<StampTone, string> = {
  ordered: 'var(--fill-ordered-tint)',
  delivered: 'var(--fill-delivered-tint)',
  decision: 'var(--fill-decision-tint)',
  damaged: 'var(--fill-damaged-tint)',
  anchor: 'var(--fill-anchor-tint)',
};

/** The 1.5px border: each state's own -ink, the values FINAL §2 measured off
 *  the page (rgb(124,94,48) / rgb(121,101,30) / rgb(156,83,64)). The anchor is
 *  a wash rather than an object and has no -ink token, so it draws its base
 *  pigment. */
const TONE_BORDER: Record<StampTone, string> = {
  ordered: 'var(--color-clay-ink)',
  delivered: 'var(--color-sage-ink)',
  decision: 'var(--color-golden-hour-ink)',
  damaged: 'var(--color-terracotta-ink)',
  anchor: 'var(--color-dusty-blue)',
};

/**
 * `size` — 'xs' is the historical small mark, kept as the default so no
 * existing surface shifts. Its literal is the 11px mono floor (S2), raised
 * from 10px with the rest of the direction's own surfaces. 'sm' is the 12px metadata floor the Document's newer surfaces
 * hold to (R7's lifecycle stamp, I114–I120); the grammar is identical at both.
 */
export function Stamp({
  label,
  color,
  ink,
  size = 'xs',
  variant = 'outline',
  tone,
}: {
  label: string;
  color: string;
  ink?: string;
  size?: 'xs' | 'sm';
  /** 'outline' is today's look, unchanged, and stays the default. */
  variant?: 'outline' | 'filled';
  /** Required for `filled`; without one the stamp keeps its outline, because a
   *  fill has no meaning to invent from a caller-supplied border colour. */
  tone?: StampTone;
}) {
  if (variant === 'filled' && tone) {
    return (
      <span
        data-stamp-variant="filled"
        data-stamp-tone={tone}
        className="inline-block -rotate-[1.5deg] whitespace-nowrap rounded-[3px] border-[1.5px] px-[9px] py-[3px] font-mono text-[12px] font-semibold uppercase tracking-[0.08em] text-[var(--text-primary)] motion-safe:transition-[background-color,border-color] motion-safe:duration-[260ms] motion-safe:ease-[var(--ease-editorial)]"
        style={{
          backgroundColor: TONE_FILL[tone],
          borderColor: TONE_BORDER[tone],
        }}
      >
        {label}
      </span>
    );
  }

  return (
    <span
      className={`inline-block -rotate-[1.5deg] whitespace-nowrap rounded-[3px] border-[1.5px] bg-transparent px-[9px] py-[3px] font-mono font-semibold uppercase ${
        size === 'sm'
          ? 'text-[12px] tracking-[0.08em]'
          : 'text-[11px] tracking-[0.1em]'
      }`}
      style={{ borderColor: color, color: ink ?? color }}
    >
      {label}
    </span>
  );
}
