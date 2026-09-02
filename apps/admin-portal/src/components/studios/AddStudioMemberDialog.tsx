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
import { UserSearchPicker } from '@/components/shared/UserSearchPicker';
import { StaffRoleSelect } from '@/components/studios/StaffRoleSelect';
import { useAddStudioMember } from '@/hooks/use-studios';
import { toast } from 'sonner';
import type { StudioMemberRole, StudioOwner } from '@/types';

interface AddStudioMemberDialogProps {
  studioId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function AddStudioMemberDialog({ studioId, open, onOpenChange }: AddStudioMemberDialogProps) {
  const [user, setUser] = useState<StudioOwner | null>(null);
  const [role, setRole] = useState<StudioMemberRole>('member');
  const [teammateType, setTeammateType] = useState<'member' | 'designer'>('member');
  const [staffRole, setStaffRole] = useState<string>('');
  const addMember = useAddStudioMember();

  useEffect(() => {
    if (open) {
      setUser(null);
      setRole('member');
      setTeammateType('member');
      setStaffRole('');
      addMember.reset();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const valid = !!user;

  const handleSubmit = async () => {
    if (!user) return;
    try {
      await addMember.mutateAsync({
        studioId,
        data: { userId: user.id, role, teammateType, staffRole: staffRole || undefined },
      });
      toast.success('Member added');
      onOpenChange(false);
    } catch (error: any) {
      toast.error(error?.message || 'Failed to add member');
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Add Existing User</DialogTitle>
          <DialogDescription>Add a user who already has a Patina account to this studio.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label>
              User <span className="text-destructive">*</span>
            </Label>
            <UserSearchPicker value={user} onChange={setUser} excludeStudioId={studioId} />
          </div>

          <div className="space-y-2">
            <Label>Tier</Label>
            <Select value={role} onValueChange={(v) => setRole(v as StudioMemberRole)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="admin">Admin</SelectItem>
                <SelectItem value="member">Member</SelectItem>
                <SelectItem value="guest">Guest</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Teammate type</Label>
            <Select
              value={teammateType}
              onValueChange={(v) => setTeammateType(v as 'member' | 'designer')}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="member">Member</SelectItem>
                <SelectItem value="designer">Designer (gets designer-portal access)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Title (optional)</Label>
            <StaffRoleSelect
              value={staffRole || undefined}
              onChange={(v) => setStaffRole(v ?? '')}
              onTierSuggest={setRole}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={addMember.isPending}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={!valid || addMember.isPending}>
            {addMember.isPending ? 'Adding...' : 'Add Member'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
