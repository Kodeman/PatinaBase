'use client';

/**
 * RevisionLedger — the schedule's own append-only history at the spine's foot
 * (C6 · R100 "Memory", Slice 05). Prototype: the Ledger slide's `.rev` rows
 * ("v1 · Cut with the signature · Jul 8 · Client"). "A designer who shows her
 * schedule's history is a designer a client trusts with the next date."
 *
 * A quiet typographic disclosure: a mono "Revisions · N" line that unfolds to
 * the numbered ledger — one DM-mono row per `schedule_revisions` entry, newest
 * first (the query's order), reading `v{n} · {reason} · {who} · {when}`. `who`
 * is "you" when the actor is the signed-in designer, a short id otherwise, and
 * omitted when the row carries no actor. It renders `useScheduleRevisions`
 * verbatim — no edit, no delete, no reorder; the ledger is append-only by
 * construction (00323/00326: RPC-only writes, no UPDATE/DELETE policies). It
 * fires nothing.
 *
 * Renders only when revisions exist (nothing until a baseline is cut). Mounted
 * inside the gated ScheduleSpine, so it is studio-only by construction — the
 * client never sees it. Zero shadows (D4); depth is the pearl hairlines + ink
 * weight.
 */

import { useState } from 'react';
import { useScheduleRevisions } from '@patina/supabase';
import { useAuth } from '@/hooks/use-auth';
import { fmtDay } from '@/lib/document/format';

export interface RevisionLedgerProps {
  projectId: string;
}

/** The boring, honest fallback name for a non-you actor — the uid's head. */
function shortActor(actorId: string): string {
  return actorId.slice(0, 8);
}

export function RevisionLedger({ projectId }: RevisionLedgerProps) {
  const { data: revisions } = useScheduleRevisions(projectId);
  const { user } = useAuth();
  const myId = user?.id ?? null;
  const [open, setOpen] = useState(false);

  if (!revisions || revisions.length === 0) return null;

  return (
    <section aria-label="Schedule revision history" className="mt-8">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="font-mono text-[9px] uppercase tracking-[0.08em] text-[var(--color-aged-oak)] hover:text-[var(--color-charcoal)]"
      >
        {open ? '– ' : '+ '}Revisions · {revisions.length}
      </button>

      {open && (
        <div className="mt-3 border-t border-[var(--color-pearl)]">
          {revisions.map((r) => {
            const who = r.actor == null ? null : r.actor === myId ? 'you' : shortActor(r.actor);
            const reason = r.reason ?? 'Schedule revised';
            return (
              <div
                key={r.id}
                className="border-b border-[var(--color-pearl)] py-1.5 font-mono text-[0.62rem] leading-relaxed text-[var(--color-mocha)]"
              >
                <span className="font-medium text-[var(--color-charcoal)]">v{r.v}</span>
                {' · '}
                {reason}
                {who ? (
                  <>
                    {' · '}
                    <span className="text-[var(--color-aged-oak)]">{who}</span>
                  </>
                ) : null}
                {' · '}
                <span className="text-[var(--color-aged-oak)]">{fmtDay(r.cut_at)}</span>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
