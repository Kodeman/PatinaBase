export function isElementRendered(element: HTMLElement) {
  if (
    element.hidden ||
    element.closest('[hidden], [aria-hidden="true"], [inert]')
  ) {
    return false;
  }

  let current: HTMLElement | null = element;
  while (current) {
    const style = window.getComputedStyle(current);
    if (style.display === 'none' || style.visibility === 'hidden') return false;
    current = current.parentElement;
  }

  return true;
}

/** FR3 F3-17's selector for the band's act, and the dock centre the band's
 *  Next publishes (`next:` keys, D7). */
export const BAND_ACT_SELECTOR = '[data-lens-line="2"] [data-part="act"]';
const DOCK_NEXT_SELECTOR = '[data-action-region="lens-band"][data-action-key^="next:"]';

/** The band's Next act as it stands on this width: the band's act at desk
 *  width, the dock centre on the phone — where focus goes home when the
 *  control that opened something is gone (FR4 Fix 2, walk D18). */
export function bandNextAct(): HTMLElement | null {
  const rendered = (el: HTMLElement | null) =>
    el && el.getClientRects().length > 0 ? el : null;
  const band = rendered(document.querySelector<HTMLElement>(BAND_ACT_SELECTOR));
  const dock = rendered(document.querySelector<HTMLElement>(DOCK_NEXT_SELECTOR));
  return window.matchMedia?.('(min-width: 1180px)').matches ? (band ?? dock) : (dock ?? band);
}

export function topActiveModalDialog() {
  return Array.from(
    document.querySelectorAll<HTMLElement>(
      '[role="dialog"][aria-modal="true"]',
    ),
  )
    .filter(isElementRendered)
    .at(-1);
}

/**
 * The topmost open DISMISSIBLE POPOVER — an anchored panel that dismisses on
 * Esc but is not a modal dialog (the Calendar Folio is the first). Such a panel
 * deliberately wears no `role="dialog"`: the schedule confirm strip defers its
 * Esc to any `[role="dialog"]` in the DOM, so a date panel wearing that role
 * would silently disable the strip's revert. That also keeps it out of
 * `topActiveModalDialog()`, so surfaces that consult that function for their own
 * Esc must consult this one too, or their Esc and the popover's will both fire.
 *
 * Popovers opt in by rendering `data-dismissible-popover` on their panel.
 */
export function topDismissiblePopover() {
  return Array.from(
    document.querySelectorAll<HTMLElement>('[data-dismissible-popover]'),
  )
    .filter(isElementRendered)
    .at(-1);
}

type ManagedDialog = {
  dialog: HTMLElement;
  onTopChange: (isTop: boolean) => void;
};

const managedDialogs: ManagedDialog[] = [];

function syncManagedDialogs() {
  const connected = managedDialogs
    .filter(({ dialog }) => dialog.isConnected)
    .sort(({ dialog: left }, { dialog: right }) => {
      if (left === right) return 0;
      return left.compareDocumentPosition(right) &
        Node.DOCUMENT_POSITION_FOLLOWING
        ? -1
        : 1;
    });
  const top = connected.at(-1)?.dialog ?? null;
  for (const entry of connected) entry.onTopChange(entry.dialog === top);
}

export function registerManagedModalDialog(
  dialog: HTMLElement,
  onTopChange: (isTop: boolean) => void,
) {
  const entry = { dialog, onTopChange };
  managedDialogs.push(entry);
  syncManagedDialogs();

  return () => {
    const index = managedDialogs.indexOf(entry);
    if (index >= 0) managedDialogs.splice(index, 1);
    syncManagedDialogs();
  };
}
