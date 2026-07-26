'use client';

/**
 * The work — the dependency web (Track 5, project coordination).
 *
 * The same quiet block work-block.tsx renders (deliverables as checkable lines
 * in the paper's grammar: a square tick that fills sage — a stamp, not a SaaS
 * checkbox), here in its coordination-aware form: each task carries an OWNER
 * chip (party.ts court token) and a DEPENDENCY line (task-dep-line.tsx) derived
 * from the live coordination items + the trade-sequence web. Resolve a blocker
 * (in the band) and the downstream task comes unblocked — nothing is stored on
 * the task; isBlocked() recomputes from the items query (the cascade, 00218).
 *
 * MIRRORS work-block.tsx's grammar (read it): same bordered Work block, same
 * tick-as-stamp, same "+ Task" affordance. It does NOT replace work-block — it's
 * the project-section sibling that adds the owner chip + dependency web. A
 * blocked tick is a not-allowed ⊘ that, on click, opens the blocking item's
 * sheet via onOpenBlocker (the band wires it). Zero shadows (D4): depth is the
 * 1px pearl edge + the tick's value contrast + the dot's brand fill.
 */

import { useMemo, useState } from 'react';
import { fmtDay } from '@/lib/document/format';
import {
  useSectionTasks,
  useToggleSectionTask,
  useCreateSectionTask,
} from '@/hooks/use-section-work';
import { useProjectParties } from '@patina/supabase';
import { isBlocked } from '@/lib/document/coordination-derivation';
import type { CoordinationItem } from '@patina/supabase';
import type { SectionTask } from '@/hooks/use-section-work';
import { OwnerChip, TaskDepLine } from './task-dep-line';
import { DocumentAction } from '../document-action';

const todayYmd = () => new Date().toISOString().slice(0, 10);

export interface CoordinationWorkProps {
  projectId: string;
  /** All coordination items (for isBlocked() blocker lookup + opening blockers). */
  items: CoordinationItem[];
  /** Optional: clicking a ⊘ blocked tick opens that blocker's sheet (band wires it). */
  onOpenItem?: (id: string) => void;
}

export function CoordinationWork({
  projectId,
  items,
  onOpenItem,
}: CoordinationWorkProps) {
  const { data: tasks } = useSectionTasks(projectId);
  const { data: parties } = useProjectParties(projectId);
  const toggleTask = useToggleSectionTask(projectId);
  const createTask = useCreateSectionTask(projectId);

  const [capturing, setCapturing] = useState(false);
  const [title, setTitle] = useState('');

  // The project section's tasks — the dependency web lives in the project
  // section (the prototype's "The work" with the owner + blocked-by columns).
  const sectionTasks = useMemo(
    () => (tasks ?? []).filter((t) => t.section_key === 'project'),
    [tasks],
  );
  // isBlocked() reads against ALL tasks (sequence predecessors may live in any
  // section) + all coordination items.
  const allTasks = tasks ?? [];

  const doneN = sectionTasks.filter((t) => t.status === 'done').length;
  const total = sectionTasks.length;

  const save = () => {
    const trimmed = title.trim();
    if (!trimmed) return;
    createTask.mutate({
      title: trimmed,
      sectionKey: 'project',
      dueDate: null,
      estimateMinutes: null,
    });
    setTitle('');
    setCapturing(false);
  };

  // Empty state stays one quiet line — the block earns its space (work-block.tsx).
  if (sectionTasks.length === 0 && !capturing) {
    return (
      <div className="mb-1 mt-4 flex items-baseline gap-4">
        <span className="font-mono text-[9px] uppercase tracking-[0.08em] text-[var(--text-muted)]">
          The work
        </span>
        <span className="font-mono text-[9px] uppercase tracking-[0.05em] text-[var(--color-aged-oak)]">
          the dependency web
        </span>
        <DocumentAction
          actionKey="open-task-capture"
          surfaceKey="coordination"
          regionKey="work-block"
          variant="secondary"
          onClick={() => setCapturing(true)}
        >
          Add task
        </DocumentAction>
      </div>
    );
  }

  return (
    <div className="mb-2 mt-4 rounded-[6px] border border-[var(--color-pearl)] bg-[rgba(252,250,246,0.7)]">
      <div className="flex items-baseline justify-between border-b border-[var(--color-pearl)] px-3 py-1.5">
        <span className="font-mono text-[9px] font-semibold uppercase tracking-[0.1em] text-[var(--text-muted)]">
          The work{total > 0 ? ` · ${doneN} of ${total} done` : ''}
        </span>
        <span className="font-mono text-[9px] uppercase tracking-[0.05em] text-[var(--text-muted)]">
          the dependency web
        </span>
      </div>

      <ul className="px-1.5">
        {sectionTasks.map((t) => {
          const done = t.status === 'done';
          const blocked = isBlocked(
            t as unknown as Parameters<typeof isBlocked>[0],
            items as unknown as Parameters<typeof isBlocked>[1],
            allTasks as unknown as Parameters<typeof isBlocked>[2],
          );
          const isBlockedTick = !done && blocked.any;
          const overdue = !done && t.due_date && t.due_date <= todayYmd();

          // The tick's behavior mirrors the prototype: a done/blocked tick does
          // NOT toggle — a blocked tick opens its blocker; a free tick toggles.
          const onTick = () => {
            if (done) {
              toggleTask.mutate(t); // allow un-ticking a done task
              return;
            }
            if (blocked.byItem && blocked.blockingItemId) {
              onOpenItem?.(blocked.blockingItemId);
              return;
            }
            if (blocked.bySeq) return; // sequence-blocked: not actionable here
            toggleTask.mutate(t);
          };

          return (
            <li
              key={t.id}
              className="border-b border-dashed border-[var(--color-pearl)] last:border-b-0"
            >
              <div className="grid w-full grid-cols-[auto_1fr_auto] items-start gap-2.5 px-1 py-1.5">
                {/* The tick is a stamp, not a SaaS checkbox (work-block.tsx):
                    sage-wash + ✓ when done; a terracotta ⊘ (not-allowed) when
                    blocked; an empty square edge otherwise. */}
                <button
                  type="button"
                  onClick={onTick}
                  aria-label={
                    done
                      ? `Mark "${t.title}" not done`
                      : isBlockedTick
                        ? `"${t.title}" is blocked`
                        : `Mark "${t.title}" done`
                  }
                  className={`relative top-px inline-flex h-[13px] w-[13px] items-center justify-center rounded-[3px] border-[1.5px] text-[8px] font-bold leading-none ${
                    isBlockedTick ? 'cursor-not-allowed' : ''
                  }`}
                  style={{
                    borderColor: done
                      ? 'var(--color-sage)'
                      : isBlockedTick
                        ? 'rgba(212,160,144,0.55)'
                        : 'var(--doc-ink-border)',
                    background: done
                      ? 'rgba(168,181,160,0.15)'
                      : isBlockedTick
                        ? 'rgba(212,160,144,0.08)'
                        : 'transparent',
                    color: done
                      ? 'var(--color-sage)'
                      : 'var(--color-terracotta)',
                  }}
                >
                  {done ? '✓' : isBlockedTick ? '⊘' : ''}
                </button>

                <span className="min-w-0">
                  <span
                    className={`block text-[12px] leading-snug ${
                      done
                        ? 'text-[var(--text-muted)] line-through decoration-[rgba(139,115,85,0.4)]'
                        : isBlockedTick
                          ? 'text-[var(--color-aged-oak)]'
                          : 'text-[var(--color-charcoal)]'
                    }`}
                  >
                    {t.title}
                  </span>
                  <TaskDepLine
                    task={t}
                    items={items}
                    tasks={allTasks}
                    onOpenBlocker={onOpenItem}
                  />
                </span>

                <span className="flex flex-col items-end gap-0.5">
                  <OwnerChip task={t} parties={parties} />
                  {(done || t.due_date) && (
                    <span
                      className="whitespace-nowrap font-mono text-[9px] uppercase tracking-[0.05em]"
                      style={{
                        color: overdue ? '#C4836F' : 'var(--text-muted)',
                      }}
                    >
                      {done
                        ? t.completed_at
                          ? `done · ${fmtDay(t.completed_at)}`
                          : 'done'
                        : t.due_date
                          ? `due ${fmtDay(t.due_date)}`
                          : ''}
                    </span>
                  )}
                </span>
              </div>
            </li>
          );
        })}
      </ul>

      {capturing ? (
        <div
          className="flex items-center gap-2 border-t border-dashed border-[var(--color-pearl)] px-1 py-1.5"
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              e.stopPropagation();
              setCapturing(false);
            }
            if (e.key === 'Enter') save();
          }}
        >
          <span
            aria-hidden
            className="inline-block h-[11px] w-[11px] border border-dashed"
            style={{ borderColor: 'var(--doc-ink-border)' }}
          />
          <input
            autoFocus
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="What needs doing"
            className="min-w-0 flex-1 bg-transparent text-[12px] text-[var(--color-charcoal)] outline-none placeholder:italic placeholder:text-[var(--text-muted)]"
          />
          <DocumentAction
            actionKey="add-task"
            surfaceKey="coordination"
            regionKey="task-capture"
            variant="primary"
            onClick={save}
            disabled={!title.trim()}
          >
            Add
          </DocumentAction>
        </div>
      ) : (
        <div className="flex items-baseline px-1 py-1.5">
          <DocumentAction
            actionKey="open-task-capture"
            surfaceKey="coordination"
            regionKey="work-block"
            variant="secondary"
            onClick={() => setCapturing(true)}
          >
            Add task
          </DocumentAction>
        </div>
      )}
    </div>
  );
}
