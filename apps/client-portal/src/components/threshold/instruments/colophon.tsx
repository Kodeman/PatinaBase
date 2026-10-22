/* ── THE COLOPHON (house sheet §A8) ──────────────────────────────────────────
   The last line of every client-facing page: who prepared it, and that it
   came through Patina. The phrase alone — a caller supplies its own hairline
   and spacing (the specimen draws `.colophon-rule` and `.colophon` as two
   separate siblings), so this drops cleanly into a page-level mount AND into
   a payment sheet's footer, which already opens with its own rule.

   ABSENCE IS SILENCE: with no studio name there is nothing true to attribute,
   so the block renders nothing at all rather than a half sentence. ───────── */

import Link from 'next/link';

export interface ColophonProps {
  /** The studio's display name. */
  studioName?: string | null;
}

export function Colophon({ studioName }: ColophonProps) {
  const studio = studioName?.trim();
  if (!studio) return null;

  return (
    <p className="t-meta text-left text-[var(--ink-faint)]">
      {`Prepared by ${studio} · Sent through Patina · `}
      <Link className="inline-flex min-h-[44px] items-center text-inherit underline underline-offset-4 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[3px] focus-visible:outline-[var(--focus-ring)]" href="/privacy">Privacy</Link>
    </p>
  );
}
