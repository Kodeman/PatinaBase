'use client';

/**
 * The one loading register (doc-polish W5). Nine sections used to speak nine
 * different bespoke italic sentences while their queries were in flight —
 * simultaneously, on a single cold load. This is the single quiet skeleton
 * bar every one of them renders instead: no prose, one muted pulse, the
 * human-readable label preserved for assistive tech via sr-only text so a
 * screen reader still hears what is loading even though sighted readers no
 * longer see seven sentences competing for attention. Mirrors the muted
 * `animate-pulse` skeleton idiom already established in project-mood-boards.tsx
 * and recent-boards-strip.tsx, rather than inventing a new one.
 *
 * D-B39 / W5-R3 — a SECOND form, `variant="inline"`. The block form (default)
 * stands in for a body that does not exist yet, and its own line box is the
 * shift D-B16 permits. The inline form is for the other kind of site: one
 * that prints BESIDE content already read, under a head — there, the bar's
 * mount/unmount must never move what stands above or below it. It rides as
 * the LAST inline child of the head's own count line (or, for a sub-block
 * with no head, the nearest printed line above it), at the line's own size,
 * so the line box that holds it exists — unchanged — whether the bar is
 * mounted or not. `<span>`, never `<p>`: it is a passenger inside another
 * line, never a line of its own.
 */
export function SectionLoadingLine({
  label,
  className = '',
  variant = 'block',
}: {
  label: string;
  className?: string;
  variant?: 'block' | 'inline';
}) {
  if (variant === 'inline') {
    return (
      // `aria-busy` is the CONTRACT (D-B46): the lens's resolution gate reads
      // `[aria-busy="true"], .animate-pulse` on the paper to know that a body
      // is still arriving, and `aria-busy` is the half that survives a class
      // rename. Both forms carry it; both unmount when their data lands.
      <span role="status" aria-live="polite" aria-busy="true" className={className}>
        <span
          aria-hidden
          className="ml-[0.5ch] inline-block h-[0.85em] w-[3ch] animate-pulse rounded-[2px] bg-[var(--color-pearl)] align-middle motion-reduce:animate-none"
        />
        <span className="sr-only">{label}</span>
      </span>
    );
  }

  return (
    // text-[11.5px]: the bespoke sentences this bar replaced sat between
    // 9px and 13px, clustered around 11.5-12px — this keeps the bar's
    // 0.85em height in that register instead of inheriting the ~16px body
    // size (no call site passes a font-size override today).
    <p
      role="status"
      aria-live="polite"
      aria-busy="true"
      className={`my-1 text-[11.5px] ${className}`}
    >
      <span
        aria-hidden
        className="inline-block h-[0.85em] w-24 max-w-[45%] animate-pulse rounded-[2px] bg-[var(--color-pearl)] align-middle motion-reduce:animate-none"
      />
      <span className="sr-only">{label}</span>
    </p>
  );
}
