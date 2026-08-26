'use client';

/**
 * ProposalMilestonesEditor — the "Anchored milestones" mini-list for one
 * proposal phase (Slice 03 §5, R101.3). A proposal milestone is ALWAYS a hard
 * date the client signs against — proposal_schedule_milestones has no
 * offset-from-phase-end branch (unlike the project-side schedule_milestones),
 * so the date field accepts ONLY the anchor grammar; a typed duration is
 * rejected with the proposal-specific reason instead of the field's generic
 * "wrong kind" text.
 *
 * D4-typographic, no modal: a flat list (name · kind · date · remove) plus an
 * inline add row reusing the Document's ONE grammar field
 * (ScheduleEntryField) so a proposal milestone reads like its project-side
 * sibling everywhere the grammar shows up. ScheduleEntryField holds its own
 * uncontrolled text internally with no reset hook of its own (by design — it
 * is a direct-commit capture, not a bound editor) — bumping its `key` after a
 * successful add remounts it blank for the next capture, the same reset
 * mechanism GhostAddLine's resetSignal achieves for a richer field.
 */

import { useState } from 'react';
import {
  useProposalScheduleMilestones,
  useAddProposalScheduleMilestone,
  useRemoveProposalScheduleMilestone,
  type ProposalScheduleMilestone,
} from '@patina/supabase';
import type { MilestoneKind } from '@patina/utils';
import { ScheduleEntryField } from '@/components/document/schedule/schedule-entry-field';
import { fmtDay } from '@/lib/document/format';
import { scheduleEvents } from '@/lib/analytics/schedule-events';

const KINDS: Array<{ key: MilestoneKind; label: string }> = [
  { key: 'signoff', label: 'Sign-off' },
  { key: 'decision', label: 'Decision' },
  { key: 'delivery', label: 'Delivery' },
  { key: 'event', label: 'Event' },
];

export interface ProposalMilestonesEditorProps {
  phaseId: string;
  proposalId: string;
  /** Injected clock 'YYYY-MM-DD' — feeds the date field's year inference. */
  today: string;
}

export function ProposalMilestonesEditor({ phaseId, proposalId, today }: ProposalMilestonesEditorProps) {
  const { data: allMilestones = [] } = useProposalScheduleMilestones(proposalId) as {
    data: ProposalScheduleMilestone[];
  };
  const milestones = allMilestones.filter((m) => m.phase_id === phaseId);

  const addMilestone = useAddProposalScheduleMilestone();
  const removeMilestone = useRemoveProposalScheduleMilestone();

  const [name, setName] = useState('');
  const [kind, setKind] = useState<MilestoneKind>('event');
  const [nameError, setNameError] = useState<string | null>(null);
  // Bumped on a successful add — remounts the date field blank (see header note).
  const [fieldKey, setFieldKey] = useState(0);

  const commit = (date: string) => {
    const trimmed = name.trim();
    if (!trimmed) {
      setNameError('name the milestone');
      return;
    }
    addMilestone.mutate(
      { proposalId, phaseId, name: trimmed, kind, anchorDate: date },
      {
        onSuccess: () => {
          scheduleEvents.scheduleAnchorSet({
            surface: 'proposal',
            proposal_id: proposalId,
            target: 'milestone',
            set: true,
          });
          setName('');
          setKind('event');
          setFieldKey((k) => k + 1);
        },
      },
    );
  };

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <span className="type-meta-small">Anchored milestones</span>
      </div>

      {milestones.length > 0 && (
        <ul className="mb-3">
          {milestones
            .slice()
            .sort((a, b) => (a.anchor_date < b.anchor_date ? -1 : a.anchor_date > b.anchor_date ? 1 : 0))
            .map((m) => (
              <li
                key={m.id}
                className="flex items-baseline justify-between gap-3 border-b py-1.5"
                style={{ borderColor: 'rgba(229, 226, 221, 0.4)' }}
              >
                <span className="min-w-0 flex-1 truncate font-body text-[0.82rem] text-[var(--text-primary)]">
                  {m.name}
                </span>
                <span className="flex-none font-mono text-[0.6rem] uppercase tracking-[0.06em] text-[var(--color-clay-ink)]">
                  {KINDS.find((k) => k.key === m.kind)?.label ?? m.kind} · {fmtDay(m.anchor_date)}
                </span>
                <button
                  type="button"
                  onClick={() => removeMilestone.mutate({ milestoneId: m.id, proposalId })}
                  disabled={removeMilestone.isPending}
                  aria-label={`Remove milestone ${m.name}`}
                  className="flex-none font-mono text-[0.6rem] uppercase tracking-[0.06em] text-[var(--text-muted)] hover:text-[var(--color-terracotta-ink)] disabled:opacity-50"
                >
                  ×
                </button>
              </li>
            ))}
        </ul>
      )}

      {milestones.length === 0 && (
        <p className="mb-2 font-body text-[0.78rem] text-[var(--text-muted)]">
          No anchored milestones on this phase yet.
        </p>
      )}

      <div className="flex flex-wrap items-center gap-[0.5rem]">
        <input
          type="text"
          aria-label="Milestone name"
          value={name}
          placeholder="Milestone name…"
          disabled={addMilestone.isPending}
          onChange={(e) => {
            setName(e.target.value);
            if (nameError) setNameError(null);
          }}
          className="min-w-[160px] flex-1 border-b border-[var(--color-pearl)] bg-transparent pb-[2px] font-heading text-[0.9rem] text-[var(--color-charcoal)] placeholder:italic placeholder:text-[var(--text-muted)] focus:border-[var(--color-clay)] focus:outline-none disabled:opacity-50"
        />

        <div className="flex flex-wrap gap-[0.3rem]">
          {KINDS.map((k) => {
            const selected = k.key === kind;
            return (
              <button
                key={k.key}
                type="button"
                aria-pressed={selected}
                onClick={() => setKind(k.key)}
                className={`rounded-[3px] border px-[0.4rem] py-[0.15rem] font-mono text-[0.56rem] uppercase tracking-[0.06em] ${
                  selected
                    ? 'border-[var(--color-charcoal)] text-[var(--color-charcoal)]'
                    : 'border-[var(--color-pearl)] text-[var(--color-aged-oak)]'
                }`}
              >
                {k.label}
              </button>
            );
          })}
        </div>

        <ScheduleEntryField
          key={fieldKey}
          aria-label="Milestone date"
          today={today}
          accept={['anchor']}
          wrongKindReason="proposals carry anchored dates only"
          autoFocus={false}
          placeholder="Sep 21"
          onCommit={(e) => e.kind === 'anchor' && commit(e.date)}
          className="min-w-[140px]"
        />
      </div>

      {nameError && (
        <p className="mt-[0.35rem] font-mono text-[0.58rem] uppercase tracking-[0.06em] text-[var(--color-terracotta-ink)]">
          {nameError}
        </p>
      )}
      {addMilestone.isError && (
        <p className="mt-[0.35rem] font-mono text-[0.58rem] uppercase tracking-[0.06em] text-[var(--color-terracotta-ink)]">
          Add failed — nothing was saved
        </p>
      )}
    </div>
  );
}
