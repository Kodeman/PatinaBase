/**
 * US-19 FR9 F9-1 (X1) — two makers' silences are two rows. Under `one-voice`,
 * where the paper's lines name every unanswered PO, the Desk's aggregate
 * `po_unacknowledged` need (`N POs sent — no acknowledgment`) prints as one
 * need per PO, oldest first, each carrying the line its act lands on. The
 * Desk card and `document_state` keep the aggregate.
 */
import type { NeedLine } from './desk-derivation';

/** The PO a line rides, as `useProjectFFEItems` embeds it. */
export interface PoSilencePo {
  id?: string | null;
  po_number?: string | null;
  vendor_po_number?: string | null;
  sent_at?: string | null;
  acknowledged_at?: string | null;
  status?: string | null;
}

/** A paper line, in schedule order. */
export interface PoSilenceLine {
  id: string | number;
  removed_at?: string | null;
  purchase_order?: PoSilencePo | null;
}

/** A need the paper prints; a per-PO silence names the line it lands on. */
export type PoSilenceNeed = NeedLine & { lineId?: string };

/** The rule the Desk's `po_unacknowledged` counts by (00590): sent, never
 *  acknowledged, neither delivered nor cancelled. */
export function isUnansweredPo(po: PoSilencePo | null | undefined): boolean {
  return (
    Boolean(po?.sent_at) &&
    !po?.acknowledged_at &&
    po?.status !== 'delivered' &&
    po?.status !== 'cancelled'
  );
}

/**
 * One `po_unacknowledged` need per unanswered PO — `{PO} sent — no
 * acknowledgment`, `NO ACK`, due on that PO's `sent_at`, landing on its first
 * line in schedule order — sorted oldest first. Only where the lines name as
 * many POs as the row counts (`unackedPoCount`), and at least two; otherwise
 * the need is returned unchanged, so no silence is lost. A held note riding
 * the same kind is never expanded.
 */
export function expandPoSilences({
  need,
  lines,
  unackedPoCount,
}: {
  need: NeedLine;
  lines: readonly PoSilenceLine[] | null | undefined;
  unackedPoCount: number;
}): PoSilenceNeed[] {
  if (need.kind !== 'po_unacknowledged' || need.draft || !lines) return [need];
  const firstLine = new Map<string, { po: PoSilencePo; lineId: string }>();
  for (const line of lines) {
    const po = line.purchase_order;
    if (line.removed_at != null || !po?.id || !isUnansweredPo(po) || firstLine.has(po.id)) {
      continue;
    }
    firstLine.set(po.id, { po, lineId: String(line.id) });
  }
  const silences = [...firstLine.values()];
  if (silences.length < 2 || silences.length !== unackedPoCount) return [need];
  // A PO with no number would print a row naming nothing; keep the aggregate.
  if (silences.some(({ po }) => !(po.po_number ?? po.vendor_po_number))) return [need];
  return silences
    .sort((a, b) => String(a.po.sent_at).localeCompare(String(b.po.sent_at)))
    .map(({ po, lineId }) => ({
      ...need,
      kind: 'po_unacknowledged',
      text: `${po.po_number ?? po.vendor_po_number} sent — no acknowledgment`,
      stamp: { ...need.stamp, label: 'NO ACK' },
      dueOn: po.sent_at,
      owner: 'maker',
      lineId,
    }));
}
