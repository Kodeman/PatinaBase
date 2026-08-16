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

/** One offered discovery-call slot (`match_ceremonies.offered_slots[]`, Arrival Arc R106). */
export interface CeremonySlot {
  id: string;
  starts_at: string;
  duration_minutes: number;
}

/**
 * One `match_ceremonies` row (Arrival Arc R106 §2 — the Match Ceremony).
 * Draft-state fields (`intro_text`, `credential_line`, `portfolio_url`,
 * `draft_slots`) autosave via direct PostgREST UPDATE (designer has full RLS
 * on own rows); `offered_slots`/`offered_at`/`picked_*`/`designer_client_id`/
 * `thread_id` are written by the RPCs, never by the portal directly.
 */
export interface MatchCeremony {
  id: string;
  lead_id: string;
  designer_id: string;
  client_id: string | null;
  state: 'draft' | 'sent' | 'picked';
  intro_text: string | null;
  credential_line: string | null;
  portfolio_url: string | null;
  draft_slots: CeremonySlot[] | null;
  offered_slots: CeremonySlot[] | null;
  timezone: string | null;
  offered_at: string | null;
  picked_slot_id: string | null;
  picked_at: string | null;
  designer_client_id: string | null;
  thread_id: string | null;
  created_at: string;
  updated_at: string | null;
}

/** The `accept_design_request` RPC's jsonb result (Arrival Arc R106 §1/§7). */
export interface AcceptDesignRequestResult {
  lead_id: string;
  ceremony_id: string;
  already_yours: boolean;
}

/** The `ceremony_complete` RPC's jsonb result (Arrival Arc R106 §7). */
export interface CeremonyCompleteResult {
  designer_client_id: string;
  thread_id: string;
  ceremony_id: string;
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
    /** AI style read on the scan — the ceremony's tag chips (R106). */
    suggested_styles: string[] | null;
  } | null;
}

// ═══════════════════════════════════════════════════════════════════════════
// HOOKS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * The open design-request pool (Desk strip, `design-request-pool` flag).
 * Polls every 30s — mirrors the inbox bell's cadence (no realtime publication
 * changes for this feature per the backend contract). `opts.enabled` lets the
 * caller gate the query (and its poll) on the feature flag having resolved,
 * so non-pilot designers never issue the request.
 */
export function useOpenDesignRequests(opts?: { enabled?: boolean }) {
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
    enabled: opts?.enabled ?? true,
    refetchInterval: opts?.enabled ?? true ? 30_000 : false,
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
    mutationFn: async ({ leadId, studioId }: { leadId: string; studioId: string }) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = getSupabase() as any;

      const { data, error } = await supabase.rpc('claim_design_request', {
        p_lead_id: leadId,
        p_studio_id: studioId,
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
            model_url_gltf,
            suggested_styles
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

// ═══════════════════════════════════════════════════════════════════════════
// THE MATCH CEREMONY (Arrival Arc R106)
// ═══════════════════════════════════════════════════════════════════════════
// `match_ceremonies` is not in the generated database.types.ts on this branch
// (the migration lands in a sibling lane) — the client is cast `any` per the
// document_state precedent elsewhere in this file.

/**
 * Accept an open design request (Arrival Arc, `accept_design_request` RPC —
 * claim + ceremony stub + client held-state notification; creates nothing
 * else). Idempotent for a lead the caller already owns (`already_yours`), so
 * the TriageBar can route an already-assigned lead into its ceremony.
 *
 * Invalidates the pool + leads surfaces this package owns. The Desk's
 * `['document-state','desk']` key and the `documentEvents` telemetry are the
 * app's — mirror `useClaimDesignRequest` and handle both at the call site.
 */
export function useAcceptDesignRequest(options?: { errorSurface?: 'inline' }) {
  const queryClient = useQueryClient();

  return useMutation({
    meta: options?.errorSurface ? { errorSurface: options.errorSurface } : undefined,
    mutationFn: async ({ leadId, studioId }: { leadId: string; studioId: string }) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = getSupabase() as any;

      const { data, error } = await supabase.rpc('accept_design_request', {
        p_lead_id: leadId,
        p_studio_id: studioId,
      });

      if (error) throw error;
      return data as AcceptDesignRequestResult;
    },
    onSuccess: (result: AcceptDesignRequestResult) => {
      queryClient.invalidateQueries({ queryKey: ['open-design-requests'] });
      queryClient.invalidateQueries({ queryKey: ['leads'] });
      queryClient.invalidateQueries({ queryKey: ['lead-stats'] });
      queryClient.invalidateQueries({ queryKey: ['ceremony', result.lead_id] });
    },
  });
}

/**
 * The caller's own `match_ceremonies` row for a lead (RLS: designer full
 * access on own rows). `null` when no ceremony exists — the route treats that
 * as not-your-lead and quietly redirects.
 */
export function useCeremony(leadId: string) {
  return useQuery({
    queryKey: ['ceremony', leadId],
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = getSupabase() as any;

      const { data, error } = await supabase
        .from('match_ceremonies')
        .select('*')
        .eq('lead_id', leadId)
        .maybeSingle();

      if (error) throw error;
      return (data ?? null) as MatchCeremony | null;
    },
    enabled: !!leadId,
  });
}

/** The draft fields the ceremony autosaves (R106 §3 — put-downable, draft held). */
export interface CeremonyDraftPatch {
  intro_text?: string | null;
  credential_line?: string | null;
  portfolio_url?: string | null;
  draft_slots?: CeremonySlot[] | null;
  timezone?: string | null;
}

/**
 * Autosave the ceremony draft (direct PostgREST UPDATE by ceremony id — the
 * designer's own row under RLS). Debounce lives portal-side (~800ms). No
 * query invalidation on purpose: while the composer is open the local state
 * is the source of truth, and an autosave-triggered refetch would clobber
 * in-flight typing. Re-entry refetches `['ceremony', leadId]` on mount.
 */
export function useSaveCeremonyDraft() {
  return useMutation({
    mutationFn: async ({ ceremonyId, patch }: { ceremonyId: string; patch: CeremonyDraftPatch }) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = getSupabase() as any;

      const { error } = await supabase
        .from('match_ceremonies')
        .update(patch)
        .eq('id', ceremonyId);

      if (error) throw error;
    },
  });
}

/** `ceremony_complete` RPC input (R106 §7 — the threshold act, one transaction). */
export interface CeremonyCompleteInput {
  leadId: string;
  intro: string;
  slots: CeremonySlot[];
  timezone: string;
  credentialLine?: string | null;
  portfolioUrl?: string | null;
}

/**
 * Complete the ceremony (`ceremony_complete` RPC — one transaction:
 * relationship + discovery + thread with the intro at its head + client
 * notification). Returns the new `designer_client_id` — the send lands the
 * designer in the Document at Discovery (`/doc/{designer_client_id}`).
 *
 * Invalidates the relationship/lead surfaces this package owns; the app's
 * `['document-state', …]` keys and telemetry belong at the call site
 * (TriageBar pattern).
 */
export function useCeremonyComplete() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: CeremonyCompleteInput) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = getSupabase() as any;

      const { data, error } = await supabase.rpc('ceremony_complete', {
        p_lead_id: input.leadId,
        p_intro: input.intro,
        p_slots: input.slots,
        p_timezone: input.timezone,
        p_credential_line: input.credentialLine ?? null,
        p_portfolio_url: input.portfolioUrl ?? null,
      });

      if (error) throw error;
      return data as CeremonyCompleteResult;
    },
    onSuccess: (result: CeremonyCompleteResult, input: CeremonyCompleteInput) => {
      queryClient.invalidateQueries({ queryKey: ['ceremony', input.leadId] });
      queryClient.invalidateQueries({ queryKey: ['leads'] });
      queryClient.invalidateQueries({ queryKey: ['lead-stats'] });
      queryClient.invalidateQueries({ queryKey: ['designer-clients'] });
      queryClient.invalidateQueries({ queryKey: ['discovery', result.designer_client_id] });
    },
  });
}
