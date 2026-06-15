'use client';

/**
 * Task dependency line — Track 5 (the dependency web inside "The work").
 *
 * One task's owner chip + its dependency line, the prototype's `.task-dep`:
 *   · ⊘ blocked by {kind} — "{title}" ({court}'s court)   (an OPEN item gates it)
 *   · ↳ after "{title}" — trade sequencing                (a predecessor task)
 *   · ● ready — nothing blocking                          (free to start)
 *
 * Pure presentation over `isBlocked(task, items, tasks)` — the same read-side
 * truth the ⊘ tick reads. The owner chip mirrors `party.ts`'s court dot grammar
 * (a brand-var dot + the mono court label). When item-blocked, the line is a
 * button that calls `onOpenBlocker(itemId)` so the band opens that blocker's
 * sheet (the prototype's `blockedClick` → `openItem`).
 *
 * Zero shadows (D4): depth is the dot's value contrast + the mono ink color.
 * Mono "ink" literals (#C4836F due-soon/blocked, #7E8F76 dep-ready) are the
 * pre-approved prototype colors already used in item-type.ts / work-block.tsx.
 */

import { isBlocked } from '@/lib/document/coordination-derivation';
import { itemTypeToken } from './item-type';
import { courtToken } from './party';
import type { CoordinationItem, ProjectParty } from '@patina/supabase';
import type { SectionTask } from '@/hooks/use-section-work';

// Prototype literal inks (NOT brand vars — pre-approved, already in-repo):
//   .dep-blocked #c4836f  ·  .dep-ready #7e8f76  ·  .dep-seq uses aged-oak.
const DEP_BLOCKED_INK = '#C4836F';
const DEP_READY_INK = '#7E8F76';

export interface TaskDepLineProps {
  task: SectionTask;
  items: CoordinationItem[];
  tasks: SectionTask[];
  /** Open the blocking item's sheet when the task is item-blocked. */
  onOpenBlocker?: (itemId: string) => void;
}

export function TaskDepLine({ task, items, tasks, onOpenBlocker }: TaskDepLineProps) {
  // A done task carries no dependency line (the prototype hides it once done).
  if (task.status === 'done') return null;

  const blocked = isBlocked(
    task as unknown as Parameters<typeof isBlocked>[0],
    items as unknown as Parameters<typeof isBlocked>[1],
    tasks as unknown as Parameters<typeof isBlocked>[2],
  );

  // ── Item-blocked: ⊘ blocked by {kind} — "{title}" ({court}'s court). The line
  //    is a button → opens that blocker's sheet.
  if (blocked.byItem && blocked.blockingItemId) {
    const blocker = items.find((i) => i.id === blocked.blockingItemId);
    const kindLabel = blocker
      ? itemTypeToken(blocker.coordination_kind).label.toLowerCase()
      : 'an item';
    const courtPhrase =
      blocked.blockingItemCourt === 'designer'
        ? 'your court'
        : `${blocked.blockingItemCourt ? courtToken(blocked.blockingItemCourt).label : 'another'}’s court`;
    const title = blocker?.title ?? 'a pending item';

    return (
      <button
        type="button"
        onClick={() => onOpenBlocker?.(blocked.blockingItemId!)}
        disabled={!onOpenBlocker}
        className="mt-[3px] flex items-center gap-1 text-left text-[10px] leading-snug hover:opacity-80 disabled:cursor-default disabled:hover:opacity-100"
        style={{ color: DEP_BLOCKED_INK }}
      >
        <span aria-hidden>⊘</span>
        <span>
          blocked by {kindLabel} — &ldquo;{title}&rdquo; ({courtPhrase})
        </span>
      </button>
    );
  }

  // ── Sequence-blocked: ↳ after "{title}" — trade sequencing.
  if (blocked.bySeq && blocked.waitingOnTaskId) {
    const pre = tasks.find((t) => t.id === blocked.waitingOnTaskId);
    return (
      <div
        className="mt-[3px] flex items-center gap-1 text-[10px] leading-snug"
        style={{ color: 'var(--color-aged-oak)' }}
      >
        <span aria-hidden>↳</span>
        <span>
          after &ldquo;{(pre?.title ?? 'a prior task').toLowerCase()}&rdquo; — trade sequencing
        </span>
      </div>
    );
  }

  // ── Ready: ● ready — nothing blocking.
  return (
    <div
      className="mt-[3px] flex items-center gap-1 text-[10px] leading-snug"
      style={{ color: DEP_READY_INK }}
    >
      <span aria-hidden>●</span>
      <span>ready — nothing blocking</span>
    </div>
  );
}

/**
 * The task's owner chip — a brand-var court dot + the mono court label, the
 * prototype's `.owner-chip` (`.pd` dot + PARTY[owner].short). A concrete party
 * row (the named GC / vendor) refines the dot/label when supplied, otherwise the
 * generic court token. Pure presentation; no shadow (D4) — the dot is a flat
 * brand-var fill.
 */
export function OwnerChip({
  task,
  parties,
  clientName,
}: {
  task: SectionTask;
  parties?: ProjectParty[];
  clientName?: string;
}) {
  const party =
    task.owner_party_id && parties
      ? parties.find((p) => p.id === task.owner_party_id) ?? null
      : null;
  const base = courtToken(task.owner);

  // Concrete party name (gc/vendor/other), else the real client name for the
  // client court, else the generic court label — mirrors partyFor().
  const label =
    party?.display_name?.trim() ||
    party?.company_name?.trim() ||
    (task.owner === 'client' ? clientName?.trim() : '') ||
    base.label;

  return (
    <span className="mt-px inline-flex flex-shrink-0 items-center gap-1 font-mono text-[8px] uppercase tracking-[0.04em] text-[var(--color-aged-oak)]">
      <span
        aria-hidden
        className="inline-block h-1.5 w-1.5 rounded-full"
        style={{ background: base.dotColor }}
      />
      {label}
    </span>
  );
}
