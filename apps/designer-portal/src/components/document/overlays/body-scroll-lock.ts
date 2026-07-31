let bodyScrollLocks = 0;
let bodyOverflowBeforeLock = '';
let bodyPaddingBeforeLock = '';

/**
 * Prevent the document beneath an overlay from scrolling.
 *
 * Every document overlay shares this counter so nested sheets can close in any
 * order without an outer cleanup restoring scroll while an inner overlay is
 * still open. The returned release function is idempotent for effect cleanup.
 */
export function lockBodyScroll() {
  if (bodyScrollLocks === 0) {
    bodyOverflowBeforeLock = document.body.style.overflow;
    bodyPaddingBeforeLock = document.body.style.paddingRight;

    const layoutWidth = document.documentElement.clientWidth;
    const scrollbarWidth =
      layoutWidth > 0 ? Math.max(0, window.innerWidth - layoutWidth) : 0;
    if (scrollbarWidth > 0) {
      const currentPadding =
        Number.parseFloat(window.getComputedStyle(document.body).paddingRight) ||
        0;
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
