import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { createBrowserClient } from '../client';

// Lazy client getter to avoid module-level initialization during SSR
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const getSupabase = () => createBrowserClient() as any;

// ═══════════════════════════════════════════════════════════════════════════
// The Match Ceremony, read from the Discovery fold's side (Arrival Arc R106,
// build-plan 2.5 / package "Discovery fold, honest" — Wave 2).
//
// The ceremony-authoring surface (compose, send, put-down) lives on a sibling
// lane keyed by `lead_id`. This module is the Discovery fold's OWN lookup —
// by `designer_client_id` (the relationship/engagement id `discovery-section
// .tsx` already calls `engagementId`), because that's the key the fold has in
// hand. `match_ceremonies` is not yet in the generated database.types.ts (its
// migration lands on a sibling lane); the client is cast `any` per the
// document_state precedent used elsewhere in this package.
// ═══════════════════════════════════════════════════════════════════════════

export interface CeremonyOfferedSlot {
  id: string;
  starts_at: string;
  duration_minutes: number;
}

/** The subset of `match_ceremonies` the Discovery fold's schedule line needs. */
export interface CeremonyForRelationship {
  id: string;
  lead_id: string;
  designer_id: string;
  client_id: string | null;
  designer_client_id: string | null;
  state: 'draft' | 'sent' | 'picked';
  offered_slots: CeremonyOfferedSlot[] | null;
  timezone: string | null;
  offered_at: string | null;
  picked_slot_starts_at: string | null;
  thread_id: string | null;
}

const CEREMONY_COLUMNS =
  'id, lead_id, designer_id, client_id, designer_client_id, state, offered_slots, timezone, offered_at, picked_slot_starts_at, thread_id';

/**
 * The Match Ceremony for a Discovery-fold relationship. A ceremony only
 * becomes a fact the fold reports once it's been sent (`state` 'sent' or
 * 'picked') — an unabandoned 'draft' still sits with the designer in the
 * ceremony composer, not yet a thing that happened to this engagement, so it
 * is excluded here. Returns `null` for non-arc engagements (no ceremony row
 * at all) — the fold's schedule line renders nothing for those, byte-
 * identical to today.
 */
export function useCeremonyForRelationship(designerClientId: string | null) {
  return useQuery<CeremonyForRelationship | null>({
    queryKey: ['match-ceremony', 'relationship', designerClientId],
    enabled: Boolean(designerClientId),
    queryFn: async () => {
      const supabase = getSupabase();
      const { data, error } = await supabase
        .from('match_ceremonies')
        .select(CEREMONY_COLUMNS)
        .eq('designer_client_id', designerClientId)
        .in('state', ['sent', 'picked'])
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return (data ?? null) as CeremonyForRelationship | null;
    },
  });
}

export interface RefreshOfferedSlotsInput {
  ceremonyId: string;
  /** Carried through purely for precise cache invalidation. */
  designerClientId: string;
  slots: { starts_at: string; duration_minutes?: number }[];
}

/**
 * The designer replaces a stale, unpicked slot offer (`refresh_offered_slots`
 * RPC, R106 §4 / build-plan 2.7 — "if the offered slots go stale before she
 * picks, the chip asks for fresh times"). Server validates 2–3 future slots
 * and mints slot ids; the caller sends only `starts_at` (+ optional
 * `duration_minutes`, default 45).
 */
export function useRefreshOfferedSlots() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ ceremonyId, slots }: RefreshOfferedSlotsInput) => {
      const supabase = getSupabase();
      const { data, error } = await supabase.rpc('refresh_offered_slots', {
        p_ceremony_id: ceremonyId,
        p_slots: slots,
      });
      if (error) throw error;
      return data as CeremonyOfferedSlot[];
    },
    onSuccess: (_data, input) => {
      void qc.invalidateQueries({
        queryKey: ['match-ceremony', 'relationship', input.designerClientId],
      });
    },
  });
}
