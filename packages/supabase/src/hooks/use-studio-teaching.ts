import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createBrowserClient } from '../client';

/**
 * Teaching sharing (R5, 00790): whether a studio's corrections help Patina for
 * every studio. On by default; an owner or admin turns it off through
 * set_studio_teaching_sharing, which refuses anyone else and logs each change.
 *
 * `organizations.share_teaching` and the RPC land in 00790. The generated
 * database types lag until the wave regenerates them, so the one provisional
 * cast lives here and integration can remove it in one place.
 */
const getSupabase = () => createBrowserClient() as any;

export const studioTeachingKeys = {
  sharing: (organizationId: string) => ['studio-teaching', 'sharing', organizationId] as const,
};

/** True when the studio shares its teaching; null for a studio the caller cannot see. */
export function useStudioTeachingSharing(organizationId: string | null | undefined) {
  return useQuery({
    queryKey: studioTeachingKeys.sharing(organizationId ?? ''),
    queryFn: async (): Promise<boolean | null> => {
      const { data, error } = await getSupabase()
        .from('organizations')
        .select('share_teaching')
        .eq('id', organizationId as string)
        .maybeSingle();
      if (error) throw error;
      return data ? (data.share_teaching as boolean) : null;
    },
    enabled: !!organizationId,
  });
}

/** Owner/admin only; the server refuses anyone else. Resolves to the stored value. */
export function useSetStudioTeachingSharing() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ organizationId, share }: { organizationId: string; share: boolean }) => {
      const { data, error } = await getSupabase().rpc('set_studio_teaching_sharing', {
        p_studio_id: organizationId,
        p_share: share,
      });
      if (error) throw error;
      return data as boolean;
    },
    onSuccess: (_share, { organizationId }) => {
      queryClient.invalidateQueries({ queryKey: studioTeachingKeys.sharing(organizationId) });
    },
  });
}
