'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { Button, Textarea } from '@/components/ui/controls';
import { useBufferedAutosave } from '@/hooks/use-buffered-autosave';
import {
  useProposalChangeOrderTerms,
  useUpsertChangeOrderTerms,
} from '@patina/supabase';

interface ChangeOrderTermsEditorProps {
  proposalId: string;
}

interface LocalTerms {
  processDescription: string;
  hourlyRateCents: number;
  minimumFeeCents: number;
  approvalRequired: boolean;
}

const DEFAULT_TERMS: LocalTerms = {
  processDescription:
    'Any work outside the agreed scope of services will be documented as a change order. ' +
    'The designer will provide a written estimate for the additional work. ' +
    'Work will not commence until the change order is approved and signed by the client.',
  hourlyRateCents: 17500,
  minimumFeeCents: 25000,
  approvalRequired: true,
};

export function ChangeOrderTermsEditor({ proposalId }: ChangeOrderTermsEditorProps) {
  const { data: terms, isLoading } = useProposalChangeOrderTerms(proposalId);
  const upsert = useUpsertChangeOrderTerms({ errorSurface: 'inline' });

  const [local, setLocal] = useState<LocalTerms>(DEFAULT_TERMS);
  const localRef = useRef<LocalTerms>(DEFAULT_TERMS);
  const [initialized, setInitialized] = useState(false);

  // Sync server data once loaded
  useEffect(() => {
    if (terms && !initialized) {
      const next = {
        processDescription: terms.process_description ?? DEFAULT_TERMS.processDescription,
        hourlyRateCents: terms.hourly_rate_cents ?? DEFAULT_TERMS.hourlyRateCents,
        minimumFeeCents: terms.minimum_fee_cents ?? DEFAULT_TERMS.minimumFeeCents,
        approvalRequired: terms.approval_required ?? DEFAULT_TERMS.approvalRequired,
      };
      localRef.current = next;
      setLocal(next);
      setInitialized(true);
    } else if (!terms && !isLoading && !initialized) {
      // No existing terms yet -- keep defaults
      setInitialized(true);
    }
  }, [terms, isLoading, initialized]);

  const termsAutosave = useBufferedAutosave<string, LocalTerms>({
    proposalId,
    delay: 800,
    save: useCallback(
      async (_key, next) => {
        await upsert.mutateAsync({
          proposalId,
          processDescription: next.processDescription,
          hourlyRateCents: next.hourlyRateCents,
          minimumFeeCents: next.minimumFeeCents,
          approvalRequired: next.approvalRequired,
        });
      },
      [proposalId, upsert],
    ),
  });

  function update(patch: Partial<LocalTerms>, flush = false) {
    // Ref-backed merge keeps rapid events lossless even before React commits
    // the prior setState render.
    const next = { ...localRef.current, ...patch };
    localRef.current = next;
    setLocal(next);
    termsAutosave.queue(proposalId, next);
    if (flush) void termsAutosave.flush(proposalId);
  }

  if (isLoading) {
    return (
      <div className="py-8 text-center font-body text-[0.82rem] text-[var(--text-muted)]">
        Loading terms...
      </div>
    );
  }

  return (
    <div>
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <span className="type-meta">Change Order Terms</span>
        {!terms && initialized && (
          <Button
            variant="primary"
            onClick={() => {
              termsAutosave.queue(proposalId, localRef.current);
              void termsAutosave.flush(proposalId);
            }}
            disabled={
              upsert.isPending || termsAutosave.state === 'saving'
            }
          >
            Save Terms
          </Button>
        )}
      </div>

      {/* Process description */}
      <div className="mb-6">
        <label
          className="mb-1.5 block font-body text-[0.78rem] font-medium text-[var(--text-primary)]"
        >
          Process Description
        </label>
        <Textarea
          id={`change-order-process-${proposalId}`}
          value={local.processDescription}
          onChange={(e) => update({ processDescription: e.target.value })}
          onBlur={() => void termsAutosave.flush(proposalId)}
          rows={5}
          placeholder="Describe the process for handling work outside the agreed scope..."
        />
        <span className="mt-1 block font-body text-[0.68rem] text-[var(--text-muted)]">
          Supports markdown formatting in the final proposal document.
        </span>
      </div>

      {/* Fee fields */}
      <div className="grid gap-6 sm:grid-cols-2">
        {/* Hourly rate */}
        <div>
          <label
            className="mb-1.5 block font-body text-[0.78rem] font-medium text-[var(--text-primary)]"
          >
            Hourly Rate (Out-of-Scope)
          </label>
          <div className="flex items-center gap-1 rounded-[3px] border border-[var(--border-default)] px-3 py-2 focus-within:border-[var(--accent-primary)]">
            <span className="font-mono text-[0.82rem] text-[var(--text-muted)]">$</span>
            <input
              aria-label="Hourly rate (out-of-scope)"
              type="number"
              min={0}
              step={25}
              value={local.hourlyRateCents / 100}
              onChange={(e) =>
                update({ hourlyRateCents: Math.round(parseFloat(e.target.value || '0') * 100) })
              }
              onBlur={() => void termsAutosave.flush(proposalId)}
              className="w-full bg-transparent font-mono text-[0.88rem] text-[var(--text-primary)] outline-none"
            />
            <span className="font-body text-[0.72rem] text-[var(--text-muted)]">/hr</span>
          </div>
        </div>

        {/* Minimum fee */}
        <div>
          <label
            className="mb-1.5 block font-body text-[0.78rem] font-medium text-[var(--text-primary)]"
          >
            Minimum Fee per Change Order
          </label>
          <div className="flex items-center gap-1 rounded-[3px] border border-[var(--border-default)] px-3 py-2 focus-within:border-[var(--accent-primary)]">
            <span className="font-mono text-[0.82rem] text-[var(--text-muted)]">$</span>
            <input
              aria-label="Minimum fee per change order"
              type="number"
              min={0}
              step={50}
              value={local.minimumFeeCents / 100}
              onChange={(e) =>
                update({ minimumFeeCents: Math.round(parseFloat(e.target.value || '0') * 100) })
              }
              onBlur={() => void termsAutosave.flush(proposalId)}
              className="w-full bg-transparent font-mono text-[0.88rem] text-[var(--text-primary)] outline-none"
            />
          </div>
        </div>
      </div>

      {/* Approval required */}
      <div className="mt-6">
        <label className="flex cursor-pointer items-start gap-3">
          <button
            type="button"
            role="checkbox"
            aria-checked={local.approvalRequired}
            onClick={() =>
              update({ approvalRequired: !localRef.current.approvalRequired }, true)
            }
            className={`mt-0.5 flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-[3px] border-[1.5px] transition-colors ${
              local.approvalRequired
                ? 'border-[var(--color-sage)] bg-[rgba(122,155,118,0.1)] text-[var(--color-sage)]'
                : 'border-[var(--border-default)]'
            }`}
            style={{ fontSize: '0.6rem', cursor: 'pointer' }}
          >
            {local.approvalRequired && '\u2713'}
          </button>
          <div>
            <span className="font-body text-[0.88rem] text-[var(--text-primary)]">
              Written approval required before work begins
            </span>
            <span className="mt-0.5 block font-body text-[0.72rem] text-[var(--text-muted)]">
              Client must sign the change order before any out-of-scope work is performed.
            </span>
          </div>
        </label>
      </div>

      <div className="mt-4 min-h-4" aria-live="polite">
        {(termsAutosave.state === 'dirty' ||
          termsAutosave.state === 'saving') && (
          <p
            role="status"
            className="font-body text-[0.72rem] text-[var(--text-muted)]"
          >
            Saving change-order terms…
          </p>
        )}
        {termsAutosave.state === 'saved' && (
          <p
            role="status"
            className="font-body text-[0.72rem] text-[var(--color-sage)]"
          >
            Change-order terms saved
          </p>
        )}
        {termsAutosave.state === 'error' && (
          <p
            role="alert"
            className="font-body text-[0.72rem] text-[var(--color-terracotta)]"
          >
            {termsAutosave.error ?? 'Could not save the change-order terms.'}{' '}
            Your client copy was not updated.
          </p>
        )}
      </div>
    </div>
  );
}
