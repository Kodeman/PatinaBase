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

   Nothing stands in for that answer. While it is still coming, or when it
   could not be had, the letter names no payee at all: the page's own studio
   may be the wrong one (US-45 review R5). ──────────────────────────────── */

export type PayeeRow = Pick<
  Invoice,
  'studio_id' | 'project_id' | 'designer_id' | 'designer'
>;

/** Who this invoice is payable to, from its own row, or why that isn't known. */
export type LetterPayee =
  | { state: 'known'; name: string }
  | { state: 'loading' | 'unavailable'; name: null };

/** The ids this invoice resolves its own studio by. */
function payeeIds(row: PayeeRow | null | undefined) {
  return {
    studioId: row?.studio_id ?? null,
    projectId: row?.project_id ?? null,
    designerId: row?.designer_id ?? null,
  };
}

/** The name the invoice's own designer join carries, if it carries one. */
function rowDesignerName(row: PayeeRow | null | undefined): string | undefined {
  return row?.designer?.full_name?.trim() || row?.designer?.business_name?.trim();
}

export function useLetterPayee(row: PayeeRow | null | undefined): LetterPayee {
  const ids = payeeIds(row);
  const identity = useStudioIdentity(ids);

  const name = identity.data?.name?.trim() || rowDesignerName(row);
  if (name) return { state: 'known', name };
  // With no id to resolve the query never runs, so it is not still loading.
  const asking = Object.values(ids).some(Boolean) && identity.isPending;
  return { state: asking ? 'loading' : 'unavailable', name: null };
}
