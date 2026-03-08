'use client';

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Button,
  Alert,
  AlertDescription,
} from '@patina/design-system';
import { CheckCircle2 } from 'lucide-react';
import { useActivateAdminUser } from '@/hooks/admin/use-users';
import { toast } from 'sonner';

interface ActivateUserDialogProps {
  userId: string;
  userEmail: string;
  currentStatus: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ActivateUserDialog({
  userId,
  userEmail,
  currentStatus,
  open,
  onOpenChange,
}: ActivateUserDialogProps) {
  const activateUser = useActivateAdminUser();

  const handleActivate = async () => {
    try {
      await activateUser.mutateAsync(userId);
      toast.success('User activated successfully');
      onOpenChange(false);
    } catch (error) {
      toast.error('Failed to activate user');
      console.error('Activate user error:', error);
    }
  };

  const isReactivation = currentStatus === 'suspended' || currentStatus === 'banned';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CheckCircle2 className="h-5 w-5 text-green-600" />
            {isReactivation ? 'Reactivate User' : 'Activate User'}
          </DialogTitle>
          <DialogDescription>
            {isReactivation
              ? `Restore access for ${userEmail}. The user will be able to log in again.`
              : `Activate the account for ${userEmail}.`}
          </DialogDescription>
        </DialogHeader>

        <Alert>
          <CheckCircle2 className="h-4 w-4" />
          <AlertDescription>
            {isReactivation ? (
              <>
                This will remove the {currentStatus} status and restore full access to the user's
                account. They will be able to log in immediately.
              </>
            ) : (
              <>This will set the user's status to active and grant them access to the platform.</>
            )}
          </AlertDescription>
        </Alert>

        <DialogFooter className="mt-4">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={activateUser.isPending}
          >
            Cancel
          </Button>
          <Button onClick={handleActivate} disabled={activateUser.isPending}>
            {activateUser.isPending
              ? 'Activating...'
              : isReactivation
              ? 'Reactivate User'
              : 'Activate User'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
