import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createBrowserClient } from '../client';

export type NeedKey = string;
export type NeedStateAction = 'not_today' | 'acted' | 'set_aside' | 'clear';

export interface NeedState {
  needKey: NeedKey;
  projectId: string | null;
  deferredUntil: string | null;
  actedAt: string | null;
  waitingOn: string | null;
  setAsideUntil: string | null;
  setAsideReason: string | null;
}

interface NeedStateRow {
  need_key: string;
  project_id: string | null;
  deferred_until: string | null;
  acted_at: string | null;
  waiting_on: string | null;
  set_aside_until: string | null;
  set_aside_reason: string | null;
}

export function mapNeedStateRows(rows: NeedStateRow[]): Map<NeedKey, NeedState> {
  return new Map(rows.map((row) => [row.need_key, {
    needKey: row.need_key,
    projectId: row.project_id,
    deferredUntil: row.deferred_until,
    actedAt: row.acted_at,
    waitingOn: row.waiting_on,
    setAsideUntil: row.set_aside_until,
    setAsideReason: row.set_aside_reason,
  }]));
}

/**
 * The viewer's own need states, across every studio she sits in. RLS returns
 * only her rows, and `set_need_state` files each under the PROJECT's studio, so
 * a read filtered by the Desk's studio missed every state a member of two
 * studios wrote (walk W-D1). `organizationId` only gates the read.
 */
export function useNeedStates(organizationId: string) {
  return useQuery({
    queryKey: ['need-states', organizationId],
    queryFn: async () => {
      const supabase = createBrowserClient();
      const { data, error } = await supabase
        .from('studio_need_states')
        .select('need_key, project_id, deferred_until, acted_at, waiting_on, set_aside_until, set_aside_reason');
      if (error) throw error;
      return mapNeedStateRows((data ?? []) as NeedStateRow[]);
    },
    enabled: Boolean(organizationId),
  });
}

/**
 * A state names its line's record one of two ways (00765, SQ-778 N5):
 * `projectId` for a known project, or `engagementId` for a Day Sheet line,
 * whose id is `project_id ?? engagement_id` — a project, or an inquiry,
 * proposal or relationship with no project yet. The server finds the studio
 * from either, so every line can hold a state.
 */
export type SetNeedStateInput = (
  | { projectId: string; engagementId?: undefined }
  | { engagementId: string; projectId?: undefined }
) & {
  needKey: NeedKey;
  action: NeedStateAction;
  waitingOn?: string;
  until?: string;
  reason?: string;
};

/** `{ errorSurface: 'inline' }` — the caller prints the failure at the act
 *  (R83, SQ-777 F2); the transport's own words never reach a toast. */
export function useSetNeedState(options?: { errorSurface?: 'inline' }) {
  const queryClient = useQueryClient();
  return useMutation({
    meta: options?.errorSurface ? { errorSurface: options.errorSurface } : undefined,
    mutationFn: async (input: SetNeedStateInput) => {
      const supabase = createBrowserClient();
      const { error } = await supabase.rpc('set_need_state', {
        p_need_key: input.needKey,
        // A plpgsql argument is nullable; the generated type cannot say so.
        p_project_id: (input.projectId ?? null) as unknown as string,
        p_action: input.action,
        p_waiting_on: input.waitingOn,
        p_until: input.until,
        p_reason: input.reason,
        ...(input.engagementId ? { p_engagement_id: input.engagementId } : {}),
      });
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['need-states'] }),
  });
}
