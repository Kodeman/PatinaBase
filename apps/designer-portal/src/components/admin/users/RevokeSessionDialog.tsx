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
import { LogOut } from 'lucide-react';
import { useRevokeAdminSession } from '@/hooks/admin/use-users';
import { toast } from 'sonner';

interface RevokeSessionDialogProps {
  userId: string;
  sessionId: string;
  deviceInfo?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function RevokeSessionDialog({
  userId,
  sessionId,
  deviceInfo,
  open,
  onOpenChange,
}: RevokeSessionDialogProps) {
  const revokeSession = useRevokeAdminSession();

  const handleRevoke = async () => {
    try {
      await revokeSession.mutateAsync({ userId, sessionId });
      toast.success('Session revoked successfully');
      onOpenChange(false);
    } catch (error) {
      toast.error('Failed to revoke session');
      console.error('Revoke session error:', error);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <LogOut className="h-5 w-5" />
            Revoke Session
          </DialogTitle>
          <DialogDescription>
            This will immediately terminate this user session and require the user to log in again.
          </DialogDescription>
        </DialogHeader>

        <Alert>
          <LogOut className="h-4 w-4" />
          <AlertDescription>
            {deviceInfo ? (
              <>
                The session on <strong>{deviceInfo}</strong> will be terminated immediately.
              </>
            ) : (
              <>This session will be terminated immediately.</>
            )}
          </AlertDescription>
        </Alert>

        <DialogFooter className="mt-4">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={revokeSession.isPending}
          >
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={handleRevoke}
            disabled={revokeSession.isPending}
          >
            {revokeSession.isPending ? 'Revoking...' : 'Revoke Session'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
