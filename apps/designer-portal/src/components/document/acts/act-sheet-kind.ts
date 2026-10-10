/**
 * US-25 slice 5 — which scoped act sheet a need opens, if any.
 *
 * A sheet is scoped to one record, so a need that names none (an aggregate
 * with no `recordId`) opens nothing and the caller keeps its own landing. A
 * PO silence that already carries a held note keeps its DraftReview landing.
 * A held order rises only for a seat that can release it (needHeldForRelease
 * filters on `viewerCanRelease`), so `releaseHeld` is that seat's mark.
 */

import type { NeedLine } from '@/lib/document/desk-derivation';
import type { DeskNeed } from '@/lib/document/desk-need-list';
import { isUnansweredPo, type PoSilenceLine } from '@/lib/document/po-silences';

/**
 * The PO a `po_unacknowledged` need is about, read off the paper's lines: a
 * per-PO silence names its line; the aggregate names a PO only when the lines
 * hold exactly one unanswered order. Null where the lines cannot say.
 */
export function silencePoId(
  need: Pick<NeedLine, 'recordId'> & { lineId?: string },
  lines: readonly PoSilenceLine[] | null | undefined,
): string | null {
  if (need.recordId) return need.recordId;
  if (!lines) return null;
  const live = lines.filter((line) => line.removed_at == null);
  if (need.lineId) {
    return live.find((line) => String(line.id) === need.lineId)?.purchase_order?.id ?? null;
  }
  const unanswered = new Set(
    live.flatMap((line) =>
      line.purchase_order?.id && isUnansweredPo(line.purchase_order) ? [line.purchase_order.id] : [],
    ),
  );
  return unanswered.size === 1 ? [...unanswered][0]! : null;
}

export type ActSheetKind = 'po-chase' | 'invoice-reminder' | 'proposal-follow-up' | 'release-order';

export function actSheetKindOf({ need }: DeskNeed): ActSheetKind | null {
  if (!need.recordId) return null;
  switch (need.kind) {
    case 'po_unacknowledged':
      return need.draft ? null : 'po-chase';
    case 'overdue_invoice':
      return 'invoice-reminder';
    case 'proposal_declined':
    case 'hesitating_proposal':
    case 'proposal_expired':
      return 'proposal-follow-up';
    case 'po_unsent':
      return need.releaseHeld ? 'release-order' : null;
    default:
      return null;
  }
}
