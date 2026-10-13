'use client';

/**
 * JudgmentCard — one side of a style comparison as plate and caption (US-28
 * S10c, V20 U-Q20). The plate is a picture mat on a 1px --card-edge, never a
 * card; the caption names the piece and its maker. The whole unit is the one
 * button that picks it, so the hit area is the plate and the caption together.
 */

import type { JudgmentProduct } from '@patina/supabase';

export function JudgmentCard({
  product,
  onPick,
}: {
  product: Pick<JudgmentProduct, 'name' | 'brand' | 'images'>;
  onPick: () => void;
}) {
  const image = product.images?.[0];
  return (
    <button
      type="button"
      onClick={onPick}
      data-judgment-card
      className="judgment-plate"
    >
      <span className="plate judgment-plate-mat">
        {image ? (
          <img src={image} alt="" />
        ) : (
          <span className="judgment-plate-word">{product.name}</span>
        )}
      </span>
      <span className="cap">
        <span className="name t-d4">{product.name}</span>
        {product.brand && (
          <span className="t-body-sm judgment-cap-maker">{product.brand}</span>
        )}
      </span>
    </button>
  );
}
