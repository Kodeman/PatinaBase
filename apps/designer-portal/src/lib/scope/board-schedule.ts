// Pure helpers for "send a board pin to the schedule" (B5) and the "price
// moved" drift badge. Kept dependency-light (only the doc-code suggester) so
// the twin guard, payload mapping, and drift derivation are unit-testable
// without React or Supabase.

import { resolveDocCode } from './doc-code';

/** The snapshot a schedule line is seeded from — a product/capture board pin. */
export interface PinScheduleSnapshot {
  type: string;
  productId: string | null;
  name: string | null;
  imageUrl: string | null;
  /** data.price_cents — a board price is RETAIL (sell-side), never trade (R-DI4). */
  priceCents: number | null;
  /** data.vendor_id, when the pin recorded one. */
  vendorId: string | null;
  /** data.vendor_name (the brand an unfurl or library pick recorded). */
  vendorName: string | null;
  /** data.source_url — the page a URL pin was unfurled from. */
  sourceUrl: string | null;
  /** data.proposalItemId — the schedule line this pin was last sent to. */
  proposalItemId: string | null;
}

/** A slim schedule line, enough for twin detection + doc_code suggestion. */
export interface ScheduleLineRef {
  id: string;
  product_id: string | null;
  doc_code: string | null;
  scope_room_id: string | null;
  name: string | null;
  ffe_category: string | null;
}

/** The args a pin maps to for useAddProposalItem. */
export interface SendToScheduleArgs {
  proposalId: string;
  productId?: string;
  name: string;
  quantity: number;
  /** The pin's RETAIL price — lands on unit_sell_price only (see priceBasis). */
  unitPrice: number;
  /** Board prices are retail: trade stays 0 instead of copying retail into it. */
  priceBasis: 'retail';
  vendorId?: string;
  vendorName?: string;
  customFields?: { source_url: string };
  imageUrl: string | null;
  scopeRoomId: string | null;
  docCode: string;
}

/**
 * The existing schedule line for this product in this room, if any — the
 * idempotence guard (the Wave-1 twin concept: same product in the same room is
 * a duplicate). A pin without a product_id has no twin (always addable).
 * Rooms compare null-normalized so "whole home" (null) matches "whole home".
 */
export function findScheduleTwin(
  scheduleItems: ScheduleLineRef[],
  productId: string | null,
  boardScopeRoomId: string | null,
): ScheduleLineRef | undefined {
  if (productId == null) return undefined;
  return scheduleItems.find(
    (s) => s.product_id === productId && (s.scope_room_id ?? null) === (boardScopeRoomId ?? null),
  );
}

/**
 * The schedule line this pin already sits on, if any. The pin's backlink
 * (data.proposalItemId) wins when that line still exists; otherwise the
 * product twin guard applies. A backlink to a deleted line is ignored, so the
 * pin can be sent again (and re-stamped).
 */
export function findExistingScheduleLine(
  scheduleItems: ScheduleLineRef[],
  snap: Pick<PinScheduleSnapshot, 'productId' | 'proposalItemId'>,
  boardScopeRoomId: string | null,
): ScheduleLineRef | undefined {
  const sent = snap.proposalItemId
    ? scheduleItems.find((s) => s.id === snap.proposalItemId)
    : undefined;
  return sent ?? findScheduleTwin(scheduleItems, snap.productId, boardScopeRoomId);
}

/**
 * Map a pin's snapshot → the proposal_item args: name/image/price ride to the
 * SELL side only (priceBasis 'retail' — trade stays 0); product_id, vendor,
 * room and the pin's source_url carry; a doc_code is auto-suggested (no
 * ffe_category on a board pin, so the suggester falls back to a consonant
 * prefix of the name).
 */
export function buildSendToScheduleArgs(input: {
  proposalId: string;
  snap: PinScheduleSnapshot;
  boardScopeRoomId: string | null;
  existingCodes: Array<string | null>;
}): SendToScheduleArgs {
  const { proposalId, snap, boardScopeRoomId, existingCodes } = input;
  return {
    proposalId,
    productId: snap.productId ?? undefined,
    name: snap.name ?? 'Board pick',
    quantity: 1,
    unitPrice: snap.priceCents ?? 0,
    priceBasis: 'retail',
    ...(snap.vendorId ? { vendorId: snap.vendorId } : {}),
    ...(snap.vendorName ? { vendorName: snap.vendorName } : {}),
    ...(snap.sourceUrl ? { customFields: { source_url: snap.sourceUrl } } : {}),
    imageUrl: snap.imageUrl,
    scopeRoomId: boardScopeRoomId,
    docCode: resolveDocCode(null, null, existingCodes, snap.name ?? undefined),
  };
}

/** A board pin's linked product for the drift check. */
export interface DriftPin {
  id: string; // board_item_id
  product_id: string | null;
  snapshotPriceCents: number | null; // data.price_cents
}

/**
 * The set of board_item_ids whose linked product's CURRENT retail price differs
 * from the pin's snapshot price — the "price moved" badge population. Only pins
 * with a product_id, a numeric snapshot, and a known current price qualify.
 */
export function computeBoardDrift(
  pins: DriftPin[],
  currentRetailById: Map<string, number | null>,
): Set<string> {
  const drifted = new Set<string>();
  for (const pin of pins) {
    if (!pin.product_id) continue;
    const current = currentRetailById.get(pin.product_id);
    if (
      typeof pin.snapshotPriceCents === 'number' &&
      typeof current === 'number' &&
      current !== pin.snapshotPriceCents
    ) {
      drifted.add(pin.id);
    }
  }
  return drifted;
}
