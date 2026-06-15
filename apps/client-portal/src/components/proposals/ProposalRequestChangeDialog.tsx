'use client';

import { useState } from 'react';

import { useRequestProposalChange } from '@patina/supabase';
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  useToast,
} from '@patina/design-system';

interface ProposalRequestChangeDialogProps {
  proposalId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onRequested?: () => void;
}

const FEEDBACK_MAX = 1000;

export function ProposalRequestChangeDialog({
  proposalId,
  open,
  onOpenChange,
  onRequested,
}: ProposalRequestChangeDialogProps) {
  const requestChange = useRequestProposalChange();
  const { toast } = useToast();
  const [feedback, setFeedback] = useState('');
  const [error, setError] = useState<string | null>(null);

  const trimmed = feedback.trim();
  const canSubmit = trimmed.length > 0 && !requestChange.isPending;

  function reset() {
    setFeedback('');
    setError(null);
  }

  async function onConfirm() {
    setError(null);
    if (!trimmed) {
      setError('Add a note so your designer knows what to change.');
      return;
    }
    try {
      await requestChange.mutateAsync({ proposalId, feedback: trimmed });
      reset();
      onOpenChange(false);
      toast({ description: 'Your note was sent' });
      onRequested?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send your note');
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) {
          reset();
        }
        onOpenChange(next);
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Request a change</DialogTitle>
          <DialogDescription>
            Tell your designer what you&rsquo;d like adjusted. This won&rsquo;t decline the proposal
            — it stays open while they take a look.
          </DialogDescription>
        </DialogHeader>
        <div className="py-2">
          <label htmlFor="request-change-feedback" className="block">
            <span className="block text-sm font-medium text-[var(--text-primary)] mb-2">
              Your note
            </span>
            <textarea
              id="request-change-feedback"
              data-testid="proposal-request-change-feedback"
              value={feedback}
              onChange={(e) => setFeedback(e.target.value.slice(0, FEEDBACK_MAX))}
              rows={4}
              maxLength={FEEDBACK_MAX}
              placeholder="What would you like to change?"
              className="w-full resize-none rounded-md border border-[var(--border-default)] bg-[var(--bg-surface)] px-3 py-2 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-primary)]"
            />
          </label>
          <p className="mt-1 text-xs text-[var(--text-muted)]">
            {feedback.length} / {FEEDBACK_MAX}
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
            disabled={requestChange.isPending}
          >
            Cancel
          </Button>
          <Button
            onClick={onConfirm}
            disabled={!canSubmit}
            data-testid="proposal-request-change-confirm"
          >
            {requestChange.isPending ? 'Sending…' : 'Send note'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
