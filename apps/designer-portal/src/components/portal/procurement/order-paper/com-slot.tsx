'use client';

/**
 * The order paper's COM slot (C-24, D1-04): what a paper says when one of its
 * lines is half of a frame-and-fabric pair.
 *
 * - A fabric line (it supplies a piece) makes this the fabric PO: its line
 *   names the piece and the workroom it ships to, the studio's workroom
 *   locations lead the ship-to list (still nothing preselected, R-PB3), and
 *   an unapproved CFA reads as a warning that never blocks (R9).
 * - A piece whose fabric is on another PO reads "COM arriving separately —
 *   {mill} PO {n}", as po-send prints it on the furniture PO.
 * - Once this paper's PO exists, the fabric PO is pointed at the PO it
 *   supplies (set_purchase_order_supplies), from whichever side is ordered
 *   second.
 */

import { useMemo } from 'react';
import {
  useFfePairLines,
  useProjectSubmittals,
  useSetPurchaseOrderSupplies,
  type FfeLineSubmittalRow,
  type FfePairLine,
} from '@patina/supabase';

export interface ComLineFacts {
  /** The pair sentence under the line's name. */
  pair: string;
  /** The never-blocking CFA warning on a fabric line, when one applies. */
  cfaWarning: string | null;
}

export interface SuppliesLink {
  purchaseOrderId: string;
  suppliesPurchaseOrderId: string;
}

const byId = (lines: readonly FfePairLine[]) => new Map(lines.map((l) => [l.id, l]));

/** The paper's lines that supply a piece (the fabric half of a pair). */
export function fabricLines(paperItemIds: readonly string[], lines: readonly FfePairLine[]): FfePairLine[] {
  const index = byId(lines);
  return paperItemIds
    .map((id) => index.get(id))
    .filter((l): l is FfePairLine => !!l && !!l.parent_ffe_item_id);
}

/** An approved CFA on the fabric line or on the piece it supplies. */
export function hasApprovedCfa(
  fabric: FfePairLine,
  submittals: readonly Pick<FfeLineSubmittalRow, 'ffe_item_id' | 'kind' | 'decision'>[],
): boolean {
  return submittals.some(
    (s) =>
      s.kind === 'cfa' &&
      s.decision === 'approved' &&
      (s.ffe_item_id === fabric.id || s.ffe_item_id === fabric.parent_ffe_item_id),
  );
}

export const cfaWarningSentence = (vendorName: string) =>
  `CFA from ${vendorName} not yet approved — send anyway? If the dye lot differs, the reorder is on the studio.`;

/** What the COM slot prints under each paper line that is half of a pair. */
export function comLineFacts(
  paperItemIds: readonly string[],
  lines: readonly FfePairLine[],
  submittals: readonly Pick<FfeLineSubmittalRow, 'ffe_item_id' | 'kind' | 'decision'>[] | null,
  vendorName: string,
): Map<string, ComLineFacts> {
  const index = byId(lines);
  const facts = new Map<string, ComLineFacts>();
  for (const id of paperItemIds) {
    const line = index.get(id);
    if (!line) continue;
    const parent = line.parent_ffe_item_id ? index.get(line.parent_ffe_item_id) : null;
    if (parent) {
      facts.set(id, {
        pair: `COM for ${parent.name}${parent.vendor_name ? `, shipped to ${parent.vendor_name}` : ''}`,
        // Unknown submittals (still loading or unreadable) never warn.
        cfaWarning: submittals && !hasApprovedCfa(line, submittals) ? cfaWarningSentence(vendorName) : null,
      });
      continue;
    }
    const children = lines.filter((l) => l.parent_ffe_item_id === id);
    if (children.length === 0) continue;
    const pair = children.map((child) => {
      if (!child.purchase_order_id) return 'COM arriving separately — the fabric is not ordered yet';
      if (child.purchase_order_id === line.purchase_order_id) return `COM on this order: ${child.name}`;
      return `COM arriving separately — ${child.vendor_name ?? 'the mill'} ${
        child.purchase_order?.po_number ?? 'PO to follow'
      }`;
    });
    facts.set(id, { pair: Array.from(new Set(pair)).join(' · '), cfaWarning: null });
  }
  return facts;
}

/**
 * The supplies links this paper's PO should carry: a fabric line's PO points
 * at its piece's PO, and a piece's PO is pointed at by its fabric's PO.
 */
export function suppliesLinks(
  poId: string,
  paperItemIds: readonly string[],
  lines: readonly FfePairLine[],
): SuppliesLink[] {
  const index = byId(lines);
  const links = new Map<string, SuppliesLink>();
  const add = (from: string | null | undefined, to: string | null | undefined, current?: string | null) => {
    if (!from || !to || from === to || current === to) return;
    links.set(from, { purchaseOrderId: from, suppliesPurchaseOrderId: to });
  };
  for (const id of paperItemIds) {
    const line = index.get(id);
    if (!line) continue;
    const parent = line.parent_ffe_item_id ? index.get(line.parent_ffe_item_id) : null;
    if (parent) {
      const current =
        line.purchase_order_id === poId ? line.purchase_order?.supplies_purchase_order_id : null;
      add(poId, parent.purchase_order_id, current);
    }
    for (const child of lines.filter((l) => l.parent_ffe_item_id === id)) {
      add(child.purchase_order_id, poId, child.purchase_order?.supplies_purchase_order_id);
    }
  }
  return Array.from(links.values());
}

/** A fabric PO's ship-to list: the studio's workrooms first. */
export function workroomFirst<T extends { kind: string }>(locations: readonly T[]): T[] {
  return [
    ...locations.filter((l) => l.kind === 'workroom'),
    ...locations.filter((l) => l.kind !== 'workroom'),
  ];
}

export interface ComPaper {
  isFabricPaper: boolean;
  /** The workroom a fabric paper ships to (the piece's maker), when known. */
  workroomName: string | null;
  facts: Map<string, ComLineFacts>;
  orderLocations: <T extends { kind: string }>(locations: T[]) => T[];
  /** Write the supplies links for this paper's PO. Never rejects. */
  linkSupplies: (poId: string) => Promise<void>;
}

export function useComPaper({
  projectId,
  itemIds,
  vendorName,
}: {
  projectId: string;
  itemIds: string[];
  vendorName: string;
}): ComPaper {
  const { data: lines } = useFfePairLines(projectId);
  const { data: submittals } = useProjectSubmittals(projectId);
  const setSupplies = useSetPurchaseOrderSupplies({ errorSurface: 'inline' });
  const key = itemIds.join(',');

  return useMemo(() => {
    const all = lines ?? [];
    const fabric = fabricLines(itemIds, all);
    const index = byId(all);
    const workroomName =
      fabric.map((l) => index.get(l.parent_ffe_item_id as string)?.vendor_name).find(Boolean) ?? null;
    return {
      isFabricPaper: fabric.length > 0,
      workroomName,
      facts: comLineFacts(itemIds, all, submittals ?? null, vendorName),
      orderLocations: (locations) => (fabric.length > 0 ? workroomFirst(locations) : locations),
      linkSupplies: async (poId: string) => {
        // The link is reconstructible on the next save or send of either
        // paper, so a refusal here never fails the order.
        for (const link of suppliesLinks(poId, itemIds, all)) {
          await setSupplies.mutateAsync(link).catch(() => undefined);
        }
      },
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lines, submittals, key, vendorName, setSupplies.mutateAsync]);
}

/** The COM slot under one paper line. */
export function ComLineNote({ com, itemId }: { com: ComPaper; itemId: string }) {
  const facts = com.facts.get(itemId);
  if (!facts) return null;
  return (
    <span data-order-paper-com className="block doc-type-meta text-[var(--color-quiet-ink)]">
      {facts.pair}
      {facts.cfaWarning && (
        <span data-order-paper-cfa className="block text-[var(--color-charcoal)]">
          {facts.cfaWarning}
        </span>
      )}
    </span>
  );
}
