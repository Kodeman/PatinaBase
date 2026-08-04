/**
 * pick → proposal line: the whole mapping, as one pure function.
 *
 * The FF&E schedule's "+ Add Item" used to build this payload inline inside a
 * React handler, which meant the two things most worth pinning — that a
 * configured pick prices at its RESOLVED specification, and that NO trade money
 * reaches the stored envelope — could only be tested by driving the component.
 * They live here instead, where a unit test can read them directly.
 *
 * ── Why the envelope is client-safe ────────────────────────────────────────
 * `proposal_items` is PRE-SALE and has no FK to a `product_configurations` row,
 * so the specification the designer quoted rides along in
 * `custom_fields.configuration`. That column travels: activation (00269) carries
 * it into the project, and a proposal is a CLIENT document. Trade cost is the
 * studio's own number — it is stripped here, at the boundary, rather than being
 * filtered by every downstream reader:
 *
 *   · `tradePriceCents` is dropped outright.
 *   · Every selection entry is rebuilt WITHOUT its price deltas — retail and
 *     trade alike. What survives is what identifies the choice (codes, labels,
 *     ids), plus lead time and the COM flag.
 *   · What remains that is money is retail, and only the resolved total.
 *
 * COM (00413) rides in the same envelope: the fabric the designer specified in
 * the configure step is the piece's most order-critical fact, and the picker
 * saves no configuration row to hold it.
 */
import type {
  ProductConfigurationComDetails,
  ProductConfigurationSelection,
} from '@patina/types';
import type { ProposalItemType } from '@patina/supabase';
import type { ProductPickResult } from '@/components/portal/proposals/product-picker-modal';
import { resolveDocCode } from '@/lib/scope/doc-code';

/**
 * One chosen value as a CLIENT document may carry it: enough to say what was
 * chosen and what it does to the schedule, and nothing about what it costs the
 * studio.
 */
export interface ClientSafeSelectionEntry {
  optionGroupId: string;
  optionValueId: string;
  groupCode?: string;
  valueCode?: string;
  groupName?: string;
  valueLabel?: string;
  leadTimeDeltaWeeks: number;
  allowsCom: boolean;
}

export interface ProposalConfigurationEnvelope {
  /**
   * `proposal_items.custom_fields` is a free-form JSON column, and the hook
   * types it as `Record<string, unknown>`. The index signature is what lets a
   * precisely-shaped envelope pass through that door without a cast.
   */
  [key: string]: unknown;
  configuration: {
    mode: string;
    label: string | null;
    selections: ClientSafeSelectionEntry[];
    variantId: string | null;
    optionValueIds: string[];
    /** Resolved RETAIL total. The only money in the envelope. */
    retailPriceCents: number | null;
    leadTimeWeeks: number | null;
    comDetails: ProductConfigurationComDetails | null;
    /** True when an optioned piece was taken without resolving a spec. */
    skipped: boolean;
  };
}

/** The `useAddProposalItem` payload, minus the proposal it is being added to. */
export interface ProposalItemFromPick {
  productId: string;
  name: string;
  quantity: number;
  unitPrice: number;
  vendorName: string | undefined;
  itemType: ProposalItemType;
  scopeRoomId: string | null;
  ffeCategory: string | undefined;
  leadTimeWeeks: number | null;
  customFields: ProposalConfigurationEnvelope | null;
  docCode: string;
}

/** Strip a snapshot selection down to what a client document may carry. */
export function toClientSafeSelection(
  entry: ProductConfigurationSelection,
): ClientSafeSelectionEntry {
  return {
    optionGroupId: entry.optionGroupId,
    optionValueId: entry.optionValueId,
    groupCode: entry.groupCode,
    valueCode: entry.valueCode,
    groupName: entry.groupName,
    valueLabel: entry.valueLabel,
    leadTimeDeltaWeeks: entry.leadTimeDeltaWeeks ?? 0,
    allowsCom: entry.allowsCom ?? false,
  };
}

export interface BuildProposalItemFromPickOptions {
  /** The FF&E category chosen alongside the pick, if any. */
  ffeCategorySlug: string | null;
  /** Every doc code already in the document, for the auto-suggest sequence. */
  existingDocCodes: Array<string | null>;
}

export function buildProposalItemFromPick(
  pick: ProductPickResult,
  { ffeCategorySlug, existingDocCodes }: BuildProposalItemFromPickOptions,
): ProposalItemFromPick {
  // A configured pick prices and leads at its RESOLVED specification, not the
  // product's list row — a King in walnut is not the base bed.
  const selection = pick.configurationSelection;
  const unitPrice = selection?.retailPriceCents ?? pick.priceCents ?? 0;
  const leadTimeWeeks = selection?.leadTimeWeeks ?? null;

  const customFields: ProposalConfigurationEnvelope | null =
    selection || pick.configurationSkipped
      ? {
          configuration: {
            mode: pick.configurationMode ?? 'standard',
            label: selection?.label ?? null,
            selections: (selection?.selections ?? []).map(toClientSafeSelection),
            variantId: selection?.variantId ?? null,
            optionValueIds: selection?.optionValueIds ?? [],
            retailPriceCents: selection?.retailPriceCents ?? null,
            leadTimeWeeks: selection?.leadTimeWeeks ?? null,
            comDetails: selection?.comDetails ?? null,
            skipped: pick.configurationSkipped === true,
          },
        }
      : null;

  return {
    productId: pick.productId,
    name: pick.name,
    quantity: 1,
    unitPrice,
    vendorName: pick.vendorName ?? undefined,
    itemType: 'fixed',
    scopeRoomId: pick.scopeRoomId,
    ffeCategory: ffeCategorySlug ?? undefined,
    leadTimeWeeks,
    customFields,
    // S1 — auto-suggest a spec code on add (prefix from category, else name).
    docCode: resolveDocCode(null, ffeCategorySlug, existingDocCodes, pick.name),
  };
}
