// Small, deliberately-duplicated twin of supabase/functions/morning-brief/
// compose.ts's chicagoDateOf. The edge function runs in Deno and cannot
// import Node/Next.js code (and vice versa) — this is the one place the
// admin portal needs "today in America/Chicago" (the Morning Brief panel's
// GET route, to look up today's brief before falling back to the latest
// available row). Keep in sync if the edge function's version changes.

/** The America/Chicago calendar date (YYYY-MM-DD) containing `date`. */
export function chicagoDateOf(date: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Chicago',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}
