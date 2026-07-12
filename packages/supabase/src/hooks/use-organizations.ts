import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { createBrowserClient } from '../client';

// ═══════════════════════════════════════════════════════════════════════════
// ORGANIZATION HOOKS
// ═══════════════════════════════════════════════════════════════════════════

// Lazy client getter
const getSupabase = () => createBrowserClient();

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

export type OrganizationType = 'design_studio' | 'manufacturer' | 'contractor' | 'admin_team';
export type OrganizationStatus = 'active' | 'suspended' | 'pending_approval' | 'deactivated';
export type SubscriptionTier = 'free' | 'professional' | 'enterprise';
export type MemberRole = 'owner' | 'admin' | 'member' | 'guest';
export type MemberStatus = 'active' | 'invited' | 'suspended' | 'removed';

export interface Organization {
  id: string;
  type: OrganizationType;
  name: string;
  slug: string;
  logo_url: string | null;
  website: string | null;
  description: string | null;
  email: string | null;
  phone: string | null;
  address: Record<string, unknown> | null;
  settings: Record<string, unknown>;
  subscription_tier: SubscriptionTier;
  subscription_expires_at: string | null;
  business_verified: boolean;
  business_verified_at: string | null;
  tax_id: string | null;
  status: OrganizationStatus;
  created_at: string;
  updated_at: string;
}

export interface OrganizationMember {
  id: string;
  user_id: string;
  organization_id: string;
  role: MemberRole;
  permissions_override: { grant?: string[]; revoke?: string[] } | null;
  invited_by: string | null;
  invitation_token: string | null;
  invitation_expires_at: string | null;
  status: MemberStatus;
  joined_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface OrganizationWithMembership extends Organization {
  membership: {
    id: string;
    role: MemberRole;
    status: MemberStatus;
    joined_at: string | null;
  };
}

export interface OrganizationMemberWithProfile extends OrganizationMember {
  profiles: {
    id: string;
    email: string | null;
    display_name: string | null;
    avatar_url: string | null;
  };
}

export interface CreateOrganizationInput {
  name: string;
}

export interface InviteMemberInput {
  organizationId: string;
  email: string;
  role: MemberRole;
  teammateType?: 'designer' | 'trades' | 'member';
  name?: string;
}

/** Row shape returned by `accept_workspace_invitation` (00295). */
export interface AcceptedInvitation {
  organization_id: string;
  organization_name: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// QUERY HOOKS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Get all organizations the current user is a member of
 */
export function useOrganizations() {
  return useQuery({
    queryKey: ['organizations'],
    queryFn: async () => {
      const supabase = getSupabase();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const { data, error } = await supabase
        .from('organization_members')
        .select(`
          id,
          role,
          status,
          joined_at,
          organizations (*)
        `)
        .eq('user_id', user.id)
        .eq('status', 'active');

      if (error) throw error;

      return data.map(m => ({
        ...m.organizations,
        membership: {
          id: m.id,
          role: m.role,
          status: m.status,
          joined_at: m.joined_at,
        },
      })) as OrganizationWithMembership[];
    },
  });
}

/**
 * Get a single organization by ID
 */
export function useOrganization(id: string) {
  return useQuery({
    queryKey: ['organization', id],
    queryFn: async () => {
      const supabase = getSupabase();
      const { data, error } = await supabase
        .from('organizations')
        .select('*')
        .eq('id', id)
        .single();

      if (error) throw error;
      return data as Organization;
    },
    enabled: !!id,
  });
}

/**
 * Get members of an organization
 */
export function useOrganizationMembers(organizationId: string) {
  return useQuery({
    queryKey: ['organization-members', organizationId],
    queryFn: async () => {
      const supabase = getSupabase();
      const { data, error } = await supabase
        .from('organization_members')
        .select(`
          *,
          profiles!organization_members_user_id_fkey (id, email, display_name, avatar_url)
        `)
        .eq('organization_id', organizationId)
        .in('status', ['active', 'invited']);

      if (error) throw error;
      return data as unknown as OrganizationMemberWithProfile[];
    },
    enabled: !!organizationId,
  });
}

/**
 * Get pending invitations for the current user
 */
export function usePendingInvitations() {
  return useQuery({
    queryKey: ['pending-invitations'],
    queryFn: async () => {
      const supabase = getSupabase();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const { data, error } = await supabase
        .from('organization_members')
        .select(`
          *,
          organizations (id, name, type, logo_url)
        `)
        .eq('user_id', user.id)
        .eq('status', 'invited')
        .gt('invitation_expires_at', new Date().toISOString());

      if (error) throw error;
      return data;
    },
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// MUTATION HOOKS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Create a new studio workspace (user becomes owner) via the
 * `create_studio_workspace` RPC (00295, SECURITY DEFINER — the RLS
 * chicken-and-egg means a client-side insert can never SELECT its own
 * `.select()` return before the owner membership exists). The RPC handles
 * `auth.uid()`, name validation, and unique-slug generation server-side.
 */
export function useCreateOrganization() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: CreateOrganizationInput) => {
      const supabase = getSupabase();
      const { data, error } = await supabase.rpc('create_studio_workspace', {
        p_name: input.name,
      });

      if (error) throw error;
      return data as Organization;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['organizations'] });
    },
  });
}

/**
 * Update an organization
 */
export function useUpdateOrganization() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      id,
      ...updates
    }: Partial<Organization> & { id: string }) => {
      const supabase = getSupabase();
      // Cast updates to match Supabase's expected JSON types
      const dbUpdates = updates as Record<string, unknown>;
      const { data, error } = await supabase
        .from('organizations')
        .update(dbUpdates)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return data as Organization;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['organizations'] });
      queryClient.invalidateQueries({ queryKey: ['organization', data.id] });
    },
  });
}

/**
 * Invite a teammate (designer or collaborator) to an organization via the
 * `workspace-member-invite` edge function (00296). The function authorizes
 * the caller (owner/admin, active membership), mints or resolves the invitee's
 * auth user, upserts the `invited` membership, optionally grants
 * `studio_designer`, and sends the branded invite email — all server-side
 * because minting auth users needs the service role.
 */
export function useInviteMember() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: InviteMemberInput) => {
      const supabase = getSupabase();
      const { data, error } = await supabase.functions.invoke('workspace-member-invite', {
        body: {
          organization_id: input.organizationId,
          email: input.email,
          member_role: input.role,
          teammate_type: input.teammateType,
          name: input.name,
        },
      });

      if (error) {
        // functions.invoke wraps a non-2xx in a FunctionsHttpError whose .context
        // is the raw Response — surface the edge fn's { error } (e.g. already_member)
        // instead of a generic message.
        let detail: string | undefined;
        try {
          const body = await (error as { context?: Response }).context?.json();
          detail = body?.detail ?? body?.error;
        } catch {
          /* fall through to the generic message */
        }
        throw new Error(detail ?? error.message ?? 'Failed to invite member');
      }
      if (data?.error) throw new Error(data.detail ?? data.error);
      return data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: ['organization-members', variables.organizationId],
      });
    },
  });
}

/**
 * Accept an invitation to join an organization, by invitation token (not
 * membership id — there is no self-UPDATE RLS policy for an invited user, so
 * this goes through the `accept_workspace_invitation` RPC, 00295, SECURITY
 * DEFINER). Validates the token exists, is unexpired, and belongs to
 * `auth.uid()`; flips the membership active and returns the joined org.
 */
export function useAcceptInvitation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (token: string): Promise<AcceptedInvitation> => {
      const supabase = getSupabase();
      const { data, error } = await supabase.rpc('accept_workspace_invitation', {
        p_token: token,
      });

      if (error) throw error;
      const row = data?.[0];
      if (!row) throw new Error('Invitation not found or already used');
      return row;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['organizations'] });
      queryClient.invalidateQueries({ queryKey: ['pending-invitations'] });
    },
  });
}

/**
 * Decline an invitation, by invitation token (see useAcceptInvitation — same
 * no-self-UPDATE-policy reasoning) via the `decline_workspace_invitation` RPC
 * (00295, SECURITY DEFINER). Validates the token then deletes the invited row.
 */
export function useDeclineInvitation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (token: string) => {
      const supabase = getSupabase();
      const { error } = await supabase.rpc('decline_workspace_invitation', {
        p_token: token,
      });

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pending-invitations'] });
    },
  });
}

/**
 * Update a member's role
 */
export function useUpdateMemberRole() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      memberId,
      role,
    }: {
      memberId: string;
      role: MemberRole;
    }) => {
      const supabase = getSupabase();
      const { data, error } = await supabase
        .from('organization_members')
        .update({ role })
        .eq('id', memberId)
        .select('*, organization_id')
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({
        queryKey: ['organization-members', data.organization_id],
      });
    },
  });
}

/**
 * Remove a member from an organization
 */
export function useRemoveMember() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (memberId: string) => {
      const supabase = getSupabase();

      // Get organization_id before deleting
      const { data: member } = await supabase
        .from('organization_members')
        .select('organization_id')
        .eq('id', memberId)
        .single();

      const { error } = await supabase
        .from('organization_members')
        .delete()
        .eq('id', memberId);

      if (error) throw error;
      return { organizationId: member?.organization_id };
    },
    onSuccess: (data) => {
      if (data.organizationId) {
        queryClient.invalidateQueries({
          queryKey: ['organization-members', data.organizationId],
        });
      }
      queryClient.invalidateQueries({ queryKey: ['organizations'] });
    },
  });
}

/**
 * Leave an organization
 */
export function useLeaveOrganization() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (organizationId: string) => {
      const supabase = getSupabase();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const { error } = await supabase
        .from('organization_members')
        .delete()
        .eq('organization_id', organizationId)
        .eq('user_id', user.id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['organizations'] });
    },
  });
}
