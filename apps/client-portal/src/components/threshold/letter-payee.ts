'use client';

import type { Invoice } from '@patina/supabase';
import { useStudioIdentity } from '@patina/supabase';

/* ── Who a check for THIS letter is made out to ─────────────────────────────
   A studio invoice carries its own `studio_id` (00571, ruling S1) and stands
   in whichever house adopted it — a house that may belong to another studio
   altogether. Resolving the payee from the surrounding house would then print
   the adopting studio's name over a letter the other studio drew, so every
   letter resolves its own: named studio → project → designer, which is the
   resolver's precedence and exactly what the houseless door already does.

   `fallback` is reached only when the resolver answers no name at all. ──── */

export type PayeeRow = Pick<
  Invoice,
  'studio_id' | 'project_id' | 'designer_id' | 'designer'
>;

export function useLetterPayee(
  row: PayeeRow | null | undefined,
  fallback?: string | null,
): string {
  const identity = useStudioIdentity({
    studioId: row?.studio_id ?? null,
    projectId: row?.project_id ?? null,
    designerId: row?.designer_id ?? null,
  });

  return (
    identity.data?.name?.trim() ||
    row?.designer?.full_name?.trim() ||
    row?.designer?.business_name?.trim() ||
    fallback?.trim() ||
    'your designer'
  );
}
