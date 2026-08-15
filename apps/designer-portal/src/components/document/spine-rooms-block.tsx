'use client';

/**
 * Rooms — the spine's list of the project's rooms, each with the one word its
 * FF&E lines currently justify, and each a handle for taking that room in hand.
 *
 * Taking a room in hand LIFTS it: what belongs to it moves to the top of every
 * list that has a room dimension, on the paper and on the open shelf at once,
 * washed in clay. Nothing hides — which is why the room keeps its state word
 * while held; the "In hand" tag is added to the line, never swapped in.
 */

export interface SpineRoom {
  id: string;
  name: string;
  stateWord: string;
}

export function SpineRoomsBlock({
  rooms,
  heldRoomId,
  onToggleRoom,
}: {
  rooms: readonly SpineRoom[];
  heldRoomId: string | null;
  onToggleRoom: (roomId: string) => void;
}) {
  if (rooms.length === 0) return null;

  return (
    <div className="mt-4 border-t border-[var(--color-pearl)] pt-3">
      <p
        id="doc-spine-rooms-label"
        className="mb-2 font-mono text-[10px] uppercase tracking-[0.1em] text-[var(--color-aged-oak)]"
      >
        Rooms
      </p>
      <div role="group" aria-labelledby="doc-spine-rooms-label">
        {rooms.map((room) => {
          const held = room.id === heldRoomId;
          return (
            <button
              key={room.id}
              type="button"
              aria-pressed={held}
              onClick={() => onToggleRoom(room.id)}
              className={`-mx-1.5 flex w-[calc(100%+0.75rem)] items-baseline justify-between gap-2 px-1.5 py-1.5 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-clay)] ${
                held
                  ? 'doc-room-lifted'
                  : 'border-b border-[rgba(44,41,38,0.10)]'
              }`}
            >
              <span
                className={`text-[13px] leading-tight ${
                  held
                    ? 'font-semibold text-[var(--color-charcoal)]'
                    : 'text-[var(--color-charcoal)]'
                }`}
              >
                {room.name}
              </span>
              <span
                className={`whitespace-nowrap font-mono text-[10px] uppercase tracking-[0.05em] ${
                  held
                    ? 'text-[var(--color-charcoal)]'
                    : 'text-[var(--color-aged-oak)]'
                }`}
              >
                {held && (
                  <span className="text-[var(--color-charcoal)]">In hand · </span>
                )}
                {room.stateWord}
              </span>
            </button>
          );
        })}
      </div>
      <p className="mt-2 font-mono text-[10px] uppercase tracking-[0.08em] text-[var(--color-aged-oak)]">
        Take a room in hand · nothing hides
      </p>
    </div>
  );
}
