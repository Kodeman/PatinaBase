'use client';

/**
 * The margin item grammar (spec §11 .mitem) — the shared paper card that the
 * margin rail (MarginItem) and the Orders-book vendor thread both render
 * through, so the two surfaces CANNOT drift (I21). Three layers:
 *   .mi-k — the mono kind line (sender · day / Decision · due …)
 *   .mi-t — the title / body
 *   .mi-d — the detail line (snippet, or a PO-anchored deep-link)
 *
 * Two tones: `paper` (the document's light margin) and `dark` (the charcoal
 * Orders book). `ownVoice` paints the accent + kind line clay — the studio's
 * own hand, distinct from the vendor's dusty-blue (R33 F1/F2 lineage).
 */

import type { CSSProperties, ReactNode } from 'react';

export type MItemTone = 'paper' | 'dark';

const TITLE_COLOR: Record<MItemTone, string> = {
  paper: 'text-[var(--color-charcoal)]',
  dark: 'text-[var(--color-off-white)]',
};
const DETAIL_COLOR: Record<MItemTone, string> = {
  paper: 'text-[var(--text-muted)]',
  dark: 'text-[rgba(250,247,242,0.5)]',
};

/** The three text layers — the unit both surfaces share (anti-drift core). */
export function MItemContent({
  kindLine,
  kindColor,
  title,
  detail,
  tone = 'paper',
}: {
  kindLine: string;
  kindColor: string;
  title: ReactNode;
  detail?: ReactNode;
  tone?: MItemTone;
}) {
  return (
    <>
      <span
        className="mb-0.5 block font-mono text-[8px] font-semibold uppercase tracking-[0.06em]"
        style={{ color: kindColor }}
      >
        {kindLine}
      </span>
      <span className={`block text-[11.5px] font-medium leading-snug ${TITLE_COLOR[tone]}`}>
        {title}
      </span>
      {detail != null && detail !== '' && (
        <span className={`mt-0.5 block text-[10.5px] leading-relaxed ${DETAIL_COLOR[tone]}`}>
          {detail}
        </span>
      )}
    </>
  );
}

const CONTAINER: Record<MItemTone, string> = {
  paper: 'border-[var(--color-pearl)] bg-[var(--doc-paper)]',
  dark: 'border-[rgba(250,247,242,0.15)] bg-[rgba(250,247,242,0.04)]',
};

/** A full standalone .mitem card (the vendor thread's message). */
export function MItem({
  kindLine,
  title,
  detail,
  accent,
  tone = 'paper',
  ownVoice = false,
  className = '',
  style,
}: {
  kindLine: string;
  title: ReactNode;
  detail?: ReactNode;
  /** Border-left + kind-line color; overridden to clay when ownVoice. */
  accent: { border: string; label: string };
  tone?: MItemTone;
  ownVoice?: boolean;
  className?: string;
  style?: CSSProperties;
}) {
  const borderLeft = ownVoice ? 'var(--color-clay)' : accent.border;
  const kindColor = ownVoice ? 'var(--color-clay)' : accent.label;
  return (
    <div
      className={`rounded-[5px] border px-3 py-2 ${CONTAINER[tone]} ${className}`}
      style={{ borderLeft: `2.5px solid ${borderLeft}`, ...style }}
    >
      <MItemContent kindLine={kindLine} kindColor={kindColor} title={title} detail={detail} tone={tone} />
    </div>
  );
}
