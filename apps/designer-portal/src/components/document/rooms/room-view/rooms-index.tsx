'use client';

/**
 * RoomsIndex — The Rooms, the third Studio room beside Library and People
 * (R107 §1, prototype scene 01). Every scanned room across every client, one
 * roster; each card is a lens into its Document, nothing copied. Owns
 * RoomShell itself (mirrors LibraryRoom/library-room.tsx — the room's own top
 * component owns the shell + its count line, not the page).
 */

import { useMemo } from 'react';
import { useRoomRoster } from '@patina/supabase';
import { RoomShell } from '../room-shell';
import { buildRoomRosterEntry } from '@/lib/room-view/roster-from-rows';
import { RoomCard } from './room-card';
import { StrataSweep } from '@/components/ui/strata-sweep';
import { useDocumentSurface } from '@/lib/help-system/use-document-surface';
import { DOCUMENT_SURFACE_KEYS } from '@/lib/help-system/document-surface-keys';

export function RoomsIndex() {
  useDocumentSurface(DOCUMENT_SURFACE_KEYS.rooms);
  const { data, isLoading, isError } = useRoomRoster();

  const entries = useMemo(() => (data ?? []).map(buildRoomRosterEntry), [data]);
  const ready = !isLoading && !isError;

  return (
    <RoomShell
      title="Measured rooms"
      count={ready ? `${entries.length} scanned room${entries.length === 1 ? '' : 's'}` : undefined}
    >
      <div className="mx-auto max-w-[1180px] px-6 pb-16 pt-8 sm:px-9">
        {isLoading && (
          <div className="flex items-center justify-center gap-2 py-16">
            <StrataSweep size="sm" label="Loading room surveys" />
            <span className="font-mono text-[11px] uppercase tracking-[0.08em] text-[var(--color-aged-oak)] opacity-60">
              Loading room surveys…
            </span>
          </div>
        )}

        {isError && (
          <p className="py-16 text-center text-[13px] italic text-[var(--text-muted)]">
            Room surveys could not be loaded. Try again.
          </p>
        )}

        {ready && entries.length === 0 && (
          <p className="py-16 text-center font-heading text-[15px] italic text-[var(--text-muted)]">
            No room surveys have been uploaded yet.
          </p>
        )}

        {ready && entries.length > 0 && (
          <div className="grid grid-cols-1 gap-5 min-[900px]:grid-cols-2">
            {entries.map((entry) => (
              <RoomCard key={entry.roomId} entry={entry} />
            ))}
          </div>
        )}
      </div>
    </RoomShell>
  );
}
