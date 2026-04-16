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
import { Label } from '@/components/ui/label';
import { Loader2 } from 'lucide-react';

interface AdminUnpublishDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (reason: string) => Promise<void>;
  productName: string;
}

export function AdminUnpublishDialog({
  open,
  onOpenChange,
  onConfirm,
  productName,
}: AdminUnpublishDialogProps) {
  const [reason, setReason] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleConfirm = async () => {
    setIsSubmitting(true);
    try {
      await onConfirm(reason);
      setReason('');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Unpublish "{productName}"</DialogTitle>
          <DialogDescription>
            The product will be removed from the public catalog. Provide a reason for the audit
            log.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2 py-4">
          <Label htmlFor="unpublish-reason">Reason</Label>
          <textarea
            id="unpublish-reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={3}
            className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            placeholder="e.g. vendor out of stock, quality issue, compliance review"
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={handleConfirm}
            disabled={isSubmitting || reason.trim().length === 0}
          >
            {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Unpublish
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
