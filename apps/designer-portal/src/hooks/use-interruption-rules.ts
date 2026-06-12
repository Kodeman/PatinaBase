/**
 * Interruption rules (D2) — per-designer break-through settings. The table
 * (00201) ships empty: absence of a row = the kind stays quiet (the default
 * is zero interruptions). Toggling on upserts a row; the louder channel that
 * reads these is a later slice — this is read + write.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createBrowserClient } from '@patina/supabase';
import { useAuth } from '@/hooks/use-auth';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const getSupabase = () => createBrowserClient() as any;

export type InterruptionKind = 'decision' | 'message' | 'invoice' | 'pulse' | 'time' | 'note';

export function useInterruptionRules() {
  return useQuery({
    queryKey: ['interruption-rules'],
    queryFn: async (): Promise<Record<string, boolean>> => {
      const { data, error } = await getSupabase()
        .from('designer_interruption_rules')
        .select('kind, enabled');
      if (error) throw error;
      const map: Record<string, boolean> = {};
      for (const row of (data ?? []) as { kind: string; enabled: boolean }[]) {
        map[row.kind] = row.enabled;
      }
      return map;
    },
  });
}

export function useSetInterruptionRule() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async ({ kind, enabled }: { kind: InterruptionKind; enabled: boolean }) => {
      if (!user?.id) throw new Error('Not authenticated');
      const { error } = await getSupabase()
        .from('designer_interruption_rules')
        .upsert(
          { designer_id: user.id, kind, enabled, updated_at: new Date().toISOString() },
          { onConflict: 'designer_id,kind' },
        );
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['interruption-rules'] }),
  });
}
