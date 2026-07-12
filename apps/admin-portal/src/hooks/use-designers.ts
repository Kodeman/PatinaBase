import { useMutation, useQueryClient } from '@tanstack/react-query';
import { designersService, type InviteDesignerRequest } from '@/services/designers';
import { userKeys } from './use-users';

/**
 * Invite a designer via the branded designer-invite edge function
 * (api/admin/designers/invite). Invalidates the users list — the invited
 * account shows up there once profiles.is_designer/user_roles land.
 */
export function useInviteDesigner() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: InviteDesignerRequest) => designersService.invite(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: userKeys.lists() });
    },
  });
}
