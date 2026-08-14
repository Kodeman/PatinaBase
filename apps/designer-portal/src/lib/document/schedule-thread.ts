/**
 * The Schedule Thread (Date Instruments, lane D2) — contextual placement of a
 * task against the project schedule. Where the Folio answers "when is it
 * due," the Thread answers "where does this work sit relative to the spine":
 * pick an anchor (today, a phase boundary, a milestone, install week), say
 * how many workdays after it the work starts and how many workdays it lasts,
 * and read back the plain consequence — including whether it still leaves
 * runway before install.
 *
 * Pure, dependency-free (beyond `@patina/utils`), clock-injected — no
 * function here reads `Date.now()`; `today` always arrives as an argument.
 * All date arithmetic goes through `@patina/utils` (epoch-day parsing,
 * workday stepping) — this file adds no second date-math implementation
 * (R100's "ONE date-math impl" rule, same discipline as
 * `folio-calendar-derivation.ts` and `calendar.ts`).
 */

import {
  addWorkdaysISO,
  epochDayFromISO,
  weekdayFromEpochDay,
  workdaysBetween,
  type ResolvedMilestone,
  type ResolvedPhase,
} from '@patina/utils';

// ─────────────────────────────────────────────────────────────────────────────
// Anchors
// ─────────────────────────────────────────────────────────────────────────────

/**
 * A resolved phase widened with the name `resolveSchedule` doesn't carry
 * (`ResolvedPhase` is joined off the raw `project_phases` name by the
 * caller — see `phaseRowById` in schedule-rule.tsx for the same join
 * pattern). The Thread never re-fetches or re-resolves; it only reads.
 */
export interface ThreadPhase extends ResolvedPhase {
  name: string;
}

/** A resolved milestone widened with its name, same reasoning as `ThreadPhase`. */
export interface ThreadMilestone extends ResolvedMilestone {
  name: string;
}

/** The slice of `useResolvedSchedule`'s output the Thread reads — phases and
 *  milestones joined with their names, nothing else (no conflicts, no slack). */
export interface ThreadResolvedSchedule {
  phases: ThreadPhase[];
  milestones: ThreadMilestone[];
}

/** Structural mirror of `install_windows`' two date columns — this file
 *  cannot depend on `@patina/supabase`'s row type, same reasoning as
 *  `ScheduleDisclosedImpactInput` in use-install-window.ts. */
export interface ThreadInstallWindow {
  starts_on: string;
}

/** One pickable point on the Thread's anchor list. */
export interface ThreadAnchor {
  key: string;
  label: string;
  date: string;
}

/**
 * The anchor list a task can be placed against: Today, every resolved
 * main-lane phase's start ("<Name> begins") and end ("<Name> ends"), every
 * resolved milestone (its own name), and the live install window's start
 * ("Install begins") when one is held or confirmed.
 *
 * - Only `lane === 'main'` phases contribute — a thread-lane (overlapping,
 *   unanchored) phase has no place of its own on the spine to anchor against.
 * - Any entry whose date fails to parse (null, or a malformed string) is
 *   dropped rather than surfaced as a broken chip — the same "degrade, never
 *   throw" discipline `resolveSchedule` itself follows.
 * - The returned list is sorted chronologically (ascending ISO-string
 *   comparison, which is exact for `YYYY-MM-DD`); ties keep their relative
 *   insertion order (Today, then phases in resolved order, then milestones,
 *   then install) since `Array.prototype.sort` is stable.
 */
export function deriveThreadAnchors(
  resolved: ThreadResolvedSchedule,
  installWindow: ThreadInstallWindow | null,
  today: string,
): ThreadAnchor[] {
  const anchors: ThreadAnchor[] = [];

  if (epochDayFromISO(today) != null) {
    anchors.push({ key: 'today', label: 'Today', date: today });
  }

  for (const phase of resolved.phases) {
    if (phase.lane !== 'main') continue;
    if (phase.start != null && epochDayFromISO(phase.start) != null) {
      anchors.push({ key: `phase-start-${phase.id}`, label: `${phase.name} begins`, date: phase.start });
    }
    if (phase.end != null && epochDayFromISO(phase.end) != null) {
      anchors.push({ key: `phase-end-${phase.id}`, label: `${phase.name} ends`, date: phase.end });
    }
  }

  for (const milestone of resolved.milestones) {
    if (milestone.date != null && epochDayFromISO(milestone.date) != null) {
      anchors.push({ key: `milestone-${milestone.id}`, label: milestone.name, date: milestone.date });
    }
  }

  if (installWindow != null && epochDayFromISO(installWindow.starts_on) != null) {
    anchors.push({ key: 'install-start', label: 'Install begins', date: installWindow.starts_on });
  }

  return anchors
    .slice()
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}

// ─────────────────────────────────────────────────────────────────────────────
// Placement
// ─────────────────────────────────────────────────────────────────────────────

export interface ThreadPlacement {
  startsOn: string;
  dueDate: string;
}

/**
 * Turns "after ANCHOR by BY workdays, lasts LASTS workdays" into concrete
 * dates.
 *
 * `startsOn` = `addWorkdaysISO(anchorDate, byWorkdays)` — inherits that
 * function's own step rule exactly: `by=0` lands on `anchorDate` itself when
 * it's a workday, otherwise the next workday after it; `by=N` (N>0) takes
 * that same starting workday and steps `N` further workdays forward. `by` is
 * floored to a non-negative integer (mirrors `addWorkdaysISO`'s own
 * defensiveness) — a caller-side stepper is expected to enforce the min-0
 * bound already, this is a second, cheap guarantee.
 *
 * `dueDate` = `addWorkdaysISO(startsOn, lastsWorkdays - 1)`. Since `startsOn`
 * is itself always a workday (that's what `addWorkdaysISO` returns), stepping
 * it forward 0 further days returns `startsOn` unchanged — so `lasts=1`
 * reads as "same day," `lasts=2` as "one more workday," and so on. `lasts` is
 * floored to a minimum of 1 (a task cannot last zero or negative workdays).
 *
 * Total: a malformed `anchorDate` (fails to parse) makes `addWorkdaysISO`
 * return `null`, and this function returns `null` in turn rather than a
 * half-built placement.
 */
export function computeThreadPlacement(
  anchorDate: string,
  byWorkdays: number,
  lastsWorkdays: number,
): ThreadPlacement | null {
  const by = Number.isFinite(byWorkdays) ? Math.max(0, Math.trunc(byWorkdays)) : 0;
  const startsOn = addWorkdaysISO(anchorDate, by);
  if (startsOn == null) return null;

  const lasts = Number.isFinite(lastsWorkdays) ? Math.max(1, Math.trunc(lastsWorkdays)) : 1;
  const dueDate = addWorkdaysISO(startsOn, lasts - 1);
  if (dueDate == null) return null;

  return { startsOn, dueDate };
}

// ─────────────────────────────────────────────────────────────────────────────
// Consequence
// ─────────────────────────────────────────────────────────────────────────────

const WEEKDAY_ABBR = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;
const MONTH_ABBR = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
] as const;

/** "Tue, Aug 25" off a valid ISO day, or null if it doesn't parse. */
function weekdayMonthDay(iso: string): string | null {
  const epoch = epochDayFromISO(iso);
  if (epoch == null) return null;
  const month = MONTH_ABBR[Number(iso.slice(5, 7)) - 1];
  if (!month) return null;
  return `${WEEKDAY_ABBR[weekdayFromEpochDay(epoch)]}, ${month} ${Number(iso.slice(8, 10))}`;
}

/**
 * The plain sentence a placement reads back — the ONE string both the panel
 * types out and the tests pin.
 *
 * Contract:
 *  - `placement == null` → `''`.
 *  - Otherwise the sentence always opens with
 *    `Starts <weekday, month day> · finishes <weekday, month day>` for
 *    `placement.startsOn` / `placement.dueDate`.
 *  - Exactly ONE clause is appended:
 *      · `installStart` is `null`, fails to parse, or falls ON OR BEFORE
 *        `placement.dueDate` (the install window already opened by the time
 *        this work finishes, or opens the same day) →
 *        `' · after install begins'` — a quiet warning, not an error: the
 *        work isn't landing ahead of install, it's landing on or after it,
 *        and there is nothing further to measure.
 *      · otherwise → `' · leaves N working day(s) before install'`, where N
 *        is the count of FULL WORKDAYS STRICTLY BETWEEN `dueDate` and
 *        `installStart` — both endpoints excluded, so a `dueDate` that falls
 *        on the workday immediately before `installStart` (nothing but a
 *        weekend between them, say) reads `N=0`, never `N=1`. `N=1` means
 *        one clear working day of runway exists between finishing and
 *        install starting.
 *  - `today` is accepted for signature symmetry with this file's other
 *    clock-injected functions but is not read: the sentence states the
 *    placement's relationship to install, never to "now."
 */
export function threadConsequence(
  placement: ThreadPlacement | null,
  installStart: string | null,
  today: string,
): string {
  void today;
  if (placement == null) return '';

  const start = weekdayMonthDay(placement.startsOn);
  const finish = weekdayMonthDay(placement.dueDate);
  if (start == null || finish == null) return '';
  const main = `Starts ${start} · finishes ${finish}`;

  const dueEpoch = epochDayFromISO(placement.dueDate);
  const installEpoch = installStart == null ? null : epochDayFromISO(installStart);
  if (dueEpoch == null || installEpoch == null || installEpoch <= dueEpoch) {
    return `${main} · after install begins`;
  }

  const n = workdaysBetween(dueEpoch + 1, installEpoch - 1);
  return `${main} · leaves ${n} working ${n === 1 ? 'day' : 'days'} before install`;
}
