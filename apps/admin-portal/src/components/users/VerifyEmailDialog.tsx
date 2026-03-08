'use client';

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Mail } from 'lucide-react';
import { useVerifyEmail } from '@/hooks/use-users';
import { toast } from 'sonner';

interface VerifyEmailDialogProps {
  userId: string;
  userEmail: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function VerifyEmailDialog({
  userId,
  userEmail,
  open,
  onOpenChange,
}: VerifyEmailDialogProps) {
  const verifyEmail = useVerifyEmail();

  const handleVerify = async () => {
    try {
      await verifyEmail.mutateAsync(userId);
      toast.success('Email verified successfully');
      onOpenChange(false);
    } catch (error) {
      toast.error('Failed to verify email');
      console.error('Verify email error:', error);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Mail className="h-5 w-5 text-blue-600" />
            Verify Email Address
          </DialogTitle>
          <DialogDescription>
            Manually verify the email address {userEmail} for this user.
          </DialogDescription>
        </DialogHeader>

        <Alert>
          <Mail className="h-4 w-4" />
          <AlertDescription>
            This will mark the email as verified without requiring the user to click a
            verification link. Use this for trusted users or when troubleshooting email delivery
            issues.
          </AlertDescription>
        </Alert>

        <DialogFooter className="mt-4">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={verifyEmail.isPending}
          >
            Cancel
          </Button>
          <Button onClick={handleVerify} disabled={verifyEmail.isPending}>
            {verifyEmail.isPending ? 'Verifying...' : 'Verify Email'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
