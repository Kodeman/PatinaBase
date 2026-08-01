/**
 * Project team membership hooks (project_team_members table, migration 00084).
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createBrowserClient } from '../client';

const getSupabase = () => createBrowserClient();

export type ProjectRole = 'lead_designer' | 'support_designer' | 'vendor' | 'client' | 'bookkeeper' | 'previous_lead';

export interface ProjectTeamMember {
  id: string;
  project_id: string;
  user_id: string;
  role: ProjectRole;
  permissions: Record<string, unknown>;
  assigned_at: string;
  assigned_by: string | null;
  removed_at: string | null;
  user?: {
    id: string;
    full_name: string;
    email: string;
  };
}

export function useProjectTeamMembers(projectId: string) {
  return useQuery({
    queryKey: ['project-team', projectId],
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = getSupabase() as any;
      const { data, error } = await supabase
        .from('project_team_members')
        .select(`
          *,
          user:profiles!user_id(id, full_name, email)
        `)
        .eq('project_id', projectId)
        .is('removed_at', null)
        .order('assigned_at', { ascending: true });
      if (error) throw error;
      return (data ?? []) as ProjectTeamMember[];
    },
    enabled: !!projectId,
  });
}

export function useAddProjectTeamMember() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      projectId,
      userId,
      role,
      permissions = {},
    }: {
      projectId: string;
      userId: string;
      role: ProjectRole;
      permissions?: Record<string, unknown>;
    }) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = getSupabase() as any;
      const { data: user } = await supabase.auth.getUser();
      const { data, error } = await supabase
        .from('project_team_members')
        .insert({
          project_id: projectId,
          user_id: userId,
          role,
          permissions,
          assigned_by: user.user?.id ?? null,
        })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ['project-team', vars.projectId] });
    },
  });
}

export function useRemoveProjectTeamMember() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ memberId, projectId }: { memberId: string; projectId: string }) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = getSupabase() as any;
      const { error } = await supabase
        .from('project_team_members')
        .update({ removed_at: new Date().toISOString() })
        .eq('id', memberId);
      if (error) throw error;
      return { memberId, projectId };
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ['project-team', vars.projectId] });
    },
  });
}

/**
 * Permission flags derived from the current user's project role.
 * `lead_designer` can do everything; support designer/bookkeeper/vendor are scoped.
 */
export interface ProjectPermissions {
  canEditScope: boolean;
  canEditFinancials: boolean;
  canSignChangeOrders: boolean;
  canIssuePOs: boolean;
  canAssignTeam: boolean;
  canViewEarnings: boolean;
  isLeadDesigner: boolean;
  isSupportDesigner: boolean;
  isBookkeeper: boolean;
  isVendor: boolean;
  isClient: boolean;
}

const NONE_PERMS: ProjectPermissions = {
  canEditScope: false,
  canEditFinancials: false,
  canSignChangeOrders: false,
  canIssuePOs: false,
  canAssignTeam: false,
  canViewEarnings: false,
  isLeadDesigner: false,
  isSupportDesigner: false,
  isBookkeeper: false,
  isVendor: false,
  isClient: false,
};

function permsForRole(role: ProjectRole): ProjectPermissions {
  switch (role) {
    case 'lead_designer':
      return {
        canEditScope: true,
        canEditFinancials: true,
        canSignChangeOrders: true,
        canIssuePOs: true,
        canAssignTeam: true,
        canViewEarnings: true,
        isLeadDesigner: true,
        isSupportDesigner: false,
        isBookkeeper: false,
        isVendor: false,
        isClient: false,
      };
    case 'support_designer':
      return {
        ...NONE_PERMS,
        canEditScope: true,
        canIssuePOs: true,
        isSupportDesigner: true,
      };
    case 'bookkeeper':
      return {
        ...NONE_PERMS,
        canViewEarnings: false, // bookkeeper sees aggregate financials, not designer earnings
        isBookkeeper: true,
      };
    case 'vendor':
      return { ...NONE_PERMS, isVendor: true };
    case 'client':
      return { ...NONE_PERMS, isClient: true };
    case 'previous_lead':
      return { ...NONE_PERMS };
  }
}

export function useProjectPermissions(projectId: string): ProjectPermissions & { isLoading: boolean } {
  const { data: members, isLoading } = useQuery({
    queryKey: ['project-permissions', projectId],
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = getSupabase() as any;
      const { data: user } = await supabase.auth.getUser();
      if (!user.user) return [];

      // Lead designer is also stored on projects.designer_id (00066).
      // Check both that and project_team_members for richer roles.
      const [projectRes, membersRes] = await Promise.all([
        supabase.from('projects').select('designer_id').eq('id', projectId).single(),
        supabase
          .from('project_team_members')
          .select('role')
          .eq('project_id', projectId)
          .eq('user_id', user.user.id)
          .is('removed_at', null),
      ]);

      const roles: ProjectRole[] = [];
      if (projectRes.data?.designer_id === user.user.id) roles.push('lead_designer');
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      for (const m of (membersRes.data ?? []) as any[]) {
        if (!roles.includes(m.role)) roles.push(m.role);
      }
      return roles;
    },
    enabled: !!projectId,
  });

  const roles = members ?? [];
  if (roles.length === 0) return { ...NONE_PERMS, isLoading };

  // Merge permissions across all roles (most-permissive wins)
  const merged = roles.reduce<ProjectPermissions>((acc, role) => {
    const p = permsForRole(role);
    return {
      canEditScope: acc.canEditScope || p.canEditScope,
      canEditFinancials: acc.canEditFinancials || p.canEditFinancials,
      canSignChangeOrders: acc.canSignChangeOrders || p.canSignChangeOrders,
      canIssuePOs: acc.canIssuePOs || p.canIssuePOs,
      canAssignTeam: acc.canAssignTeam || p.canAssignTeam,
      canViewEarnings: acc.canViewEarnings || p.canViewEarnings,
      isLeadDesigner: acc.isLeadDesigner || p.isLeadDesigner,
      isSupportDesigner: acc.isSupportDesigner || p.isSupportDesigner,
      isBookkeeper: acc.isBookkeeper || p.isBookkeeper,
      isVendor: acc.isVendor || p.isVendor,
      isClient: acc.isClient || p.isClient,
    };
  }, NONE_PERMS);

  return { ...merged, isLoading };
}

/**
 * Reassign the lead designer on a project.
 *
 * The checked RPC owns the row lock, compare-and-swap, studio membership
 * validation, team-role transition, relationship transfer, and audit write as
 * one transaction. Keeping that sequence server-side prevents partial transfers.
 */
export function useReassignLead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      projectId,
      newDesignerId,
      oldDesignerId,
    }: {
      projectId: string;
      newDesignerId: string;
      oldDesignerId: string;
    }) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = getSupabase() as any;

      const { error } = await supabase.rpc('reassign_project_lead', {
        p_project_id: projectId,
        p_expected_designer_id: oldDesignerId,
        p_new_designer_id: newDesignerId,
      });
      if (error) throw error;

      return { projectId, newDesignerId, oldDesignerId };
    },
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: ['project', vars.projectId] });
      queryClient.invalidateQueries({ queryKey: ['project-team', vars.projectId] });
      queryClient.invalidateQueries({ queryKey: ['project-permissions', vars.projectId] });
      queryClient.invalidateQueries({ queryKey: ['project-activity-from-log', vars.projectId] });
      queryClient.invalidateQueries({ queryKey: ['client-activity'] });
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      queryClient.invalidateQueries({ queryKey: ['document-state'] });
    },
  });
}
