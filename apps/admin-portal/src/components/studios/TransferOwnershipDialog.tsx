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
import { Alert, AlertDescription } from '@/components/ui/alert';
import { AlertTriangle } from 'lucide-react';
import { useStudioMembers, useTransferStudioOwnership } from '@/hooks/use-studios';
import { toast } from 'sonner';
import type { StudioMember } from '@/types';

interface TransferOwnershipDialogProps {
  studioId: string;
  studioName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Preselect this member (set by the roster's per-row "Transfer ownership"). */
  initialMember?: StudioMember;
}

function memberLabel(member: StudioMember): string {
  const name = member.profile?.displayName || member.profile?.email || member.userId;
  const title = member.staffRole || member.jobTitle;
  return title ? `${name} · ${title}` : name;
}

export function TransferOwnershipDialog({
  studioId,
  studioName,
  open,
  onOpenChange,
  initialMember,
}: TransferOwnershipDialogProps) {
  // The RPC only accepts an active, non-guest member of this studio, so the
  // picker is the roster itself — a free user search offered ineligible people.
  const { data: members, isLoading } = useStudioMembers(studioId);
  const [newOwnerUserId, setNewOwnerUserId] = useState<string>('');
  const transferOwnership = useTransferStudioOwnership();

  useEffect(() => {
    if (open) {
      setNewOwnerUserId(initialMember?.userId ?? '');
      transferOwnership.reset();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initialMember]);

  const eligible = (members ?? []).filter(
    (m) => m.status === 'active' && m.role !== 'owner' && m.role !== 'guest',
  );
  const selected = eligible.find((m) => m.userId === newOwnerUserId);

  const handleConfirm = async () => {
    if (!newOwnerUserId) return;
    try {
      await transferOwnership.mutateAsync({ studioId, newOwnerUserId });
      toast.success(`Ownership transferred to ${selected ? memberLabel(selected) : 'the new owner'}`);
      onOpenChange(false);
    } catch (error: any) {
      toast.error(error?.message || 'Failed to transfer ownership');
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Transfer Ownership</DialogTitle>
          <DialogDescription>
            Transfer ownership of {studioName} to another active member. The new owner must
            already be an active, non-guest member of this studio.
          </DialogDescription>
        </DialogHeader>

        <Alert>
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            The current owner is demoted to Admin. This cannot be undone from this dialog.
          </AlertDescription>
        </Alert>

        <div className="space-y-2 py-4">
          <Label>New owner</Label>
          {isLoading ? (
            <p className="text-sm text-muted-foreground">Loading members…</p>
          ) : eligible.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No eligible members. Add an active admin or member to this studio first.
            </p>
          ) : (
            <Select value={newOwnerUserId} onValueChange={setNewOwnerUserId}>
              <SelectTrigger>
                <SelectValue placeholder="Select a member..." />
              </SelectTrigger>
              <SelectContent>
                {eligible.map((member) => (
                  <SelectItem key={member.userId} value={member.userId}>
                    {memberLabel(member)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={transferOwnership.isPending}
          >
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={handleConfirm}
            disabled={!newOwnerUserId || transferOwnership.isPending}
          >
            {transferOwnership.isPending ? 'Transferring...' : 'Transfer Ownership'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
