'use client';

/**
 * The Rooms Rail — the Speccing table's room lens (Start to Signature W3 3d;
 * Direction B R6, amendment A7). Fills the frame's `rooms-rail` slot.
 *
 * A segmented row at the table head listing the proposal's rooms — the same
 * proposal_scope_rooms the Drafting Room's Rooms facet reads (RoomsInScope →
 * useProposalScopeRooms). Pressing a room takes it in hand; pressing it again,
 * or the plain "All" position, releases it. Exactly one or zero held: the
 * parent owns the held id (controlled `value`/`onChange`), and sibling tools
 * receive it as their roomFilter — a LIFT signal. The rail only REPORTS the
 * hold; it never filters anything itself.
 *
 * This is NOT the project room lens (room-lens-context), which reads a
 * different store and deliberately releases below 1440 (I136-errata: no
 * put-down affordance survives under the narrow spine). This lens persists at
 * ALL widths BY CONSTRUCTION — its subject, the rail itself, is on-screen at
 * every width, so below 1440 the row wraps and scrolls inside its own
 * overflow-x container instead of hiding. A7: no display:none, no width-gated
 * class, no self-release.
 *
 * "Add a room" prints as a scored line at the rail's end — the speccing-table
 * home of the add-room verb (the FF&E section's own add-room, I137, is a
 * different surface) — saving through the Rooms facet's existing creation
 * flow: useAddScopeRoom, then the facet's scopeUpdated('add') analytics event.
 */

import { useState } from 'react';
import { useAddScopeRoom, useProposalScopeRooms } from '@patina/supabase';
import { proposalEvents } from '@/lib/analytics';

interface RailRoom {
  id: string;
  name: string;
}

const SEGMENT =
  'da-score-hover doc-type-control whitespace-nowrap px-1 py-1.5 text-[13px] leading-tight focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-clay)]';

export function RoomsRail({
  proposalId,
  value,
  onChange,
}: {
  proposalId: string;
  value: string | null;
  onChange: (roomId: string | null) => void;
}) {
  const { data: rooms = [], isLoading } = useProposalScopeRooms(proposalId);
  const addRoom = useAddScopeRoom();
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');

  if (isLoading) return null;

  const save = () => {
    const trimmed = name.trim();
    if (!trimmed || addRoom.isPending) return;
    addRoom.mutate(
      { proposalId, name: trimmed },
      {
        onSuccess: () => {
          // The facet's own creation flow ends with this event (RoomsInScope).
          proposalEvents.scopeUpdated({
            proposalId,
            field: 'room',
            action: 'add',
          });
          setName('');
          setAdding(false);
        },
      },
    );
  };

  return (
    <nav
      aria-label="Rooms on the table"
      className="border-b border-[var(--doc-ink-border)] pb-1"
    >
      {/* One scrollable row at every width — the compact form IS the form. */}
      <div className="overflow-x-auto">
        <div className="flex flex-wrap items-baseline gap-x-5 gap-y-1">
          <span
            aria-hidden
            className="font-mono text-[10px] uppercase tracking-[0.1em] text-[var(--color-aged-oak)]"
          >
            Rooms
          </span>

          <button
            type="button"
            aria-pressed={value === null}
            onClick={() => onChange(null)}
            className={`${SEGMENT} ${
              value === null
                ? 'font-semibold text-[var(--color-charcoal)] underline decoration-[var(--color-clay)] underline-offset-4'
                : 'text-[var(--color-quiet-ink)]'
            }`}
          >
            All
          </button>

          {(rooms as RailRoom[]).map((room) => {
            const held = room.id === value;
            return (
              <button
                key={room.id}
                type="button"
                aria-pressed={held}
                onClick={() => onChange(held ? null : room.id)}
                className={`${SEGMENT} ${
                  held
                    ? 'font-semibold text-[var(--color-charcoal)] underline decoration-[var(--color-clay)] underline-offset-4'
                    : 'text-[var(--color-quiet-ink)]'
                }`}
              >
                {room.name}
              </button>
            );
          })}

          {adding ? (
            <span
              className="inline-flex items-baseline gap-2"
              onKeyDown={(e) => {
                if (e.key === 'Escape') {
                  e.stopPropagation();
                  setName('');
                  setAdding(false);
                }
                if (e.key === 'Enter') save();
              }}
            >
              <input
                autoFocus
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                aria-label="Room name"
                placeholder="Room name"
                className="w-36 border-b border-dashed border-[var(--color-pearl)] bg-transparent px-1 py-1 text-[13px] leading-tight text-[var(--color-charcoal)] outline-none placeholder:text-[var(--color-aged-oak)] focus:border-[var(--color-clay)]"
              />
              <button
                type="button"
                onClick={save}
                disabled={addRoom.isPending}
                className={`${SEGMENT} text-[var(--color-charcoal)] disabled:opacity-50`}
              >
                {addRoom.isPending ? 'Adding…' : 'Add'}
              </button>
              <button
                type="button"
                onClick={() => {
                  setName('');
                  setAdding(false);
                }}
                disabled={addRoom.isPending}
                className={`${SEGMENT} text-[var(--color-quiet-ink)] disabled:opacity-50`}
              >
                Cancel
              </button>
            </span>
          ) : (
            <button
              type="button"
              onClick={() => setAdding(true)}
              className={`${SEGMENT} text-[var(--color-quiet-ink)]`}
            >
              + Add a room
            </button>
          )}
        </div>
      </div>
    </nav>
  );
}
