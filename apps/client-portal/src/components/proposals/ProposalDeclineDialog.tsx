'use client';

import { useState } from 'react';

import { useDeclineProposal } from '@patina/supabase';
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@patina/design-system';

interface ProposalDeclineDialogProps {
  proposalId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDeclined?: () => void;
}

const REASON_MAX = 1000;

export function ProposalDeclineDialog({
  proposalId,
  open,
  onOpenChange,
  onDeclined,
}: ProposalDeclineDialogProps) {
  const decline = useDeclineProposal();
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);

  async function onConfirm() {
    setError(null);
    try {
      await decline.mutateAsync({ proposalId, reason: reason.trim() || undefined });
      setReason('');
      onOpenChange(false);
      onDeclined?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to decline proposal');
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) {
          setReason('');
          setError(null);
        }
        onOpenChange(next);
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Decline this proposal?</DialogTitle>
          <DialogDescription>
            Your designer will be notified. You can share a reason to help them respond — this is
            optional.
          </DialogDescription>
        </DialogHeader>
        <div className="py-2">
          <label htmlFor="decline-reason" className="block">
            <span className="block text-sm font-medium text-[var(--text-primary)] mb-2">
              Reason (optional)
            </span>
            <textarea
              id="decline-reason"
              data-testid="proposal-decline-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value.slice(0, REASON_MAX))}
              rows={4}
              maxLength={REASON_MAX}
              placeholder="What&rsquo;s holding you back?"
              className="w-full resize-none rounded-md border border-[var(--border-default)] bg-[var(--bg-surface)] px-3 py-2 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-primary)]"
            />
          </label>
          <p className="mt-1 text-xs text-[var(--text-muted)]">
            {reason.length} / {REASON_MAX}
          </p>
          {error && (
            <p className="mt-2 text-sm text-patina-terracotta" role="alert">
              {error}
            </p>
          )}
        </div>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={decline.isPending}
          >
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={onConfirm}
            disabled={decline.isPending}
            data-testid="proposal-decline-confirm"
          >
            {decline.isPending ? 'Declining…' : 'Decline proposal'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
