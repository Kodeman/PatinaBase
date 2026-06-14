'use client';

/**
 * Place a catalog piece into a project document's FF&E schedule, marked "via
 * the Engine" (R38). This is the one act the Engine offers — and the ONLY thing
 * that persists from an ask (the ask itself leaves no thread/history). The
 * insert mirrors the decision feed-through's shape (00175); `added_via='engine'`
 * (00208) is the quiet, honest footprint the placed line wears.
 */

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { createBrowserClient } from '@patina/supabase';

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
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ projectId, piece }: { projectId: string; piece: PlaceablePiece }) => {
      const supabase = createBrowserClient() as unknown as {
        from: (table: string) => {
          insert: (row: Record<string, unknown>) => {
            select: (cols: string) => { single: () => Promise<{ data: { id: string } | null; error: { message: string } | null }> };
          };
        };
      };
      // 00185 dual pricing: unit_price_cents is the CLIENT price (the budget
      // source of truth — useProjectFinancials/Desk read it); trade cost lives
      // in trade_price_cents. Match every other FF&E insert path.
      const unitPrice = piece.price_retail ?? 0;
      const { data, error } = await supabase
        .from('project_ffe_items')
        .insert({
          project_id: projectId,
          product_id: piece.id,
          name: piece.name,
          item_type: 'tbd',
          status: 'specified',
          quantity: 1,
          unit_price_cents: unitPrice,
          trade_price_cents: piece.price_trade ?? null,
          line_total_cents: unitPrice,
          added_via: 'engine',
        })
        .select('id')
        .single();
      if (error) throw error;
      return data as { id: string };
    },
    onSuccess: (_d, { projectId }) => {
      // Unified FF&E key (procurement Wave 1) + the project rollups.
      void qc.invalidateQueries({ queryKey: ['project-ffe-items', projectId] });
      void qc.invalidateQueries({ queryKey: ['project', projectId] });
      void qc.invalidateQueries({ queryKey: ['projects'] });
    },
  });
}
