import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { createBrowserClient } from '../client';
import type { RoomScanDimensions } from './use-room-scans';

// Lazy client getter to avoid module-level initialization during SSR
const getSupabase = () => createBrowserClient();

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

/**
 * One row of the `open_design_requests` pool (Designer Handoff backend
 * contract, 00286). Unassigned, client-originated 'new' leads — the view's
 * own in-body `is_designer` gate means only designers can select it at all.
 * Deliberately no homeowner identity columns pre-claim.
 */
export interface OpenDesignRequest {
  id: string;
  project_type: string | null;
  budget_range: string | null;
  timeline: string | null;
  project_description: string | null;
  location_city: string | null;
  location_state: string | null;
  created_at: string | null;
  scan_count: number | null;
  thumbnail_url: string | null;
  room_type: string | null;
  floor_area: number | null;
}

/** The `claim_design_request` RPC's jsonb result (00286). */
export interface ClaimDesignRequestResult {
  lead_id: string;
  designer_id?: string;
  status?: string;
  already_yours: boolean;
}

/** One `lead_room_scans` junction row, joined to its scan (00285). */
export interface LeadRoomScan {
  id: string;
  lead_id: string;
  scan_id: string;
  is_primary: boolean;
  position: number;
  created_at: string;
  scan: {
    id: string;
    name: string;
    room_type: string | null;
    thumbnail_url: string | null;
    floor_area: number | null;
    dimensions: RoomScanDimensions | null;
    status: string;
    model_url: string | null;
    model_url_gltf: string | null;
  } | null;
}

// ═══════════════════════════════════════════════════════════════════════════
// HOOKS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * The open design-request pool (Desk strip, `design-request-pool` flag).
 * Polls every 30s — mirrors the inbox bell's cadence (no realtime publication
 * changes for this feature per the backend contract).
 */
export function useOpenDesignRequests() {
  return useQuery({
    queryKey: ['open-design-requests'],
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = getSupabase() as any;

      const { data, error } = await supabase
        .from('open_design_requests')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      return (data ?? []) as OpenDesignRequest[];
    },
    refetchInterval: 30_000,
  });
}

/**
 * Claim an open design request (atomic first-wins on the backend). Success
 * turns the lead into a normal Desk lead (Shape C, status 'new') owned by the
 * caller. Errors surface as `error.message` carrying the RPC's slug —
 * `already_claimed | not_designer | request_not_found | not_authenticated`
 * (`already_yours: true` in the result, not an error, means the caller had
 * already won a prior attempt — a safe re-claim).
 *
 * Invalidates the pool + the leads surfaces this hook owns. The Desk's own
 * `['document-state','desk']` key is NOT invalidated here — mirror the
 * TriageBar pattern and invalidate it at the call site (the app owns that
 * key, not this package).
 *
 * R83 — the caller (the Desk's Open requests strip) renders `already_claimed`
 * inline at the card, so it passes `{ errorSurface: 'inline' }` to keep the
 * global error toast quiet (see `apps/designer-portal/src/lib/react-query.ts`'s
 * meta contract; mirrors `useUpdateDecisionStatus`/`useCreateScopeChangeRequest`).
 */
export function useClaimDesignRequest(options?: { errorSurface?: 'inline' }) {
  const queryClient = useQueryClient();

  return useMutation({
    meta: options?.errorSurface ? { errorSurface: options.errorSurface } : undefined,
    mutationFn: async (leadId: string) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = getSupabase() as any;

      const { data, error } = await supabase.rpc('claim_design_request', {
        p_lead_id: leadId,
      });

      if (error) throw error;
      return data as ClaimDesignRequestResult;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['open-design-requests'] });
      queryClient.invalidateQueries({ queryKey: ['leads'] });
      queryClient.invalidateQueries({ queryKey: ['lead-stats'] });
    },
  });
}

/**
 * The full scan set attached to one design request/lead (`lead_room_scans`
 * junction, 00285), ordered primary-first then by position. RLS restricts
 * this to the lead's participants (homeowner or its assigned designer), so it
 * only resolves once a request is claimed (or was pre-assigned).
 */
export function useLeadScans(leadId: string) {
  return useQuery({
    queryKey: ['lead-scans', leadId],
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = getSupabase() as any;

      const { data, error } = await supabase
        .from('lead_room_scans')
        .select(
          `
          id,
          lead_id,
          scan_id,
          is_primary,
          position,
          created_at,
          scan:room_scans!scan_id(
            id,
            name,
            room_type,
            thumbnail_url,
            floor_area,
            dimensions,
            status,
            model_url,
            model_url_gltf
          )
        `,
        )
        .eq('lead_id', leadId)
        .order('is_primary', { ascending: false })
        .order('position', { ascending: true });

      if (error) throw error;
      return (data ?? []) as LeadRoomScan[];
    },
    enabled: !!leadId,
  });
}
