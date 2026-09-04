/* ── The mat's two line styles ──────────────────────────────────────────────
   Kept out of `mat.tsx` so a column the mat renders can wear the mat's own
   lines without importing the mat back: `mat` → `other-houses` → `mat` is a
   cycle that only survives while both constants are read inside a component
   body, and turns into a module-scope ReferenceError the day one isn't.
   ────────────────────────────────────────────────────────────────────────── */

export const LINE_CLASS =
  'block w-full border-t border-[var(--border-subtle)] py-2 text-left text-[15px] leading-[1.5] text-[var(--text-body)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[3px] focus-visible:outline-[var(--threshold-accent,#8A5F19)]';

export const COLUMN_HEAD_CLASS =
  'mb-2.5 font-mono text-[11px] font-normal uppercase leading-[1.5] tracking-[0.14em] text-[var(--text-muted)]';

/** The muted second line under a mat line — a location, a quiet sentence. */
export const SUBLINE_CLASS =
  'block font-mono text-[11px] leading-[1.5] tracking-[0.04em] text-[var(--text-muted)]';
