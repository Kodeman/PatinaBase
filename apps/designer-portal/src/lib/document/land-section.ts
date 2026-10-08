/**
 * SQ-544 (walk D6, P-2) — a section landing that focuses a control inside the
 * section has to leave that control visible. The page scrolls the section to
 * `block: start` and then focuses the control with `preventScroll`, so the
 * browser never brings the control itself clear: at 390 the Brief's
 * `Accept · begin` rested at y 740–784 under a dock whose top is 751.
 *
 * The bottom clearance is the one `html` already declares for the dock
 * (`scroll-padding-bottom`, globals.css R127/D-B47); the top clearance is the
 * control's own `scroll-margin-top` (`--doc-landing-clear`, the band). This
 * reads both rather than restating either number.
 */

export interface LandingGeometry {
  /** Window scroll offset now. */
  scrollY: number;
  viewportHeight: number;
  /** Section's viewport top now. */
  sectionTop: number;
  /** Where the section's start rests: its `scroll-margin-top` plus `html`'s `scroll-padding-top`. */
  sectionClearTop: number;
  /** Control's viewport top and bottom now. */
  targetTop: number;
  targetBottom: number;
  /** The control's own `scroll-margin-top` plus `html`'s `scroll-padding-top`. */
  targetClearTop: number;
  /** `html`'s `scroll-padding-bottom` — the dock. */
  clearBottom: number;
}

/**
 * The window y the landing rests at, or null when the section's own start
 * already leaves the control clear (the caller keeps `scrollIntoView`). A lift
 * never carries the control's top under the band.
 */
export function landingLift(g: LandingGeometry): number | null {
  const start = g.scrollY + g.sectionTop - g.sectionClearTop;
  // The control's viewport position once the section rests at its start.
  const shift = g.sectionTop - g.sectionClearTop;
  const restBottom = g.viewportHeight - g.clearBottom;
  const overshoot = g.targetBottom - shift - restBottom;
  if (overshoot <= 0) return null;
  const headroom = g.targetTop - shift - g.targetClearTop;
  const lift = Math.min(overshoot, headroom);
  return lift > 0 ? start + lift : null;
}

function px(value: string | undefined): number {
  const n = Number.parseFloat(value ?? "");
  return Number.isFinite(n) ? n : 0;
}

/**
 * Scroll `section` to its start, as before — unless the focused `target` would
 * then rest under the dock, in which case the one scroll lifts just far enough
 * to clear it.
 */
export function landSection(
  section: HTMLElement,
  target: HTMLElement | null | undefined,
  behavior: ScrollBehavior,
): void {
  if (target && target !== section) {
    const root = window.getComputedStyle(document.documentElement);
    const padTop = px(root.scrollPaddingTop);
    const sectionRect = section.getBoundingClientRect();
    const targetRect = target.getBoundingClientRect();
    const top = landingLift({
      scrollY: window.scrollY,
      viewportHeight: window.innerHeight,
      sectionTop: sectionRect.top,
      sectionClearTop:
        px(window.getComputedStyle(section).scrollMarginTop) + padTop,
      targetTop: targetRect.top,
      targetBottom: targetRect.bottom,
      targetClearTop:
        px(window.getComputedStyle(target).scrollMarginTop) + padTop,
      clearBottom: px(root.scrollPaddingBottom),
    });
    if (top !== null) {
      window.scrollTo({ top, behavior });
      return;
    }
  }
  section.scrollIntoView({ block: "start", behavior });
}
