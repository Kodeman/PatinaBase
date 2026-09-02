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
import { useSetStudioStatus } from '@/hooks/use-studios';
import { toast } from 'sonner';

export type StudioStatusAction = 'suspend' | 'reactivate' | 'deactivate';

const ACTION_CONFIG: Record<
  StudioStatusAction,
  { title: string; status: 'active' | 'suspended' | 'deactivated'; confirmText: string; message: string; destructive: boolean }
> = {
  suspend: {
    title: 'Suspend Studio',
    status: 'suspended',
    confirmText: 'Suspend Studio',
    message:
      'Co-members lose shared access immediately (the owner keeps their own rows). Reactivate to restore it.',
    destructive: true,
  },
  reactivate: {
    title: 'Reactivate Studio',
    status: 'active',
    confirmText: 'Reactivate Studio',
    message: 'Restores shared access for every active member.',
    destructive: false,
  },
  deactivate: {
    title: 'Deactivate Studio',
    status: 'deactivated',
    confirmText: 'Deactivate Studio',
    message:
      'Deactivation is not deletion — the studio letterhead and history remain, but membership access stays off until reactivated.',
    destructive: true,
  },
};

interface StudioStatusDialogProps {
  studioId: string;
  studioName: string;
  action: StudioStatusAction;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function StudioStatusDialog({
  studioId,
  studioName,
  action,
  open,
  onOpenChange,
}: StudioStatusDialogProps) {
  const [reason, setReason] = useState('');
  const setStatus = useSetStudioStatus();
  const config = ACTION_CONFIG[action];

  const handleConfirm = async () => {
    try {
      await setStatus.mutateAsync({ studioId, status: config.status, reason: reason.trim() || undefined });
      toast.success(`${studioName} ${config.status}`);
      onOpenChange(false);
      setReason('');
    } catch (error: any) {
      toast.error(error?.message || `Failed to ${action} studio`);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>{config.title}</DialogTitle>
          <DialogDescription>
            {config.title} for {studioName}.
          </DialogDescription>
        </DialogHeader>

        {config.destructive && (
          <Alert>
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>{config.message}</AlertDescription>
          </Alert>
        )}
        {!config.destructive && <p className="text-sm text-muted-foreground">{config.message}</p>}

        <div className="space-y-2 py-4">
          <Label htmlFor="status-reason">Reason (optional)</Label>
          <Textarea
            id="status-reason"
            placeholder="Enter a reason for this status change..."
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={3}
          />
          <p className="text-xs text-muted-foreground">Logged in the studio activity feed.</p>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={setStatus.isPending}>
            Cancel
          </Button>
          <Button
            variant={config.destructive ? 'destructive' : 'default'}
            onClick={handleConfirm}
            disabled={setStatus.isPending}
          >
            {setStatus.isPending ? 'Working...' : config.confirmText}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
