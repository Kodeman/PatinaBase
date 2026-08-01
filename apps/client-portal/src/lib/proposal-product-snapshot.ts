import type {
  ProposalItem,
  ProposalItemProductSnapshot,
} from '@patina/supabase';

/**
 * Adapt the proposal-owned catalog copy to the legacy product render shape.
 * Deliberately accepts no live product fallback: missing snapshot provenance is
 * rendered as missing, never silently replaced with mutable catalog state.
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
    price_retail: snapshot.price_retail ?? null,
    has_teaching: snapshot.has_teaching === true,
    record_completeness_hidden:
      snapshot.record_completeness_hidden === true,
  };
}
