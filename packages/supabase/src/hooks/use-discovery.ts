import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { createBrowserClient } from '../client';

// Lazy client getter to avoid module-level initialization during SSR
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const getSupabase = () => createBrowserClient() as any;

// ═══════════════════════════════════════════════════════════════════════════
// The Discovery section (Track 6, Slice 5 / R66)
//
// The five STRUCTURED essentials + deepening, captured per Discovery
// engagement (designer_clients, document_state Shape D). The structured data
// auto-seeds the proposal Drafting Room via begin_direction_from_discovery
// (00224). The margin (notes) and folio are handled separately — this hook is
// the structured layer only.
// ═══════════════════════════════════════════════════════════════════════════

export interface DiscoveryRoom {
  name: string;
  room_type?: string | null;
  floor_area_sqft?: number | string | null;
  keep_as_is?: boolean;
  notes?: string | null;
}
export interface LifestyleRow {
  room: string; // a scope-room name, or 'Household'
  who?: string | null;
  how?: string | null;
}
export interface KeepItem {
  label: string;
  reason?: string | null;
}
export interface AvoidItem {
  label: string;
}
export interface DecisionMaker {
  name: string;
  role?: string | null;
  approves?: string | null;
  comms?: string | null;
}

export interface ClientDiscovery {
  id: string;
  designer_client_id: string;
  designer_id: string;
  project_type: string | null;
  rooms: DiscoveryRoom[];
  budget_min_cents: number | null;
  budget_max_cents: number | null;
  budget_basis: string | null;
  target_date: string | null;
  hard_date: string | null;
  start_urgency: string | null;
  style_tag_ids: string[];
  style_keywords: string[];
  lifestyle: LifestyleRow[];
  keep_items: KeepItem[];
  avoid_items: AvoidItem[];
  decision_makers: DecisionMaker[];
  site_notes: string | null;
  room_scan_id: string | null;
  ready_at: string | null;
  seeded_proposal_id: string | null;
  seeded_at: string | null;
  created_at: string;
  updated_at: string;
}

/** What the read hook returns: the row if it exists, plus a non-binding
 *  prefill derived from the originating lead's coarse fields (R66 audit). */
export interface DiscoveryRead {
  row: ClientDiscovery | null;
  prefill: Partial<ClientDiscovery> | null;
}

const DISCOVERY_COLUMNS =
  'id, designer_client_id, designer_id, project_type, rooms, budget_min_cents, budget_max_cents, budget_basis, target_date, hard_date, start_urgency, style_tag_ids, style_keywords, lifestyle, keep_items, avoid_items, decision_makers, site_notes, room_scan_id, ready_at, seeded_proposal_id, seeded_at, created_at, updated_at';

/** The lead's coarse budget_range enum → a cents range for the prefill. */
function budgetRangeToCents(range: string | null): { min: number | null; max: number | null } {
  switch (range) {
    case 'under_5k':
      return { min: 0, max: 500_000 };
    case '5k_15k':
      return { min: 500_000, max: 1_500_000 };
    case '15k_50k':
      return { min: 1_500_000, max: 5_000_000 };
    case '50k_100k':
      return { min: 5_000_000, max: 10_000_000 };
    case 'over_100k':
      return { min: 10_000_000, max: null };
    default:
      return { min: null, max: null };
  }
}

export function useDiscovery(designerClientId: string | null) {
  return useQuery<DiscoveryRead>({
    queryKey: ['discovery', designerClientId],
    enabled: Boolean(designerClientId),
    queryFn: async () => {
      const supabase = getSupabase();
      const { data: row, error } = await supabase
        .from('client_discovery')
        .select(DISCOVERY_COLUMNS)
        .eq('designer_client_id', designerClientId)
        .maybeSingle();
      if (error) throw error;
      if (row) return { row: row as ClientDiscovery, prefill: null };

      // No discovery row yet — derive a non-binding prefill from the lead.
      const { data: dc } = await supabase
        .from('designer_clients')
        .select('lead_id')
        .eq('id', designerClientId)
        .maybeSingle();
      let prefill: Partial<ClientDiscovery> | null = null;
      if (dc?.lead_id) {
        const { data: lead } = await supabase
          .from('leads')
          .select('project_type, budget_range, timeline')
          .eq('id', dc.lead_id)
          .maybeSingle();
        if (lead) {
          const b = budgetRangeToCents(lead.budget_range ?? null);
          prefill = {
            project_type: lead.project_type ?? null,
            budget_min_cents: b.min,
            budget_max_cents: b.max,
            start_urgency: lead.timeline ?? null,
          };
        }
      }
      return { row: null, prefill };
    },
  });
}

export interface UpsertDiscoveryInput {
  designerClientId: string;
  designerId: string;
  patch: Partial<
    Omit<ClientDiscovery, 'id' | 'designer_client_id' | 'designer_id' | 'created_at' | 'updated_at'>
  >;
}

/** Per-block partial upsert (no Save button — each editor self-persists). */
export function useUpsertDiscovery() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ designerClientId, designerId, patch }: UpsertDiscoveryInput) => {
      const supabase = getSupabase();
      const { data, error } = await supabase
        .from('client_discovery')
        .upsert(
          { designer_client_id: designerClientId, designer_id: designerId, ...patch },
          { onConflict: 'designer_client_id' }
        )
        .select(DISCOVERY_COLUMNS)
        .single();
      if (error) throw error;
      return data as ClientDiscovery;
    },
    onSuccess: (_data, input) => {
      void qc.invalidateQueries({ queryKey: ['discovery', input.designerClientId] });
    },
  });
}

/** The readiness act (R66): seed a draft proposal from the five essentials.
 *  Returns the new proposal id; the engagement re-derives Discovery→Direction. */
export function useBeginDirection() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ designerClientId }: { designerClientId: string }) => {
      const supabase = getSupabase();
      const { data, error } = await supabase.rpc('begin_direction_from_discovery', {
        p_designer_client_id: designerClientId,
      });
      if (error) throw error;
      return data as string; // the new proposal id
    },
    onSuccess: (_data, input) => {
      void qc.invalidateQueries({ queryKey: ['discovery', input.designerClientId] });
      // One act, many surfaces (§5): the open doc + Desk re-derive Shape D→B.
      void qc.invalidateQueries({ queryKey: ['document-state'] });
      void qc.invalidateQueries({ queryKey: ['desk'] });
      void qc.invalidateQueries({ queryKey: ['leads'] });
    },
  });
}
