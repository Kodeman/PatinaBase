/**
 * In-motion chip (spec §7): one quiet line for an engagement progressing
 * without the designer. Carries state, never urgency-outlined (R22). Tappable
 * — it opens the document (R22: the awareness tier is still a document), but
 * it never claims "needs your hand."
 */

import Link from 'next/link';
import type { MotionChip } from '@/lib/document/desk-derivation';

export function InMotionChip({ chip }: { chip: MotionChip }) {
  return (
    <li className="inline-block">
      <Link
        href={`/doc/${chip.row.engagement_id}`}
        className="inline-block rounded-[4px] border border-[rgba(250,247,242,0.1)] bg-[rgba(250,247,242,0.05)] px-3 py-[0.45rem] text-[11px] leading-none text-[rgba(250,247,242,0.6)] transition-colors hover:border-[rgba(196,165,123,0.35)]"
      >
        <span className="text-[rgba(250,247,242,0.85)]">{chip.row.title}</span>
        <span aria-hidden> — </span>
        {chip.text}
      </Link>
    </li>
  );
}
