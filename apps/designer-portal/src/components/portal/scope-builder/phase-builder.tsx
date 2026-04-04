'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { PortalButton } from '@/components/portal/button';
import {
  useProposalPhases,
  useAddProposalPhase,
  useUpdateProposalPhase,
  useRemoveProposalPhase,
} from '@patina/supabase';

const PHASE_KEY_OPTIONS = [
  { value: 'consultation', label: 'Consultation' },
  { value: 'concept_development', label: 'Concept Development' },
  { value: 'design_refinement', label: 'Design Refinement' },
  { value: 'procurement', label: 'Procurement' },
  { value: 'installation', label: 'Installation' },
  { value: 'final_walkthrough', label: 'Final Walkthrough' },
] as const;

const DEFAULT_PHASES = [
  { name: 'Schematic Design', phaseKey: 'concept_development', durationWeeks: 3, feeCents: 250000, revisionLimit: 2 },
  { name: 'Design Development', phaseKey: 'design_refinement', durationWeeks: 4, feeCents: 350000, revisionLimit: 2 },
  { name: 'Procurement Management', phaseKey: 'procurement', durationWeeks: 8, feeCents: 200000, revisionLimit: 1 },
  { name: 'Installation & Styling', phaseKey: 'installation', durationWeeks: 3, feeCents: 150000, revisionLimit: 1 },
  { name: 'Completion & Handover', phaseKey: 'final_walkthrough', durationWeeks: 1, feeCents: 50000, revisionLimit: 0 },
];

interface PhaseBuilderProps {
  proposalId: string;
}

function formatDollars(cents: number): string {
  return `$${(cents / 100).toLocaleString('en-US', { minimumFractionDigits: 0 })}`;
}

function useDebouncedSave(
  save: (phaseId: string, proposalId: string, updates: Record<string, unknown>) => void,
  delay = 600
) {
  const timers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  return useCallback(
    (phaseId: string, proposalId: string, updates: Record<string, unknown>) => {
      const existing = timers.current.get(phaseId);
      if (existing) clearTimeout(existing);
      timers.current.set(
        phaseId,
        setTimeout(() => {
          save(phaseId, proposalId, updates);
          timers.current.delete(phaseId);
        }, delay)
      );
    },
    [save, delay]
  );
}

export function PhaseBuilder({ proposalId }: PhaseBuilderProps) {
  const { data: phases = [], isLoading } = useProposalPhases(proposalId);
  const addPhase = useAddProposalPhase();
  const updatePhase = useUpdateProposalPhase();
  const removePhase = useRemoveProposalPhase();

  // Local edit state keyed by phase id
  const [edits, setEdits] = useState<Record<string, Record<string, unknown>>>({});

  // Sync server data into local state when phases load
  useEffect(() => {
    if (phases.length > 0) {
      const next: Record<string, Record<string, unknown>> = {};
      for (const p of phases) {
        if (!edits[p.id]) {
          next[p.id] = {
            name: p.name,
            phase_key: p.phase_key,
            duration_weeks: p.duration_weeks,
            fee_cents: p.fee_cents,
            revision_limit: p.revision_limit,
            gate_condition: p.gate_condition,
          };
        } else {
          next[p.id] = edits[p.id];
        }
      }
      setEdits(next);
    }
    // Only re-sync when phases array identity changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phases]);

  const debouncedUpdate = useDebouncedSave(
    useCallback(
      (phaseId: string, propId: string, updates: Record<string, unknown>) => {
        updatePhase.mutate({ phaseId, proposalId: propId, updates });
      },
      [updatePhase]
    )
  );

  function setField(phaseId: string, field: string, value: unknown) {
    setEdits((prev) => ({
      ...prev,
      [phaseId]: { ...prev[phaseId], [field]: value },
    }));
    debouncedUpdate(phaseId, proposalId, { [field]: value });
  }

  function handleAddPhase() {
    addPhase.mutate({
      proposalId,
      name: 'New Phase',
      phaseKey: 'consultation',
      durationWeeks: 2,
      feeCents: 0,
      revisionLimit: 2,
    });
  }

  function handleAddDefaults() {
    DEFAULT_PHASES.forEach((d) => {
      addPhase.mutate({
        proposalId,
        name: d.name,
        phaseKey: d.phaseKey,
        durationWeeks: d.durationWeeks,
        feeCents: d.feeCents,
        revisionLimit: d.revisionLimit,
      });
    });
  }

  const totalFee = phases.reduce(
    (sum: number, p: { fee_cents: number }) => sum + (p.fee_cents || 0),
    0
  );
  const totalWeeks = phases.reduce(
    (sum: number, p: { duration_weeks: number | null }) => sum + (p.duration_weeks || 0),
    0
  );

  if (isLoading) {
    return (
      <div className="py-8 text-center font-body text-[0.82rem] text-[var(--text-muted)]">
        Loading phases...
      </div>
    );
  }

  return (
    <div>
      {/* Header */}
      <div className="mb-4 flex items-center justify-between">
        <span className="type-meta">Project Phases</span>
        <div className="flex gap-2">
          {phases.length === 0 && (
            <PortalButton variant="secondary" onClick={handleAddDefaults}>
              Add Defaults
            </PortalButton>
          )}
          <PortalButton variant="secondary" onClick={handleAddPhase}>
            + Add Phase
          </PortalButton>
        </div>
      </div>

      {/* Column headers */}
      {phases.length > 0 && (
        <div
          className="grid gap-3 border-b border-[var(--border-default)] pb-1.5"
          style={{ gridTemplateColumns: '1fr 120px 80px 120px 80px 1fr 36px' }}
        >
          <span className="type-meta-small">Phase Name</span>
          <span className="type-meta-small">Type</span>
          <span className="type-meta-small text-right">Weeks</span>
          <span className="type-meta-small text-right">Fee</span>
          <span className="type-meta-small text-center">Revisions</span>
          <span className="type-meta-small">Gate Condition</span>
          <span />
        </div>
      )}

      {/* Phase rows */}
      {phases.map((phase: Record<string, unknown>) => {
        const id = phase.id as string;
        const local = edits[id] || {};

        return (
          <div
            key={id}
            className="grid items-center gap-3 border-b py-2"
            style={{
              gridTemplateColumns: '1fr 120px 80px 120px 80px 1fr 36px',
              borderColor: 'rgba(229, 226, 221, 0.4)',
            }}
          >
            {/* Name */}
            <input
              type="text"
              value={(local.name as string) ?? ''}
              onChange={(e) => setField(id, 'name', e.target.value)}
              className="w-full border-b border-transparent bg-transparent font-body text-[0.88rem] text-[var(--text-primary)] outline-none focus:border-[var(--accent-primary)]"
            />

            {/* Phase key select */}
            <select
              value={(local.phase_key as string) ?? ''}
              onChange={(e) => setField(id, 'phase_key', e.target.value)}
              className="w-full cursor-pointer border-b border-transparent bg-transparent font-body text-[0.78rem] text-[var(--text-primary)] outline-none focus:border-[var(--accent-primary)]"
            >
              <option value="">--</option>
              {PHASE_KEY_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>

            {/* Duration weeks */}
            <input
              type="number"
              min={0}
              value={(local.duration_weeks as number) ?? 0}
              onChange={(e) => setField(id, 'duration_weeks', parseInt(e.target.value) || 0)}
              className="w-full border-b border-transparent bg-transparent text-right font-mono text-[0.82rem] text-[var(--text-primary)] outline-none focus:border-[var(--accent-primary)]"
            />

            {/* Fee (shown as dollars, stored as cents) */}
            <div className="flex items-center justify-end gap-0.5">
              <span className="font-mono text-[0.78rem] text-[var(--text-muted)]">$</span>
              <input
                type="number"
                min={0}
                step={100}
                value={((local.fee_cents as number) ?? 0) / 100}
                onChange={(e) =>
                  setField(id, 'fee_cents', Math.round(parseFloat(e.target.value || '0') * 100))
                }
                className="w-full border-b border-transparent bg-transparent text-right font-mono text-[0.82rem] text-[var(--text-primary)] outline-none focus:border-[var(--accent-primary)]"
              />
            </div>

            {/* Revision stepper */}
            <div className="flex items-center justify-center gap-1.5">
              <button
                className="flex h-5 w-5 items-center justify-center rounded-[3px] border border-[var(--border-default)] text-[0.65rem] text-[var(--text-muted)] hover:bg-[var(--bg-hover)]"
                onClick={() =>
                  setField(id, 'revision_limit', Math.max(0, ((local.revision_limit as number) ?? 0) - 1))
                }
              >
                -
              </button>
              <span className="w-4 text-center font-mono text-[0.82rem] text-[var(--text-primary)]">
                {(local.revision_limit as number) ?? 0}
              </span>
              <button
                className="flex h-5 w-5 items-center justify-center rounded-[3px] border border-[var(--border-default)] text-[0.65rem] text-[var(--text-muted)] hover:bg-[var(--bg-hover)]"
                onClick={() =>
                  setField(id, 'revision_limit', ((local.revision_limit as number) ?? 0) + 1)
                }
              >
                +
              </button>
            </div>

            {/* Gate condition */}
            <input
              type="text"
              placeholder="e.g. Client sign-off"
              value={(local.gate_condition as string) ?? ''}
              onChange={(e) => setField(id, 'gate_condition', e.target.value)}
              className="w-full border-b border-transparent bg-transparent font-body text-[0.78rem] text-[var(--text-muted)] outline-none placeholder:text-[var(--text-muted)]/40 focus:border-[var(--accent-primary)] focus:text-[var(--text-primary)]"
            />

            {/* Remove */}
            <button
              className="flex h-6 w-6 items-center justify-center rounded-[3px] text-[0.7rem] text-[var(--text-muted)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
              onClick={() => removePhase.mutate({ phaseId: id, proposalId })}
              title="Remove phase"
            >
              x
            </button>
          </div>
        );
      })}

      {/* Summary */}
      {phases.length > 0 && (
        <div
          className="mt-1 grid items-baseline gap-3 border-t-2 border-[var(--border-default)] pt-3"
          style={{ gridTemplateColumns: '1fr 120px 80px 120px 80px 1fr 36px' }}
        >
          <span className="font-body text-[0.88rem] font-semibold text-[var(--text-primary)]">
            Total
          </span>
          <span />
          <span className="text-right font-mono text-[0.82rem] text-[var(--text-primary)]">
            {totalWeeks}w
          </span>
          <span className="text-right font-display text-[0.95rem] font-semibold text-[var(--text-primary)]">
            {formatDollars(totalFee)}
          </span>
          <span />
          <span />
          <span />
        </div>
      )}

      {/* Empty state */}
      {phases.length === 0 && (
        <div className="py-10 text-center">
          <p className="font-body text-[0.88rem] text-[var(--text-muted)]">
            No phases defined yet.
          </p>
          <p className="mt-1 font-body text-[0.78rem] text-[var(--text-muted)]">
            Add a phase manually or start with the default template.
          </p>
        </div>
      )}
    </div>
  );
}
