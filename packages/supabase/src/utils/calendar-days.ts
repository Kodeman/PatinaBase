/** Calendar-day distance from a bare date to the viewer's local today. */
export function calendarDaysPast(date: string, now: Date): number {
  const datePart = date.slice(0, 10);
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(datePart);
  if (!match) return 0;
  const [, year, month, day] = match;
  const localDay = new Date(Number(year), Number(month) - 1, Number(day));
  if (
    localDay.getFullYear() !== Number(year) ||
    localDay.getMonth() !== Number(month) - 1 ||
    localDay.getDate() !== Number(day)
  ) return 0;
  const dateOrdinal = Date.UTC(Number(year), Number(month) - 1, Number(day));
  const todayOrdinal = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.floor((todayOrdinal - dateOrdinal) / 86_400_000);
}
