/**
 * In-motion chip (spec v1.1 §7): one quiet line for an engagement
 * progressing without the designer. Never actionable, never a feed.
 */

import type { MotionChip } from '@/lib/document/desk-derivation';

export function InMotionChip({ chip }: { chip: MotionChip }) {
  return (
    <li className="inline-block rounded-[4px] border border-[rgba(250,247,242,0.1)] bg-[rgba(250,247,242,0.05)] px-3 py-[0.45rem] text-[11px] leading-none text-[rgba(250,247,242,0.6)]">
      <span className="text-[rgba(250,247,242,0.85)]">{chip.row.title}</span>
      <span aria-hidden> — </span>
      {chip.text}
    </li>
  );
}
