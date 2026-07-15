'use client';

/**
 * Rule label row — the natural-width, staggered phase labels above the line
 * (C6 · R99, Slice 02). Prototype: `.ma-label` (+ `.closed/.live/.ahead`
 * weights and the `small` subline) in
 * the-document-schedule-master-direction.html.
 *
 * NOTHING TRUNCATES (§ hard constraint). Every label renders at its natural
 * width, `white-space: nowrap`, and the rows come from `assignLabelRows` after
 * REAL DOM measurement — never a truncation, never an ellipsis. The first
 * render (SSR-identical) places every label on row 0; a `useLayoutEffect`
 * then measures each button's `getBoundingClientRect().width` + the container
 * width, runs the pure `assignLabelRows`, and sets rows BEFORE paint (no
 * flash). It re-measures on a ResizeObserver and once `document.fonts.ready`
 * settles (Playfair/Inter widths shift as webfonts swap in). If the greedy
 * packing needs a 3rd+ row (`overflowBeyondTwo`) the labels still all render —
 * a dev-only `console.warn` flags the review escalation; layout never fails.
 *
 * On mobile (<980px) the row is hidden (the parent's CSS) → the container
 * measures 0 wide → the effect early-returns → the stagger never runs there.
 * Each label is a MINIMAP control: a focusable `<button>` that reveals its
 * phase in the spine. Zero shadows (D4).
 */

import { useLayoutEffect, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import {
  assignLabelRows,
  type LabelInput,
  type RuleWeight,
} from '@/lib/document/schedule-rule-derivation';

export interface RuleLabelItem {
  /** The phase id — the reveal target and the ref/row key. */
  id: string;
  name: string;
  /** A short derived sub-line (dates / anchor); '' renders no `small`. */
  subline: string;
  weight: RuleWeight;
  xPct: number;
  anchor: 'start' | 'end';
}

export interface RuleLabelRowProps {
  labels: RuleLabelItem[];
  onReveal: (phaseId: string) => void;
}

/** Font weight + ink per rule weight (`.ma-label.closed/.live/.ahead`). */
const WEIGHT: Record<RuleWeight, number> = { closed: 300, active: 600, ahead: 400 };
const INK: Record<RuleWeight, string> = {
  closed: 'var(--color-aged-oak)',
  active: 'var(--color-charcoal)',
  ahead: 'var(--color-clay)',
};

/** Vertical pitch between staggered rows (`.ma-label` top:0 / top:26px). */
const ROW_PITCH_PX = 26;

export function RuleLabelRow({ labels, onReveal }: RuleLabelRowProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const labelRefs = useRef(new Map<string, HTMLButtonElement>());
  // Row 0 for everything until measured — SSR-identical, no hydration drift.
  const [rows, setRows] = useState<Map<string, number>>(() => new Map());

  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const measure = () => {
      const containerWidthPx = container.getBoundingClientRect().width;
      if (containerWidthPx === 0) return; // hidden (mobile) — stagger never runs
      const inputs: LabelInput[] = labels.map((l) => ({
        id: l.id,
        xPct: l.xPct,
        anchor: l.anchor,
        widthPx: labelRefs.current.get(l.id)?.getBoundingClientRect().width ?? 0,
      }));
      const layout = assignLabelRows(inputs, containerWidthPx);
      if (layout.overflowBeyondTwo && process.env.NODE_ENV !== 'production') {
        console.warn(
          `[ScheduleRule] label stagger needs ${layout.rowCount} rows (>2) — review ` +
            'escalation; labels render on all rows, nothing is truncated.',
        );
      }
      setRows(layout.rows);
    };

    measure();

    const observer = new ResizeObserver(measure);
    observer.observe(container);

    // Re-measure once webfonts settle; guarded for jsdom / no-fonts-API envs.
    let cancelled = false;
    if (typeof document !== 'undefined' && 'fonts' in document) {
      document.fonts.ready.then(() => !cancelled && measure()).catch(() => {});
    }

    return () => {
      cancelled = true;
      observer.disconnect();
    };
  }, [labels]);

  return (
    <div ref={containerRef} className="absolute inset-x-0 top-0 h-[60px]">
      {labels.map((l) => {
        const row = rows.get(l.id) ?? 0;
        const pos: CSSProperties =
          l.anchor === 'end'
            ? { right: `${100 - l.xPct}%`, textAlign: 'right' }
            : { left: `${l.xPct}%` };
        return (
          <button
            key={l.id}
            ref={(el) => {
              if (el) labelRefs.current.set(l.id, el);
              else labelRefs.current.delete(l.id);
            }}
            type="button"
            onClick={() => onReveal(l.id) /* telemetry: wired in S2-4 */}
            aria-label={`${l.name} — reveal in the schedule`}
            className="absolute block cursor-pointer whitespace-nowrap font-body text-[0.78rem] leading-tight tracking-[0.02em]"
            style={{ top: row * ROW_PITCH_PX, ...pos, fontWeight: WEIGHT[l.weight], color: INK[l.weight] }}
          >
            {l.name}
            {l.subline && (
              <small className="mt-px block font-mono text-[0.56rem] uppercase tracking-[0.07em] text-[var(--color-clay)]">
                {l.subline}
              </small>
            )}
          </button>
        );
      })}
    </div>
  );
}
