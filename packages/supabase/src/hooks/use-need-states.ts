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

export function useNeedStates(organizationId: string) {
  return useQuery({
    queryKey: ['need-states', organizationId],
    queryFn: async () => {
      const supabase = createBrowserClient();
      const { data, error } = await supabase
        .from('studio_need_states')
        .select('need_key, project_id, deferred_until, acted_at, waiting_on, set_aside_until, set_aside_reason')
        .eq('organization_id', organizationId);
      if (error) throw error;
      return mapNeedStateRows((data ?? []) as NeedStateRow[]);
    },
    enabled: Boolean(organizationId),
  });
}

export interface SetNeedStateInput {
  needKey: NeedKey;
  projectId: string;
  action: NeedStateAction;
  waitingOn?: string;
  until?: string;
  reason?: string;
}

export function useSetNeedState() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: SetNeedStateInput) => {
      const supabase = createBrowserClient();
      const { error } = await supabase.rpc('set_need_state', {
        p_need_key: input.needKey,
        p_project_id: input.projectId,
        p_action: input.action,
        p_waiting_on: input.waitingOn,
        p_until: input.until,
        p_reason: input.reason,
      });
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['need-states'] }),
  });
}
