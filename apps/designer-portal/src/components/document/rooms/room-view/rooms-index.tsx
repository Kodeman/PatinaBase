'use client';

/**
 * RoomsIndex — Measured rooms, the Studio room beside Library and People
 * (R107 §1; US-28 S10a, uplift.md (c) area 3; specimens/rooms-{1440,390}.html
 * frame p1). "Is this room measured and drawn yet?"
 *
 * Each job is a Section (`.section`, the S1 block): the client beside the
 * job's 2px stage tick and the stage word in the eyebrow, the job's name as
 * its title (a link to its Document), at most three room Cards, the rest
 * ledger rows, and its own closing --rule-mid. Scans with no Document gather
 * in one last Section. No filled act. Owns RoomShell itself (mirrors
 * LibraryRoom: the room's own top component owns the shell and its count).
 */

import { useMemo } from 'react';
import Link from 'next/link';
import { useRoomRoster } from '@patina/supabase';
import { RoomShell } from '../room-shell';
import { EmptyState } from '../../empty-state';
import { buildRoomRosterEntry } from '@/lib/room-view/roster-from-rows';
import { StrataSweep } from '@/components/ui/strata-sweep';
import { useDocumentSurface } from '@/lib/help-system/use-document-surface';
import { DOCUMENT_SURFACE_KEYS } from '@/lib/help-system/document-surface-keys';
import { useDocumentEngagement } from '@/hooks/use-document-state';
import { RoomCard, RoomRow } from './room-card';
import { groupRoomsByJob, type RoomJobGroup } from './rooms-by-job';

export function RoomsIndex() {
  useDocumentSurface(DOCUMENT_SURFACE_KEYS.rooms);
  const { data, isLoading, isError } = useRoomRoster();

  const entries = useMemo(() => (data ?? []).map(buildRoomRosterEntry), [data]);
  const groups = useMemo(() => groupRoomsByJob(entries), [entries]);
  const ready = !isLoading && !isError;

  return (
    <RoomShell
      title="Measured rooms"
      count={ready ? `${entries.length} scanned room${entries.length === 1 ? '' : 's'}` : undefined}
    >
      <div className="rooms-index mx-auto max-w-[976px] px-4 pb-16 pt-12 sm:px-6">
        {isLoading && (
          <div className="flex items-center justify-center gap-2 py-16">
            <StrataSweep size="sm" label="Loading measured rooms" />
            <span className="eb">Loading measured rooms…</span>
          </div>
        )}

        {isError && (
          <EmptyState eyebrow="Measured rooms">
            The measured rooms could not be loaded. Try again.
          </EmptyState>
        )}

        {ready && entries.length === 0 && (
          <EmptyState eyebrow="Measured rooms">No rooms have been scanned yet.</EmptyState>
        )}

        {ready && groups.map((group) => <RoomsJobSection key={group.key} group={group} />)}
      </div>
    </RoomShell>
  );
}

function RoomsJobSection({ group }: { group: RoomJobGroup }) {
  // The job's name, from the same resolver the Document itself uses. Disabled
  // (never loading) for the unfiled group; the title falls back to "The
  // Document" until the name resolves.
  const resolved = useDocumentEngagement(group.engagementId ?? '');
  const jobTitle =
    resolved.data?.kind === 'engagement' ? (resolved.data.row.title ?? null) : null;
  const titleId = `rooms-job-${group.key}`;

  return (
    <section className="section" aria-labelledby={titleId} data-rooms-job={group.key}>
      <div className="sec-head">
        <p className="eb" id={group.engagementId ? undefined : titleId}>
          <svg className="orn" viewBox="0 0 34 12" aria-hidden="true" focusable="false">
            <path d="M0 2h34M0 6h28M0 10h20" />
          </svg>
          {group.engagementId ? (
            <>
              <span className={group.stageClass ? `tick ${group.stageClass}` : 'tick'}>
                {group.clientName ?? 'Client not named'}
              </span>
              {group.stageWord && <span>{group.stageWord}</span>}
            </>
          ) : (
            <span>Not filed to a job</span>
          )}
        </p>
      </div>

      {group.engagementId && (
        <h2 className="sec-title t-d3" id={titleId}>
          <Link href={`/doc/${group.engagementId}`} className="name rooms-job-name">
            {jobTitle ?? 'The Document'}
          </Link>
        </h2>
      )}

      <div className="cards-wrap">
        <div className="cards">
          {group.cards.map((entry) => (
            <RoomCard key={entry.roomId} entry={entry} />
          ))}
        </div>
      </div>

      {group.rows.length > 0 && (
        <div className="ledger rooms-rows">
          <div className="rows">
            {group.rows.map((entry) => (
              <RoomRow key={entry.roomId} entry={entry} />
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
