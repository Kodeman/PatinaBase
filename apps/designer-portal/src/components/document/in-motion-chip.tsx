/**
 * In-motion line (spec §7, Desk light restyle): one quiet line for an
 * engagement progressing without the designer. Carries state, never
 * urgency-outlined (R22). A Golden Hour dot + the name in Playfair + the
 * Aged Oak detail — low-emphasis, never a chip-in-a-card. Tappable: it opens
 * the document (R22: the awareness tier is still a document), but never claims
 * "needs your hand."
 */

import Link from 'next/link';
import type { MotionChip } from '@/lib/document/desk-derivation';

export function InMotionChip({ chip }: { chip: MotionChip }) {
  return (
    <li>
      <Link
        href={`/doc/${chip.row.engagement_id}`}
        // R45: `kind` is an optional style/telemetry hook. Default treatment is
        // kind-agnostic; the data attribute lets CSS or analytics key off it
        // without re-deriving from the (translatable) text.
        data-motion-kind={chip.kind}
        className="group flex items-baseline gap-2 text-[13px] leading-snug text-[var(--text-muted)] transition-colors hover:text-[var(--text-body)]"
      >
        <span
          aria-hidden
          className="inline-block h-1.5 w-1.5 shrink-0 self-center rounded-full bg-[var(--color-golden-hour)]"
        />
        <span className="font-heading text-[14px] text-[var(--text-primary)]">
          {chip.row.title}
        </span>
        <span aria-hidden className="text-[var(--text-subtle)]">
          —
        </span>
        <span>{chip.text}</span>
      </Link>
    </li>
  );
}
