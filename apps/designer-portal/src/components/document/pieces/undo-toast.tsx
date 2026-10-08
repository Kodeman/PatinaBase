"use client";

/**
 * US-21 T-24 — the undo toast (SPEC §2.6, a8, a15; D8).
 *
 * `Removed Rattan lounge chair ×2 from Sunroom.` · `UNDO` · `10 S`. It sits as
 * the body's last row, never fixed, and never takes focus: the next line is
 * still being typed. It counts down once a second and calls `onExpire` at 0.
 * Remount it (a new `key`) for each removal to restart the count.
 */
import { useEffect, useRef, useState } from "react";

export const UNDO_SECONDS = 10;

export function removedSentence(
  name: string,
  quantity: number,
  roomName?: string | null,
): string {
  return roomName
    ? `Removed ${name} ×${quantity} from ${roomName}.`
    : `Removed ${name} ×${quantity}.`;
}

export interface UndoToastProps {
  name: string;
  quantity: number;
  /** Omitted on the phone, where the head already names the room (a15). */
  roomName?: string | null;
  onUndo: () => void;
  onExpire: () => void;
  seconds?: number;
}

export function UndoToast({
  name,
  quantity,
  roomName,
  onUndo,
  onExpire,
  seconds = UNDO_SECONDS,
}: UndoToastProps) {
  const [left, setLeft] = useState(seconds);
  const onExpireRef = useRef(onExpire);
  onExpireRef.current = onExpire;

  useEffect(() => {
    const timer = window.setInterval(
      () => setLeft((s) => Math.max(0, s - 1)),
      1000,
    );
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (left === 0) onExpireRef.current();
  }, [left]);

  return (
    <div
      role="status"
      data-undo-toast
      className="flex w-full max-w-[560px] items-center gap-6 rounded-[3px] bg-[var(--sheet-toast)] px-4 py-3 font-sans text-[14px] leading-[1.5] text-[var(--sheet-toast-ink)]"
    >
      <span className="min-w-0 flex-1">
        {removedSentence(name, quantity, roomName)}
      </span>
      <button
        type="button"
        onClick={onUndo}
        className="act inline-flex min-h-[44px] min-w-[44px] items-center justify-center font-mono text-[12px] font-medium uppercase tracking-[0.06em] text-[var(--sheet-toast-ink)] underline decoration-1 underline-offset-4 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-clay-ink)]"
      >
        Undo
      </button>
      <span className="font-mono text-[11px] tabular-nums" aria-hidden="true">
        {left} S
      </span>
    </div>
  );
}
