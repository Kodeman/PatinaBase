'use client';

/**
 * Save a composed piece (R40) as a REAL catalog draft — a `products` row on the
 * designer's own shelf (layer 'personal', status 'draft'), saveable at any
 * percent of completeness. Nothing is required; an empty piece still rests as a
 * draft and can be deepened or taught later from the shelf.
 *
 * Reuses the shipped catalog tables (no migration): `products` for the record +
 * catalog fields, `product_styles` for the eye (the same upsert useAssignStyle
 * uses). Percent-composed is DERIVED from what's filled (compose-progress.ts) —
 * no stored progress column.
 *
 * Prices: the form takes DOLLARS, persisted as integer cents (price_trade /
 * price_retail). The maker side of commerce (price, lead time) is theirs in
 * their own portal — one piece, two authors (R40).
 */

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { createBrowserClient } from '@patina/supabase';

export interface ComposeDraftInput {
  /** Existing draft id — present on re-save (deepening), absent on first save. */
  id?: string;
  name: string;
  maker: string;
  sourceUrl: string;
  images: string[];
  materials: string[];
  dimensions: { width: string; depth: string; height: string } | null;
  /** Client/retail price in DOLLARS (stored as cents). */
  priceRetailDollars: number | null;
  /** Trade price in DOLLARS (stored as cents). */
  priceTradeDollars: number | null;
  leadTimeWeeks: number | null;
  /** Style archetype ids — the eye / teaching (product_styles). */
  styleIds: string[];
}

const toCents = (dollars: number | null) =>
  dollars != null && Number.isFinite(dollars) ? Math.round(dollars * 100) : null;

export function useComposePiece() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: ComposeDraftInput): Promise<{ id: string }> => {
      const supabase = createBrowserClient() as any;
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const row: Record<string, unknown> = {
        name: input.name.trim() || 'Untitled piece',
        brand: input.maker.trim() || null,
        source_url: input.sourceUrl.trim() || '',
        images: input.images,
        materials: input.materials,
        dimensions: input.dimensions,
        price_retail: toCents(input.priceRetailDollars),
        price_trade: toCents(input.priceTradeDollars),
        lead_time_weeks: input.leadTimeWeeks,
        layer: 'personal',
        status: 'draft',
      };

      let id = input.id;
      if (id) {
        const { error } = await supabase.from('products').update(row).eq('id', id);
        if (error) throw error;
      } else {
        // owner_user_id is REQUIRED for a personal-layer row (00152 CHECK:
        // layer != 'personal' OR owner_user_id IS NOT NULL). The normalize
        // trigger back-fills it from captured_by today, but set it explicitly so
        // this callsite doesn't depend on that transitional trigger.
        const { data, error } = await supabase
          .from('products')
          .insert({
            ...row,
            captured_by: user.id,
            owner_user_id: user.id,
            captured_at: new Date().toISOString(),
          })
          .select('id')
          .single();
        if (error) throw error;
        id = (data as { id: string }).id;
      }

      // The eye — sync product_styles to the current selection. Replace wholesale
      // (delete-then-insert): a draft can un-teach a trait, and a clean replace is
      // idempotent without a NOT-IN filter. The delete is scoped to assigned_by =
      // the caller, matching the product_styles RLS USING clause — without it the
      // delete silently skips rows the caller didn't assign. The write mirrors
      // useAssignStyle's row shape (RLS-proven).
      const { error: delErr } = await supabase
        .from('product_styles')
        .delete()
        .eq('product_id', id)
        .eq('assigned_by', user.id);
      if (delErr) throw delErr;
      if (input.styleIds.length > 0) {
        const { error: insErr } = await supabase.from('product_styles').insert(
          input.styleIds.map((styleId, i) => ({
            product_id: id,
            style_id: styleId,
            is_primary: i === 0,
            confidence: 1.0,
            source: 'manual',
            assigned_by: user.id,
          })),
        );
        if (insErr) throw insErr;
      }

      return { id: id as string };
    },
    onSuccess: () => {
      // The piece lands on the My Library shelf (layer 'personal').
      void qc.invalidateQueries({ queryKey: ['products'] });
      void qc.invalidateQueries({ queryKey: ['layer-products'] });
      void qc.invalidateQueries({ queryKey: ['layer-counts'] });
    },
  });
}
