'use client';

import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { useRemoveStudioMember } from '@/hooks/use-studios';
import { toast } from 'sonner';
import type { StudioMember } from '@/types';

interface RemoveStudioMemberDialogProps {
  studioId: string;
  member: StudioMember;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function RemoveStudioMemberDialog({
  studioId,
  member,
  open,
  onOpenChange,
}: RemoveStudioMemberDialogProps) {
  const removeMember = useRemoveStudioMember();
  const isInvite = member.status === 'invited';

  const handleConfirm = async () => {
    try {
      await removeMember.mutateAsync({ studioId, memberId: member.id, userId: member.userId });
      toast.success(isInvite ? 'Invite canceled' : 'Member removed');
    } catch (error: any) {
      toast.error(error?.message || 'Failed to remove member');
    }
  };

  return (
    <ConfirmDialog
      open={open}
      onOpenChange={onOpenChange}
      onConfirm={handleConfirm}
      title={isInvite ? 'Cancel Invite' : 'Remove Member'}
      description={
        isInvite
          ? `Cancel the pending invite for ${member.profile?.email ?? member.userId}?`
          : `Remove ${member.profile?.email ?? member.userId} from this studio? The owner tier cannot be removed this way — transfer ownership first.`
      }
      confirmText={isInvite ? 'Cancel Invite' : 'Remove Member'}
      variant="destructive"
      isLoading={removeMember.isPending}
    />
  );
}
