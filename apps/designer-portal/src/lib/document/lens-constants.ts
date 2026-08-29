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

/** OD-7: the same stop is never announced twice inside this window. */
export const LENS_ANNOUNCE_DEDUPE_MS = 2000;

/** The ladder's value line, one string at both desktop tiers. */
export const LENS_VALUE_MAX_CHARS = 30;

/** A quiet region's count line, and the ladder's `countLine` with it. */
export const LENS_COUNT_MAX_CHARS = 40;

/** The floor every ladder segment takes before extent distributes the rest. */
export const LADDER_SEGMENT_MIN_PX = 36;
