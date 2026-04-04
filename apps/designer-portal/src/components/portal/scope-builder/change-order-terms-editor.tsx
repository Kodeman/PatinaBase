'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { PortalButton } from '@/components/portal/button';
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
  const upsert = useUpsertChangeOrderTerms();

  const [local, setLocal] = useState<LocalTerms>(DEFAULT_TERMS);
  const [initialized, setInitialized] = useState(false);

  // Sync server data once loaded
  useEffect(() => {
    if (terms && !initialized) {
      setLocal({
        processDescription: terms.process_description ?? DEFAULT_TERMS.processDescription,
        hourlyRateCents: terms.hourly_rate_cents ?? DEFAULT_TERMS.hourlyRateCents,
        minimumFeeCents: terms.minimum_fee_cents ?? DEFAULT_TERMS.minimumFeeCents,
        approvalRequired: terms.approval_required ?? DEFAULT_TERMS.approvalRequired,
      });
      setInitialized(true);
    } else if (!terms && !isLoading && !initialized) {
      // No existing terms yet -- keep defaults
      setInitialized(true);
    }
  }, [terms, isLoading, initialized]);

  // Debounced auto-save
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const save = useCallback(
    (next: LocalTerms) => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => {
        upsert.mutate({
          proposalId,
          processDescription: next.processDescription,
          hourlyRateCents: next.hourlyRateCents,
          minimumFeeCents: next.minimumFeeCents,
          approvalRequired: next.approvalRequired,
        });
      }, 800);
    },
    [upsert, proposalId]
  );

  function update(patch: Partial<LocalTerms>) {
    const next = { ...local, ...patch };
    setLocal(next);
    save(next);
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
          <PortalButton
            variant="primary"
            onClick={() => save(local)}
            disabled={upsert.isPending}
          >
            Save Terms
          </PortalButton>
        )}
      </div>

      {/* Process description */}
      <div className="mb-6">
        <label
          className="mb-1.5 block font-body text-[0.78rem] font-medium text-[var(--text-primary)]"
        >
          Process Description
        </label>
        <textarea
          value={local.processDescription}
          onChange={(e) => update({ processDescription: e.target.value })}
          rows={5}
          className="w-full resize-y rounded-[3px] border border-[var(--border-default)] bg-transparent px-3 py-2.5 font-body text-[0.88rem] leading-relaxed text-[var(--text-primary)] outline-none placeholder:text-[var(--text-muted)]/40 focus:border-[var(--accent-primary)]"
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
              type="number"
              min={0}
              step={25}
              value={local.hourlyRateCents / 100}
              onChange={(e) =>
                update({ hourlyRateCents: Math.round(parseFloat(e.target.value || '0') * 100) })
              }
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
              type="number"
              min={0}
              step={50}
              value={local.minimumFeeCents / 100}
              onChange={(e) =>
                update({ minimumFeeCents: Math.round(parseFloat(e.target.value || '0') * 100) })
              }
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
            onClick={() => update({ approvalRequired: !local.approvalRequired })}
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

      {/* Save indicator */}
      {upsert.isPending && (
        <div className="mt-4 font-body text-[0.72rem] text-[var(--text-muted)]">Saving...</div>
      )}
    </div>
  );
}
