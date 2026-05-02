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
