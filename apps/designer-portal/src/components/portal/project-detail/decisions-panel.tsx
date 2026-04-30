'use client';

import { useMemo, useState } from 'react';
import { useDecisionsByProject, useSendDecisionReminder } from '@patina/supabase';
import { DecisionComposerModal } from './decision-composer-modal';
import { deadlineVariant } from '@/lib/decision-deadline';

interface DecisionsPanelProps {
  projectId: string;
  designerClientId: string;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyDecision = any;

export function DecisionsPanel({ projectId, designerClientId }: DecisionsPanelProps) {
  const { data: rawDecisions, isLoading } = useDecisionsByProject(projectId);
  const sendReminder = useSendDecisionReminder();
  const [composerOpen, setComposerOpen] = useState(false);

  const decisions = (Array.isArray(rawDecisions) ? rawDecisions : []) as AnyDecision[];
  const open = useMemo(
    () => decisions.filter((d) => d.status === 'pending' || d.status === 'draft' || d.status === 'open'),
    [decisions]
  );
  const closed = useMemo(
    () => decisions.filter((d) => d.status === 'responded' || d.status === 'decided'),
    [decisions]
  );

  return (
    <div className="my-8">
      <div className="mb-4 flex items-baseline justify-between">
        <h3 className="type-section-head" style={{ fontSize: '1.15rem' }}>
          Decisions
        </h3>
        <button
          type="button"
          onClick={() => setComposerOpen(true)}
          className="rounded-[3px] border bg-transparent px-3 py-1.5 text-[0.8rem]"
          style={{ borderColor: 'var(--border-default)', fontFamily: 'var(--font-body)' }}
        >
          + New decision
        </button>
      </div>

      {isLoading ? (
        <p className="type-body italic text-[var(--text-muted)]">Loading decisions…</p>
      ) : decisions.length === 0 ? (
        <div
          className="rounded-md border-2 border-dashed py-8 text-center"
          style={{ borderColor: 'var(--border-default)' }}
        >
          <p className="type-body text-[0.85rem] text-[var(--text-muted)]">
            No decisions yet. Create one to surface a question and 2–4 options for your client.
          </p>
        </div>
      ) : (
        <>
          {open.length > 0 && (
            <div className="mb-4">
              <div className="mb-2 type-meta-small uppercase tracking-wider">Open</div>
              <div className="flex flex-col gap-2">
                {open.map((d) => {
                  const variant = deadlineVariant(d.due_date, d.status);
                  return (
                    <div
                      key={d.id}
                      className="rounded-md border p-3"
                      style={{ borderColor: 'var(--border-default)' }}
                    >
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="type-label flex-1 truncate">{d.title}</span>
                        <span
                          className="type-meta-small uppercase tracking-wider"
                          style={{ color: variant.color }}
                        >
                          {variant.label}
                        </span>
                      </div>
                      {d.description && (
                        <p className="type-body mt-1 line-clamp-2 text-[0.78rem] text-[var(--text-muted)]">
                          {d.description}
                        </p>
                      )}
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        <span className="type-meta-small uppercase tracking-wider text-[var(--text-muted)]">
                          {d.decision_type}
                          {d.blocking_status === 'blocks_procurement' && ' · blocks procurement'}
                          {d.blocking_status === 'blocks_phase' && ' · blocks phase'}
                        </span>
                        <span className="ml-auto flex gap-2">
                          <button
                            type="button"
                            onClick={() =>
                              sendReminder.mutate({ decisionId: d.id })
                            }
                            className="text-[0.7rem] text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                          >
                            Send reminder
                          </button>
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {closed.length > 0 && (
            <div>
              <div className="mb-2 type-meta-small uppercase tracking-wider">Decided</div>
              <div className="flex flex-col gap-1">
                {closed.slice(0, 5).map((d) => (
                  <div
                    key={d.id}
                    className="flex items-baseline justify-between border-b py-1.5"
                    style={{ borderColor: 'var(--border-subtle)' }}
                  >
                    <span className="type-body text-[0.82rem] text-[var(--text-muted)]">{d.title}</span>
                    <span className="type-meta-small text-[var(--color-sage, #A8B5A0)]">✓ Decided</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {composerOpen && (
        <DecisionComposerModal
          projectId={projectId}
          designerClientId={designerClientId}
          onClose={() => setComposerOpen(false)}
        />
      )}
    </div>
  );
}
