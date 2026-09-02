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
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { StaffRoleSelect } from '@/components/studios/StaffRoleSelect';
import { useInviteStudioMember } from '@/hooks/use-studios';
import { toast } from 'sonner';
import type { StudioMemberRole } from '@/types';

interface InviteStudioMemberDialogProps {
  studioId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Prefilled when resending an existing pending invite. */
  resendFor?: { email: string; role: StudioMemberRole; staffRole?: string };
}

export function InviteStudioMemberDialog({
  studioId,
  open,
  onOpenChange,
  resendFor,
}: InviteStudioMemberDialogProps) {
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<StudioMemberRole>('member');
  const [staffRole, setStaffRole] = useState('');
  const invite = useInviteStudioMember();
  const isResend = !!resendFor;

  useEffect(() => {
    if (open) {
      setEmail(resendFor?.email ?? '');
      setRole(resendFor?.role ?? 'member');
      setStaffRole(resendFor?.staffRole ?? '');
      invite.reset();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, resendFor]);

  const valid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());

  const handleSubmit = async () => {
    if (!valid) return;
    try {
      const result = await invite.mutateAsync({
        studioId,
        data: {
          email: email.trim().toLowerCase(),
          role,
          staffRole: staffRole || undefined,
          resend: isResend,
        },
      });
      if (result?.email_status === 'failed') {
        toast.warning('Member saved, but the invite email failed to send');
      } else {
        toast.success(isResend ? 'Invite resent' : 'Invite sent');
      }
      onOpenChange(false);
    } catch (error: any) {
      toast.error(error?.message || 'Failed to send invite');
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>{isResend ? 'Resend Invite' : 'Invite by Email'}</DialogTitle>
          <DialogDescription>
            {isResend
              ? `Resend the studio invite to ${resendFor?.email}.`
              : 'Invite someone new to this studio by email.'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="invite-email">
              Email <span className="text-destructive">*</span>
            </Label>
            <Input
              id="invite-email"
              type="email"
              placeholder="name@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={isResend}
            />
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
            <Label>Title (optional)</Label>
            <StaffRoleSelect
              value={staffRole || undefined}
              onChange={(v) => setStaffRole(v ?? '')}
              onTierSuggest={setRole}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={invite.isPending}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={!valid || invite.isPending}>
            {invite.isPending ? 'Sending...' : isResend ? 'Resend Invite' : 'Send Invite'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
