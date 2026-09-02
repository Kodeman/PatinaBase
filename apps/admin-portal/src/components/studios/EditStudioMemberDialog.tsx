'use client';

import { useEffect, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { StaffRoleSelect } from '@/components/studios/StaffRoleSelect';
import { useUpdateStudioMember } from '@/hooks/use-studios';
import { toast } from 'sonner';
import type { StudioMember, StudioMemberRole } from '@/types';

interface EditStudioMemberDialogProps {
  studioId: string;
  member: StudioMember;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function EditStudioMemberDialog({
  studioId,
  member,
  open,
  onOpenChange,
}: EditStudioMemberDialogProps) {
  const [role, setRole] = useState<StudioMemberRole>(member.role);
  const [staffRole, setStaffRole] = useState<string | null>(member.staffRole ?? null);
  const updateMember = useUpdateStudioMember();
  const isOwner = member.role === 'owner';

  useEffect(() => {
    if (open) {
      setRole(member.role);
      setStaffRole(member.staffRole ?? null);
      updateMember.reset();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, member]);

  const hasChanges = role !== member.role || staffRole !== (member.staffRole ?? null);

  const handleSubmit = async () => {
    if (!hasChanges) {
      toast.info('No changes to save');
      return;
    }
    const data: { role?: string; staffRole?: string | null } = {};
    if (role !== member.role) data.role = role;
    // null (not undefined) so "No title" actually clears the column.
    if (staffRole !== (member.staffRole ?? null)) data.staffRole = staffRole;

    try {
      await updateMember.mutateAsync({
        studioId,
        memberId: member.id,
        userId: member.userId,
        data,
      });
      toast.success('Member updated');
      onOpenChange(false);
    } catch (error: any) {
      toast.error(error?.message || 'Failed to update member');
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Edit Member</DialogTitle>
          <DialogDescription>Update tier and title for {member.profile?.email ?? member.userId}.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label>Tier</Label>
            <Select
              value={role}
              onValueChange={(v) => setRole(v as StudioMemberRole)}
              disabled={isOwner}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="admin">Admin</SelectItem>
                <SelectItem value="member">Member</SelectItem>
                <SelectItem value="guest">Guest</SelectItem>
              </SelectContent>
            </Select>
            {isOwner && (
              <p className="text-xs text-muted-foreground">
                Use Transfer Ownership to change the owner&apos;s tier.
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label>Title</Label>
            <StaffRoleSelect value={staffRole} onChange={setStaffRole} />
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={updateMember.isPending}
          >
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={!hasChanges || updateMember.isPending}>
            {updateMember.isPending ? 'Saving...' : 'Save Changes'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
