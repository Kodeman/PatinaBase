/**
 * US-14 arrival — the host the engine runs against (CONTRACT §3, types.ts `Host`). DOM reads only;
 * the two React-owned busy signals arrive as getters from ArrivalRun.
 */
import { isElementRendered } from '@/components/document/overlays/active-dialog';
import { isEditableTarget } from '@/hooks/use-lens-state';
import { documentEvents } from '@/lib/analytics/document-events';
import { markArrival } from './mark-arrival';
import type { ArrivalEnded, Host, Surface } from './types';

export { suppressNextArrival } from './nav';

export interface HostDeps {
  /** The Desk walkthrough's WelcomeModal or tour is on screen. */
  walkthroughOnScreen: () => boolean;
  /** A log-time offer exists (LogStrip listens for Escape whenever it does, painted or not). */
  logOfferPending: () => boolean;
}

const FACE_FALLBACKS = ['"Playfair Display"', 'Inter', '"DM Mono"'] as const;
const FACE_VARS = ['--font-heading', '--font-inter', '--font-mono'] as const;

function firstFamily(stack: string): string | null {
  const first = stack.split(',')[0]?.trim();
  return first ? first : null;
}

/** A MarginNote (arbiter line, teaching note, walkthrough offer) wears its Dismiss button as a
 *  direct child; the setup whisper and the since line wear none and are not busy. */
function dismissibleNoteOnScreen(): boolean {
  const notes = document.querySelectorAll<HTMLElement>('aside[role="note"]');
  for (const note of Array.from(notes)) {
    const dismiss = Array.from(note.children).some((child) =>
      child.matches('button[aria-label="Dismiss note"]'),
    );
    if (dismiss && isElementRendered(note)) return true;
  }
  return false;
}

function dialogOnScreen(): boolean {
  const dialogs = document.querySelectorAll<HTMLElement>('[role="dialog"], [role="alertdialog"]');
  return Array.from(dialogs).some(isElementRendered);
}

function selectionLive(): boolean {
  try {
    const selection = window.getSelection();
    return !!selection && !selection.isCollapsed;
  } catch {
    return false;
  }
}

function safeInsets(): { top: number; bottom: number } {
  const probe = document.createElement('div');
  probe.setAttribute('aria-hidden', 'true');
  probe.style.cssText =
    'position:fixed;left:0;top:0;width:0;height:0;visibility:hidden;pointer-events:none;' +
    'padding:env(safe-area-inset-top) 0 env(safe-area-inset-bottom) 0;';
  document.body.appendChild(probe);
  try {
    const cs = window.getComputedStyle(probe);
    return { top: parseFloat(cs.paddingTop) || 0, bottom: parseFloat(cs.paddingBottom) || 0 };
  } finally {
    probe.remove();
  }
}

export function createHost(
  surface: Surface,
  engagementId: string | null,
  deps: HostDeps,
): Host {
  const selector = `[data-arrival="${surface}"]`;
  return {
    root() {
      return document.querySelector<HTMLElement>(selector);
    },
    ready() {
      const root = document.querySelector<HTMLElement>(selector);
      return !!root && root.hasAttribute('data-arrival-ready');
    },
    busy() {
      return (
        dialogOnScreen() ||
        isEditableTarget(document.activeElement) ||
        document.querySelector('[data-shelf-open]') !== null ||
        deps.walkthroughOnScreen() ||
        dismissibleNoteOnScreen() ||
        deps.logOfferPending() ||
        selectionLive()
      );
    },
    faces() {
      const cs = window.getComputedStyle(document.body);
      return FACE_VARS.map(
        (name, i) => firstFamily(cs.getPropertyValue(name)) ?? FACE_FALLBACKS[i],
      );
    },
    view() {
      const vh = window.innerHeight || document.documentElement.clientHeight || 0;
      const width = document.documentElement.clientWidth || window.innerWidth || 0;
      const inset = safeInsets();
      let barHeight = 0;
      const bar = document.querySelector<HTMLElement>('[data-testid="mobile-bar"]');
      if (bar && isElementRendered(bar)) {
        const r = bar.getBoundingClientRect();
        if (r.bottom > r.top && r.top < vh) barHeight = vh - Math.max(0, r.top);
      }
      const top = inset.top;
      const bottom = vh - Math.max(inset.bottom, barHeight);
      return { top, height: Math.max(0, bottom - top), width, bottom };
    },
    telemetry(e: ArrivalEnded) {
      documentEvents.arrivalEnded(e);
    },
    markArrival(s: Surface, id: string | null) {
      markArrival(s, id ?? engagementId);
    },
  };
}
