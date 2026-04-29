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
 * Operation order (RLS-safe):
 *  1. Fetch client_id + actor name (while caller is still lead)
 *  2. Verify project still has oldDesignerId as lead (concurrency guard)
 *  3. INSERT project_team_members previous_lead row (caller still has lead RLS)
 *  4. INSERT client_activity_log entry (caller still owns the designer_client row)
 *  5. UPDATE projects.designer_id = newDesignerId (final, intentionally last)
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

      // Verify caller is authenticated
      const { data: authData } = await supabase.auth.getUser();
      const callerUid = authData?.user?.id;
      if (!callerUid) throw new Error('Not authenticated');

      // 1. Fetch project (client_id needed for audit log) + verify current lead
      const { data: projectRow, error: projectFetchError } = await supabase
        .from('projects')
        .select('client_id, designer_id')
        .eq('id', projectId)
        .single();
      if (projectFetchError) throw projectFetchError;
      if (projectRow.designer_id !== oldDesignerId) {
        throw new Error('Could not reassign lead — the current lead may have already changed.');
      }

      // 2. Fetch designer_client id for the audit log (NOT NULL FK requirement)
      const { data: dcOldRow, error: dcError } = await supabase
        .from('designer_clients')
        .select('id')
        .eq('designer_id', oldDesignerId)
        .eq('client_id', projectRow.client_id)
        .maybeSingle();
      if (dcError) throw dcError;
      if (!dcOldRow?.id) {
        throw new Error('No designer-client relationship found for activity log — cannot record reassignment.');
      }
      const designerClientId: string = dcOldRow.id;

      // 3. Look up actor name for audit
      const { data: profileRow } = await supabase
        .from('profiles')
        .select('full_name')
        .eq('id', callerUid)
        .maybeSingle();
      const actorName: string = profileRow?.full_name ?? 'Unknown';

      // 4. Insert old lead as 'previous_lead' team member BEFORE updating designer_id
      //    (caller still has lead_designer RLS at this point)
      const { error: teamError } = await supabase
        .from('project_team_members')
        .upsert(
          {
            project_id: projectId,
            user_id: oldDesignerId,
            role: 'previous_lead',
            assigned_by: callerUid,
          },
          { onConflict: 'project_id,user_id,role', ignoreDuplicates: true },
        );
      if (teamError) throw teamError;

      // 5. Insert audit log entry BEFORE updating designer_id
      //    (caller's designer_client row is still the canonical one)
      const { error: logError } = await supabase
        .from('client_activity_log')
        .insert({
          designer_client_id: designerClientId,
          activity_type: 'lead_reassigned',
          title: 'Lead designer reassigned',
          metadata: {
            project_id: projectId,
            old_designer_id: oldDesignerId,
            new_designer_id: newDesignerId,
          },
          actor_name: actorName,
        });
      if (logError) throw logError;

      // 6. Finally update projects.designer_id
      const { error: projectUpdateError } = await supabase
        .from('projects')
        .update({ designer_id: newDesignerId })
        .eq('id', projectId)
        .eq('designer_id', oldDesignerId);
      if (projectUpdateError) throw projectUpdateError;

      return { projectId, newDesignerId, oldDesignerId };
    },
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: ['project', vars.projectId] });
      queryClient.invalidateQueries({ queryKey: ['project-team', vars.projectId] });
      queryClient.invalidateQueries({ queryKey: ['project-activity-from-log', vars.projectId] });
      queryClient.invalidateQueries({ queryKey: ['client-activity'] });
    },
  });
}
