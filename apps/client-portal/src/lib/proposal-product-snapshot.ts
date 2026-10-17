import type {
  ProposalItem,
  ProposalItemProductSnapshot,
} from '@patina/supabase';

/**
 * Adapt the proposal-owned catalog copy to the legacy product render shape.
 * Deliberately accepts no live product fallback: missing snapshot provenance is
 * rendered as missing, never silently replaced with mutable catalog state.
 *
 * US-37 D6: retail never reaches a client, so `price_retail` is always null
 * here even when a payload carries it, and no trade price is ever copied.
 */
export function productFromProposalSnapshot(
  snapshot: ProposalItemProductSnapshot | null | undefined,
  fallbackId?: string,
): ProposalItem['product'] | undefined {
  if (!snapshot || Object.keys(snapshot).length === 0) return undefined;
  const id = snapshot.product_id ?? fallbackId;
  if (!id) return undefined;
  return {
    id,
    name: snapshot.name ?? '',
    images: snapshot.images ?? null,
    brand: snapshot.brand ?? null,
    source_url: snapshot.source_url ?? null,
    dimensions: snapshot.dimensions,
    materials: snapshot.materials ?? null,
    price_retail: null,
    has_teaching: snapshot.has_teaching === true,
    record_completeness_hidden:
      snapshot.record_completeness_hidden === true,
  };
}

/**
 * A proposal line as a client may hold it (US-37 D6): no markup and no raw
 * product copy (it carries the piece's retail). Its `unit_price` is the
 * client's own unit price, never the studio's trade cost.
 */
export type ClientProposalItem = Omit<
  ProposalItem,
  'markup_percent' | 'client_product_snapshot'
>;

/**
 * The client document's lines. `tbd` placeholders are studio scaffolding and
 * never reach the client (R43). The trade cost (`unit_price` on a studio
 * line), markup and raw product copy are dropped even if a payload carries
 * them: `unit_price` becomes the sell price, and the copy lives on only as
 * `product`. A guest bundle has already reduced `product` to the fields its
 * share permits, so that audited DTO is kept; an authenticated render builds
 * the product only from the immutable client copy.
 */
export function clientProposalItems(
  items: readonly ProposalItem[],
  keepGuestProduct: boolean,
): ClientProposalItem[] {
  return items
    .filter((item) => item.item_type !== 'tbd')
    .map(({
      unit_price: _tradeCost,
      markup_percent: _markup,
      client_product_snapshot: snapshot,
      ...item
    }) => ({
      ...item,
      unit_price: item.unit_sell_price,
      product: keepGuestProduct
        ? item.product
        : productFromProposalSnapshot(snapshot, item.id),
    }));
}
