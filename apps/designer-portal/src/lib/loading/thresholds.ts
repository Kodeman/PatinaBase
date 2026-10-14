/**
 * The loading register's clock (US-33 PQ8, V24). Every wait in the portal is
 * measured from the click against these numbers. Each is design practice,
 * not research (r-patterns.md §2).
 */

/** B1: within this, exactly one thing answers a click (D2 §2, S1). */
export const ANSWER_BUDGET_MS = 100;

/** Shaped placeholders fade in after this, so a fast load never flashes. */
export const PLACEHOLDER_DELAY_MS = 150;

/** The navigation rule starts drawing. */
export const NAV_RULE_DELAY_MS = 300;

/** A pending write prints its word. */
export const PENDING_WORD_DELAY_MS = 400;

/** Once shown, the pending word holds at least this long, so it never blinks. */
export const PENDING_WORD_HOLD_MS = 500;

/** The slow line: "Still reading." */
export const SLOW_MS = 4_000;

/** A write that is still working says so. */
export const STILL_WORKING_WRITE_MS = 8_000;

/** The stall: the slow line gains a Reload. */
export const STALL_MS = 10_000;
