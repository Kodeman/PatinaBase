'use client';

/* eslint-disable @typescript-eslint/no-explicit-any */
// Note: table reads use `as any` because database.types.ts has not been
// regenerated to include the aesthete tables yet (same convention as
// use-teaching.ts). Run `pnpm db:generate` after migrations to tighten.

/**
 * Product DNA draft reads (Aesthete Engine, design §5.2/§6.3).
 *
 * `product_dna_drafts` holds the Engine's raw structured read of a product —
 * NEVER the canonical row. The teaching surfaces prefill from the newest
 * draft when no designer-confirmed `product_style_spectrum` row exists
 * ("canonical-else-draft"); a designer save writes the canonical row through
 * the existing teaching mutations and the prefill source flips to canonical.
 *
 * Copy law: anything shown from a draft is "the Engine's first read" —
 * never a model name, never "AI".
 */

import { useQuery } from '@tanstack/react-query';
import { createBrowserClient } from '../client';
// SpectrumValues comes from @patina/shared here (the package's existing type
// source — see use-teaching.ts); @patina/types re-exports the same shape for
// app-side consumers.
import type { SpectrumValues } from '@patina/shared';

const getSupabase = () => createBrowserClient();

// ─── Types (draft jsonb is the §6.3 output schema; typed loosely + read
//     defensively — prompt versions may evolve ahead of this client) ─────────

export interface DnaDraftStyle {
  primary_archetype?: string;
  secondary?: Array<{ archetype: string; weight: number }>;
  spectrums?: Partial<Record<keyof SpectrumValues, number>>;
  spectrum_conf?: Partial<Record<keyof SpectrumValues, number>>;
  mood_keywords?: string[];
  ambiance?: string;
}

export interface DnaDraftMaterial {
  primary?: string;
  finish?: string;
  craftsmanship_tier?: number;
}

export interface DnaDraftPatina {
  potential?: number;
  material_honesty?: number;
  trajectory?: string;
}

export interface DnaDraftBody {
  style?: DnaDraftStyle;
  material?: DnaDraftMaterial;
  patina?: DnaDraftPatina;
  identity?: { era?: string | null; provenance_candidate?: string | null };
  overall_confidence?: number;
  [key: string]: unknown;
}

export interface ProductDnaDraft {
  id: number;
  product_id: string;
  draft: DnaDraftBody;
  model: string;
  prompt_version: string;
  overall_confidence: number | null;
  created_at: string;
}

export type SpectrumPrefillSource = 'canonical' | 'draft' | 'none';

export interface SpectrumPrefill {
  /** -1..1 spectrum values, or {} when nothing exists yet. */
  values: Partial<SpectrumValues>;
  source: SpectrumPrefillSource;
  /** Per-dimension confidence when the source is a draft (§6.3 spectrum_conf). */
  confidence: Partial<Record<keyof SpectrumValues, number>> | null;
}

const SPECTRUM_KEYS: Array<keyof SpectrumValues> = [
  'warmth',
  'complexity',
  'formality',
  'timelessness',
  'boldness',
  'craftsmanship',
];

// ─── Pure: canonical-else-draft resolution (§5.2) ────────────────────────────

/**
 * Resolve what the six sliders should show: the designer-confirmed canonical
 * row when it exists (any dimension set), else the Engine's newest draft
 * spectrums, else nothing. Values are already -1..1 in both sources.
 */
export function resolveSpectrumPrefill(
  canonical: Partial<SpectrumValues> | null | undefined,
  draft: DnaDraftBody | null | undefined,
): SpectrumPrefill {
  if (canonical) {
    const values: Partial<SpectrumValues> = {};
    let any = false;
    for (const k of SPECTRUM_KEYS) {
      const v = canonical[k];
      if (typeof v === 'number' && Number.isFinite(v)) {
        values[k] = v;
        any = true;
      }
    }
    if (any) return { values, source: 'canonical', confidence: null };
  }

  const spectrums = draft?.style?.spectrums;
  if (spectrums) {
    const values: Partial<SpectrumValues> = {};
    let any = false;
    for (const k of SPECTRUM_KEYS) {
      const v = spectrums[k];
      if (typeof v === 'number' && Number.isFinite(v)) {
        // Drafts are model output — clamp defensively to the CHECK range.
        values[k] = Math.max(-1, Math.min(1, v));
        any = true;
      }
    }
    if (any) {
      return { values, source: 'draft', confidence: draft?.style?.spectrum_conf ?? null };
    }
  }

  return { values: {}, source: 'none', confidence: null };
}

// ─── Pure: quiet draft facts for the teaching product view ───────────────────

/**
 * Compress the draft's material/patina read into a few quiet words for the
 * teaching product view. Words, not numbers (de-gamified law R32/R37) — and
 * always attributed as "the Engine's first read" by the rendering surface.
 */
export function summarizeDraftFacts(draft: DnaDraftBody | null | undefined): string[] {
  if (!draft) return [];
  const facts: string[] = [];

  const material = draft.material;
  if (material?.primary) {
    facts.push(material.finish ? `${material.primary} · ${material.finish}` : material.primary);
  }

  const patina = draft.patina;
  if (typeof patina?.potential === 'number') {
    if (patina.potential >= 0.7) facts.push('high patina potential');
    else if (patina.potential >= 0.4) facts.push('some patina potential');
  }
  if (patina?.trajectory) facts.push(patina.trajectory);

  const era = draft.identity?.era;
  if (typeof era === 'string' && era) facts.push(era);

  const mood = draft.style?.mood_keywords;
  if (Array.isArray(mood) && mood.length) facts.push(mood.slice(0, 3).join(', '));

  return facts;
}

// ─── Hooks ───────────────────────────────────────────────────────────────────

/**
 * Newest Engine draft for a product (RLS scopes reads through product
 * visibility; drafts are written only by the aesthete-dna-draft job).
 */
export function useProductDnaDraft(productId: string | null | undefined) {
  return useQuery({
    queryKey: ['product-dna-draft', productId],
    queryFn: async (): Promise<ProductDnaDraft | null> => {
      const supabase = getSupabase();
      const { data, error } = await (supabase as any)
        .from('product_dna_drafts')
        .select('id, product_id, draft, model, prompt_version, overall_confidence, created_at')
        .eq('product_id', productId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) throw error;
      return (data as ProductDnaDraft | null) ?? null;
    },
    enabled: !!productId,
  });
}
