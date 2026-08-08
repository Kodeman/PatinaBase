'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useProposal } from '@patina/supabase';
import { useBufferedAutosave } from '@/hooks/use-buffered-autosave';
import {
  useDraftingEstimate,
  useDraftingState,
  useSaveDraftingEstimate,
} from '@/hooks/use-drafting-state';

export type DraftingCommercialStage = 'rom' | 'quote_ready' | 'issued';

export function draftingCommercialStage({
  draftingPercent,
  estimatedHours,
  status,
  commercialState,
}: {
  draftingPercent: number;
  estimatedHours: number | null;
  status: string | null | undefined;
  commercialState: string | null | undefined;
}): DraftingCommercialStage {
  if (status && status !== 'draft') return 'issued';
  if (commercialState && commercialState !== 'draft') return 'issued';
  return draftingPercent >= 100 && estimatedHours !== null
    ? 'quote_ready'
    : 'rom';
}

function parseEstimatedHours(value: string) {
  if (value.trim() === '') return { estimatedHours: null, error: null };
  const estimatedHours = Number(value);
  if (!Number.isFinite(estimatedHours) || estimatedHours <= 0) {
    return {
      estimatedHours: null,
      error: 'Enter hours greater than zero, or leave the estimate blank.',
    };
  }
  return { estimatedHours, error: null };
}

const STAGES: Array<{ id: DraftingCommercialStage; label: string }> = [
  { id: 'rom', label: 'ROM estimate' },
  { id: 'quote_ready', label: 'Quote ready' },
  { id: 'issued', label: 'Issued' },
];

export function DraftingEstimateFlow({ proposalId }: { proposalId: string }) {
  const [open, setOpen] = useState(false);
  const [hoursInput, setHoursInput] = useState('');
  const [editing, setEditing] = useState(false);
  const estimate = useDraftingEstimate(proposalId);
  const drafting = useDraftingState(proposalId);
  const proposal = useProposal(proposalId);
  const { mutateAsync: saveEstimate } = useSaveDraftingEstimate();

  const persist = useCallback(
    async (_key: 'estimate', patch: { estimatedHours: number | null }) => {
      await saveEstimate({ proposalId, estimatedHours: patch.estimatedHours });
    },
    [proposalId, saveEstimate],
  );
  const autosave = useBufferedAutosave<
    'estimate',
    { estimatedHours: number | null }
  >({ proposalId, save: persist, delay: 600 });

  useEffect(() => {
    if (!editing && estimate.data) {
      setHoursInput(
        estimate.data.estimatedHours === null
          ? ''
          : String(estimate.data.estimatedHours),
      );
    }
  }, [editing, estimate.data]);

  useEffect(() => {
    if (autosave.state === 'saved') setEditing(false);
  }, [autosave.state]);

  const parsed = useMemo(() => parseEstimatedHours(hoursInput), [hoursInput]);
  const stage = draftingCommercialStage({
    draftingPercent: drafting.pct,
    estimatedHours: estimate.data?.estimatedHours ?? null,
    status: proposal.data?.status,
    commercialState: proposal.data?.commercial_state,
  });

  const updateHours = (value: string) => {
    setHoursInput(value);
    setEditing(true);
    const next = parseEstimatedHours(value);
    if (!next.error) {
      autosave.queue('estimate', { estimatedHours: next.estimatedHours });
    }
  };

  const saveLabel =
    autosave.state === 'dirty' || autosave.state === 'saving'
      ? 'Saving estimate…'
      : autosave.state === 'saved'
        ? 'Estimate saved'
        : '';

  return (
    <div className="fixed bottom-5 right-5 z-40 flex max-w-[calc(100vw-2.5rem)] flex-col items-end gap-2">
      {open && (
        <aside
          role="dialog"
          aria-label="Estimate to quote"
          className="w-[360px] max-w-full rounded-[7px] border border-[var(--doc-ink-border)] bg-[var(--doc-paper)] p-5 shadow-xl"
        >
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="font-heading text-[1.05rem] text-[var(--color-charcoal)]">
                Estimate to quote
              </p>
              <p className="doc-type-meta mt-1 uppercase tracking-[0.08em] text-[var(--color-aged-oak)]">
                Uses the existing proposal lifecycle
              </p>
            </div>
            <button
              type="button"
              aria-label="Close estimate to quote"
              onClick={() => setOpen(false)}
              className="min-h-11 min-w-11 font-mono text-sm text-[var(--color-quiet-ink)]"
            >
              ×
            </button>
          </div>

          <ol className="mt-4 grid grid-cols-3 gap-2" aria-label="Commercial progress">
            {STAGES.map((item, index) => {
              const current = item.id === stage;
              const reached = STAGES.findIndex((entry) => entry.id === stage) >= index;
              return (
                <li
                  key={item.id}
                  data-current={current ? 'true' : 'false'}
                  className="border-t-2 pt-2 font-mono text-[0.58rem] uppercase tracking-[0.06em]"
                  style={{
                    borderColor: reached
                      ? 'var(--color-clay)'
                      : 'var(--doc-ink-border)',
                    color: current
                      ? 'var(--color-charcoal)'
                      : 'var(--color-quiet-ink)',
                  }}
                >
                  {item.label}
                </li>
              );
            })}
          </ol>

          <label className="mt-5 block">
            <span className="doc-type-meta mb-1.5 block uppercase tracking-[0.08em]">
              Estimated design hours
            </span>
            <div className="flex items-center gap-2 border-b border-[var(--doc-ink-border)] pb-1">
              <input
                type="number"
                min="0.25"
                step="0.25"
                inputMode="decimal"
                value={hoursInput}
                disabled={estimate.isLoading}
                onChange={(event) => updateHours(event.target.value)}
                onBlur={() => {
                  if (!parsed.error) void autosave.flush('estimate');
                }}
                className="min-w-0 flex-1 bg-transparent font-heading text-[1.35rem] text-[var(--color-charcoal)] outline-none"
                aria-describedby="drafting-estimate-help drafting-estimate-status"
              />
              <span className="doc-type-meta uppercase">hours</span>
            </div>
          </label>

          <p
            id="drafting-estimate-help"
            className="doc-type-body mt-2 text-[var(--color-quiet-ink)]"
          >
            The draft remains a ROM until every proposal facet is complete and
            this estimate is saved. Issuing continues through the existing
            client document flow.
          </p>
          <div id="drafting-estimate-status" className="mt-2 min-h-5" aria-live="polite">
            {parsed.error ? (
              <p role="alert" className="text-xs text-[var(--color-terracotta)]">
                {parsed.error}
              </p>
            ) : autosave.state === 'error' ? (
              <p role="alert" className="text-xs text-[var(--color-terracotta)]">
                {autosave.error ?? 'The time estimate could not be saved.'}
              </p>
            ) : (
              <p className="font-mono text-[0.6rem] uppercase tracking-[0.06em] text-[var(--color-aged-oak)]">
                {saveLabel}
              </p>
            )}
          </div>
        </aside>
      )}

      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className="rounded-full border border-[var(--color-clay)] bg-[var(--doc-paper)] px-4 py-3 font-mono text-[0.65rem] uppercase tracking-[0.08em] text-[var(--color-charcoal)] shadow-lg"
      >
        Estimate · {STAGES.find((item) => item.id === stage)?.label}
      </button>
    </div>
  );
}
