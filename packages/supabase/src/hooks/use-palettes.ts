import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { createBrowserClient } from '../client';
import {
  invalidateProposalClientQueries,
  PROPOSAL_CLIENT_MUTATION_KEY,
} from '../lib/proposal-client-query-invalidation';

const getSupabase = () => createBrowserClient();

// ─── Types ────────────────────────────────────────────────────────────────────

export type PaletteSwatchRole =
  | 'foundation'
  | 'wall'
  | 'accent'
  | 'trim'
  | 'ceiling'
  | 'floor'
  | 'metal'
  | 'textile'
  | 'other';

export interface ProposalPalette {
  id: string;
  proposal_id: string;
  name: string;
  scope_room_id: string | null;
  is_primary: boolean;
  source_image_url: string | null;
  notes: string | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface PaletteSwatch {
  id: string;
  palette_id: string;
  hex: string;
  name: string | null;
  role: PaletteSwatchRole | null;
  paint_color_id: string | null;
  brand: string | null;
  brand_code: string | null;
  source_pixel: { x: number; y: number } | null;
  sort_order: number;
  created_at: string;
}

export interface PaletteWithSwatches extends ProposalPalette {
  swatches: PaletteSwatch[];
}

export interface UpsertPaletteInput {
  proposalId: string;
  paletteId?: string;
  name?: string;
  scopeRoomId?: string | null;
  sourceImageUrl?: string | null;
  notes?: string | null;
  isPrimary?: boolean;
  sortOrder?: number;
}

export interface UpsertSwatchInput {
  proposalId: string;
  paletteId: string;
  swatchId?: string;
  hex: string;
  name?: string | null;
  role?: PaletteSwatchRole | null;
  paintColorId?: string | null;
  brand?: string | null;
  brandCode?: string | null;
  sourcePixel?: { x: number; y: number } | null;
  sortOrder?: number;
}

// ─── Hooks ────────────────────────────────────────────────────────────────────

/**
 * Returns all palettes for a given proposal, ordered by sort_order then
 * created_at. RLS ensures only the proposal designer (or, for non-draft
 * proposals, the linked client) can see the rows.
 */
export function usePalettes(proposalId: string | null | undefined) {
  return useQuery({
    queryKey: ['proposal-palettes', proposalId ?? null],
    enabled: !!proposalId,
    queryFn: async (): Promise<ProposalPalette[]> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = getSupabase() as any;
      const { data, error } = await supabase
        .from('proposal_palettes')
        .select('*')
        .eq('proposal_id', proposalId)
        .order('sort_order', { ascending: true })
        .order('created_at', { ascending: true });

      if (error) throw error;
      return (data ?? []) as ProposalPalette[];
    },
  });
}

/**
 * Returns a single palette with its swatches inlined.
 */
export function usePalette(paletteId: string | null | undefined) {
  return useQuery({
    queryKey: ['proposal-palette', paletteId ?? null],
    enabled: !!paletteId,
    queryFn: async (): Promise<PaletteWithSwatches | null> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = getSupabase() as any;

      const { data: palette, error: paletteErr } = await supabase
        .from('proposal_palettes')
        .select('*')
        .eq('id', paletteId)
        .maybeSingle();

      if (paletteErr) throw paletteErr;
      if (!palette) return null;

      const { data: swatches, error: swatchErr } = await supabase
        .from('palette_swatches')
        .select('*')
        .eq('palette_id', paletteId)
        .order('sort_order', { ascending: true })
        .order('created_at', { ascending: true });

      if (swatchErr) throw swatchErr;

      return {
        ...(palette as ProposalPalette),
        swatches: (swatches ?? []) as PaletteSwatch[],
      };
    },
  });
}

/**
 * Create or update a palette. If `paletteId` is provided, the row is
 * updated; otherwise a new row is inserted. When `isPrimary: true` is
 * passed, any existing primary palette on the proposal is demoted first
 * to satisfy the partial unique index.
 */
export function useUpsertPalette() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationKey: [PROPOSAL_CLIENT_MUTATION_KEY],
    mutationFn: async (input: UpsertPaletteInput): Promise<ProposalPalette> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = getSupabase() as any;

      // Demote existing primary if needed.
      if (input.isPrimary === true) {
        const demoteQuery = supabase
          .from('proposal_palettes')
          .update({ is_primary: false })
          .eq('proposal_id', input.proposalId);
        // Don't demote ourselves on update.
        const { error: demoteErr } = await (input.paletteId
          ? demoteQuery.neq('id', input.paletteId)
          : demoteQuery);
        if (demoteErr) throw demoteErr;
      }

      if (input.paletteId) {
        // Update path — only set fields that were explicitly provided.
        const updates: Record<string, unknown> = {};
        if (input.name !== undefined) updates.name = input.name;
        if (input.scopeRoomId !== undefined) updates.scope_room_id = input.scopeRoomId;
        if (input.sourceImageUrl !== undefined) updates.source_image_url = input.sourceImageUrl;
        if (input.notes !== undefined) updates.notes = input.notes;
        if (input.isPrimary !== undefined) updates.is_primary = input.isPrimary;
        if (input.sortOrder !== undefined) updates.sort_order = input.sortOrder;

        const { data, error } = await supabase
          .from('proposal_palettes')
          .update(updates)
          .eq('id', input.paletteId)
          .select()
          .single();

        if (error) throw error;
        return data as ProposalPalette;
      }

      // Insert path.
      if (!input.name) throw new Error('Palette name is required');

      const row = {
        proposal_id: input.proposalId,
        name: input.name,
        scope_room_id: input.scopeRoomId ?? null,
        source_image_url: input.sourceImageUrl ?? null,
        notes: input.notes ?? null,
        is_primary: input.isPrimary ?? false,
        sort_order: input.sortOrder ?? 0,
      };

      const { data, error } = await supabase
        .from('proposal_palettes')
        .insert(row)
        .select()
        .single();

      if (error) throw error;
      return data as ProposalPalette;
    },
    onSuccess: async (palette) => {
      queryClient.invalidateQueries({ queryKey: ['proposal-palettes', palette.proposal_id] });
      queryClient.invalidateQueries({ queryKey: ['proposal-palette', palette.id] });
      await invalidateProposalClientQueries(queryClient, palette.proposal_id);
    },
  });
}

/**
 * Delete a palette. ON DELETE CASCADE removes its swatches too.
 */
export function useDeletePalette() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationKey: [PROPOSAL_CLIENT_MUTATION_KEY],
    mutationFn: async ({
      paletteId,
      proposalId: _proposalId,
    }: {
      paletteId: string;
      proposalId: string;
    }): Promise<void> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = getSupabase() as any;
      const { error } = await supabase.from('proposal_palettes').delete().eq('id', paletteId);
      if (error) throw error;
    },
    onSuccess: async (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['proposal-palettes', variables.proposalId] });
      queryClient.invalidateQueries({ queryKey: ['proposal-palette', variables.paletteId] });
      await invalidateProposalClientQueries(queryClient, variables.proposalId);
    },
  });
}

/**
 * Create or update a swatch on a palette.
 */
export function useUpsertSwatch() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationKey: [PROPOSAL_CLIENT_MUTATION_KEY],
    mutationFn: async (input: UpsertSwatchInput): Promise<PaletteSwatch> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = getSupabase() as any;

      if (input.swatchId) {
        const updates: Record<string, unknown> = {};
        if (input.hex !== undefined) updates.hex = input.hex;
        if (input.name !== undefined) updates.name = input.name;
        if (input.role !== undefined) updates.role = input.role;
        if (input.paintColorId !== undefined) updates.paint_color_id = input.paintColorId;
        if (input.brand !== undefined) updates.brand = input.brand;
        if (input.brandCode !== undefined) updates.brand_code = input.brandCode;
        if (input.sourcePixel !== undefined) updates.source_pixel = input.sourcePixel;
        if (input.sortOrder !== undefined) updates.sort_order = input.sortOrder;

        const { data, error } = await supabase
          .from('palette_swatches')
          .update(updates)
          .eq('id', input.swatchId)
          .select()
          .single();

        if (error) throw error;
        return data as PaletteSwatch;
      }

      const row = {
        palette_id: input.paletteId,
        hex: input.hex,
        name: input.name ?? null,
        role: input.role ?? null,
        paint_color_id: input.paintColorId ?? null,
        brand: input.brand ?? null,
        brand_code: input.brandCode ?? null,
        source_pixel: input.sourcePixel ?? null,
        sort_order: input.sortOrder ?? 0,
      };

      const { data, error } = await supabase
        .from('palette_swatches')
        .insert(row)
        .select()
        .single();

      if (error) throw error;
      return data as PaletteSwatch;
    },
    onSuccess: async (swatch, variables) => {
      queryClient.invalidateQueries({ queryKey: ['proposal-palette', swatch.palette_id] });
      // Also bust the parent list cache for any consumer that selected
      // by proposal — we don't know the proposal id from the swatch row,
      // so invalidate the broader prefix.
      queryClient.invalidateQueries({ queryKey: ['proposal-palettes'] });
      await invalidateProposalClientQueries(queryClient, variables.proposalId);
    },
  });
}

/**
 * Delete a single swatch.
 */
export function useDeleteSwatch() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationKey: [PROPOSAL_CLIENT_MUTATION_KEY],
    mutationFn: async ({
      swatchId,
      paletteId: _paletteId,
      proposalId: _proposalId,
    }: {
      swatchId: string;
      paletteId: string;
      proposalId: string;
    }): Promise<void> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = getSupabase() as any;
      const { error } = await supabase.from('palette_swatches').delete().eq('id', swatchId);
      if (error) throw error;
    },
    onSuccess: async (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['proposal-palette', variables.paletteId] });
      queryClient.invalidateQueries({ queryKey: ['proposal-palettes'] });
      await invalidateProposalClientQueries(queryClient, variables.proposalId);
    },
  });
}

/**
 * Reorder the exact swatch set on a palette. The 00389 RPC validates that the
 * supplied ids contain every palette swatch exactly once and assigns the whole
 * zero-based order in one transaction.
 */
export function useReorderSwatches() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationKey: [PROPOSAL_CLIENT_MUTATION_KEY],
    mutationFn: async ({
      paletteId,
      proposalId: _proposalId,
      orderedIds,
    }: {
      paletteId: string;
      proposalId: string;
      orderedIds: string[];
    }): Promise<void> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = getSupabase() as any;

      const { error } = await supabase.rpc('reorder_palette_swatches', {
        p_proposal_id: _proposalId,
        p_palette_id: paletteId,
        p_ordered_ids: orderedIds,
      });
      if (error) throw error;
    },
    // Keep every mounted projection synchronized after success or rejection.
    onSettled: async (_data, _error, variables) => {
      queryClient.invalidateQueries({ queryKey: ['proposal-palette', variables.paletteId] });
      queryClient.invalidateQueries({ queryKey: ['proposal-palettes'] });
      await invalidateProposalClientQueries(queryClient, variables.proposalId);
    },
  });
}
