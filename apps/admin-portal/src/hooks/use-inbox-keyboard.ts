'use client';

import { useEffect, useRef } from 'react';
import { useCommandPalette } from '@/contexts/command-palette-context';

// ─────────────────────────────────────────────────────────────────────────────
// Keyboard-first navigation for the Approval Inbox.
//
//   j / ArrowDown  → next row      k / ArrowUp → prev row
//   Enter          → toggle expand
//   a              → approve        r → open reject popover   e → open edit drawer
//
// Guards (bail without acting): a modifier is held (meta/ctrl/alt); the event
// target is an input/textarea/select/[contenteditable]; the command palette is
// open; or the inbox is suspended (a reject popover / edit drawer owns the
// keyboard). The pure key→action mapping is split into resolveInboxAction so it
// can be unit-tested without a DOM.
// ─────────────────────────────────────────────────────────────────────────────

export type InboxAction = 'next' | 'prev' | 'toggle' | 'approve' | 'reject' | 'edit';

export interface InboxKeyboardHandlers {
  onNext: () => void;
  onPrev: () => void;
  onToggleExpand: () => void;
  onApprove: () => void;
  onReject: () => void;
  onEdit: () => void;
}

export interface UseInboxKeyboardOptions extends InboxKeyboardHandlers {
  /** When false the listener is inert (still bound, but no-ops). Default true. */
  enabled?: boolean;
  /** True while a popover/drawer owns the keyboard — every key is ignored. */
  suspended?: boolean;
}

const EDITABLE_TAGS = new Set(['INPUT', 'TEXTAREA', 'SELECT']);

export function isEditableTarget(target: EventTarget | null): boolean {
  const el = target as (HTMLElement & { tagName?: string }) | null;
  if (!el) return false;
  if (el.tagName && EDITABLE_TAGS.has(el.tagName)) return true;
  if (el.isContentEditable) return true;
  return false;
}

type ResolvableEvent = Pick<KeyboardEvent, 'key' | 'metaKey' | 'ctrlKey' | 'altKey'> & {
  target: EventTarget | null;
};

/** Pure key → action resolver. Returns null when the event must be ignored
 *  (modifier held, editable target, or an unmapped key). Unit-tested directly. */
export function resolveInboxAction(e: ResolvableEvent): InboxAction | null {
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
      return 'toggle';
    case 'a':
      return 'approve';
    case 'r':
      return 'reject';
    case 'e':
      return 'edit';
    default:
      return null;
  }
}

export function useInboxKeyboard(options: UseInboxKeyboardOptions): void {
  const { isOpen: paletteOpen } = useCommandPalette();

  // Latest options + palette state via refs so the single window listener always
  // sees fresh values without re-binding on every render.
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

      const action = resolveInboxAction(e);
      if (!action) return;

      e.preventDefault();
      const dispatch: Record<InboxAction, () => void> = {
        next: opts.onNext,
        prev: opts.onPrev,
        toggle: opts.onToggleExpand,
        approve: opts.onApprove,
        reject: opts.onReject,
        edit: opts.onEdit,
      };
      dispatch[action]();
    };

    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
}
