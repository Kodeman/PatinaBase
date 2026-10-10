"use client";

/**
 * US-21 T-24 — `Move to room…` (SPEC a9; S6, Q8).
 *
 * The visible act for keyboard, touch and locked lines; drag is the extra
 * gesture (T-26). The line's own room reads `· HERE` and choosing it changes
 * nothing. Arrows, Home and End move; Enter or a tap chooses; Esc goes back.
 */
import { useEffect, useRef, type KeyboardEvent } from "react";
import { menuKeyIndex } from "@/lib/document/pieces/rough-in-keys";

export interface MoveRoom {
  id: string;
  name: string;
}

export interface MoveToRoomMenuProps {
  rooms: MoveRoom[];
  currentRoomId: string;
  onChoose: (roomId: string) => void;
  /** Esc: back to the row menu. */
  onClose: () => void;
}

export function MoveToRoomMenu({
  rooms,
  currentRoomId,
  onChoose,
  onClose,
}: MoveToRoomMenuProps) {
  const itemRefs = useRef<Array<HTMLButtonElement | null>>([]);

  useEffect(() => {
    const first = rooms.findIndex((room) => room.id !== currentRoomId);
    itemRefs.current[first >= 0 ? first : 0]?.focus();
  }, [rooms, currentRoomId]);

  function onKeyDown(event: KeyboardEvent<HTMLUListElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      onClose();
      return;
    }
    const index = itemRefs.current.findIndex(
      (item) => item === document.activeElement,
    );
    const next = menuKeyIndex(event.key, index, rooms.length);
    if (next === null) return;
    event.preventDefault();
    itemRefs.current[next]?.focus();
  }

  return (
    <ul
      role="menu"
      aria-label="Move to room"
      onKeyDown={onKeyDown}
      className="mt-1 border-t border-[var(--sheet-rule)] py-1 pl-3"
    >
      {rooms.map((room, i) => {
        const here = room.id === currentRoomId;
        return (
          <li role="none" key={room.id}>
            <button
              ref={(el) => {
                itemRefs.current[i] = el;
              }}
              type="button"
              role="menuitem"
              aria-current={here ? "location" : undefined}
              onClick={() => (here ? onClose() : onChoose(room.id))}
              className="flex min-h-[44px] w-full items-center gap-2 px-3 text-left font-sans text-[14px] text-[var(--sheet-ink)] hover:bg-[var(--sheet-row-hover)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[var(--color-clay-ink)]"
            >
              {room.name}
              {here ? (
                <span className="font-mono text-[11px] uppercase text-[var(--sheet-ink-faint)]">
                  · Here
                </span>
              ) : null}
            </button>
          </li>
        );
      })}
    </ul>
  );
}
