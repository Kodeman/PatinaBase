'use client';

/**
 * NurtureQueueRow (Track C) — the prototype's `.queue-row`: a small avatar, the
 * name + role badge, the "why this surfaced" line (terracotta when due), and the
 * action — "Reach out" for a client (composes a touchpoint), "Open" for everyone
 * else (touchpoints are a client relationship). Reuses the shared person-bits.
 */

import { Avatar, RoleBadge } from '../person-bits';
import type { NurtureEntry } from '@/lib/document/people-derivation';

export function NurtureQueueRow({
  entry,
  onReachOut,
  onOpen,
}: {
  entry: NurtureEntry;
  /** Compose a touchpoint — clients only (carry a designer_client_id). */
  onReachOut: () => void;
  onOpen: () => void;
}) {
  const { person, due, reason } = entry;
  const isClient = person.role === 'client';

  return (
    <div className="mb-1.5 flex items-center gap-3.5 rounded-[10px] border border-[var(--color-pearl)] bg-white px-3.5 py-3">
      <Avatar name={person.display_name} role={person.role} size={36} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-[0.84rem] font-semibold text-[var(--color-charcoal)]">
            {person.display_name}
          </span>
          <RoleBadge role={person.role} />
        </div>
        <div
          className={`mt-[0.1rem] text-[0.68rem] ${
            due ? 'font-medium text-[var(--color-terracotta)]' : 'text-[var(--color-aged-oak)]'
          }`}
        >
          {reason}
        </div>
      </div>
      {isClient ? (
        <button
          type="button"
          onClick={onReachOut}
          className="shrink-0 rounded-[6px] border border-[var(--color-clay)] bg-[var(--color-clay)] px-3 py-1.5 font-mono text-[0.46rem] font-semibold uppercase tracking-[0.06em] text-white transition-opacity hover:opacity-90"
        >
          Reach out
        </button>
      ) : (
        <button
          type="button"
          onClick={onOpen}
          className="shrink-0 rounded-[6px] border border-[var(--color-pearl)] px-3 py-1.5 font-mono text-[0.46rem] font-semibold uppercase tracking-[0.06em] text-[var(--color-charcoal)] transition-colors hover:border-[var(--color-clay)]"
        >
          Open
        </button>
      )}
    </div>
  );
}
