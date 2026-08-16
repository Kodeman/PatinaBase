import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { createBrowserClient } from '../client';

// Lazy client getter to avoid module-level initialization during SSR
const getSupabase = () => createBrowserClient();

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

export interface Lead {
  id: string;
  homeowner_id: string | null;
  designer_id: string | null;
  /** Immutable design-studio authority snapshot. Pooled/legacy rows may be null. */
  studio_id: string | null;
  project_type: string;
  project_description: string | null;
  budget_range: string | null;
  timeline: string | null;
  location_city: string | null;
  location_state: string | null;
  location_zip: string | null;
  match_score: number | null;
  match_reasons: string[];
  status: 'new' | 'viewed' | 'contacted' | 'accepted' | 'declined' | 'expired';
  response_deadline: string | null;
  contacted_at: string | null;
  accepted_at: string | null;
  declined_at: string | null;
  created_at: string;
  updated_at: string;
  // Contact details for designer-captured prospects with no homeowner profile
  contact_name: string | null;
  contact_email: string | null;
  // Track 6 R65 — where the lead came from (canonical chip label or free text).
  source: string | null;
  // Joined data
  homeowner?: {
    id: string;
    email: string;
    full_name: string | null;
    avatar_url: string | null;
  };
}

export interface LeadFilters {
  status?: string | string[];
  matchScoreMin?: number;
  projectType?: string;
  budgetRange?: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// HOOKS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Fetch leads for the current designer with optional filters
 */
export function useLeads(filters?: LeadFilters) {
  return useQuery({
    queryKey: ['leads', filters],
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = getSupabase() as any;

      let query = supabase
        .from('leads')
        .select(`
          *,
          homeowner:profiles!homeowner_id(
            id,
            email,
            full_name,
            avatar_url
          )
        `)
        .order('created_at', { ascending: false });

      // Apply filters
      if (filters?.status) {
        if (Array.isArray(filters.status)) {
          query = query.in('status', filters.status);
        } else {
          query = query.eq('status', filters.status);
        }
      }

      if (filters?.matchScoreMin !== undefined) {
        query = query.gte('match_score', filters.matchScoreMin);
      }

      if (filters?.projectType) {
        query = query.eq('project_type', filters.projectType);
      }

      if (filters?.budgetRange) {
        query = query.eq('budget_range', filters.budgetRange);
      }

      const { data, error } = await query;

      if (error) throw error;
      return (data ?? []) as Lead[];
    },
  });
}

/**
 * Fetch a single lead by ID
 */
export function useLead(leadId: string) {
  return useQuery({
    queryKey: ['lead', leadId],
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = getSupabase() as any;

      const { data, error } = await supabase
        .from('leads')
        .select(`
          *,
          homeowner:profiles!homeowner_id(
            id,
            email,
            full_name,
            avatar_url
          )
        `)
        .eq('id', leadId)
        .single();

      if (error) throw error;
      return data as Lead;
    },
    enabled: !!leadId,
  });
}

/**
 * Get lead statistics for the current designer
 */
export function useLeadStats() {
  return useQuery({
    queryKey: ['lead-stats'],
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = getSupabase() as any;

      const { data, error } = await supabase
        .from('leads')
        .select('status, match_score');

      if (error) throw error;

      const leads = data ?? [];
      const stats = {
        total: leads.length,
        new: leads.filter((l: Lead) => l.status === 'new').length,
        viewed: leads.filter((l: Lead) => l.status === 'viewed').length,
        contacted: leads.filter((l: Lead) => l.status === 'contacted').length,
        accepted: leads.filter((l: Lead) => l.status === 'accepted').length,
        declined: leads.filter((l: Lead) => l.status === 'declined').length,
        highMatch: leads.filter((l: Lead) => (l.match_score ?? 0) >= 0.8).length,
        avgMatchScore: leads.length > 0
          ? leads.reduce((sum: number, l: Lead) => sum + (l.match_score ?? 0), 0) / leads.length
          : 0,
      };

      return stats;
    },
  });
}

/**
 * Create a lead manually as a designer (inbound prospect capture).
 *
 * The lead is attributed to the current designer with homeowner_id = null
 * (no Patina profile yet). Requires the designer-side INSERT RLS policy from
 * migration 00166. Contact details are optional and carry onto designer_clients
 * when the lead is later accepted (see useAcceptLead).
 */
export function useCreateLead() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: {
      /** Explicit active design-studio workspace for this captured lead. */
      studio_id: string;
      project_type: string; // required (NOT NULL on the table)
      project_description?: string;
      budget_range?: string;
      timeline?: string;
      location_city?: string;
      location_state?: string;
      contact_name?: string;
      contact_email?: string;
      // Optional ISO timestamp. Additive + backward-compatible: the old
      // legacy AddLeadDialog never passed it (stayed null there).
      // The Document's CaptureLeadSheet sets it +1 day (Track 6, R62) so the
      // new lead rises as a `new_lead` need on the Desk.
      response_deadline?: string;
      // Track 6 R65 — "Where from", a canonical chip label or free text.
      // Stored in its own column (00223) so People's pipeline stats stay clean.
      source?: string;
    }) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = getSupabase() as any;

      const { data: user } = await supabase.auth.getUser();
      if (!user.user) throw new Error('Not authenticated');

      const { data, error } = await supabase
        .from('leads')
        .insert({
          designer_id: user.user.id,
          studio_id: input.studio_id,
          homeowner_id: null,
          status: 'new',
          project_type: input.project_type,
          project_description: input.project_description || null,
          budget_range: input.budget_range || null,
          timeline: input.timeline || null,
          location_city: input.location_city || null,
          location_state: input.location_state || null,
          contact_name: input.contact_name || null,
          contact_email: input.contact_email || null,
          response_deadline: input.response_deadline || null,
          source: input.source || null,
          // match_score left null — the UI coalesces `match_score || 0`.
        })
        .select()
        .single();

      if (error) throw error;
      return data as Lead;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['leads'] });
      queryClient.invalidateQueries({ queryKey: ['lead-stats'] });
    },
  });
}

/**
 * Update lead status (view, contact, accept, decline)
 */
export function useUpdateLeadStatus() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      leadId,
      status,
      declineReason,
    }: {
      leadId: string;
      status: Lead['status'];
      declineReason?: string;
    }) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = getSupabase() as any;

      const updates: Record<string, unknown> = { status };

      // Set timestamp based on status
      switch (status) {
        case 'viewed':
          // Don't overwrite if already viewed
          break;
        case 'contacted':
          updates.contacted_at = new Date().toISOString();
          break;
        case 'accepted':
          updates.accepted_at = new Date().toISOString();
          break;
        case 'declined':
          updates.declined_at = new Date().toISOString();
          if (declineReason) {
            updates.decline_reason = declineReason;
          }
          break;
      }

      const { data, error } = await supabase
        .from('leads')
        .update(updates)
        .eq('id', leadId)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: (_, { leadId }) => {
      queryClient.invalidateQueries({ queryKey: ['leads'] });
      queryClient.invalidateQueries({ queryKey: ['lead', leadId] });
      queryClient.invalidateQueries({ queryKey: ['lead-stats'] });
    },
  });
}

/**
 * Mark lead as viewed (called when opening lead detail)
 */
export function useMarkLeadViewed() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (leadId: string) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = getSupabase() as any;

      // Only update if status is 'new'
      const { data, error } = await supabase
        .from('leads')
        .update({ status: 'viewed' })
        .eq('id', leadId)
        .eq('status', 'new')
        .select()
        .single();

      if (error && error.code !== 'PGRST116') throw error; // Ignore "no rows" error
      return data;
    },
    onSuccess: (_, leadId) => {
      queryClient.invalidateQueries({ queryKey: ['leads'] });
      queryClient.invalidateQueries({ queryKey: ['lead', leadId] });
      queryClient.invalidateQueries({ queryKey: ['lead-stats'] });
    },
  });
}

/**
 * Accept a lead (converts to client relationship)
 */
export function useAcceptLead() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (leadId: string) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = getSupabase() as any;

      // Get the lead first
      const { data: lead, error: leadError } = await supabase
        .from('leads')
        .select('*')
        .eq('id', leadId)
        .single();

      if (leadError) throw leadError;
      if (!lead.studio_id) {
        throw new Error('This legacy lead has no immutable studio workspace.');
      }

      // Update lead status
      const { error: updateError } = await supabase
        .from('leads')
        .update({
          status: 'accepted',
          accepted_at: new Date().toISOString(),
        })
        .eq('id', leadId);

      if (updateError) throw updateError;

      // Create designer_client relationship
      if (lead.homeowner_id) {
        // Only an immutable relationship already bound to this exact lead and
        // studio may be reused. Never choose a pair row by recency/priority.
        const { data: existing, error: existingError } = await supabase
          .from('designer_clients')
          .select('id')
          .eq('lead_id', leadId)
          .eq('studio_id', lead.studio_id)
          .maybeSingle();
        if (existingError) throw existingError;

        if (existing) {
          const { error: clientError } = await supabase
            .from('designer_clients')
            .update({
              source: 'lead',
              lead_id: leadId,
              status: 'active',
            })
            .eq('id', existing.id);

          if (clientError) throw clientError;
        } else {
          const { error: clientError } = await supabase
            .from('designer_clients')
            .insert({
              designer_id: lead.designer_id,
              studio_id: lead.studio_id,
              client_id: lead.homeowner_id,
              source: 'lead',
              lead_id: leadId,
              status: 'active',
            });

          if (clientError) throw clientError;
        }
      } else {
        // Manually-captured lead with no homeowner profile — upsert a
        // profile-less client row carrying the captured contact info.
        // designer_clients.client_id is nullable (00018), but two partial
        // unique indexes still apply to NULL-client rows:
        //   - idx_designer_clients_unique_profile ON (designer_id, client_id)
        //     WHERE client_id IS NOT NULL  (irrelevant here — client_id is null)
        //   - idx_designer_clients_unique_email ON (designer_id, client_email)
        //     WHERE client_email IS NOT NULL AND client_id IS NULL
        // A blind insert collides with the email index when re-accepting this
        // lead, or when another profile-less client already holds this email.
        // Partial unique indexes don't support onConflict, so check-then-write.

        // First, look for a client already linked to this exact lead (makes
        // re-accepting the same lead idempotent).
        const { data: existingByLead } = await supabase
          .from('designer_clients')
          .select('id')
          .eq('lead_id', leadId)
          .eq('studio_id', lead.studio_id)
          .maybeSingle();

        let existingId: string | null = existingByLead?.id ?? null;

        if (existingId) {
          // Update the existing profile-less row in place (keep client_id null).
          const { error: clientError } = await supabase
            .from('designer_clients')
            .update({
              client_name: lead.contact_name ?? null,
              client_email: lead.contact_email ?? null,
              source: 'lead',
              lead_id: leadId,
              status: 'active',
            })
            .eq('id', existingId);

          if (clientError) throw clientError;
        } else {
          const { error: clientError } = await supabase
            .from('designer_clients')
            .insert({
              designer_id: lead.designer_id,
              studio_id: lead.studio_id,
              client_id: null,
              client_name: lead.contact_name ?? null,
              client_email: lead.contact_email ?? null,
              source: 'lead',
              lead_id: leadId,
              status: 'active',
            });

          if (clientError) throw clientError;
        }
      }

      return lead;
    },
    onSuccess: (_, leadId) => {
      queryClient.invalidateQueries({ queryKey: ['leads'] });
      queryClient.invalidateQueries({ queryKey: ['lead', leadId] });
      queryClient.invalidateQueries({ queryKey: ['lead-stats'] });
      queryClient.invalidateQueries({ queryKey: ['designer-clients'] });
    },
  });
}

/**
 * Begin Discovery — the Document's "Accept" triage act (Track 6, ruling R61).
 *
 * Distinct from {@link useAcceptLead}: the retired pre-Document lead flow jumped a
 * relationship straight to `status='active'` (it expects you to then build a
 * proposal/project). The Document model instead wants an accepted lead to
 * surface as a **Discovery** document on the Desk — `document_state` Shape D,
 * which requires `designer_clients.status='lead'` AND no live proposal/project.
 * Verified by SQL smoke: an `active`, project-less relationship is invisible in
 * `document_state`; the same row at `status='lead'` appears as Discovery.
 *
 * One-act-many-surfaces: this flips the lead's Desk folder from Brief (Shape C)
 * to Discovery (Shape D) in one act. Callers should ALSO invalidate the Desk /
 * document-state query keys in their own onSuccess so the folder re-derives
 * without a reload (the desk key lives in the app, not this package).
 *
 * `useAcceptLead` is intentionally left untouched (phase-in constraint D7 — the
 * old zone must keep functioning).
 */
export function useBeginDiscovery() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (leadId: string) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = getSupabase() as any;
      const { data, error } = await supabase.rpc('begin_discovery', {
        p_lead_id: leadId,
      });

      if (error) throw error;
      if (!data?.lead || !data?.designerClientId) {
        throw new Error('Discovery transition did not return its canonical identity');
      }

      return data as { lead: Lead; designerClientId: string };
    },
    onSuccess: (_, leadId) => {
      queryClient.invalidateQueries({ queryKey: ['leads'] });
      queryClient.invalidateQueries({ queryKey: ['lead', leadId] });
      queryClient.invalidateQueries({ queryKey: ['lead-stats'] });
      queryClient.invalidateQueries({ queryKey: ['designer-clients'] });
    },
  });
}

/**
 * Nurture a lead with a reconnect date (Track 6, ruling R65).
 *
 * Distinct from a bare status flip: a nurtured lead earns a *dated* return. It
 * leaves the Desk's needs-hand band immediately (status='contacted' + the R61
 * desk-derivation gate) and rises again as a Desk need on/after `reconnectAt`
 * (desk-derivation 'reconnect_due'). The reconnect date reuses
 * `leads.response_deadline` — its meaning follows status (respond-by while
 * new/viewed; reconnect-on while contacted), so no column is added (D7).
 * An undated nurture is only a hope (R65); the UI always supplies a date.
 */
export function useNurtureLead() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ leadId, reconnectAt }: { leadId: string; reconnectAt: string }) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = getSupabase() as any;

      const { data, error } = await supabase
        .from('leads')
        .update({
          status: 'contacted',
          contacted_at: new Date().toISOString(),
          response_deadline: reconnectAt,
        })
        .eq('id', leadId)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: (_, { leadId }) => {
      queryClient.invalidateQueries({ queryKey: ['leads'] });
      queryClient.invalidateQueries({ queryKey: ['lead', leadId] });
      queryClient.invalidateQueries({ queryKey: ['lead-stats'] });
    },
  });
}

/**
 * Decline a lead
 */
export function useDeclineLead() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      leadId,
      reason: _reason,
    }: {
      leadId: string;
      reason?: string;
    }) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = getSupabase() as any;

      const { data, error } = await supabase
        .from('leads')
        .update({
          status: 'declined',
          declined_at: new Date().toISOString(),
        })
        .eq('id', leadId)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: (_, { leadId }) => {
      queryClient.invalidateQueries({ queryKey: ['leads'] });
      queryClient.invalidateQueries({ queryKey: ['lead', leadId] });
      queryClient.invalidateQueries({ queryKey: ['lead-stats'] });
    },
  });
}
