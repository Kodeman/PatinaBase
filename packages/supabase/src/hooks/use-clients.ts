import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { createBrowserClient } from '../client';

// Lazy client getter to avoid module-level initialization during SSR
const getSupabase = () => createBrowserClient();

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

export type ClientLifecycleStage = 'lead' | 'proposal' | 'active' | 'completed' | 'nurture';

export interface DesignerClient {
  id: string;
  designer_id: string;
  client_id: string | null;
  source: 'lead' | 'direct' | 'referral';
  lead_id: string | null;
  status: ClientLifecycleStage;
  notes: string | null;
  total_revenue: number;
  total_projects: number;
  created_at: string;
  updated_at: string;
  // Direct contact info (for clients without profiles)
  client_email: string | null;
  client_name: string | null;
  // Extended fields (v2)
  referral_source: string | null;
  location: string | null;
  preferred_contact: string | null;
  style_tags: string[];
  style_preferences: Record<string, unknown>;
  inspiration_quote: string | null;
  last_contacted_at: string | null;
  satisfaction_score: number | null;
  // Joined data (for clients with profiles)
  client?: {
    id: string;
    email: string;
    full_name: string | null;
    avatar_url: string | null;
    phone: string | null;
  } | null;
  /**
   * The owning designer's profile (Wave 5 — shared-workspace attribution).
   * Populated by `useClients()`'s join only; `undefined` from callers that
   * don't select it (e.g. `useClient()`). `null` means the joined profile
   * row didn't resolve (legacy data) — render no byline in that case.
   */
  designer?: {
    id: string;
    full_name: string | null;
    display_name: string | null;
    avatar_url: string | null;
  } | null;
}

export interface ClientMessage {
  id: string;
  designer_client_id: string;
  sender_id: string;
  recipient_id: string;
  body: string;
  subject: string | null;
  read_at: string | null;
  created_at: string;
  // Joined data
  sender?: {
    id: string;
    full_name: string | null;
    avatar_url: string | null;
  };
}

export interface ClientFilters {
  status?: string | string[];
  source?: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// HOOKS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Fetch all clients for the current designer
 */
export function useClients(filters?: ClientFilters) {
  return useQuery({
    queryKey: ['designer-clients', filters],
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = getSupabase() as any;

      // Wave 5 (studio shared workspace): join the owning designer's profile
      // alongside the existing client join — additive, one query, no N+1 per
      // row. `profiles!designer_clients_designer_id_fkey` is the explicit
      // constraint name since `designer_clients` FKs `profiles` twice
      // (client_id and designer_id) — the column-only hint would be
      // ambiguous were it not scoped per-column, so we spell out the
      // constraint to match the client_id leg's own explicitness.
      let query = supabase
        .from('designer_clients')
        .select(`
          *,
          client_email,
          client_name,
          client:profiles!client_id(
            id,
            email,
            full_name,
            avatar_url,
            phone
          ),
          designer:profiles!designer_clients_designer_id_fkey(
            id,
            full_name,
            display_name,
            avatar_url
          )
        `)
        .order('updated_at', { ascending: false });

      // Apply filters
      if (filters?.status) {
        if (Array.isArray(filters.status)) {
          query = query.in('status', filters.status);
        } else {
          query = query.eq('status', filters.status);
        }
      }

      if (filters?.source) {
        query = query.eq('source', filters.source);
      }

      const { data, error } = await query;

      if (error) throw error;
      return (data ?? []) as DesignerClient[];
    },
  });
}

/**
 * Fetch a single client relationship by ID
 */
export function useClient(clientId: string) {
  return useQuery({
    queryKey: ['designer-client', clientId],
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = getSupabase() as any;

      const { data, error } = await supabase
        .from('designer_clients')
        .select(`
          *,
          client_name,
          client_email,
          client:profiles!client_id(
            id,
            email,
            full_name,
            avatar_url,
            phone
          )
        `)
        .eq('id', clientId)
        .maybeSingle();

      if (error) throw error;
      return data as DesignerClient | null;
    },
    enabled: !!clientId,
  });
}

/**
 * Resolve the current designer's `designer_clients` row for a given client
 * AUTH user id (profiles.id / auth.users.id). RLS scopes designer_clients to
 * the signed-in designer, so this returns at most one row — the relationship
 * between this designer and that client. Use when you hold a project's
 * `client_id` (an auth user id) but need the `designer_clients.id` it maps to —
 * e.g. opening the decision composer, which keys off designer_client_id and
 * fails RLS if handed a raw auth uid.
 */
export function useDesignerClientForClientUser(
  clientUserId: string | null | undefined,
) {
  return useQuery({
    queryKey: ['designer-client-for-user', clientUserId],
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = getSupabase() as any;

      const { data, error } = await supabase
        .from('designer_clients')
        .select('id, designer_id, client_id, lead_id')
        .eq('client_id', clientUserId)
        .maybeSingle();

      if (error) throw error;
      return data as {
        id: string;
        designer_id: string;
        client_id: string;
        lead_id: string | null;
      } | null;
    },
    enabled: !!clientUserId,
  });
}

/**
 * Get client statistics
 */
export function useClientStats() {
  return useQuery({
    queryKey: ['client-stats'],
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = getSupabase() as any;

      const { data, error } = await supabase
        .from('designer_clients')
        .select('status, source, total_revenue, total_projects, satisfaction_score');

      if (error) throw error;

      const clients = data ?? [];
      const scores = clients
        .map((c: DesignerClient) => c.satisfaction_score)
        .filter((s: number | null): s is number => s != null);
      const referralClients = clients.filter((c: DesignerClient) => c.source === 'referral');

      return {
        total: clients.length,
        // Per-stage counts
        lead: clients.filter((c: DesignerClient) => c.status === 'lead').length,
        proposal: clients.filter((c: DesignerClient) => c.status === 'proposal').length,
        active: clients.filter((c: DesignerClient) => c.status === 'active').length,
        completed: clients.filter((c: DesignerClient) => c.status === 'completed').length,
        nurture: clients.filter((c: DesignerClient) => c.status === 'nurture').length,
        // Aggregate metrics
        fromLeads: clients.filter((c: DesignerClient) => c.source === 'lead').length,
        totalRevenue: clients.reduce((sum: number, c: DesignerClient) => sum + (c.total_revenue || 0), 0),
        totalProjects: clients.reduce((sum: number, c: DesignerClient) => sum + (c.total_projects || 0), 0),
        avgSatisfaction: scores.length > 0
          ? scores.reduce((a: number, b: number) => a + b, 0) / scores.length
          : 0,
        reviewCount: scores.length,
        referralRate: clients.length > 0
          ? Math.round((referralClients.length / clients.length) * 100)
          : 0,
        activeProjectValue: clients
          .filter((c: DesignerClient) => c.status === 'active')
          .reduce((sum: number, c: DesignerClient) => sum + (c.total_revenue || 0), 0),
      };
    },
  });
}

/**
 * Update client status
 */
export function useUpdateClientStatus() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      clientId,
      status,
    }: {
      clientId: string;
      status: DesignerClient['status'];
    }) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = getSupabase() as any;

      const { data, error } = await supabase
        .from('designer_clients')
        .update({ status })
        .eq('id', clientId)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: (_, { clientId }) => {
      queryClient.invalidateQueries({ queryKey: ['designer-clients'] });
      queryClient.invalidateQueries({ queryKey: ['designer-client', clientId] });
      queryClient.invalidateQueries({ queryKey: ['client-stats'] });
    },
  });
}

/**
 * Update client notes
 */
export function useUpdateClientNotes() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      clientId,
      notes,
    }: {
      clientId: string;
      notes: string;
    }) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = getSupabase() as any;

      const { data, error } = await supabase
        .from('designer_clients')
        .update({ notes })
        .eq('id', clientId)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: (_, { clientId }) => {
      queryClient.invalidateQueries({ queryKey: ['designer-clients'] });
      queryClient.invalidateQueries({ queryKey: ['designer-client', clientId] });
    },
  });
}

/**
 * Update a client's editable contact fields on the designer's relationship row
 * (designer_clients): the working name + email (the contact for captured
 * clients without a Patina account) and notes. The client's OWN Patina profile
 * (full_name/email/phone) is theirs — not edited here. Invalidates the client
 * lists AND the document/desk read models so a renamed household shows through
 * immediately (§5).
 */
export function useUpdateClientContact() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      clientId,
      updates,
    }: {
      clientId: string; // designer_clients.id
      updates: {
        client_name?: string | null;
        client_email?: string | null;
        notes?: string | null;
      };
    }) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = getSupabase() as any;

      const { data, error } = await supabase
        .from('designer_clients')
        .update(updates)
        .eq('id', clientId)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: (_, { clientId }) => {
      queryClient.invalidateQueries({ queryKey: ['designer-clients'] });
      queryClient.invalidateQueries({ queryKey: ['designer-client', clientId] });
      queryClient.invalidateQueries({ queryKey: ['document-state'] });
      queryClient.invalidateQueries({ queryKey: ['desk-engagements'] });
    },
  });
}

/**
 * Get messages for a client relationship
 */
export function useClientMessages(designerClientId: string) {
  return useQuery({
    queryKey: ['client-messages', designerClientId],
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = getSupabase() as any;

      const { data, error } = await supabase
        .from('client_messages')
        .select(`
          *,
          sender:profiles!sender_id(
            id,
            full_name,
            avatar_url
          )
        `)
        .eq('designer_client_id', designerClientId)
        .order('created_at', { ascending: true });

      if (error) throw error;
      return (data ?? []) as ClientMessage[];
    },
    enabled: !!designerClientId,
  });
}

/**
 * Send a message to a client
 */
export function useSendClientMessage() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      designerClientId,
      message,
    }: {
      designerClientId: string;
      message: string;
    }) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = getSupabase() as any;

      const { data: user } = await supabase.auth.getUser();
      if (!user.user) throw new Error('Not authenticated');

      // recipient_id: look up the other party in the designer_clients row
      const { data: dcRow, error: dcErr } = await supabase
        .from('designer_clients')
        .select('client_id, designer_id')
        .eq('id', designerClientId)
        .single();
      if (dcErr) throw dcErr;
      // The designer is the current user — recipient is the client (or vice-versa)
      const recipientId =
        dcRow.designer_id === user.user.id ? dcRow.client_id : dcRow.designer_id;

      const { data, error } = await supabase
        .from('client_messages')
        .insert({
          designer_client_id: designerClientId,
          sender_id: user.user.id,
          recipient_id: recipientId,
          body: message,
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: (_, { designerClientId }) => {
      queryClient.invalidateQueries({ queryKey: ['client-messages', designerClientId] });
    },
  });
}

/**
 * Get projects for a specific client
 */
export function useClientProjects(clientId: string) {
  return useQuery({
    queryKey: ['client-projects', clientId],
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = getSupabase() as any;

      // Get the designer_client record to find client_id (profile id)
      const { data: designerClient, error: dcError } = await supabase
        .from('designer_clients')
        .select('client_id, designer_id')
        .eq('id', clientId)
        .maybeSingle();

      if (dcError) throw dcError;
      if (!designerClient) return [];

      // Get projects for this designer that involve this client.
      // Note: project_products has no `quantity` column — the join below
      // reads only the columns that exist on the table today.
      const { data, error } = await supabase
        .from('projects')
        .select(`
          *,
          products:project_products(
            id,
            product:products(id, name, images)
          )
        `)
        .eq('designer_id', designerClient.designer_id)
        .eq('client_id', designerClient.client_id)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data ?? [];
    },
    enabled: !!clientId,
  });
}

/**
 * Add a new client directly (not from lead).
 *
 * Delegates to the /api/clients/invite server-side route which handles:
 * - Auth-guarding via service-role key
 * - Optional Supabase Auth invite (magic-link email)
 * - Linking to existing profiles
 * - Writing an audit row to client_activity_log
 */
export function useAddClient() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      clientEmail,
      clientName,
      source = 'direct',
      notes,
      invite = true,
    }: {
      clientEmail: string;
      clientName?: string;
      source?: 'direct' | 'referral';
      notes?: string;
      /** When true (default), send a Supabase Auth magic-link invite if no profile exists. */
      invite?: boolean;
    }) => {
      const response = await fetch('/api/clients/invite', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientEmail, clientName, source, notes, invite }),
      });

      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body?.error ?? `Request failed with status ${response.status}`);
      }

      return response.json() as Promise<{
        designerClientId: string;
        profileId: string | null;
        invited: boolean;
        alreadyExists: boolean;
      }>;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['designer-clients'] });
      queryClient.invalidateQueries({ queryKey: ['client-stats'] });
      queryClient.invalidateQueries({ queryKey: ['client-activity'] });
    },
  });
}

/**
 * Invite-and-link an EXISTING designer_clients row (R73 — invite-on-send).
 *
 * useAddClient always INSERTS a new designer_clients row; a captured household
 * (client_id NULL, client_email set — the R46/R62 no-login normal case) needs
 * the inverse: create-and-invite the Patina account for the email already on
 * file, then set client_id on the SAME row. Delegates to the same
 * /api/clients/invite route with `designerClientId`, which:
 *  - links an existing profile by email if one exists (no email sent), or
 *  - inviteUserByEmail (Supabase Auth magic-link) + creates profile/user_roles,
 *  - then UPDATEs designer_clients.client_id (client_email/client_name kept
 *    for provenance) and writes a client_activity_log row.
 *
 * Carries `meta.errorSurface = 'inline'` (R83): callers render failures as a
 * quiet inline band at the act site (the picker row) — the designer portal's
 * global mutation onError raises no toast for this mutation.
 */
export function useInviteAndLinkClient() {
  const queryClient = useQueryClient();

  return useMutation({
    meta: { errorSurface: 'inline' },
    mutationFn: async ({
      designerClientId,
      clientEmail,
      clientName,
    }: {
      /** The existing designer_clients.id to link. */
      designerClientId: string;
      /** Email to invite — defaults server-side to the row's client_email. */
      clientEmail?: string;
      clientName?: string;
    }) => {
      const response = await fetch('/api/clients/invite', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ designerClientId, clientEmail, clientName, invite: true }),
      });

      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body?.error ?? `Request failed with status ${response.status}`);
      }

      return response.json() as Promise<{
        designerClientId: string;
        profileId: string | null;
        invited: boolean;
        alreadyExists: boolean;
      }>;
    },
    onSuccess: (_data, { designerClientId }) => {
      queryClient.invalidateQueries({ queryKey: ['designer-clients'] });
      queryClient.invalidateQueries({ queryKey: ['designer-client', designerClientId] });
      queryClient.invalidateQueries({ queryKey: ['designer-client-for-user'] });
      queryClient.invalidateQueries({ queryKey: ['client-stats'] });
      queryClient.invalidateQueries({ queryKey: ['client-activity'] });
    },
  });
}
