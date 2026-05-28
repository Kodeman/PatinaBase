'use client';

/* eslint-disable @typescript-eslint/no-explicit-any */
// Ad-hoc Supabase queries for the Catalog LibraryView secondary tabs
// (PROD-12 / PROD-13). These power the "For your active projects",
// "Founding Circle", and "Teach the Engine" tabs.
//
// We use `createBrowserClient() as any` for the cross-table queries because
// the generated database types lag behind the schema for several of these
// tables (teaching_queue, project_products, product_styles). The shapes are
// asserted to `LayerProductRow` so the page can reuse its existing grid.

import { useQuery } from '@tanstack/react-query';
import { createBrowserClient, type LayerProductRow } from '@patina/supabase';

const getSupabase = () => createBrowserClient() as any;

const PRODUCT_COLUMNS =
  'id, name, brand, price_retail, images, source_url, status, category, layer, owner_user_id, studio_id, created_at';

function uniqById(rows: LayerProductRow[]): LayerProductRow[] {
  const seen = new Set<string>();
  const out: LayerProductRow[] = [];
  for (const r of rows) {
    if (!r?.id || seen.has(r.id)) continue;
    seen.add(r.id);
    out.push(r);
  }
  return out;
}

// ─── Tab: For your active projects ─────────────────────────────────────────
//
// Heuristic (no Aesthete project-vector source exists yet): collect the
// categories + style_tags already present on products in the designer's
// ACTIVE projects, then surface catalog-layer products that share those
// categories/styles (excluding ones already in a project).
//
// If the designer has no active projects we return an honest empty state via
// `{ hasActiveProjects: false }` rather than the old Sprint-3 stub.

export interface ForProjectsResult {
  hasActiveProjects: boolean;
  items: LayerProductRow[];
}

export function useForProjectsCatalog(enabled = true) {
  return useQuery<ForProjectsResult>({
    queryKey: ['library-tab', 'for-projects'],
    enabled,
    queryFn: async () => {
      const supabase = getSupabase();

      // RLS scopes `projects` to the current designer; we only want active ones.
      const { data: projects, error: projErr } = await supabase
        .from('projects')
        .select('id')
        .eq('status', 'active');
      if (projErr) throw new Error(`for-projects(projects): ${projErr.message}`);

      const projectIds: string[] = (projects ?? []).map((p: any) => p.id);
      if (projectIds.length === 0) {
        return { hasActiveProjects: false, items: [] };
      }

      // Products already pinned to those projects + their categories/styles.
      const { data: pinned, error: ppErr } = await supabase
        .from('project_products')
        .select(
          `product_id,
           product:products!project_products_product_id_fkey(
             id, category, style_tags
           )`,
        )
        .in('project_id', projectIds);
      if (ppErr) throw new Error(`for-projects(project_products): ${ppErr.message}`);

      const pinnedProductIds = new Set<string>();
      const categories = new Set<string>();
      const styleTags = new Set<string>();
      for (const row of pinned ?? []) {
        const prod = (row as any).product;
        if (!prod) continue;
        pinnedProductIds.add(prod.id);
        if (prod.category) categories.add(prod.category);
        for (const tag of prod.style_tags ?? []) {
          if (tag) styleTags.add(tag);
        }
      }

      // No signal yet (active projects exist but have no products) — show the
      // recent catalog as a gentle fallback rather than an empty grid.
      if (categories.size === 0 && styleTags.size === 0) {
        const { data: recent, error: recErr } = await supabase
          .from('products')
          .select(PRODUCT_COLUMNS)
          .eq('layer', 'catalog')
          .order('created_at', { ascending: false })
          .limit(24);
        if (recErr) throw new Error(`for-projects(recent): ${recErr.message}`);
        const items = (recent ?? []).filter(
          (p: any) => !pinnedProductIds.has(p.id),
        ) as LayerProductRow[];
        return { hasActiveProjects: true, items };
      }

      // Catalog products matching either a project category or a style tag.
      let query = supabase
        .from('products')
        .select(PRODUCT_COLUMNS)
        .eq('layer', 'catalog')
        .order('created_at', { ascending: false })
        .limit(60);

      const orClauses: string[] = [];
      if (categories.size > 0) {
        orClauses.push(`category.in.(${[...categories].join(',')})`);
      }
      if (styleTags.size > 0) {
        // overlaps on style_tags array
        orClauses.push(`style_tags.ov.{${[...styleTags].join(',')}}`);
      }
      if (orClauses.length === 1) {
        // Single predicate — apply directly for a cleaner query.
        if (categories.size > 0) {
          query = query.in('category', [...categories]);
        } else {
          query = query.overlaps('style_tags', [...styleTags]);
        }
      } else {
        query = query.or(orClauses.join(','));
      }

      const { data: matches, error: matchErr } = await query;
      if (matchErr) throw new Error(`for-projects(matches): ${matchErr.message}`);

      const items = uniqById(
        (matches ?? []).filter((p: any) => !pinnedProductIds.has(p.id)) as LayerProductRow[],
      );
      return { hasActiveProjects: true, items };
    },
  });
}

// ─── Tab: Founding Circle ──────────────────────────────────────────────────
//
// Intended source: products joined to vendors flagged `vendors.founding_circle`.
// That column DOES NOT EXIST in the schema (verified against
// supabase/migrations + packages/supabase/src). The only `founding_circle`
// references are an unrelated notification-preference flag and an audience
// segment rule. We therefore return `{ missing: true }` so the page can render
// an honest empty state and flag the missing column, instead of inventing it.

export interface FoundingCircleResult {
  /** True when the `vendors.founding_circle` flag does not yet exist. */
  missing: boolean;
  items: LayerProductRow[];
}

export function useFoundingCircleCatalog(_enabled = true) {
  return useQuery<FoundingCircleResult>({
    queryKey: ['library-tab', 'founding-circle'],
    // No query to run — the data dependency (vendors.founding_circle) is absent.
    queryFn: async () => ({ missing: true, items: [] }),
    staleTime: Infinity,
  });
}

// ─── Tab: Teach the Engine ─────────────────────────────────────────────────
//
// Reuses the existing teaching_queue table (the same source as
// `useTeachingQueue`/`useClaimNextProduct` in @patina/supabase). Surfaces
// catalog products whose queue entry is still `pending` (i.e. awaiting
// teaching signal). Joined product rows are flattened to `LayerProductRow`.

export function useTeachTheEngineCatalog(enabled = true) {
  return useQuery<LayerProductRow[]>({
    queryKey: ['library-tab', 'teach'],
    enabled,
    queryFn: async () => {
      const supabase = getSupabase();
      const { data, error } = await supabase
        .from('teaching_queue')
        .select(
          `id,
           status,
           priority,
           product:products(${PRODUCT_COLUMNS})`,
        )
        .eq('status', 'pending')
        .order('priority', { ascending: true })
        .order('created_at', { ascending: true })
        .limit(60);
      if (error) throw new Error(`teach-the-engine(teaching_queue): ${error.message}`);

      const products = (data ?? [])
        .map((row: any) => row.product)
        .filter((p: any): p is LayerProductRow => Boolean(p) && p.layer === 'catalog');

      return uniqById(products as LayerProductRow[]);
    },
  });
}
