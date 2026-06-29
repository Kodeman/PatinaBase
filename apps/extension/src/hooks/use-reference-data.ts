/**
 * Reference data for the capture panel — the designer's active projects and the
 * style archetypes. Fetched once per session (module-cached) since it's stable
 * reference data, not part of the capture draft.
 */
import { useEffect, useState } from 'react';
import type {
  Project,
  StyleArchetype,
  MarketPosition,
  ProductionModel,
  VendorSummaryForCapture,
} from '@patina/shared';
import { supabase } from '../lib/supabase';

export interface ReferenceData {
  projects: Project[];
  styles: StyleArchetype[];
}

let cache: ReferenceData | null = null;
let inflight: Promise<ReferenceData> | null = null;

async function fetchReferenceData(): Promise<ReferenceData> {
  const [projectsRes, stylesRes] = await Promise.all([
    supabase
      .from('projects')
      .select('id, name, status, notes, created_at, updated_at')
      .eq('status', 'active')
      .order('name'),
    supabase
      .from('styles')
      .select(
        'id, name, description, visual_markers, is_archetype, display_order, color_hex'
      )
      .eq('is_archetype', true)
      .order('display_order'),
  ]);

  const projects: Project[] = (projectsRes.data ?? []).map((p) => ({
    id: p.id,
    name: p.name,
    status: p.status,
    notes: p.notes,
    clientProfileId: null,
    createdAt: p.created_at,
    updatedAt: p.updated_at,
  }));

  const styles: StyleArchetype[] = (stylesRes.data ?? []).map((s) => ({
    id: s.id,
    name: s.name,
    description: s.description,
    visualMarkers: s.visual_markers || [],
    parentId: null,
    isArchetype: s.is_archetype,
    displayOrder: s.display_order,
    colorHex: s.color_hex,
    iconName: null,
    createdAt: '',
    updatedAt: '',
  }));

  return { projects, styles };
}

export function useReferenceData(): ReferenceData & { loading: boolean } {
  const [data, setData] = useState<ReferenceData | null>(cache);
  const [loading, setLoading] = useState(!cache);

  useEffect(() => {
    if (cache) {
      setData(cache);
      setLoading(false);
      return;
    }
    let active = true;
    setLoading(true);
    (inflight ??= fetchReferenceData())
      .then((d) => {
        cache = d;
        if (active) {
          setData(d);
          setLoading(false);
        }
      })
      .catch(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  return { projects: data?.projects ?? [], styles: data?.styles ?? [], loading };
}

/** Vendor typeahead for the manufacturer/retailer selectors. */
export async function searchVendors(
  query: string
): Promise<VendorSummaryForCapture[]> {
  try {
    const { data } = await supabase
      .from('vendors')
      .select(
        'id, name, logo_url, website, market_position, production_model, primary_category'
      )
      .ilike('name', `%${query}%`)
      .limit(20);
    if (!data) return [];
    return data.map((v) => ({
      id: v.id,
      name: v.name,
      logoUrl: v.logo_url,
      website: v.website,
      marketPosition: v.market_position as MarketPosition | null,
      productionModel: v.production_model as ProductionModel | null,
      primaryCategory: v.primary_category,
      rating: null,
      reviewCount: 0,
    }));
  } catch {
    return [];
  }
}
