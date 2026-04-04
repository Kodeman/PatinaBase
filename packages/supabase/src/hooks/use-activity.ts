import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { createBrowserClient } from '../client';

const getSupabase = () => createBrowserClient();

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

export type ActivityType =
  | 'message'
  | 'decision'
  | 'status_change'
  | 'invoice'
  | 'project_update'
  | 'review'
  | 'note'
  | 'milestone';

export interface ClientActivity {
  id: string;
  designer_client_id: string;
  activity_type: ActivityType;
  title: string;
  description: string | null;
  metadata: Record<string, unknown>;
  actor_name: string | null;
  created_at: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// HOOKS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Fetch activity log for a client relationship
 */
export function useClientActivity(designerClientId: string, limit = 20) {
  return useQuery({
    queryKey: ['client-activity', designerClientId, limit],
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = getSupabase() as any;

      const { data, error } = await supabase
        .from('client_activity_log')
        .select('*')
        .eq('designer_client_id', designerClientId)
        .order('created_at', { ascending: false })
        .limit(limit);

      if (error) throw error;
      return (data ?? []) as ClientActivity[];
    },
    enabled: !!designerClientId,
  });
}

/**
 * Log a new activity entry
 */
export function useLogActivity() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      designerClientId,
      activityType,
      title,
      description,
      metadata,
      actorName,
    }: {
      designerClientId: string;
      activityType: ActivityType;
      title: string;
      description?: string;
      metadata?: Record<string, unknown>;
      actorName?: string;
    }) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = getSupabase() as any;

      const { data, error } = await supabase
        .from('client_activity_log')
        .insert({
          designer_client_id: designerClientId,
          activity_type: activityType,
          title,
          description: description || null,
          metadata: metadata || {},
          actor_name: actorName || null,
        })
        .select()
        .single();

      if (error) throw error;
      return data as ClientActivity;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['client-activity', data.designer_client_id] });
    },
  });
}
