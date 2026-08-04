const FOCUSABLE_SELECTOR = [
  'a[href]:not([tabindex="-1"])',
  'button:not([disabled]):not([tabindex="-1"])',
  'input:not([disabled]):not([type="hidden"]):not([tabindex="-1"])',
  'select:not([disabled]):not([tabindex="-1"])',
  'textarea:not([disabled]):not([tabindex="-1"])',
  'iframe:not([tabindex="-1"])',
  '[contenteditable="true"]:not([tabindex="-1"])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

let bodyScrollLocks = 0;
let bodyOverflowBeforeLock = '';
let bodyPaddingBeforeLock = '';

/** Shared by route-level rooms and nested full-screen overlays. */
export function lockBodyScroll() {
  if (bodyScrollLocks === 0) {
    bodyOverflowBeforeLock = document.body.style.overflow;
    bodyPaddingBeforeLock = document.body.style.paddingRight;

    const layoutWidth = document.documentElement.clientWidth;
    const scrollbarWidth =
      layoutWidth > 0 ? Math.max(0, window.innerWidth - layoutWidth) : 0;
    if (scrollbarWidth > 0) {
      const currentPadding =
        Number.parseFloat(window.getComputedStyle(document.body).paddingRight) || 0;
      document.body.style.paddingRight = `${currentPadding + scrollbarWidth}px`;
    }
    document.body.style.overflow = 'hidden';
  }

  bodyScrollLocks += 1;
  let released = false;
  return () => {
    if (released) return;
    released = true;
    bodyScrollLocks = Math.max(0, bodyScrollLocks - 1);
    if (bodyScrollLocks > 0) return;
    document.body.style.overflow = bodyOverflowBeforeLock;
    document.body.style.paddingRight = bodyPaddingBeforeLock;
  };
}

export function focusableWithin(panel: HTMLElement) {
  return Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
    (element) => {
      const style = window.getComputedStyle(element);
      return (
        !element.hidden &&
        !element.matches(':disabled') &&
        element.getAttribute('aria-disabled') !== 'true' &&
        !element.closest('[hidden], [aria-hidden="true"], [inert]') &&
        style.display !== 'none' &&
        style.visibility !== 'hidden'
      );
    },
  );
}

/** Keeps Tab inside a boundary while allowing a portalled nested modal to own focus. */
export function trapTabWithin(event: KeyboardEvent, panel: HTMLElement): boolean {
  if (event.key !== 'Tab' || event.defaultPrevented) return false;
  const active = document.activeElement;
  if (active instanceof HTMLElement && !panel.contains(active)) {
    const externalModal = active.closest<HTMLElement>('[role="dialog"][aria-modal="true"]');
    if (externalModal && !panel.contains(externalModal)) return false;
  }

  const focusable = focusableWithin(panel);
  if (focusable.length === 0) {
    event.preventDefault();
    panel.focus({ preventScroll: true });
    return true;
  }

  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  if (active === panel || !panel.contains(active)) {
    event.preventDefault();
    (event.shiftKey ? last : first).focus();
    return true;
  }
  if (!event.shiftKey && active === last) {
    event.preventDefault();
    first.focus();
    return true;
  }
  if (event.shiftKey && active === first) {
    event.preventDefault();
    last.focus();
    return true;
  }
  return false;
}
