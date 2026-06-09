/**
 * Parse a human-entered duration string into whole minutes.
 *
 * Accepted forms (case-insensitive, whitespace-tolerant):
 *   "1:30"      → 90   (h:mm)
 *   "1.5h"      → 90   (decimal hours; "1.5", "1.5 hr", "1.5 hours" too)
 *   "90m"       → 90   (minutes; "90 min", "90 minutes" too)
 *   "1h 30m"    → 90   (combined; "1h30" too)
 *   "90"        → 90   (bare number ≥ 15 reads as minutes…)
 *   "2"         → 120  (…bare number < 15 reads as hours — nobody logs 2 minutes)
 *
 * Returns null for anything unparseable or non-positive.
 */
export function parseDurationToMinutes(input: string): number | null {
  const raw = input.trim().toLowerCase();
  if (!raw) return null;

  // h:mm — "1:30"
  const colon = raw.match(/^(\d{1,3}):([0-5]?\d)$/);
  if (colon) {
    const minutes = parseInt(colon[1], 10) * 60 + parseInt(colon[2], 10);
    return minutes > 0 ? minutes : null;
  }

  // Combined "1h 30m" / "1h30m" / "1h30" / "1 h 30 min"
  const combined = raw.match(/^(\d+(?:\.\d+)?)\s*h(?:rs?|ours?)?\s*(?:(\d+)\s*(?:m(?:in(?:ute)?s?)?)?)?$/);
  if (combined) {
    const hours = parseFloat(combined[1]);
    const mins = combined[2] ? parseInt(combined[2], 10) : 0;
    const total = Math.round(hours * 60 + mins);
    return total > 0 ? total : null;
  }

  // Minutes — "90m" / "90 min" / "90 minutes"
  const minutesOnly = raw.match(/^(\d+(?:\.\d+)?)\s*m(?:in(?:ute)?s?)?$/);
  if (minutesOnly) {
    const total = Math.round(parseFloat(minutesOnly[1]));
    return total > 0 ? total : null;
  }

  // Bare number — small values read as hours, larger as minutes.
  const bare = raw.match(/^(\d+(?:\.\d+)?)$/);
  if (bare) {
    const n = parseFloat(bare[1]);
    if (n <= 0) return null;
    const total = Math.round(n < 15 ? n * 60 : n);
    return total > 0 ? total : null;
  }

  return null;
}

/** Format minutes for display — 90 → "1:30", 45 → "0:45". */
export function formatMinutes(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  return `${h}:${String(m).padStart(2, '0')}`;
}
