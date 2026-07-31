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
