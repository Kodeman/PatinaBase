'use client';

import { useEffect, useRef } from 'react';
import { useCommandPalette } from '@/contexts/command-palette-context';
import { isEditableTarget } from './use-inbox-keyboard';

// ─────────────────────────────────────────────────────────────────────────────
// Keyboard-first navigation for the Fulfillment Queue (S1, spec §5.1).
//
//   j / ArrowDown  → next row         k / ArrowUp → prev row
//   Enter          → open Workbench   n → open the note drawer
//   x              → exception stub (toasts "Exception desk lands in S7")
//
// CLONE of use-inbox-keyboard.ts, not a generalization over it — the two
// surfaces have different action sets and will keep drifting independently
// (S1 brief). isEditableTarget is imported (not re-duplicated) since it's a
// pure, surface-agnostic DOM predicate.
//
// Guards (bail without acting): a modifier is held (meta/ctrl/alt); the event
// target is an input/textarea/select/[contenteditable]; the command palette is
// open; or the queue is suspended (the note drawer owns the keyboard while
// open). The pure key→action mapping is split into resolveQueueAction so it
// can be unit-tested without a DOM.
// ─────────────────────────────────────────────────────────────────────────────

export type QueueAction = 'next' | 'prev' | 'open' | 'note' | 'exception';

export interface QueueKeyboardHandlers {
  onNext: () => void;
  onPrev: () => void;
  onOpen: () => void;
  onNote: () => void;
  onException: () => void;
}

export interface UseQueueKeyboardOptions extends QueueKeyboardHandlers {
  /** When false the listener is inert (still bound, but no-ops). Default true. */
  enabled?: boolean;
  /** True while the note drawer (or any modal) owns the keyboard — every key is ignored. */
  suspended?: boolean;
}

type ResolvableEvent = Pick<KeyboardEvent, 'key' | 'metaKey' | 'ctrlKey' | 'altKey'> & {
  target: EventTarget | null;
};

/** Pure key → action resolver. Returns null when the event must be ignored
 *  (modifier held, editable target, or an unmapped key). Unit-tested directly. */
export function resolveQueueAction(e: ResolvableEvent): QueueAction | null {
  if (e.metaKey || e.ctrlKey || e.altKey) return null;
  if (isEditableTarget(e.target)) return null;

  switch (e.key) {
    case 'j':
    case 'ArrowDown':
      return 'next';
    case 'k':
    case 'ArrowUp':
      return 'prev';
    case 'Enter':
      return 'open';
    case 'n':
      return 'note';
    case 'x':
      return 'exception';
    default:
      return null;
  }
}

export function useQueueKeyboard(options: UseQueueKeyboardOptions): void {
  const { isOpen: paletteOpen } = useCommandPalette();

  // Latest options + palette state via refs so the single window listener
  // always sees fresh values without re-binding on every render.
  const optionsRef = useRef(options);
  optionsRef.current = options;
  const paletteRef = useRef(paletteOpen);
  paletteRef.current = paletteOpen;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const opts = optionsRef.current;
      if (opts.enabled === false) return;
      if (opts.suspended) return;
      if (paletteRef.current) return;

      const action = resolveQueueAction(e);
      if (!action) return;

      e.preventDefault();
      const dispatch: Record<QueueAction, () => void> = {
        next: opts.onNext,
        prev: opts.onPrev,
        open: opts.onOpen,
        note: opts.onNote,
        exception: opts.onException,
      };
      dispatch[action]();
    };

    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
}
