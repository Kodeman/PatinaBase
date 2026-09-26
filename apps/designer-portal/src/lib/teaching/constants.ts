/**
 * Return teaching (Workshop Notes) constants.
 * See artifacts/return-teaching-2026-09-25/design/system-architecture.md §1.3, §2, §5.
 */

/** User-facing name of a teaching note (ruling R-RT1 default). The one place it is set. */
export const TEACHING_LABEL_WORD = 'WORKSHOP NOTE';

/** PostHog system gate for every teaching note (fail closed). */
export const TEACHING_SYSTEM_FLAG = 'teaching-notes';

export const DAY_MS = 24 * 60 * 60 * 1000;

/** A visit is the first Desk load after this long with no Desk load and no tagged boundary. */
export const VISIT_GAP_MS = 30 * 60 * 1000;

/** The since-you-were-here line appears only when the previous visit started at least this long ago. */
export const SINCE_LINE_GAP_MS = 30 * DAY_MS;

/** Unsolicited notes allowed per rolling seven days. */
export const UNSOLICITED_PER_7D = 2;

/** Consecutive closes (no act, no dismissal) that switch teaching to quiet. */
export const IGNORE_STREAK_QUIET = 3;

/** How long auto-quiet lasts. */
export const QUIET_DAYS = 30;

/** At-rest settle time for the anchor and act slots. */
export const SETTLE_MS = 1500;

/** A note retires as `retired_max` after this many closes unless the note sets its own. */
export const DEFAULT_MAX_DISPLAYS = 3;

/** The changes page. */
export const CHANGES_HREF = '/help/changes';
