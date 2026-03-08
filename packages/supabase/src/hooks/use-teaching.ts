/* eslint-disable @typescript-eslint/no-explicit-any */
// Note: This file uses type assertions (as any) because the database types
// haven't been regenerated yet to include the teaching tables.
// Run `pnpm db:generate` after migrations are applied to get full type safety.

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { createBrowserClient } from '../client';
import type {
  TeachingMode,
  TeachingStatus,
  TeachingPriority,
  ValidationVote,
  SpectrumValues,
  ProductTeachingInput,
} from '@patina/shared';

// Lazy client getter to avoid module-level initialization during SSR
// Uses createBrowserClient for proper cookie-based session handling
const getSupabase = () => createBrowserClient();

// ═══════════════════════════════════════════════════════════════════════════
// STYLE ARCHETYPE HOOKS
// ═══════════════════════════════════════════════════════════════════════════

export function useStyleArchetypes() {
  return useQuery({
    queryKey: ['style-archetypes'],
    queryFn: async () => {
      const supabase = getSupabase();
      const { data, error } = await supabase
        .from('styles')
        .select('*')
        .eq('is_archetype', true)
        .order('display_order', { ascending: true });

      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useAllStyles() {
  return useQuery({
    queryKey: ['styles'],
    queryFn: async () => {
      const supabase = getSupabase();
      const { data, error } = await supabase
        .from('styles')
        .select('*')
        .order('name', { ascending: true });

      if (error) throw error;
      return data ?? [];
    },
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// CLIENT ARCHETYPE HOOKS
// ═══════════════════════════════════════════════════════════════════════════

export function useClientArchetypes() {
  return useQuery({
    queryKey: ['client-archetypes'],
    queryFn: async () => {
      const supabase = getSupabase() as any;
      const { data, error } = await supabase
        .from('client_archetypes')
        .select('*')
        .order('display_order', { ascending: true });

      if (error) throw error;
      return data ?? [];
    },
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// APPEAL SIGNAL HOOKS
// ═══════════════════════════════════════════════════════════════════════════

export function useAppealSignals() {
  return useQuery({
    queryKey: ['appeal-signals'],
    queryFn: async () => {
      const supabase = getSupabase() as any;
      const { data, error } = await supabase
        .from('appeal_signals')
        .select('*')
        .order('category', { ascending: true });

      if (error) throw error;
      return data ?? [];
    },
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// TEACHING QUEUE HOOKS
// ═══════════════════════════════════════════════════════════════════════════

interface TeachingQueueFilters {
  status?: TeachingStatus[];
  priority?: TeachingPriority[];
  assignedTo?: string;
  requiresDeepAnalysis?: boolean;
  limit?: number;
}

export function useTeachingQueue(filters?: TeachingQueueFilters) {
  return useQuery({
    queryKey: ['teaching-queue', filters],
    queryFn: async () => {
      const supabase = getSupabase() as any;
      let query = supabase
        .from('teaching_queue')
        .select(`
          *,
          product:products(id, name, images, price_retail, description)
        `)
        .order('priority', { ascending: true })
        .order('created_at', { ascending: true });

      if (filters?.status?.length) {
        query = query.in('status', filters.status);
      }
      if (filters?.priority?.length) {
        query = query.in('priority', filters.priority);
      }
      if (filters?.assignedTo) {
        query = query.eq('assigned_to', filters.assignedTo);
      }
      if (filters?.requiresDeepAnalysis !== undefined) {
        query = query.eq('requires_deep_analysis', filters.requiresDeepAnalysis);
      }
      if (filters?.limit) {
        query = query.limit(filters.limit);
      }

      const { data, error } = await query;

      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useClaimNextProduct(mode: TeachingMode) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      const supabase = getSupabase() as any;

      // Get current user
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      // Find next available product based on mode
      const requiresDeep = mode === 'deep_analysis';

      const { data: queueItem, error: findError } = await supabase
        .from('teaching_queue')
        .select(`
          *,
          product:products(*)
        `)
        .eq('status', 'pending')
        .eq('requires_deep_analysis', requiresDeep)
        .is('assigned_to', null)
        .order('priority', { ascending: true })
        .order('created_at', { ascending: true })
        .limit(1)
        .single();

      if (findError) throw findError;
      if (!queueItem) return null;

      // Claim it
      const { error: claimError } = await supabase
        .from('teaching_queue')
        .update({
          status: 'in_progress',
          assigned_to: user.id,
          assigned_at: new Date().toISOString(),
        })
        .eq('id', queueItem.id)
        .is('assigned_to', null); // Only if still unclaimed

      if (claimError) throw claimError;

      return queueItem;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['teaching-queue'] });
    },
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// PRODUCT SPECTRUM HOOKS
// ═══════════════════════════════════════════════════════════════════════════

export function useProductSpectrum(productId: string) {
  return useQuery({
    queryKey: ['product-spectrum', productId],
    queryFn: async () => {
      const supabase = getSupabase() as any;
      const { data, error } = await supabase
        .from('product_style_spectrum')
        .select('*')
        .eq('product_id', productId)
        .single();

      if (error && error.code !== 'PGRST116') throw error; // PGRST116 = not found
      return data;
    },
    enabled: !!productId,
  });
}

export function useSaveSpectrum() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      productId,
      spectrum,
    }: {
      productId: string;
      spectrum: Partial<SpectrumValues>;
    }) => {
      const supabase = getSupabase() as any;

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const { data, error } = await supabase
        .from('product_style_spectrum')
        .upsert({
          product_id: productId,
          ...spectrum,
          assigned_by: user.id,
          updated_at: new Date().toISOString(),
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: (_, { productId }) => {
      queryClient.invalidateQueries({ queryKey: ['product-spectrum', productId] });
    },
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// PRODUCT STYLES HOOKS
// ═══════════════════════════════════════════════════════════════════════════

export function useProductStyles(productId: string) {
  return useQuery({
    queryKey: ['product-styles', productId],
    queryFn: async () => {
      const supabase = getSupabase();
      const { data, error } = await supabase
        .from('product_styles')
        .select(`
          *,
          style:styles(*)
        `)
        .eq('product_id', productId)
        .order('is_primary', { ascending: false });

      if (error) throw error;
      return data ?? [];
    },
    enabled: !!productId,
  });
}

export function useAssignStyle() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      productId,
      styleId,
      isPrimary = false,
      confidence = 1.0,
    }: {
      productId: string;
      styleId: string;
      isPrimary?: boolean;
      confidence?: number;
    }) => {
      const supabase = getSupabase();

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      // If setting as primary, unset any existing primary
      if (isPrimary) {
        await (supabase as any)
          .from('product_styles')
          .update({ is_primary: false })
          .eq('product_id', productId)
          .eq('is_primary', true);
      }

      const { data, error } = await supabase
        .from('product_styles')
        .upsert({
          product_id: productId,
          style_id: styleId,
          is_primary: isPrimary,
          confidence,
          source: 'manual',
          assigned_by: user.id,
        } as any)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: (_, { productId }) => {
      queryClient.invalidateQueries({ queryKey: ['product-styles', productId] });
      queryClient.invalidateQueries({ queryKey: ['product', productId] });
    },
  });
}

export function useRemoveStyle() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      productId,
      styleId,
    }: {
      productId: string;
      styleId: string;
    }) => {
      const supabase = getSupabase();

      const { error } = await supabase
        .from('product_styles')
        .delete()
        .eq('product_id', productId)
        .eq('style_id', styleId);

      if (error) throw error;
    },
    onSuccess: (_, { productId }) => {
      queryClient.invalidateQueries({ queryKey: ['product-styles', productId] });
      queryClient.invalidateQueries({ queryKey: ['product', productId] });
    },
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// VALIDATION HOOKS
// ═══════════════════════════════════════════════════════════════════════════

export function useValidationQueue() {
  return useQuery({
    queryKey: ['validation-queue'],
    queryFn: async () => {
      const supabase = getSupabase() as any;
      const { data, error } = await supabase
        .from('teaching_queue')
        .select(`
          *,
          product:products(id, name, images, price_retail)
        `)
        .eq('status', 'needs_validation')
        .order('created_at', { ascending: true });

      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useSubmitValidation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      productId,
      vote,
      adjustments,
      flagReason,
    }: {
      productId: string;
      vote: ValidationVote;
      adjustments?: Record<string, unknown>;
      flagReason?: string;
    }) => {
      const supabase = getSupabase() as any;

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const { data, error } = await supabase
        .from('teaching_validations')
        .insert({
          product_id: productId,
          validator_id: user.id,
          vote,
          adjustments,
          flag_reason: flagReason,
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['validation-queue'] });
      queryClient.invalidateQueries({ queryKey: ['teaching-queue'] });
    },
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// DESIGNER STATS HOOKS
// ═══════════════════════════════════════════════════════════════════════════

export function useDesignerTeachingStats() {
  return useQuery({
    queryKey: ['designer-teaching-stats'],
    queryFn: async () => {
      const supabase = getSupabase() as any;

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return null;

      const { data, error } = await supabase
        .from('designer_teaching_stats')
        .select('*')
        .eq('designer_id', user.id)
        .maybeSingle();

      if (error) throw error;

      // Return default stats if no record exists for this user
      return data ?? {
        designer_id: user.id,
        products_taught: 0,
        validations_completed: 0,
        accuracy_score: 0,
        consensus_rate: 0,
        total_teaching_minutes: 0,
        badges: [],
        match_impact_count: 0,
      };
    },
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// FULL TEACHING SUBMISSION
// ═══════════════════════════════════════════════════════════════════════════

export function useSubmitTeaching() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      productId,
      teaching,
    }: {
      productId: string;
      teaching: ProductTeachingInput;
    }) => {
      const supabase = getSupabase() as any;

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      // Start a batch of operations

      // 1. Save primary style
      if (teaching.primaryStyleId) {
        const { error } = await supabase.from('product_styles').upsert({
          product_id: productId,
          style_id: teaching.primaryStyleId,
          is_primary: true,
          confidence: 1.0,
          source: 'manual',
          assigned_by: user.id,
        });
        if (error) throw new Error(`Failed to save primary style: ${error.message}`);
      }

      // 2. Save secondary style
      if (teaching.secondaryStyleId) {
        const { error } = await supabase.from('product_styles').upsert({
          product_id: productId,
          style_id: teaching.secondaryStyleId,
          is_primary: false,
          confidence: 0.8,
          source: 'manual',
          assigned_by: user.id,
        });
        if (error) throw new Error(`Failed to save secondary style: ${error.message}`);
      }

      // 3. Save spectrum values
      if (teaching.spectrum) {
        const { error } = await supabase.from('product_style_spectrum').upsert({
          product_id: productId,
          ...teaching.spectrum,
          assigned_by: user.id,
          updated_at: new Date().toISOString(),
        });
        if (error) throw new Error(`Failed to save spectrum: ${error.message}`);
      }

      // 4. Save client matches (ideal)
      if (teaching.idealClientIds?.length) {
        const idealMatches = teaching.idealClientIds.map((archetypeId) => ({
          product_id: productId,
          archetype_id: archetypeId,
          match_strength: 1.0,
          is_avoidance: false,
          assigned_by: user.id,
        }));
        const { error } = await supabase.from('product_client_matches').upsert(idealMatches);
        if (error) throw new Error(`Failed to save ideal client matches: ${error.message}`);
      }

      // 5. Save client matches (avoidance)
      if (teaching.avoidanceClientIds?.length) {
        const avoidanceMatches = teaching.avoidanceClientIds.map((archetypeId) => ({
          product_id: productId,
          archetype_id: archetypeId,
          match_strength: 0,
          is_avoidance: true,
          assigned_by: user.id,
        }));
        const { error } = await supabase.from('product_client_matches').upsert(avoidanceMatches);
        if (error) throw new Error(`Failed to save avoidance client matches: ${error.message}`);
      }

      // 6. Save appeal signals
      if (teaching.appealSignalIds?.length) {
        const signals = teaching.appealSignalIds.map((signalId) => ({
          product_id: productId,
          appeal_signal_id: signalId,
          assigned_by: user.id,
        }));
        const { error } = await supabase.from('product_appeal_signals').upsert(signals);
        if (error) throw new Error(`Failed to save appeal signals: ${error.message}`);
      }

      // 7. Update teaching queue status
      const { error: queueError } = await supabase
        .from('teaching_queue')
        .update({
          status: 'needs_validation',
          updated_at: new Date().toISOString(),
        })
        .eq('product_id', productId);
      if (queueError) throw new Error(`Failed to update teaching queue: ${queueError.message}`);

      return { success: true };
    },
    onSuccess: (_, { productId }) => {
      queryClient.invalidateQueries({ queryKey: ['product-styles', productId] });
      queryClient.invalidateQueries({ queryKey: ['product-spectrum', productId] });
      queryClient.invalidateQueries({ queryKey: ['teaching-queue'] });
      queryClient.invalidateQueries({ queryKey: ['designer-teaching-stats'] });
    },
  });
}
