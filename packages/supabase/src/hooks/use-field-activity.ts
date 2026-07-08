'use client';

import { useQuery } from '@tanstack/react-query';
import { createBrowserClient } from '../client';

// ═══════════════════════════════════════════════════════════════════════════
// FIELD ACTIVITY — the Desk "In the field" rollup (Field Coordination · Wave 5)
//
// Reads `field_activity_summary` (00282, SECURITY INVOKER — base-table RLS
// scopes every count to the querying team member) and joins the project name so
// the Desk can render actionable need-lines, NOT KPI tiles: "3 field texts need
// review · Maple St", "2 parties haven't opted in · Kenwood", "1 field task
// overdue". The view returns one row per project; we keep only projects that
// actually have field activity (any count > 0) so a clean Desk stays clean.
// ═══════════════════════════════════════════════════════════════════════════

const getSupabase = () => createBrowserClient();

export interface FieldActivityRow {
  project_id: string;
  project_name: string | null;
  /** Inbound field texts still awaiting designer triage. */
  unreviewed_sms_count: number;
  /** Field parties invited (consent 'pending') but not yet opted in. */
  awaiting_reply_count: number;
  /** Field-owned tasks past their due date. */
  overdue_field_task_count: number;
}

export const fieldActivityKeys = {
  all: ['field-activity'] as const,
};

/**
 * The cross-project field rollup for the Desk. 30s poll (the Desk re-sorts in
 * the background, D2). Projects with zero field activity are dropped so this
 * never adds noise to a Desk with no field work.
 */
export function useFieldActivity() {
  return useQuery({
    queryKey: fieldActivityKeys.all,
    refetchInterval: 30_000,
    staleTime: 15_000,
    queryFn: async (): Promise<FieldActivityRow[]> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = getSupabase() as any;
      const { data, error } = await supabase
        .from('field_activity_summary')
        .select('project_id, unreviewed_sms_count, awaiting_reply_count, overdue_field_task_count');
      if (error) throw error;

      const rows = ((data ?? []) as Array<Omit<FieldActivityRow, 'project_name'>>).filter(
        (r) =>
          (r.unreviewed_sms_count ?? 0) > 0 ||
          (r.awaiting_reply_count ?? 0) > 0 ||
          (r.overdue_field_task_count ?? 0) > 0,
      );
      if (rows.length === 0) return [];

      // Name the projects (RLS on public.projects scopes these to the designer).
      const ids = rows.map((r) => r.project_id);
      const { data: projects, error: projErr } = await supabase
        .from('projects')
        .select('id, name')
        .in('id', ids);
      if (projErr) throw projErr;
      const nameById = new Map<string, string | null>(
        ((projects ?? []) as Array<{ id: string; name: string | null }>).map((p) => [p.id, p.name]),
      );

      return rows.map((r) => ({
        ...r,
        project_name: nameById.get(r.project_id) ?? null,
      }));
    },
  });
}
