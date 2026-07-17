// @patina/fulfillment — Workbench drag-target routing (S2, spec §5.2).
//
// The subtle part of the drag: WHAT a drop means depends on the target and the
// line's state. Pure + tested here (drag.test.ts) so the component (workbench
// .tsx) stays a thin dispatcher over this decision.
//
//   • drop on a real PO  ('po:<id>')      → move-line reshuffle (post-confirm).
//   • drop on the new-PO target ('new')   → open the assign popover (pick vendor
//                                            + cost — a new vendor always needs
//                                            an explicit cost).
//   • drop on a proposed vendor group ('vendor:<id>'):
//       – onto its OWN vendor             → no-op.
//       – line has no cost yet (unmapped) → popover, prefilled with that vendor
//                                            (a cost the drag can't supply).
//       – otherwise                       → assign to that vendor, carrying the
//                                            line's existing cost (reassign).

export interface DragLineState {
  vendorId: string | null;
  unitCostCents: number | null;
  mappingState: 'mapped' | 'unmapped';
  poId: string | null;
}

export type DragOutcome =
  | { action: 'noop' }
  | { action: 'move'; poId: string }
  | { action: 'assign'; vendorId: string; unitCostCents: number }
  | { action: 'popover'; defaultVendorId?: string };

/**
 * Resolve what a drop of `line` onto droppable `targetId` should do. Pure — no
 * side effects; the caller fires the matching mutation / opens the popover.
 */
export function resolveDragOutcome(
  targetId: string | null | undefined,
  line: DragLineState,
): DragOutcome {
  if (!targetId) return { action: 'noop' };

  if (targetId.startsWith('po:')) {
    const poId = targetId.slice('po:'.length);
    if (line.poId === poId) return { action: 'noop' };
    return { action: 'move', poId };
  }

  if (targetId === 'new') {
    return { action: 'popover' };
  }

  if (targetId.startsWith('vendor:')) {
    const vendorId = targetId.slice('vendor:'.length);
    if (line.vendorId === vendorId) return { action: 'noop' };
    if (line.mappingState === 'unmapped' || line.unitCostCents == null) {
      return { action: 'popover', defaultVendorId: vendorId };
    }
    return { action: 'assign', vendorId, unitCostCents: line.unitCostCents };
  }

  return { action: 'noop' };
}
