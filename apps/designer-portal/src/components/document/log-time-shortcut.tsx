'use client';

/**
 * LogTimeShortcut — the bare `t` that opens the "Log time" form (W3).
 *
 * `t` is the second bare single-key global in the document model, after `?`,
 * and it wears the same two guards `RegistryShortcuts` defines rather than
 * growing its own: nothing fires while a field or a contenteditable holds the
 * keystroke, and nothing fires while a dialog is open (⌘K, any DocSheet, The
 * Post, the Account sheet). Any ⌘/Ctrl/Alt modifier is ignored.
 *
 * One guard is this file's OWN: `g` then `t` is already The Post's chord
 * (registry.tsx), and both handlers sit on `window`. Without it the second key
 * of that chord would open The Post AND this form. The chord wins; a bare `t`
 * is only a bare `t`.
 *
 * It is read TWO ways on purpose, because either one alone has a hole.
 * `RegistryShortcuts` clears its armed flag the moment it consumes the second
 * key, so a listener that runs after it sees `chordIsArmed() === false` — and
 * on an event dispatched at `window` itself, listener order is registration
 * order, not phase. What the consuming handler DOES leave behind is
 * `preventDefault()`. So: armed, or already spoken for.
 *
 * It opens the form rather than focusing the strip: the strip exists only
 * after a timer stops, and the whole point of this wave is the hour captured
 * with nothing in hand.
 *
 * Renders nothing — no new UI.
 */

import { useEffect } from 'react';
import { anOverlayIsOpen, chordIsArmed, isEditableTarget } from './registry-shortcuts';
import { openLogTime } from './log-time-sheet';

export function LogTimeShortcut() {
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() !== 't') return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (chordIsArmed() || e.defaultPrevented) return;
      if (isEditableTarget(e.target)) return;
      if (anOverlayIsOpen()) return;
      e.preventDefault();
      openLogTime();
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  return null;
}
