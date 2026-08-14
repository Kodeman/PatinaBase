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
