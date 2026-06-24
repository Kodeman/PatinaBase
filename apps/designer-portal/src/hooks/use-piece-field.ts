'use client';

/**
 * usePieceField — the Piece Room's per-field self-save (R40 grammar: every facet
 * saves itself; no Save button gate). A thin wrapper over a raw `products`
 * UPDATE that the shared `useUpdateProduct` doesn't give us:
 *
 *  · OPTIMISTIC write to ['product', id] so the letterhead (name, image, price)
 *    updates the instant a field blurs — and ROLLS BACK if the save is refused.
 *  · the TWO invalidations `useUpdateProduct` misses — ['layer-products'] and
 *    ['layer-counts'] — so the Library shelf reflects an edited name/thumbnail.
 *  · RLS truth: an UPDATE that matches 0 rows (no write policy for this user)
 *    comes back as PostgREST "no rows" — surfaced as a permission failure, not a
 *    silent success or a generic error.
 *
 * Each call writes ONE column's worth of `updates` (an object so JSONB fields
 * like `dimensions`/`vendor_contact` and array columns persist whole). Prices
 * arrive already in cents — conversion is the field's job (FacetMoney), not the
 * hook's.
 */

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { createBrowserClient } from '@patina/supabase';

export type PieceFieldUpdate = Record<string, unknown>;

export function usePieceField(productId: string) {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (updates: PieceFieldUpdate) => {
      const supabase = createBrowserClient() as unknown as {
        from: (t: string) => {
          update: (u: PieceFieldUpdate) => {
            eq: (c: string, v: string) => {
              select: () => { single: () => Promise<{ data: unknown; error: { code?: string; message?: string } | null }> };
            };
          };
        };
      };
      const { data, error } = await supabase
        .from('products')
        .update(updates)
        .eq('id', productId)
        .select()
        .single();

      if (error) {
        // PGRST116 — the UPDATE matched no row the caller may SELECT back, i.e.
        // RLS refused the write. Speak to the cause, not the symptom.
        if (error.code === 'PGRST116') {
          throw new Error("You don't have permission to edit this piece.");
        }
        // 23514 — a CHECK constraint failed. The one a designer can trip is the
        // studio metadata bundle (00152): clearing a field a Studio piece needs.
        if (error.code === '23514' || /check constraint/i.test(error.message ?? '')) {
          throw new Error('A Studio piece needs this field — it can’t be left empty.');
        }
        throw new Error(error.message ?? 'Could not save just now.');
      }
      return data;
    },

    onMutate: async (updates) => {
      await qc.cancelQueries({ queryKey: ['product', productId] });
      const previous = qc.getQueryData(['product', productId]);
      qc.setQueryData(['product', productId], (old: unknown) =>
        old && typeof old === 'object' ? { ...(old as object), ...updates } : old,
      );
      return { previous };
    },

    onError: (_err, _updates, context) => {
      // Roll the letterhead back to server truth so the preview never shows a
      // value the database refused.
      if (context && 'previous' in context && context.previous !== undefined) {
        qc.setQueryData(['product', productId], context.previous);
      }
    },

    onSettled: () => {
      void qc.invalidateQueries({ queryKey: ['product', productId] });
      void qc.invalidateQueries({ queryKey: ['products'] });
      void qc.invalidateQueries({ queryKey: ['layer-products'] });
      void qc.invalidateQueries({ queryKey: ['layer-counts'] });
    },
  });
}
