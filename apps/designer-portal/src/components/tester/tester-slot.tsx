'use client';

/**
 * SQ-856 — where the TESTER mark stands when a dock is on screen. The widget
 * mounts in the root layout, so a fixed pill floated over whatever lay at the
 * bottom-left: Export in the board room, More's rows, the spine's last links.
 * A dock (the Studio Drawer above 1180, the MobileBar below it) prints this
 * empty `display: contents` slot, and the widget portals its mark into it, so
 * the mark takes its place in the dock's own row and covers nothing. The board
 * room, which sheds both docks and covers the page, prints its own `board`
 * slot in its Header line (SQ-865). With no slot laid out, the widget keeps
 * its fixed fallback.
 */

import { useCallback } from 'react';

export type TesterSlotKind = 'drawer' | 'bar' | 'board';

const slots = new Map<TesterSlotKind, HTMLElement>();
const listeners = new Set<() => void>();
let version = 0;

function emit() {
  version += 1;
  listeners.forEach((listener) => listener());
}

export function subscribeTesterSlots(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function testerSlotsVersion() {
  return version;
}

export function testerSlot(kind: TesterSlotKind): HTMLElement | null {
  return slots.get(kind) ?? null;
}

export function TesterSlot({ kind }: { kind: TesterSlotKind }) {
  const ref = useCallback(
    (el: HTMLSpanElement | null) => {
      if (el) slots.set(kind, el);
      else slots.delete(kind);
      emit();
    },
    [kind],
  );
  return <span ref={ref} data-tester-slot={kind} className="contents" />;
}
