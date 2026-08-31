/**
 * The lens's declared numbers (OD-3), in one place.
 *
 * CSS never reads these — CSS gets the `--doc-*` tokens instead. Anything that
 * needs one of these in a rootMargin, a settle gate or a character cap imports
 * it here, so the threshold a test asserts and the threshold the observer uses
 * are one declaration.
 */

/** L-4: a region mounts when its root's top reaches `viewportBottom + 240`. */
export const LENS_LOOKAHEAD_PX = 240;

/** L-9: the settle gate — scroll velocity below this, for `LENS_SETTLE_MS`. */
export const LENS_SETTLE_VELOCITY_PX = 40;
export const LENS_SETTLE_MS = 120;

/**
 * D-B46 — the resolution gate. The lens may not measure a paper whose bodies
 * are still loading: a skeleton-short paper puts stops 9,000px below the frame
 * inside the lookahead, and one direction means they never come back. The
 * paper is RESOLVED when no query is fetching and its `scrollHeight` has held
 * for this many consecutive frames.
 */
export const LENS_RESOLVE_STABLE_FRAMES = 3;

/** D-B46 — and if that never comes (a query retrying, a poller), the lens runs
 *  its first pass anyway at this age, against whatever is laid out. Stated, so
 *  the lens can never hang quiet. */
export const LENS_RESOLVE_MAX_MS = 3000;

/** OD-7: the same stop is never announced twice inside this window. */
export const LENS_ANNOUNCE_DEDUPE_MS = 2000;

/** L-1: the outgoing sentence fades out in this window before the new one is
 *  printed. Under `prefers-reduced-motion: reduce` the swap is immediate. */
export const LENS_TURN_OUT_MS = 90;

/**
 * D-B24 — line 2's measure per tier, in px: the paper's own text run at that
 * width (measured on the seed, 18px root). The pixel budget, not a character
 * cap, is what decides whether the long form prints: a character cap
 * calibrated for the 900px measure never fires before CSS ellipsis at 327.
 */
export const LENS_LINE2_MEASURE_PX = {
  full: 900,
  narrow: 950,
  mobile: 327,
} as const;

export type LensTier = keyof typeof LENS_LINE2_MEASURE_PX;

/** Measured on the seed: Inter 15px, the line-2 sentence register. */
export const LENS_LINE2_PX_PER_CHAR = 7.7;

/** Measured on the seed: DM Mono 11px, the act and the `+N MORE` door. */
export const LENS_MONO_PX_PER_CHAR = 7.5;

/** The `gap-2` between the sentence, the act and the door. */
export const LENS_LINE2_GAP_PX = 9;

/** The ladder's value line, one string at both desktop tiers. */
export const LENS_VALUE_MAX_CHARS = 30;

/** A quiet region's count line, and the ladder's `countLine` with it. */
export const LENS_COUNT_MAX_CHARS = 40;

/** The minimum height a ladder segment row takes; it is otherwise natural
 *  height (D-B52 deleted the extent distribution this used to be a floor for). */
export const LADDER_SEGMENT_MIN_PX = 36;
