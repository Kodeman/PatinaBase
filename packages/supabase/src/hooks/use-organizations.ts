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
  type: OrganizationType;
  name: string;
  slug?: string;
  website?: string;
  description?: string;
  email?: string;
  phone?: string;
}

export interface InviteMemberInput {
  organizationId: string;
  email: string;
  role: MemberRole;
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
          profiles (id, email, display_name, avatar_url)
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
 * Create a new organization (user becomes owner)
 */
export function useCreateOrganization() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: CreateOrganizationInput) => {
      const supabase = getSupabase();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      // Generate slug if not provided
      const slug = input.slug || input.name.toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-|-$)/g, '');

      // Create organization
      const { data: org, error: orgError } = await supabase
        .from('organizations')
        .insert({
          type: input.type,
          name: input.name,
          slug,
          website: input.website,
          description: input.description,
          email: input.email,
          phone: input.phone,
        })
        .select()
        .single();

      if (orgError) throw orgError;

      // Add creator as owner
      const { error: memberError } = await supabase
        .from('organization_members')
        .insert({
          user_id: user.id,
          organization_id: org.id,
          role: 'owner',
          status: 'active',
          joined_at: new Date().toISOString(),
        });

      if (memberError) throw memberError;

      return org as Organization;
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
 * Invite a member to an organization
 */
export function useInviteMember() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ organizationId, email, role }: InviteMemberInput) => {
      const supabase = getSupabase();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      // Find user by email
      const { data: targetUser, error: userError } = await supabase
        .from('profiles')
        .select('id')
        .eq('email', email)
        .single();

      if (userError || !targetUser) {
        throw new Error('User not found with that email');
      }

      // Check if already a member
      const { data: existing } = await supabase
        .from('organization_members')
        .select('id, status')
        .eq('user_id', targetUser.id)
        .eq('organization_id', organizationId)
        .single();

      if (existing && existing.status === 'active') {
        throw new Error('User is already a member');
      }

      // Generate invitation token
      const invitationToken = crypto.randomUUID();
      const invitationExpiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

      if (existing) {
        // Update existing record
        const { data, error } = await supabase
          .from('organization_members')
          .update({
            role,
            status: 'invited',
            invited_by: user.id,
            invitation_token: invitationToken,
            invitation_expires_at: invitationExpiresAt.toISOString(),
          })
          .eq('id', existing.id)
          .select()
          .single();

        if (error) throw error;
        return data;
      } else {
        // Create new record
        const { data, error } = await supabase
          .from('organization_members')
          .insert({
            user_id: targetUser.id,
            organization_id: organizationId,
            role,
            status: 'invited',
            invited_by: user.id,
            invitation_token: invitationToken,
            invitation_expires_at: invitationExpiresAt.toISOString(),
          })
          .select()
          .single();

        if (error) throw error;
        return data;
      }
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: ['organization-members', variables.organizationId],
      });
    },
  });
}

/**
 * Accept an invitation to join an organization
 */
export function useAcceptInvitation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (membershipId: string) => {
      const supabase = getSupabase();
      const { data, error } = await supabase
        .from('organization_members')
        .update({
          status: 'active',
          joined_at: new Date().toISOString(),
          invitation_token: null,
          invitation_expires_at: null,
        })
        .eq('id', membershipId)
        .eq('status', 'invited')
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['organizations'] });
      queryClient.invalidateQueries({ queryKey: ['pending-invitations'] });
    },
  });
}

/**
 * Decline an invitation
 */
export function useDeclineInvitation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (membershipId: string) => {
      const supabase = getSupabase();
      const { error } = await supabase
        .from('organization_members')
        .delete()
        .eq('id', membershipId)
        .eq('status', 'invited');

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
