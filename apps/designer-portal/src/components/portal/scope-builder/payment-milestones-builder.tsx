'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { PortalButton } from '@/components/portal/button';
import {
  useProposalPaymentMilestones,
  useAddPaymentMilestone,
  useUpdatePaymentMilestone,
  useRemovePaymentMilestone,
} from '@patina/supabase';

interface PaymentMilestonesBuilderProps {
  proposalId: string;
  totalCents: number;
}

function formatDollars(cents: number): string {
  return `$${(cents / 100).toLocaleString('en-US', { minimumFractionDigits: 0 })}`;
}

// Palette for the percentage bar segments
const SEGMENT_COLORS = [
  'var(--color-sage)',
  'var(--accent-primary)',
  'var(--color-terracotta)',
  'var(--text-muted)',
  'var(--color-slate)',
  'var(--color-clay)',
];

export function PaymentMilestonesBuilder({ proposalId, totalCents }: PaymentMilestonesBuilderProps) {
  const { data: milestones = [], isLoading } = useProposalPaymentMilestones(proposalId);
  const addMilestone = useAddPaymentMilestone();
  const updateMilestone = useUpdatePaymentMilestone();
  const removeMilestone = useRemovePaymentMilestone();

  // Local edit state
  const [edits, setEdits] = useState<Record<string, Record<string, unknown>>>({});

  useEffect(() => {
    if (milestones.length > 0) {
      const next: Record<string, Record<string, unknown>> = {};
      for (const m of milestones) {
        if (!edits[m.id]) {
          next[m.id] = {
            label: m.label,
            percentage: m.percentage,
            amount_cents: m.amount_cents,
            trigger_condition: m.trigger_condition,
          };
        } else {
          next[m.id] = edits[m.id];
        }
      }
      setEdits(next);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [milestones]);

  // Debounced save
  const timers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const debouncedSave = useCallback(
    (milestoneId: string, updates: Record<string, unknown>) => {
      const existing = timers.current.get(milestoneId);
      if (existing) clearTimeout(existing);
      timers.current.set(
        milestoneId,
        setTimeout(() => {
          updateMilestone.mutate({ milestoneId, proposalId, updates });
          timers.current.delete(milestoneId);
        }, 600)
      );
    },
    [updateMilestone, proposalId]
  );

  function setField(milestoneId: string, field: string, value: unknown) {
    setEdits((prev) => ({
      ...prev,
      [milestoneId]: { ...prev[milestoneId], [field]: value },
    }));
    debouncedSave(milestoneId, { [field]: value });
  }

  function handlePercentageChange(milestoneId: string, pct: number) {
    const clamped = Math.min(100, Math.max(0, pct));
    const amountCents = Math.round((totalCents * clamped) / 100);
    setEdits((prev) => ({
      ...prev,
      [milestoneId]: { ...prev[milestoneId], percentage: clamped, amount_cents: amountCents },
    }));
    debouncedSave(milestoneId, { percentage: clamped, amount_cents: amountCents });
  }

  function handleAdd() {
    addMilestone.mutate({
      proposalId,
      label: 'New Milestone',
      percentage: 0,
      amountCents: 0,
    });
  }

  const totalPercentage = milestones.reduce(
    (sum: number, m: { percentage: number }) => sum + (m.percentage || 0),
    0
  );
  const totalAllocated = milestones.reduce(
    (sum: number, m: { amount_cents: number }) => sum + (m.amount_cents || 0),
    0
  );
  const isBalanced = totalPercentage === 100;

  if (isLoading) {
    return (
      <div className="py-8 text-center font-body text-[0.82rem] text-[var(--text-muted)]">
        Loading milestones...
      </div>
    );
  }

  return (
    <div>
      {/* Header */}
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="type-meta">Payment Milestones</span>
          {milestones.length > 0 && (
            <span
              className="font-mono text-[0.68rem]"
              style={{
                color: isBalanced ? 'var(--color-sage)' : 'var(--color-terracotta)',
              }}
            >
              {totalPercentage}% allocated
            </span>
          )}
        </div>
        <PortalButton variant="secondary" onClick={handleAdd}>
          + Add Milestone
        </PortalButton>
      </div>

      {/* Percentage bar */}
      {milestones.length > 0 && (
        <div className="mb-4">
          <div
            className="flex h-2 overflow-hidden rounded-full"
            style={{ backgroundColor: 'rgba(229, 226, 221, 0.3)' }}
          >
            {milestones.map((m: { id: string; percentage: number; label: string }, i: number) => {
              const pct = edits[m.id]?.percentage as number ?? m.percentage ?? 0;
              if (pct <= 0) return null;
              return (
                <div
                  key={m.id}
                  className="transition-all"
                  style={{
                    width: `${pct}%`,
                    backgroundColor: SEGMENT_COLORS[i % SEGMENT_COLORS.length],
                    transitionDuration: 'var(--duration-fast)',
                  }}
                  title={`${m.label}: ${pct}%`}
                />
              );
            })}
          </div>

          {/* Segment labels */}
          <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1">
            {milestones.map((m: { id: string; label: string }, i: number) => (
              <div key={m.id} className="flex items-center gap-1.5">
                <span
                  className="inline-block h-1.5 w-1.5 rounded-full"
                  style={{ backgroundColor: SEGMENT_COLORS[i % SEGMENT_COLORS.length] }}
                />
                <span className="font-body text-[0.68rem] text-[var(--text-muted)]">
                  {(edits[m.id]?.label as string) ?? m.label}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Column headers */}
      {milestones.length > 0 && (
        <div
          className="grid gap-3 border-b border-[var(--border-default)] pb-1.5"
          style={{ gridTemplateColumns: '1fr 80px 100px 1fr 36px' }}
        >
          <span className="type-meta-small">Label</span>
          <span className="type-meta-small text-right">%</span>
          <span className="type-meta-small text-right">Amount</span>
          <span className="type-meta-small">Trigger</span>
          <span />
        </div>
      )}

      {/* Milestone rows */}
      {milestones.map(
        (m: {
          id: string;
          label: string;
          percentage: number;
          amount_cents: number;
          trigger_condition: string | null;
        }) => {
          const local = edits[m.id] || {};
          const pct = (local.percentage as number) ?? m.percentage ?? 0;
          const amt = Math.round((totalCents * pct) / 100);

          return (
            <div
              key={m.id}
              className="grid items-center gap-3 border-b py-2"
              style={{
                gridTemplateColumns: '1fr 80px 100px 1fr 36px',
                borderColor: 'rgba(229, 226, 221, 0.4)',
              }}
            >
              {/* Label */}
              <input
                type="text"
                value={(local.label as string) ?? m.label}
                onChange={(e) => setField(m.id, 'label', e.target.value)}
                className="w-full border-b border-transparent bg-transparent font-body text-[0.88rem] text-[var(--text-primary)] outline-none focus:border-[var(--accent-primary)]"
              />

              {/* Percentage */}
              <div className="flex items-center justify-end gap-0.5">
                <input
                  type="number"
                  min={0}
                  max={100}
                  value={pct}
                  onChange={(e) =>
                    handlePercentageChange(m.id, parseInt(e.target.value) || 0)
                  }
                  className="w-full border-b border-transparent bg-transparent text-right font-mono text-[0.82rem] text-[var(--text-primary)] outline-none focus:border-[var(--accent-primary)]"
                />
                <span className="font-mono text-[0.72rem] text-[var(--text-muted)]">%</span>
              </div>

              {/* Amount (auto-calculated) */}
              <span className="text-right font-display text-[0.88rem] text-[var(--text-muted)]">
                {formatDollars(amt)}
              </span>

              {/* Trigger condition */}
              <input
                type="text"
                placeholder="e.g. Upon contract signing"
                value={(local.trigger_condition as string) ?? m.trigger_condition ?? ''}
                onChange={(e) => setField(m.id, 'trigger_condition', e.target.value)}
                className="w-full border-b border-transparent bg-transparent font-body text-[0.78rem] text-[var(--text-muted)] outline-none placeholder:text-[var(--text-muted)]/40 focus:border-[var(--accent-primary)] focus:text-[var(--text-primary)]"
              />

              {/* Remove */}
              <button
                className="flex h-6 w-6 items-center justify-center rounded-[3px] text-[0.7rem] text-[var(--text-muted)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
                onClick={() => removeMilestone.mutate({ milestoneId: m.id, proposalId })}
                title="Remove milestone"
              >
                x
              </button>
            </div>
          );
        }
      )}

      {/* Totals */}
      {milestones.length > 0 && (
        <div
          className="mt-1 grid items-baseline gap-3 border-t-2 border-[var(--border-default)] pt-3"
          style={{ gridTemplateColumns: '1fr 80px 100px 1fr 36px' }}
        >
          <span className="font-body text-[0.88rem] font-semibold text-[var(--text-primary)]">
            Total
          </span>
          <span
            className="text-right font-mono text-[0.82rem] font-semibold"
            style={{
              color: isBalanced ? 'var(--color-sage)' : 'var(--color-terracotta)',
            }}
          >
            {totalPercentage}%
          </span>
          <span className="text-right font-display text-[0.95rem] font-semibold text-[var(--text-primary)]">
            {formatDollars(totalAllocated)}
          </span>
          <span />
          <span />
        </div>
      )}

      {/* Empty state */}
      {milestones.length === 0 && (
        <div className="py-10 text-center">
          <p className="font-body text-[0.88rem] text-[var(--text-muted)]">
            No payment milestones defined.
          </p>
          <p className="mt-1 font-body text-[0.78rem] text-[var(--text-muted)]">
            Split the project fee across milestones tied to deliverables.
          </p>
        </div>
      )}
    </div>
  );
}
