'use client';

/**
 * Registry g-shortcuts (R93 wayfinding): a headless global "g then <key>"
 * chord read straight off each Studio Surface's own `shortcut` field — the
 * chord lives in one place (the registry), not scattered across a keymap
 * component and the doors that display it.
 *
 * Sequence: press `g`, then within ~1.2s one of the registry's chord keys
 * (l/p/o/a/h/t/r today). Rooms navigate (`router.push`); ledgers dispatch the
 * same `document:open-ledger` event the Studio Drawer and ⌘K already use;
 * The Post dispatches the existing `openPost`. Renders nothing — no new UI.
 *
 * Ignored: any modified keydown (⌘/Ctrl/Alt), anything typed into an
 * input/textarea/select/contenteditable, and anything typed while a dialog
 * is open. There's no dedicated "the command bar is open" flag today, so
 * openness is read the way the task specified as the fallback: focus hasn't
 * left `<body>`, AND no `[role="dialog"]` is mounted. Every dialog in this
 * app — the command bar, every `DocSheet` ledger, The Post, the Account
 * sheet, the mobile sheets — both moves focus into itself on open and
 * renders that role, so this one check covers all of them, not only ⌘K.
 */

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { ALL_STUDIO_SURFACES, type StudioSurface } from '@/lib/document/registry';
import { openPost } from './overlays/post-sheet';
import { documentEvents } from '@/lib/analytics/document-events';

const CHORD_WINDOW_MS = 1200;

// Room-weight doors need a route; the registry is deliberately route-agnostic
// (see its file doc) — the same small local map the Studio Drawer keeps.
const ROOM_HREF: Partial<Record<string, string>> = {
  library: '/library',
  people: '/people',
  rooms: '/rooms',
};

// Only surfaces that declare a two-key "g then X" chord are reachable this
// way, keyed by the second (lowercased) key.
const CHORDED: Map<string, StudioSurface> = new Map(
  ALL_STUDIO_SURFACES.filter(
    (s): s is StudioSurface & { shortcut: string[] } =>
      !!s.shortcut && s.shortcut.length === 2 && s.shortcut[0] === 'g',
  ).map((s): [string, StudioSurface] => [s.shortcut[1], s]),
);

/** Exported for the `?` doorway (KeysShortcut, task L5), which must wear the
 *  exact same guard rather than growing a second, drifting definition. */
export function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  return target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT';
}

/** No "command bar is open" flag exists yet, so this reads the fallback the
 *  task called for: focus has left `<body>`, or some `[role="dialog"]` is
 *  mounted. */
export function anOverlayIsOpen(): boolean {
  const active = document.activeElement;
  const bodyIsh = active === null || active === document.body;
  if (!bodyIsh) return true;
  return document.querySelector('[role="dialog"]') !== null;
}

/** Timestamp of the last unconsumed `g` — null when no chord is armed. Module
 *  scope, not component state, because a SECOND bare-key binding has to know
 *  the chord is mid-flight: `g` then `t` is The Post, and a `t` listener that
 *  could not see the armed `g` would open its own surface on top of it. */
const chordArm: { at: number | null } = { at: null };

/** True while a `g` is waiting for its second key. Read by every bare-key
 *  binding outside the chord family (LogTimeShortcut). */
export function chordIsArmed(now: number = Date.now()): boolean {
  return chordArm.at !== null && now - chordArm.at <= CHORD_WINDOW_MS;
}

export function RegistryShortcuts() {
  const router = useRouter();

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (isEditableTarget(e.target)) return;
      if (anOverlayIsOpen()) return;

      const key = e.key.toLowerCase();
      const now = Date.now();
      const armed = chordIsArmed(now);

      if (armed) {
        // The chord is consumed either way — a non-matching second key
        // cancels it rather than leaving it armed for a later keypress.
        chordArm.at = null;
        const surface = CHORDED.get(key);
        if (!surface) return;
        e.preventDefault();

        documentEvents.wayfinding.doorOpened({
          key: surface.key,
          weight: surface.weight === 'room' ? 'room' : 'sheet',
          source: 'shortcut',
        });

        if (surface.key === 'the-post') {
          openPost();
        } else if (surface.weight === 'room') {
          const href = ROOM_HREF[surface.key];
          if (href) router.push(href);
        } else {
          window.dispatchEvent(new CustomEvent('document:open-ledger', { detail: surface.key }));
        }
        return;
      }

      if (key === 'g') chordArm.at = now;
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [router]);

  return null;
}
