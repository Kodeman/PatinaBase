'use client';

import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { AlertTriangle, Ban } from 'lucide-react';
import { useBanUser } from '@/hooks/use-users';
import { toast } from 'sonner';

interface BanUserDialogProps {
  userId: string;
  userEmail: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function BanUserDialog({
  userId,
  userEmail,
  open,
  onOpenChange,
}: BanUserDialogProps) {
  const [reason, setReason] = useState('');
  const banUser = useBanUser();

  const handleBan = async () => {
    try {
      await banUser.mutateAsync({ userId, reason: reason.trim() || undefined });
      toast.success('User banned successfully');
      onOpenChange(false);
      setReason('');
    } catch (error) {
      toast.error('Failed to ban user');
      console.error('Ban user error:', error);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Ban className="h-5 w-5 text-destructive" />
            Ban User
          </DialogTitle>
          <DialogDescription>
            Permanently ban the account for {userEmail}. This is a severe action that should only
            be used for policy violations.
          </DialogDescription>
        </DialogHeader>

        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            <strong>Warning:</strong> This is a permanent action. The user will be banned from
            the platform and will not be able to create a new account with the same email.
            All active sessions will be terminated immediately.
          </AlertDescription>
        </Alert>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="ban-reason">Reason for ban (optional)</Label>
            <Textarea
              id="ban-reason"
              placeholder="Enter the reason for banning this user..."
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={4}
              aria-label="Ban reason"
            />
            <p className="text-xs text-muted-foreground">
              This reason will be logged in the audit trail and may be shared with the user.
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={banUser.isPending}
          >
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={handleBan}
            disabled={banUser.isPending}
          >
            {banUser.isPending ? 'Banning...' : 'Ban User Permanently'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
