'use client';

/**
 * Place a catalog piece into a project document's FF&E schedule, marked "via
 * the Engine" (R38). This is the one act the Engine offers — and the ONLY thing
 * that persists from an ask (the ask itself leaves no thread/history). The
 * insert mirrors the decision feed-through's shape (00175); `added_via='engine'`
 * (00208) is the quiet, honest footprint the placed line wears.
 */

import { useMutation } from '@tanstack/react-query';
import { usePlaceProductInProjectV2 } from '@patina/supabase';

export interface PlaceablePiece {
  /** product id */
  id: string;
  name: string;
  /** trade (vendor) unit cost in cents — feeds trade_price_cents (00185). */
  price_trade?: number | null;
  /** client unit price in cents — feeds unit_price_cents, the budget source of
   *  truth (00185). */
  price_retail?: number | null;
}

export function usePlaceInDocument() {
  const place = usePlaceProductInProjectV2();
  return useMutation({
    mutationFn: async ({ projectId, piece, configurationId = null }: {
      projectId: string;
      piece: PlaceablePiece;
      configurationId?: string | null;
    }) => {
      const result = await place.mutateAsync({
        projectId,
        productId: piece.id,
        name: piece.name,
        assignmentScope: 'unassigned',
        roomId: null,
        disposition: 'candidate',
        duplicateMode: 'create',
        configurationId,
        source: 'engine',
        idempotencyKey: globalThis.crypto?.randomUUID?.() ?? `engine-${projectId}-${piece.id}-${Date.now()}`,
      });
      if (!result.selectionId) throw new Error('The project selection was not created.');
      return { id: result.selectionId };
    },
  });
}
