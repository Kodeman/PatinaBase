'use client';

/* eslint-disable @typescript-eslint/no-explicit-any */
// Note: aesthete taste tables/RPCs are not in database.types.ts yet (00242
// is newer than the generated types) — reads/rpc calls use `as any`, same
// convention as use-teaching.ts.

/**
 * Designer taste hooks (Aesthete Engine, design §8 / migration 00242).
 *
 * - Side-by-side judgments write through `submit_taste_judgment` — the RPC
 *   owns the §8.3 probe mechanics server-side (answers a due reversed repeat
 *   as kind='probe', else may enqueue one). The UI never knows which pair was
 *   a probe and never says so (de-gamified law R32/R37 — probes are invisible).
 * - Due probes are read from `taste_probe_queue` (RLS: own rows) and served
 *   FIRST in the deck, rendered identically to fresh pairs.
 * - Corrections write through `submit_taste_correction` (§8.2).
 * - "Your Eye" (§8.5) reads: designer_taste_profiles (center of gravity,
 *   deviation-from-house, sources), signature_biases (+ update_my_biases —
 *   the override layer that never writes learned state), and
 *   designer_style_confidence (confidence by style).
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { createBrowserClient } from '../client';

const getSupabase = () => createBrowserClient();

// ═══════════════════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════════════════

export type JudgmentChoice = 'a' | 'b' | 'neither' | 'both';
export type JudgmentContext = 'self' | 'client' | 'house';

export interface JudgmentProduct {
  id: string;
  name: string;
  brand: string | null;
  images: string[] | null;
}

export interface JudgmentPair {
  a: JudgmentProduct;
  b: JudgmentProduct;
}

export interface TasteProbeRow {
  id: number;
  product_a: string;
  product_b: string;
  due_at: string;
  status: 'pending' | 'answered' | 'expired';
}

export interface SubmitJudgmentInput {
  productA: string;
  productB: string;
  choice: JudgmentChoice;
  context?: JudgmentContext;
  clientProfileId?: string | null;
  latencyMs?: number | null;
  sessionId?: string | null;
}

export interface SubmitJudgmentResult {
  judgment_id: number;
  kind: 'judgment' | 'probe';
  sources: Record<string, number>;
}

export interface SubmitCorrectionInput {
  subject: 'match' | 'dna' | 'spectrum';
  productId?: string | null;
  replacementProductId?: string | null;
  clientProfileId?: string | null;
  /** Directional override, e.g. { warmth: -0.3 } (§8.2). */
  direction?: Record<string, number>;
  freeText?: string | null;
  surface?: 'engine_ask' | 'teaching' | 'companion' | 'library' | null;
}

export interface TasteProfileRow {
  designer_id: string;
  warmth: number | null;
  complexity: number | null;
  formality: number | null;
  timelessness: number | null;
  boldness: number | null;
  craftsmanship: number | null;
  reliability: number;
  deviation_from_house: Record<string, number> | null;
  sources: {
    portfolio_items?: number;
    judgments?: number;
    corrections?: number;
    rules?: number;
  } | null;
  drift_flag: boolean | null;
  version: number;
  updated_at: string;
}

export type BiasStatus = 'proposed' | 'confirmed' | 'edited' | 'muted';

export interface SignatureBiasRow {
  id: string;
  feature_group: string;
  direction: '+' | '-';
  learned_strength: number | null;
  displayed_strength: number | null;
  name: string;
  description: string | null;
  status: BiasStatus;
  evidence: Record<string, unknown> | null;
  version: number;
  updated_at: string;
}

/** Editable subset only — update_my_biases rejects anything else (§8.5). */
export interface BiasOverride {
  id: string;
  status?: Exclude<BiasStatus, 'proposed'>;
  displayed_strength?: number;
  name?: string;
  description?: string;
}

export interface StyleConfidenceRow {
  style_id: string;
  level: 'learning' | 'advanced' | 'expert';
  weight: number;
  judgment_count: number;
  style?: { id: string; name: string } | null;
}

// ═══════════════════════════════════════════════════════════════════════════
// Pure helpers (tested in __tests__/use-aesthete-taste.test.ts)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Build the sitting's deck: due probe pairs FIRST (in the order the queue
 * stored them — already reversed relative to the source judgment), then
 * fresh pairs from a shuffle of the pool, each product used at most once per
 * pass. Probe pairs are indistinguishable from fresh ones in the result —
 * the shape carries no probe marker at all, by design (§8.3, de-gamified law).
 */
export function buildJudgmentDeck(
  probes: TasteProbeRow[],
  pool: JudgmentProduct[],
  opts?: { maxPairs?: number; rng?: () => number },
): JudgmentPair[] {
  const rng = opts?.rng ?? Math.random;
  const maxPairs = opts?.maxPairs ?? 12;
  const byId = new Map(pool.map((p) => [p.id, p]));
  const deck: JudgmentPair[] = [];
  const servedKeys = new Set<string>();

  const keyOf = (x: string, y: string) => (x < y ? `${x}|${y}` : `${y}|${x}`);

  // 1. Due probes first — only when both products are still resolvable.
  for (const probe of probes) {
    if (deck.length >= maxPairs) break;
    const a = byId.get(probe.product_a);
    const b = byId.get(probe.product_b);
    if (!a || !b || a.id === b.id) continue;
    const k = keyOf(a.id, b.id);
    if (servedKeys.has(k)) continue;
    servedKeys.add(k);
    deck.push({ a, b });
  }

  // 2. Fresh pairs from a Fisher–Yates shuffle; consecutive non-overlapping
  //    pairs so each product appears at most once in the fresh portion.
  const shuffled = [...pool];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  for (let i = 0; i + 1 < shuffled.length; i += 2) {
    if (deck.length >= maxPairs) break;
    const a = shuffled[i];
    const b = shuffled[i + 1];
    const k = keyOf(a.id, b.id);
    if (servedKeys.has(k)) continue;
    servedKeys.add(k);
    deck.push({ a, b });
  }

  return deck;
}

/**
 * Step a bias's displayed strength softer/stronger. §8.5: edits are a bounded
 * scalar on the learned deviation — displayed stays within [0.5, 1.5]× the
 * learned strength. Falls back to clamping in [0, 1] when nothing was learned
 * yet (a correction-minted candidate may carry no learned_strength).
 */
export function nudgeBiasStrength(
  learned: number | null | undefined,
  displayed: number | null | undefined,
  step: 'softer' | 'stronger',
): number {
  const base = typeof learned === 'number' && Number.isFinite(learned) ? Math.abs(learned) : null;
  const current =
    typeof displayed === 'number' && Number.isFinite(displayed) ? displayed : (base ?? 0.5);
  const delta = (base ?? 0.5) * 0.25 * (step === 'stronger' ? 1 : -1);
  const next = current + delta;
  if (base != null && base > 0) {
    return Math.min(1.5 * base, Math.max(0.5 * base, next));
  }
  return Math.min(1, Math.max(0, next));
}

// ═══════════════════════════════════════════════════════════════════════════
// Judgments
// ═══════════════════════════════════════════════════════════════════════════

/**
 * The designer's own due probes (taste_probe_queue, RLS-scoped). Served first
 * in the deck; never labeled.
 */
export function useDueTasteProbes() {
  return useQuery({
    queryKey: ['taste-probes-due'],
    queryFn: async (): Promise<TasteProbeRow[]> => {
      const supabase = getSupabase() as any;
      const { data, error } = await supabase
        .from('taste_probe_queue')
        .select('id, product_a, product_b, due_at, status')
        .eq('status', 'pending')
        .lte('due_at', new Date().toISOString())
        .order('due_at', { ascending: true })
        .limit(10);

      if (error) throw error;
      return (data ?? []) as TasteProbeRow[];
    },
  });
}

/**
 * The pair pool: designer-visible catalog products that the Engine can score —
 * i.e. carrying a canonical spectrum row OR a draft (canonical-else-draft,
 * §5.2). RLS (three-layer law) scopes visibility; the embedded selects only
 * carry ids so the wire stays light.
 */
export function useJudgmentPool(limit = 40) {
  return useQuery({
    queryKey: ['judgment-pool', limit],
    queryFn: async (): Promise<JudgmentProduct[]> => {
      const supabase = getSupabase() as any;
      const { data, error } = await supabase
        .from('products')
        .select(
          'id, name, brand, images, product_style_spectrum(product_id), product_dna_drafts(product_id)',
        )
        .in('status', ['published', 'in_review'])
        .limit(limit);

      if (error) throw error;

      return ((data ?? []) as any[])
        .filter((row) => {
          const spectrum = row.product_style_spectrum;
          const hasCanonical = Array.isArray(spectrum) ? spectrum.length > 0 : !!spectrum;
          const hasDraft =
            Array.isArray(row.product_dna_drafts) && row.product_dna_drafts.length > 0;
          return hasCanonical || hasDraft;
        })
        .map((row) => ({
          id: row.id as string,
          name: (row.name ?? 'Untitled piece') as string,
          brand: (row.brand ?? null) as string | null,
          images: (row.images ?? null) as string[] | null,
        }));
    },
  });
}

/** Lifetime judgment count for the quiet Library-foot line. */
export function useMyJudgmentCount() {
  return useQuery({
    queryKey: ['taste-judgment-count'],
    queryFn: async (): Promise<number> => {
      const supabase = getSupabase() as any;
      const { count, error } = await supabase
        .from('taste_judgments')
        .select('id', { count: 'exact', head: true });

      if (error) throw error;
      return count ?? 0;
    },
  });
}

export function useSubmitTasteJudgment() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: SubmitJudgmentInput): Promise<SubmitJudgmentResult> => {
      const supabase = getSupabase() as any;
      const pair: Record<string, string> = { a: input.productA, b: input.productB };
      if (input.sessionId) pair.session_id = input.sessionId;

      const { data, error } = await supabase.rpc('submit_taste_judgment', {
        p_pair: pair,
        p_choice: input.choice,
        p_context: input.context ?? 'self',
        p_client_profile_id: input.clientProfileId ?? null,
        p_latency_ms: input.latencyMs ?? null,
      });

      if (error) throw error;
      return data as SubmitJudgmentResult;
    },
    onSuccess: () => {
      // A judgment may have answered a probe and always bumps sources.
      queryClient.invalidateQueries({ queryKey: ['taste-probes-due'] });
      queryClient.invalidateQueries({ queryKey: ['my-taste-profile'] });
      queryClient.invalidateQueries({ queryKey: ['taste-judgment-count'] });
    },
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// Corrections (§8.2)
// ═══════════════════════════════════════════════════════════════════════════

export function useSubmitTasteCorrection() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: SubmitCorrectionInput) => {
      const supabase = getSupabase() as any;
      const { data, error } = await supabase.rpc('submit_taste_correction', {
        p_subject: input.subject,
        p_product_id: input.productId ?? null,
        p_replacement_product_id: input.replacementProductId ?? null,
        p_client_profile_id: input.clientProfileId ?? null,
        p_direction: input.direction ?? {},
        p_free_text: input.freeText ?? null,
        p_surface: input.surface ?? null,
      });

      if (error) throw error;
      return data as { correction_id: number; sources: Record<string, number> };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['my-taste-profile'] });
    },
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// "Your Eye" reads (§8.5)
// ═══════════════════════════════════════════════════════════════════════════

/** Own designer_taste_profiles row — null until the first judgment/refit. */
export function useMyTasteProfile() {
  return useQuery({
    queryKey: ['my-taste-profile'],
    queryFn: async (): Promise<TasteProfileRow | null> => {
      const supabase = getSupabase() as any;

      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return null;

      const { data, error } = await supabase
        .from('designer_taste_profiles')
        .select(
          'designer_id, warmth, complexity, formality, timelessness, boldness, craftsmanship, reliability, deviation_from_house, sources, drift_flag, version, updated_at',
        )
        .eq('designer_id', user.id)
        .maybeSingle();

      if (error) throw error;
      return (data as TasteProfileRow | null) ?? null;
    },
  });
}

/** Own signature biases, strongest lean first; muted rows sink. */
export function useMySignatureBiases() {
  return useQuery({
    queryKey: ['my-signature-biases'],
    queryFn: async (): Promise<SignatureBiasRow[]> => {
      const supabase = getSupabase() as any;
      const { data, error } = await supabase
        .from('signature_biases')
        .select(
          'id, feature_group, direction, learned_strength, displayed_strength, name, description, status, evidence, version, updated_at',
        )
        .order('learned_strength', { ascending: false, nullsFirst: false });

      if (error) throw error;
      const rows = (data ?? []) as SignatureBiasRow[];
      // Muted last — a muted bias stays inspectable but stops leading.
      return [...rows.filter((r) => r.status !== 'muted'), ...rows.filter((r) => r.status === 'muted')];
    },
  });
}

export function useUpdateMyBiases() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (overrides: BiasOverride[]) => {
      const supabase = getSupabase() as any;
      const { data, error } = await supabase.rpc('update_my_biases', {
        p_overrides: overrides,
      });

      if (error) throw error;
      return data as { updated: number };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['my-signature-biases'] });
    },
  });
}

/** Confidence by style (designer_style_confidence + style names). */
export function useMyStyleConfidence() {
  return useQuery({
    queryKey: ['my-style-confidence'],
    queryFn: async (): Promise<StyleConfidenceRow[]> => {
      const supabase = getSupabase() as any;
      const { data, error } = await supabase
        .from('designer_style_confidence')
        .select('style_id, level, weight, judgment_count, style:styles(id, name)')
        .order('weight', { ascending: false });

      if (error) throw error;
      return (data ?? []) as StyleConfidenceRow[];
    },
  });
}
