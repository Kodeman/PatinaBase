'use client';

import { useState } from 'react';
import { PortalButton } from '@/components/portal/button';
import {
  usePhaseGates,
  useAddGate,
  useUpdateGate,
  useRemoveGate,
  useSatisfyGate,
  useDesignerOverrideGate,
  type PhaseGate,
  type PhaseGateKind,
} from '@patina/supabase';

const GATE_KIND_OPTIONS: Array<{ value: PhaseGateKind; label: string; description: string }> = [
  {
    value: 'client_signature',
    label: 'Client signature',
    description: 'Client must sign a named artifact (e.g. "Concept presentation")',
  },
  {
    value: 'deliverables_complete',
    label: 'Deliverables complete',
    description: 'All required deliverables in this phase must be marked complete',
  },
  {
    value: 'payment_received',
    label: 'Payment received',
    description: 'A specific payment milestone must be paid',
  },
  {
    value: 'prior_phase_signed',
    label: 'Prior phase signed',
    description: 'A specific earlier phase must be fully signed off',
  },
];

const GATE_KIND_LABEL: Record<PhaseGateKind, string> = {
  client_signature: 'Client signature',
  deliverables_complete: 'Deliverables complete',
  payment_received: 'Payment received',
  designer_override: 'Designer override',
  prior_phase_signed: 'Prior phase signed',
};

export interface ProposalPhaseLite {
  id: string;
  name: string;
  sort_order: number;
}

export interface PaymentMilestoneLite {
  id: string;
  label: string;
  amount_cents: number;
  percentage: number;
}

interface GateConditionsEditorProps {
  phaseId: string;
  allPhases: ProposalPhaseLite[];
  milestones: PaymentMilestoneLite[];
}

function formatDollars(cents: number): string {
  return `$${(cents / 100).toLocaleString('en-US', { minimumFractionDigits: 0 })}`;
}

function GatePayloadEditor({
  gate,
  phaseId,
  allPhases,
  milestones,
  onUpdate,
}: {
  gate: PhaseGate;
  phaseId: string;
  allPhases: ProposalPhaseLite[];
  milestones: PaymentMilestoneLite[];
  onUpdate: (payload: Record<string, unknown>) => void;
}) {
  switch (gate.gate_kind) {
    case 'client_signature': {
      const artifactLabel = (gate.payload?.artifact_label as string) ?? '';
      return (
        <div className="flex flex-col gap-1">
          <label className="font-mono text-[0.6rem] uppercase tracking-wider text-[var(--text-muted)]">
            Artifact label
          </label>
          <input
            type="text"
            value={artifactLabel}
            onChange={(e) => onUpdate({ ...gate.payload, artifact_label: e.target.value })}
            placeholder="e.g. Concept presentation"
            className="border-b border-transparent bg-transparent font-body text-[0.85rem] text-[var(--text-primary)] outline-none focus:border-[var(--accent-primary)]"
          />
        </div>
      );
    }

    case 'deliverables_complete': {
      const legacyText = gate.payload?.legacy_text as string | undefined;
      return (
        <div className="font-body text-[0.78rem] text-[var(--text-muted)]">
          All required deliverables in this phase must be complete.
          {legacyText && (
            <p className="mt-1 italic">
              <span className="font-mono text-[0.6rem] uppercase tracking-wider not-italic">
                Legacy:
              </span>{' '}
              {legacyText}
            </p>
          )}
        </div>
      );
    }

    case 'payment_received': {
      const milestoneId = (gate.payload?.milestone_id as string) ?? '';
      return (
        <div className="flex flex-col gap-1">
          <label className="font-mono text-[0.6rem] uppercase tracking-wider text-[var(--text-muted)]">
            Payment milestone
          </label>
          <select
            value={milestoneId}
            onChange={(e) =>
              onUpdate({ ...gate.payload, milestone_id: e.target.value || null })
            }
            className="cursor-pointer border-b border-transparent bg-transparent font-body text-[0.82rem] text-[var(--text-primary)] outline-none focus:border-[var(--accent-primary)]"
          >
            <option value="">-- Select a milestone --</option>
            {milestones.map((m) => (
              <option key={m.id} value={m.id}>
                {m.label} — {m.percentage}% ({formatDollars(m.amount_cents)})
              </option>
            ))}
          </select>
          {milestones.length === 0 && (
            <p className="font-body text-[0.7rem] italic text-[var(--text-muted)]">
              No payment milestones defined yet — add one in the Payment Milestones section.
            </p>
          )}
        </div>
      );
    }

    case 'prior_phase_signed': {
      const priorPhaseId = (gate.payload?.phase_id as string) ?? '';
      const eligible = allPhases.filter((p) => p.id !== phaseId);
      return (
        <div className="flex flex-col gap-1">
          <label className="font-mono text-[0.6rem] uppercase tracking-wider text-[var(--text-muted)]">
            Earlier phase
          </label>
          <select
            value={priorPhaseId}
            onChange={(e) =>
              onUpdate({ ...gate.payload, phase_id: e.target.value || null })
            }
            className="cursor-pointer border-b border-transparent bg-transparent font-body text-[0.82rem] text-[var(--text-primary)] outline-none focus:border-[var(--accent-primary)]"
          >
            <option value="">-- Select an earlier phase --</option>
            {eligible.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>
      );
    }

    case 'designer_override': {
      const reason = gate.override_reason ?? '';
      const ts = gate.satisfied_at
        ? new Date(gate.satisfied_at).toLocaleString()
        : 'Not satisfied';
      return (
        <div className="font-body text-[0.78rem] text-[var(--text-muted)]">
          <p>
            <span className="font-mono text-[0.6rem] uppercase tracking-wider">Reason:</span>{' '}
            {reason || '—'}
          </p>
          <p>
            <span className="font-mono text-[0.6rem] uppercase tracking-wider">Granted:</span>{' '}
            {ts}
          </p>
        </div>
      );
    }
  }
}

export function GateConditionsEditor({
  phaseId,
  allPhases,
  milestones,
}: GateConditionsEditorProps) {
  const { data: gates = [], isLoading } = usePhaseGates(phaseId);
  const addGate = useAddGate();
  const updateGate = useUpdateGate();
  const removeGate = useRemoveGate();
  const satisfyGate = useSatisfyGate();
  const designerOverride = useDesignerOverrideGate();

  const [pickerOpen, setPickerOpen] = useState(false);
  const [overrideOpen, setOverrideOpen] = useState(false);
  const [overrideReason, setOverrideReason] = useState('');

  function handlePickKind(kind: PhaseGateKind) {
    addGate.mutate(
      { phaseId, gateKind: kind, payload: {} },
      { onSuccess: () => setPickerOpen(false) }
    );
  }

  function handleOverrideSubmit() {
    const reason = overrideReason.trim();
    if (!reason) return;
    designerOverride.mutate(
      { phaseId, reason },
      {
        onSuccess: () => {
          setOverrideOpen(false);
          setOverrideReason('');
        },
      }
    );
  }

  if (isLoading) {
    return (
      <div className="py-4 text-center font-body text-[0.78rem] text-[var(--text-muted)]">
        Loading gates...
      </div>
    );
  }

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <span className="type-meta-small">Gate conditions</span>
        <span className="font-mono text-[0.6rem] uppercase tracking-wider text-[var(--text-muted)]">
          {gates.filter((g: PhaseGate) => g.satisfied_at !== null).length}/{gates.length} satisfied
        </span>
      </div>

      {gates.map((gate: PhaseGate) => {
        const isSatisfied = gate.satisfied_at !== null;
        const isLegacy =
          gate.gate_kind === 'deliverables_complete' &&
          typeof gate.payload?.legacy_text === 'string' &&
          (gate.payload.legacy_text as string).length > 0;

        return (
          <div
            key={gate.id}
            className="border-b py-3"
            style={{ borderColor: 'rgba(229, 226, 221, 0.4)' }}
          >
            <div className="mb-1.5 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span
                  className="rounded-[2px] px-1.5 py-0.5 font-mono text-[0.6rem] uppercase tracking-wider"
                  style={{
                    color: isSatisfied
                      ? 'var(--patina-sage, var(--text-muted))'
                      : 'var(--text-muted)',
                    backgroundColor: isSatisfied
                      ? 'color-mix(in srgb, var(--patina-sage, currentColor) 12%, transparent)'
                      : 'color-mix(in srgb, var(--text-muted) 8%, transparent)',
                  }}
                >
                  {GATE_KIND_LABEL[gate.gate_kind]}
                </span>
                {isLegacy && (
                  <span
                    className="rounded-[2px] px-1.5 py-0.5 font-mono text-[0.55rem] uppercase tracking-wider"
                    style={{
                      color: 'var(--text-muted)',
                      backgroundColor:
                        'color-mix(in srgb, var(--text-muted) 8%, transparent)',
                    }}
                  >
                    legacy
                  </span>
                )}
                {isSatisfied && (
                  <span className="font-mono text-[0.6rem] uppercase tracking-wider text-[var(--patina-sage,var(--text-muted))]">
                    ✓ Satisfied
                  </span>
                )}
              </div>

              <div className="flex gap-1.5">
                {!isSatisfied && gate.gate_kind !== 'designer_override' && (
                  <PortalButton
                    variant="ghost"
                    onClick={() => satisfyGate.mutate({ gateId: gate.id, phaseId })}
                    className="!px-2 !py-0.5 !text-[0.7rem]"
                  >
                    Mark satisfied
                  </PortalButton>
                )}
                <button
                  type="button"
                  onClick={() => removeGate.mutate({ gateId: gate.id, phaseId })}
                  className="rounded-[3px] px-1.5 py-0.5 text-[0.7rem] text-[var(--text-muted)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
                  title="Remove gate"
                  aria-label="Remove gate"
                >
                  x
                </button>
              </div>
            </div>

            <GatePayloadEditor
              gate={gate}
              phaseId={phaseId}
              allPhases={allPhases}
              milestones={milestones}
              onUpdate={(payload) =>
                updateGate.mutate({ gateId: gate.id, phaseId, updates: { payload } })
              }
            />
          </div>
        );
      })}

      {gates.length === 0 && (
        <p className="py-3 font-body text-[0.78rem] text-[var(--text-muted)]">
          No gates configured. Phases without gates remain pending until at least one
          gate is added.
        </p>
      )}

      {/* Add gate */}
      <div className="mt-2 flex flex-wrap items-center gap-2">
        {!pickerOpen ? (
          <PortalButton
            variant="ghost"
            onClick={() => setPickerOpen(true)}
            className="!px-2 !py-1"
          >
            + Add gate
          </PortalButton>
        ) : (
          <div className="flex flex-wrap items-center gap-2 rounded-md border border-dashed border-[var(--accent-primary)] p-2">
            <span className="font-mono text-[0.6rem] uppercase tracking-wider text-[var(--text-muted)]">
              Choose gate kind:
            </span>
            {GATE_KIND_OPTIONS.map((opt) => (
              <PortalButton
                key={opt.value}
                variant="secondary"
                onClick={() => handlePickKind(opt.value)}
                disabled={addGate.isPending}
                className="!px-2 !py-1 !text-[0.7rem]"
              >
                {opt.label}
              </PortalButton>
            ))}
            <PortalButton
              variant="ghost"
              onClick={() => setPickerOpen(false)}
              className="!px-2 !py-1 !text-[0.7rem]"
            >
              Cancel
            </PortalButton>
          </div>
        )}

        {!overrideOpen ? (
          <PortalButton
            variant="ghost"
            onClick={() => setOverrideOpen(true)}
            className="!px-2 !py-1 !text-[var(--patina-terracotta,var(--text-muted))]"
          >
            Designer override
          </PortalButton>
        ) : (
          <div className="flex w-full items-center gap-2 rounded-md border border-dashed border-[var(--patina-terracotta,var(--accent-primary))] p-2">
            <input
              type="text"
              autoFocus
              value={overrideReason}
              onChange={(e) => setOverrideReason(e.target.value)}
              placeholder="Reason for override (visible to client)..."
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleOverrideSubmit();
                }
                if (e.key === 'Escape') {
                  setOverrideOpen(false);
                  setOverrideReason('');
                }
              }}
              className="flex-1 border-b border-transparent bg-transparent font-body text-[0.85rem] text-[var(--text-primary)] outline-none focus:border-[var(--accent-primary)]"
            />
            <PortalButton
              variant="primary"
              onClick={handleOverrideSubmit}
              disabled={!overrideReason.trim() || designerOverride.isPending}
              className="!px-2 !py-1 !text-[0.7rem]"
            >
              Override
            </PortalButton>
            <PortalButton
              variant="ghost"
              onClick={() => {
                setOverrideOpen(false);
                setOverrideReason('');
              }}
              className="!px-2 !py-1 !text-[0.7rem]"
            >
              Cancel
            </PortalButton>
          </div>
        )}
      </div>
    </div>
  );
}
