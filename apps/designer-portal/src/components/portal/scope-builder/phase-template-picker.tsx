'use client';

/**
 * Phase Template Picker — Wave 5 of the Proposal Builder upgrade.
 *
 * Modal that lists every phase template the calling designer can apply
 * (5 system templates + any custom templates they've authored).
 * Picking a template appends its phases (with deliverables + default
 * gates) onto the current proposal via the apply_phase_template RPC.
 *
 * The "Apply" action is two-step:
 *   1. Click "Apply" on a card → confirmation pane swaps in.
 *   2. Confirm → mutation fires → on success the modal closes and
 *      onApplied is invoked with the inserted phase IDs.
 */

import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@patina/design-system';
import { Button } from '@/components/ui/controls';
import {
  usePhaseTemplates,
  useApplyPhaseTemplate,
  type PhaseTemplate,
  type PhaseTemplatePhase,
} from '@patina/supabase';

export interface PhaseTemplatePickerProps {
  proposalId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onApplied?: (phaseIds: string[]) => void;
}

function summarizeTemplate(template: PhaseTemplate): string {
  const phases = template.phases ?? [];
  const phaseCount = phases.length;
  const totalWeeks = phases.reduce(
    (sum: number, p: PhaseTemplatePhase) => sum + (p.duration_weeks || 0),
    0
  );
  const deliverableCount = phases.reduce(
    (sum: number, p: PhaseTemplatePhase) => sum + (p.deliverables?.length ?? 0),
    0
  );

  const phasePart = `${phaseCount} ${phaseCount === 1 ? 'phase' : 'phases'}`;
  const weeksPart = `${totalWeeks} ${totalWeeks === 1 ? 'week' : 'weeks'} total`;
  const deliverablesPart = `${deliverableCount} ${deliverableCount === 1 ? 'deliverable' : 'deliverables'}`;

  return `${phasePart} | ${weeksPart} | ${deliverablesPart}`;
}

export function PhaseTemplatePicker({
  proposalId,
  open,
  onOpenChange,
  onApplied,
}: PhaseTemplatePickerProps) {
  const { data: templates = [], isLoading, isError } = usePhaseTemplates();
  const applyMutation = useApplyPhaseTemplate();

  // Two-step picker: when a template is "armed" (clicked once), the
  // primary action becomes a confirmation. Click anywhere else or hit
  // cancel to disarm.
  const [armedSlug, setArmedSlug] = useState<string | null>(null);

  // Keep the armed state in sync with modal open/close.
  function handleOpenChange(next: boolean) {
    if (!next) setArmedSlug(null);
    onOpenChange(next);
  }

  async function handleApply(template: PhaseTemplate) {
    try {
      const phaseIds = await applyMutation.mutateAsync({
        proposalId,
        templateSlug: template.slug,
      });
      setArmedSlug(null);
      onOpenChange(false);
      onApplied?.(phaseIds);
    } catch (err) {
      // Surface the error inline; keep the modal open so the user can retry
      // or pick a different template.
      console.error('apply_phase_template failed', err);
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        className="max-w-2xl"
        onInteractOutside={(e) => {
          // While a mutation is in flight, don't allow accidental dismissal.
          if (applyMutation.isPending) e.preventDefault();
        }}
      >
        <DialogHeader>
          <DialogTitle>Apply phase template</DialogTitle>
          <DialogDescription>
            Pick a template to append its phases (with deliverables and default
            gates) to this proposal. Existing phases will not be replaced.
          </DialogDescription>
        </DialogHeader>

        <div className="flex max-h-[60vh] flex-col gap-3 overflow-y-auto pr-1">
          {isLoading && (
            <p className="py-6 text-center font-body text-[0.85rem] text-[var(--text-muted)]">
              Loading templates...
            </p>
          )}

          {isError && (
            <p className="py-6 text-center font-body text-[0.85rem] text-[var(--text-muted)]">
              Could not load templates. Please try again.
            </p>
          )}

          {!isLoading && !isError && templates.length === 0 && (
            <p className="py-6 text-center font-body text-[0.85rem] text-[var(--text-muted)]">
              No templates available.
            </p>
          )}

          {templates.map((template) => {
            const isArmed = armedSlug === template.slug;
            const phaseCount = template.phases?.length ?? 0;

            return (
              <div
                key={template.id}
                className="rounded-md border border-[var(--border-default)] bg-[var(--bg-surface)] p-4"
                data-testid={`phase-template-card-${template.slug}`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <h3 className="font-display text-[0.95rem] font-semibold text-[var(--text-primary)]">
                        {template.label}
                      </h3>
                      {!template.is_system && (
                        <span
                          className="rounded-[2px] px-1.5 py-0 font-mono text-[0.55rem] uppercase tracking-wider"
                          style={{
                            color: 'var(--text-muted)',
                            backgroundColor:
                              'color-mix(in srgb, var(--text-muted) 8%, transparent)',
                          }}
                        >
                          custom
                        </span>
                      )}
                    </div>
                    {template.description && (
                      <p className="mt-1 font-body text-[0.82rem] text-[var(--text-muted)]">
                        {template.description}
                      </p>
                    )}
                    <p className="mt-2 font-mono text-[0.7rem] uppercase tracking-wider text-[var(--text-muted)]">
                      {summarizeTemplate(template)}
                    </p>
                  </div>

                  <div className="flex shrink-0 flex-col items-end gap-2">
                    {!isArmed && (
                      <Button
                        variant="secondary"
                        onClick={() => setArmedSlug(template.slug)}
                        disabled={applyMutation.isPending}
                      >
                        Apply
                      </Button>
                    )}
                    {isArmed && (
                      <>
                        <Button
                          variant="primary"
                          onClick={() => handleApply(template)}
                          disabled={applyMutation.isPending}
                        >
                          {applyMutation.isPending ? 'Applying...' : 'Confirm'}
                        </Button>
                        <Button
                          variant="ghost"
                          onClick={() => setArmedSlug(null)}
                          disabled={applyMutation.isPending}
                        >
                          Cancel
                        </Button>
                      </>
                    )}
                  </div>
                </div>

                {isArmed && (
                  <p
                    className="mt-3 rounded-[3px] px-3 py-2 font-body text-[0.8rem] text-[var(--text-primary)]"
                    style={{
                      backgroundColor:
                        'color-mix(in srgb, var(--accent-primary) 8%, transparent)',
                    }}
                  >
                    This will append {phaseCount}{' '}
                    {phaseCount === 1 ? 'phase' : 'phases'} to your proposal.
                    Existing phases stay.
                  </p>
                )}
              </div>
            );
          })}
        </div>

        {applyMutation.isError && (
          <p className="font-body text-[0.8rem] text-[var(--text-error,#dc2626)]">
            {(applyMutation.error as Error)?.message ?? 'Failed to apply template.'}
          </p>
        )}
      </DialogContent>
    </Dialog>
  );
}
