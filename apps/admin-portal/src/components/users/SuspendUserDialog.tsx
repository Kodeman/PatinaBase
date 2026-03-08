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
import { AlertTriangle } from 'lucide-react';
import { useSuspendUser } from '@/hooks/use-users';
import { toast } from 'sonner';

interface SuspendUserDialogProps {
  userId: string;
  userEmail: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function SuspendUserDialog({
  userId,
  userEmail,
  open,
  onOpenChange,
}: SuspendUserDialogProps) {
  const [reason, setReason] = useState('');
  const suspendUser = useSuspendUser();

  const handleSuspend = async () => {
    try {
      await suspendUser.mutateAsync({ userId, reason: reason.trim() || undefined });
      toast.success('User suspended successfully');
      onOpenChange(false);
      setReason('');
    } catch (error) {
      toast.error('Failed to suspend user');
      console.error('Suspend user error:', error);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Suspend User</DialogTitle>
          <DialogDescription>
            Suspend the account for {userEmail}. The user will not be able to log in until
            reactivated.
          </DialogDescription>
        </DialogHeader>

        <Alert>
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            This will immediately prevent the user from accessing their account. All active
            sessions will be revoked.
          </AlertDescription>
        </Alert>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="reason">Reason for suspension (optional)</Label>
            <Textarea
              id="reason"
              placeholder="Enter the reason for suspending this user..."
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={4}
              aria-label="Suspension reason"
            />
            <p className="text-xs text-muted-foreground">
              This reason will be logged in the audit trail.
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={suspendUser.isPending}
          >
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={handleSuspend}
            disabled={suspendUser.isPending}
          >
            {suspendUser.isPending ? 'Suspending...' : 'Suspend User'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
