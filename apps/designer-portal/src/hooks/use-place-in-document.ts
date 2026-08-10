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
import type { FfeAssignmentScope, FfeDuplicateMode } from '@patina/types';

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
    mutationFn: async ({
      projectId,
      piece,
      configurationId = null,
      assignmentScope = 'unassigned',
      roomId = null,
      boardId = null,
      duplicateMode = 'reuse',
      idempotencyKey,
    }: {
      projectId: string;
      piece: PlaceablePiece;
      configurationId?: string | null;
      assignmentScope?: FfeAssignmentScope;
      roomId?: string | null;
      boardId?: string | null;
      duplicateMode?: FfeDuplicateMode;
      idempotencyKey?: string;
    }) => {
      const result = await place.mutateAsync({
        projectId,
        productId: piece.id,
        name: piece.name,
        itemType: 'fixed',
        assignmentScope,
        roomId,
        boardId,
        disposition: 'candidate',
        duplicateMode,
        configurationId,
        roleConfigurationIdentity: 'default',
        source: 'engine',
        idempotencyKey: idempotencyKey ?? globalThis.crypto?.randomUUID?.() ?? `engine-${projectId}-${piece.id}-${Date.now()}`,
      });
      return result;
    },
  });
}
