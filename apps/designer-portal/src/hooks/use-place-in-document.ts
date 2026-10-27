'use client';

/**
 * Place a catalog piece into a project document's FF&E schedule, marked "via
 * the Engine" (R38). This is the one act the Engine offers — and the ONLY thing
 * that persists from an ask (the ask itself leaves no thread/history). The
 * insert mirrors the decision feed-through's shape (00175); `added_via='engine'`
 * (00208) is the quiet, honest footprint the placed line wears.
 */

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { usePlaceProductInProjectV2 } from '@patina/supabase';
import type { FfeAssignmentScope, FfeDuplicateMode, PlaceProductInProjectRequest } from '@patina/types';

export type FillPlacementIntent = Pick<PlaceProductInProjectRequest,
  'placeholderSelectionId' | 'assignmentScope' | 'roomId' | 'quantity' |
  'itemType' | 'budgetMinCents' | 'budgetMaxCents' | 'disposition'>;

/** URL context is only intent; native V2 still validates the line and its authority. */
export function readFillPlacementIntent(value: string | null): FillPlacementIntent | undefined {
  if (value === null) return undefined;
  try {
    const fill = JSON.parse(value);
    if (!fill || typeof fill.placeholderSelectionId !== 'string' || !fill.placeholderSelectionId ||
        !['room', 'throughout', 'unassigned'].includes(fill.assignmentScope) ||
        !(fill.roomId === null || typeof fill.roomId === 'string') ||
        (fill.assignmentScope === 'room' && !fill.roomId) ||
        !Number.isFinite(fill.quantity) || fill.quantity <= 0 ||
        !['fixed', 'allowance'].includes(fill.itemType) ||
        (fill.disposition !== undefined && !['candidate', 'selected', 'alternate'].includes(fill.disposition)) ||
        ![fill.budgetMinCents, fill.budgetMaxCents].every(n => n == null || (Number.isFinite(n) && n >= 0))) {
      throw new Error('Invalid Fill context');
    }
    return {
      placeholderSelectionId: fill.placeholderSelectionId,
      assignmentScope: fill.assignmentScope,
      roomId: fill.roomId,
      quantity: fill.quantity,
      itemType: fill.itemType,
      ...(fill.itemType === 'allowance' ? { budgetMinCents: fill.budgetMinCents ?? null, budgetMaxCents: fill.budgetMaxCents ?? null } : {}),
      ...(fill.disposition ? { disposition: fill.disposition } : {}),
    };
  } catch {
    throw new Error('The Fill context could not be read. Return to Pieces and choose Fill again.');
  }
}

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

export function buildDocumentPlacementRequest(
  request: {
    projectId: string;
    piece: PlaceablePiece;
    configurationId?: string | null;
    duplicateMode?: FfeDuplicateMode;
  },
  context?: Pick<URLSearchParams, 'get'>,
) {
  const isOrigin = context?.get('projectId') === request.projectId;
  const roomId = isOrigin ? context!.get('roomId') : null;
  const fill = isOrigin ? readFillPlacementIntent(context!.get('fill')) : undefined;
  return {
    ...request,
    assignmentScope: (roomId ? 'room'
      : isOrigin && context!.get('assignmentScope') === 'throughout' ? 'throughout' : 'unassigned') as FfeAssignmentScope,
    roomId,
    boardId: isOrigin ? context!.get('boardId') : null,
    ...(fill && (!request.duplicateMode || request.duplicateMode === 'reuse') ? { fill } : {}),
  };
}

export function usePlaceInDocument() {
  const place = usePlaceProductInProjectV2();
  const queryClient = useQueryClient();
  return useMutation({
    // US-28 R11: the Library's "Used on" read (use-piece-usage.ts) is a
    // portal-local key the shared placement hook does not know, and the piece
    // page keeps it mounted while the Add sheet places.
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['library-piece-usage'] }),
    mutationFn: async ({
      projectId,
      piece,
      configurationId = null,
      assignmentScope = 'unassigned',
      roomId = null,
      boardId = null,
      duplicateMode = 'reuse',
      idempotencyKey,
      fill,
    }: {
      projectId: string;
      piece: PlaceablePiece;
      configurationId?: string | null;
      assignmentScope?: FfeAssignmentScope;
      roomId?: string | null;
      boardId?: string | null;
      duplicateMode?: FfeDuplicateMode;
      idempotencyKey?: string;
      fill?: FillPlacementIntent;
    }) => {
      const activeFill = duplicateMode === 'reuse' ? fill : undefined;
      const result = await place.mutateAsync({
        projectId,
        productId: piece.id,
        ...(activeFill ? {} : { name: piece.name }),
        itemType: 'fixed',
        assignmentScope,
        roomId,
        boardId,
        disposition: 'candidate',
        duplicateMode,
        ...activeFill,
        configurationId,
        roleConfigurationIdentity: 'default',
        source: 'engine',
        idempotencyKey: idempotencyKey ?? globalThis.crypto?.randomUUID?.() ?? `engine-${projectId}-${piece.id}-${Date.now()}`,
      });
      return result;
    },
  });
}
