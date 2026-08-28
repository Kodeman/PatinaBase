'use client';

/**
 * Nurture (R52 / Track C) — the touchpoint queue, ranked by dormancy + trust via
 * `deriveNurtureQueue` over the whole directory. Two bands, exactly as the
 * prototype: "Reconnect now" (the due band — terracotta) and "Warm · keep
 * tending". "Reach out" composes a touchpoint (reusing `useCreateTouchpoint`);
 * a client row's directory `person_id` IS its `designer_client_id`. Non-client
 * ties (makers/GCs) surface to keep them warm but resolve via "Open".
 */

import { useMemo, useState } from 'react';
import { usePeopleDirectory } from '@patina/supabase';
import { deriveNurtureQueue, type NurtureEntry } from '@/lib/document/people-derivation';
import { ViewHeader, EmptyTeach } from '../view-shell';
import { NurtureQueueRow } from '../ops/nurture-queue';
import { TouchpointSheet } from '../ops/touchpoint-sheet';
import type { PeopleViewProps } from '../types';

export function NurtureView({ openPerson, notify }: PeopleViewProps) {
  // studio visibility ≠ shared nurture queues — a relationship-action surface;
  // the widened (00420) STUDIO roster stays explicitly mine here.
  const { data, isLoading } = usePeopleDirectory({ role: 'all', scope: 'mine' });
  const now = useMemo(() => new Date(), []);
  const [compose, setCompose] = useState<NurtureEntry | null>(null);

  const { due, warm } = useMemo(() => {
    const queue = deriveNurtureQueue(data ?? [], now);
    return {
      due: queue.filter((e) => e.due),
      warm: queue.filter((e) => !e.due),
    };
  }, [data, now]);

  const empty = !isLoading && due.length === 0 && warm.length === 0;

  return (
    <>
      <ViewHeader
        title="Nurture"
        sub="The relationships that need tending — surfaced by the Engine, so no one drifts away unnoticed."
      />

      {isLoading ? (
        <p className="px-1 py-6 text-[0.76rem] text-[var(--color-aged-oak)]">
          Reading who needs tending…
        </p>
      ) : empty ? (
        <EmptyTeach>
          Every relationship is current — nothing to tend. The Engine surfaces someone here the
          moment a tie begins to drift.
        </EmptyTeach>
      ) : (
        <>
          {due.length > 0 && (
            <>
              <div className="mb-2 mt-1 font-mono text-[11px] font-semibold uppercase tracking-[0.1em] text-[var(--color-terracotta-ink)]">
                Reconnect now · {due.length}
              </div>
              {due.map((entry) => (
                <NurtureQueueRow
                  key={`${entry.person.role}:${entry.person.person_id}`}
                  entry={entry}
                  onReachOut={() => setCompose(entry)}
                  onOpen={() => openPerson(entry.person.person_id, entry.person.role)}
                />
              ))}
            </>
          )}

          {warm.length > 0 && (
            <>
              <div className="mb-2 mt-5 font-mono text-[11px] font-semibold uppercase tracking-[0.1em] text-[var(--color-aged-oak)]">
                Warm · keep tending
              </div>
              {warm.map((entry) => (
                <NurtureQueueRow
                  key={`${entry.person.role}:${entry.person.person_id}`}
                  entry={entry}
                  onReachOut={() => setCompose(entry)}
                  onOpen={() => openPerson(entry.person.person_id, entry.person.role)}
                />
              ))}
            </>
          )}
        </>
      )}

      <TouchpointSheet
        open={!!compose}
        designerClientId={compose?.person.role === 'client' ? compose.person.person_id : null}
        clientName={compose?.person.display_name ?? ''}
        defaultReason={compose?.reason}
        onClose={() => setCompose(null)}
        onScheduled={(message) => notify(message)}
      />
    </>
  );
}
