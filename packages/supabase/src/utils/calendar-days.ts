const BARE_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const DATE_HEAD = /^(\d{4})-(\d{2})-(\d{2})/;

/** Year, month (1–12) and day of a matched date, or null when it names no day. */
function realDay(match: RegExpExecArray | null): [number, number, number] | null {
  if (!match) return null;
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const local = new Date(year, month - 1, day);
  return local.getFullYear() === year && local.getMonth() === month - 1 && local.getDate() === day
    ? [year, month, day]
    : null;
}

/**
 * The calendar day a source date names in the viewer's zone. A bare
 * `YYYY-MM-DD` is a DATE: that day, wherever she is. A timestamp is an
 * instant, so it is the local day she was living when it happened (SQ-751 F10).
 */
function localCalendarDay(date: string): [number, number, number] | null {
  const bare = realDay(BARE_DATE.exec(date));
  if (bare) return bare;
  const instant = new Date(date);
  if (Number.isFinite(instant.getTime())) {
    return [instant.getFullYear(), instant.getMonth() + 1, instant.getDate()];
  }
  return realDay(DATE_HEAD.exec(date));
}

/** Calendar-day distance from a date to the viewer's local today. */
export function calendarDaysPast(date: string, now: Date): number {
  const day = localCalendarDay(date);
  if (!day) return 0;
  const dateOrdinal = Date.UTC(day[0], day[1] - 1, day[2]);
  const todayOrdinal = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.floor((todayOrdinal - dateOrdinal) / 86_400_000);
}
