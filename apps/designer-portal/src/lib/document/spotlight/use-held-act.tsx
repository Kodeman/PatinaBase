'use client';

import { useCallback, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { HoldSpotlight } from '@/components/document/overlays/hold-spotlight';
import { useHoldSpotlight } from './use-hold-spotlight';
import type { SpotlightHold } from './use-hold-spotlight';

const NO_HOLDS: SpotlightHold[] = [];
const CONTROL = 'a[href], button, input, select, textarea, [tabindex]';

const words = (text: string | null) => (text ?? '').replace(/\s+/g, ' ').trim();

/**
 * The frame a held act's spotlight darkens (K2): the nearest sheet panel or
 * paper column marked `data-spotlight-frame`. The paper column also hosts
 * fixed panels (the note above `<main>` in doc/[id]/page.tsx); an act inside
 * one is not laid out in the column, so it has no frame.
 */
function frameOf(act: HTMLElement): HTMLElement | null {
  const frame = act.closest<HTMLElement>('[data-spotlight-frame]');
  if (!frame) return null;
  for (let el = act.parentElement; el && el !== frame; el = el.parentElement) {
    if (window.getComputedStyle(el).position === 'fixed') return null;
  }
  return frame;
}

/**
 * One window for the act's own reason, its first `aria-describedby` element
 * in the frame. A named fix region in the frame takes the window instead
 * (R186), so it stays live and takes focus; the bar still says the reason.
 */
function reasonHold(
  act: HTMLElement,
  frame: HTMLElement,
  fixId: string | undefined,
): SpotlightHold | null {
  const reason = (act.getAttribute('aria-describedby') ?? '')
    .split(/\s+/)
    .filter(Boolean)
    .map((id) => document.getElementById(id))
    .find((el): el is HTMLElement => el !== null && el !== frame && frame.contains(el));
  if (!reason) return null;
  const fix = fixId ? document.getElementById(fixId) : null;
  const { id } = fix && fix !== frame && frame.contains(fix) ? fix : reason;
  // A fixer inside the reason stays live in the window and takes focus, so
  // the bar says the reason without repeating the fixer's label.
  const bare = reason.cloneNode(true) as HTMLElement;
  bare.querySelectorAll(CONTROL).forEach((control) => control.remove());
  return {
    id,
    target: () =>
      act.isConnected && act.getAttribute('aria-disabled') === 'true'
        ? document.getElementById(id)
        : null,
    label: words(act.getAttribute('aria-label') ?? act.textContent),
    reason: words(bare.textContent) || words(reason.textContent),
  };
}

/**
 * What pressing a held DocumentAction or Button does (US-36 K4). A site's
 * `onHeldActivate` always runs. With `holds`, the press then opens one window
 * per hold; with neither, one window on the act's `aria-describedby` reason.
 * A site with `onHeldActivate` and no `holds` answers the press itself. With
 * no frame, or no reason inside it, the press is swallowed as before.
 * `holdFix` is the element id of the region that fixes that reason.
 */
export function useHeldAct(
  holds: SpotlightHold[] | undefined,
  onHeldActivate: (() => void) | undefined,
  holdFix?: string,
): { activate: (act: HTMLElement) => void; spotlight: ReactNode } {
  const frame = useRef<HTMLElement | null>(null);
  const [own, setOwn] = useState<SpotlightHold[] | null>(null);
  const [mounted, setMounted] = useState(false);
  const { open, props } = useHoldSpotlight(own ?? holds ?? NO_HOLDS);

  const activate = useCallback(
    (act: HTMLElement) => {
      onHeldActivate?.();
      const listed = Boolean(holds?.length);
      if (onHeldActivate && !listed) return;
      const host = frameOf(act);
      const hold = host && !listed ? reasonHold(act, host, holdFix) : null;
      if (!host || (!listed && !hold)) return;
      frame.current = host;
      setOwn(hold ? [hold] : null);
      setMounted(true);
      open(act);
    },
    [holds, onHeldActivate, holdFix, open],
  );

  return {
    activate,
    // Mounted at the first press, never before: a mounted spotlight keeps a
    // status line in its frame.
    spotlight: mounted ? <HoldSpotlight frame={frame} {...props} /> : null,
  };
}
