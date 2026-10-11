import { useQuery } from '@tanstack/react-query';
import { createBrowserClient } from '../client';

export interface ProjectLead {
  leadUserId: string;
  leadName: string;
  previousLeadUserId?: string;
  previousLeadName?: string;
  assignedAt: string;
}

interface ProjectLeadRow {
  project_id: string;
  user_id: string;
  role: 'lead_designer' | 'previous_lead';
  assigned_at: string;
  updated_at: string;
  removed_at: string | null;
  user?: { full_name: string | null } | null;
}

export function mapProjectLeadRows(rows: ProjectLeadRow[]): Map<string, ProjectLead> {
  const byProject = new Map<string, ProjectLeadRow[]>();
  for (const row of rows) {
    const current = byProject.get(row.project_id) ?? [];
    current.push(row);
    byProject.set(row.project_id, current);
  }

  const leads = new Map<string, ProjectLead>();
  for (const [projectId, projectRows] of byProject) {
    const lead = projectRows.find((row) => row.role === 'lead_designer' && row.removed_at === null);
    if (!lead) continue;
    const previous = projectRows
      .filter((row) => row.role === 'previous_lead' && row.user_id !== lead.user_id)
      .sort((a, b) => b.assigned_at.localeCompare(a.assigned_at))[0];
    leads.set(projectId, {
      leadUserId: lead.user_id,
      leadName: lead.user?.full_name ?? '',
      ...(previous ? {
        previousLeadUserId: previous.user_id,
        previousLeadName: previous.user?.full_name ?? '',
      } : {}),
      // Reassignments reactivate an existing role row; updated_at records that hand-off.
      assignedAt: Date.parse(lead.updated_at) > Date.parse(lead.assigned_at) ? lead.updated_at : lead.assigned_at,
    });
  }
  return leads;
}

const LEAD_ROW_COLUMNS =
  'project_id, user_id, role, assigned_at, updated_at, removed_at, user:profiles!user_id(full_name)';

export interface ProjectLeadRead {
  /** The project's own studio; null when it has none or is not a project yet. */
  studioId: string | null;
  /** Its active lead, read for this project alone; null when it has none. */
  lead: ProjectLead | null;
}

/**
 * SQ-774 R2 — one project's own studio and its own lead, read directly. Not a
 * look-up in a studio's map: a project of another studio is absent from that
 * map, and absent is not "no lead". Under ['project-leads'], so every
 * hand-off that refreshes the studio maps refreshes this too.
 */
export function useProjectLead(projectId: string | null | undefined) {
  return useQuery({
    queryKey: ['project-leads', 'project', projectId ?? ''],
    queryFn: async (): Promise<ProjectLeadRead> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const client = createBrowserClient() as any;
      const [project, team] = await Promise.all([
        client.from('projects').select('studio_id').eq('id', projectId).maybeSingle(),
        client
          .from('project_team_members')
          .select(LEAD_ROW_COLUMNS)
          .eq('project_id', projectId)
          .in('role', ['lead_designer', 'previous_lead']),
      ]);
      if (project.error) throw project.error;
      if (team.error) throw team.error;
      return {
        studioId: (project.data?.studio_id as string | null | undefined) ?? null,
        lead: mapProjectLeadRows((team.data ?? []) as ProjectLeadRow[]).get(projectId as string) ?? null,
      };
    },
    enabled: Boolean(projectId),
  });
}

/**
 * SQ-774 R1 — every project this viewer leads now, in whichever studio: the
 * jobs whose money she sees per record (Q10), whatever studio is selected.
 */
export function useLedProjectIds(userId: string | null | undefined) {
  return useQuery({
    queryKey: ['project-leads', 'led-by', userId ?? ''],
    queryFn: async (): Promise<Set<string>> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const client = createBrowserClient() as any;
      const { data, error } = await client
        .from('project_team_members')
        .select('project_id')
        .eq('user_id', userId)
        .eq('role', 'lead_designer')
        .is('removed_at', null);
      if (error) throw error;
      return new Set(((data ?? []) as Array<{ project_id: string }>).map((row) => row.project_id));
    },
    enabled: Boolean(userId),
  });
}

export function useProjectLeads(organizationId: string) {
  return useQuery({
    queryKey: ['project-leads', organizationId],
    queryFn: async () => {
      const supabase = createBrowserClient();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const client = supabase as any;
      const { data: projects, error: projectsError } = await client
        .from('projects')
        .select('id')
        .eq('studio_id', organizationId);
      if (projectsError) throw projectsError;
      const projectIds = (projects ?? []).map((project: { id: string }) => project.id);
      if (projectIds.length === 0) return new Map<string, ProjectLead>();

      const { data, error } = await client
        .from('project_team_members')
        .select(LEAD_ROW_COLUMNS)
        .in('project_id', projectIds)
        .in('role', ['lead_designer', 'previous_lead'])
        .order('assigned_at', { ascending: false });
      if (error) throw error;
      return mapProjectLeadRows((data ?? []) as ProjectLeadRow[]);
    },
    enabled: Boolean(organizationId),
  });
}
