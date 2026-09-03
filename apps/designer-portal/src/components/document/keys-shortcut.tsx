'use client';

/**
 * KeysShortcut — the `?` doorway onto "The keys" (onboarding Wave 1, task L5;
 * decision 8, taken against the synthesis recommendation).
 *
 * This is the first bare single-key global binding outside the `g`-chord
 * family, so it wears the same two guards `RegistryShortcuts` already uses,
 * imported from there rather than redefined: nothing fires while a field or a
 * contenteditable has the keystroke, and nothing fires while a dialog is open
 * (⌘K, any DocSheet ledger, The Post, the Account sheet). Any ⌘/Ctrl/Alt
 * modifier is ignored, so ⌘? and Ctrl? stay the browser's.
 *
 * Collision check, 2026-09-03: the only bare keys bound anywhere in the
 * document model are `g` (chord lead-in, registry-shortcuts.tsx) and the
 * Board Room's `p`, `Escape`, `Delete`/`Backspace` and `Shift+T`
 * (board-room-controller.tsx handleKeyDown). None is `?`. The Board Room is
 * also a dialog-free full surface, so its handler and this one can both be
 * mounted without either swallowing the other's key.
 *
 * Renders nothing — no new UI.
 */

import { useEffect } from 'react';
import { anOverlayIsOpen, isEditableTarget } from './registry-shortcuts';
import { openKeys } from './overlays/keys-sheet';

export function KeysShortcut() {
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== '?') return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (isEditableTarget(e.target)) return;
      if (anOverlayIsOpen()) return;
      e.preventDefault();
      openKeys('key');
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  return null;
}
