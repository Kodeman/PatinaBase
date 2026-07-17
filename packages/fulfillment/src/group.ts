// @patina/fulfillment — the Workbench's PROPOSED split (S2, spec §5.2).
//
// Before confirm, no fulfillment_vendor_pos rows exist — the right side of the
// Workbench is a client-side PROPOSAL derived from each line's vendor
// assignment. This helper groups lines into proposed POs the SAME way
// fulfillment_confirm_split (00353) will when confirmed, so the letters shown
// pre-confirm (A, B, C…) match the po_numbers the RPC actually mints:
//
//   confirm_split: FOR v_vendor IN SELECT DISTINCT vendor_id … ORDER BY vendor_id
//                  → PO letter chr(64 + idx), idx 1-based.
//
// Postgres sorts `uuid` by byte value, which for canonical-form UUIDs equals a
// lexical string sort — so ordering vendorIds as strings here reproduces the
// RPC's A/B/C assignment exactly. The seeded 5-vendor order proves it: vendors
// …101/102/103/111/118 sort to A/B/C/D/E, matching the live confirm_split
// output the format golden test pins.
//
// Unmapped lines (vendorId null) collect into an explicit Unmapped group that
// visibly blocks confirm (spec §5.2 / R1.7) — never silently dropped.

import { circledIndex } from './format';
import type { FulfillmentVendorOption, FulfillmentWorkbenchLine, TransmissionType } from './types';

export interface ProposedPo {
  vendorId: string;
  vendorName: string | null;
  transmissionType: TransmissionType | null;
  /** 'A', 'B', … — matches the letter confirm_split will assign this vendor. */
  letter: string;
  /** Proposed PO number as it WILL be minted at confirm (for the card header). */
  proposedPoNumber: string;
  lines: FulfillmentWorkbenchLine[];
  /** Σ qty × unitCost for this vendor's lines (unmapped costs excluded upstream). */
  productCostCents: number;
}

export interface ProposedSplit {
  pos: ProposedPo[];
  /** Lines with no vendor yet — block confirm until assigned (R1.7). */
  unmapped: FulfillmentWorkbenchLine[];
}

/**
 * Group a Workbench's non-cancelled lines into the proposed split. Mapped lines
 * (vendorId set) group by vendor, vendors ordered by id to match
 * confirm_split's letter assignment; unmapped lines collect separately.
 *
 * @param lines   the order's lines (already carrying circledIndex)
 * @param vendors the assignable vendor directory (for names/transmission type)
 * @param year    the year the PO numbers will carry (default: current year)
 * @param orderNo the order number (for the proposed PO number preview)
 */
export function groupProposedPos(
  lines: FulfillmentWorkbenchLine[],
  vendors: FulfillmentVendorOption[],
  orderNo: number,
  year: number = new Date().getFullYear(),
): ProposedSplit {
  const active = lines.filter((l) => l.lineState !== 'cancelled');
  const vendorById = new Map(vendors.map((v) => [v.vendorId, v]));

  const unmapped = active.filter((l) => l.vendorId == null);

  const mappedVendorIds = Array.from(
    new Set(active.filter((l) => l.vendorId != null).map((l) => l.vendorId as string)),
  ).sort(); // string sort == postgres uuid sort == confirm_split's ORDER BY vendor_id

  const pos: ProposedPo[] = mappedVendorIds.map((vendorId, i) => {
    const seq = i + 1; // 1-based, matches chr(64 + v_idx)
    const letter = String.fromCharCode(64 + seq);
    const vendorLines = active.filter((l) => l.vendorId === vendorId);
    const vendor = vendorById.get(vendorId);
    return {
      vendorId,
      vendorName: vendor?.vendorName ?? vendorLines[0]?.vendorName ?? null,
      transmissionType: vendor?.transmissionType ?? null,
      letter,
      proposedPoNumber: `PO-${year}-${String(orderNo).padStart(5, '0')}-${letter}`,
      lines: vendorLines,
      productCostCents: vendorLines.reduce((s, l) => s + l.qty * (l.unitCostCents ?? 0), 0),
    };
  });

  return { pos, unmapped };
}

/** Attach the circled-index glyph to each line by its 1-based lineIndex — the
 *  route calls this so both sides of the Workbench thread the identical mark. */
export function withCircledIndexes(
  lines: Omit<FulfillmentWorkbenchLine, 'circledIndex'>[],
): FulfillmentWorkbenchLine[] {
  return lines.map((l) => ({ ...l, circledIndex: circledIndex(l.lineIndex) }));
}
