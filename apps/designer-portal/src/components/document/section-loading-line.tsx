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
 */
export function SectionLoadingLine({
  label,
  className = '',
}: {
  label: string;
  className?: string;
}) {
  return (
    <p role="status" aria-live="polite" aria-busy="true" className={`my-1 ${className}`}>
      <span
        aria-hidden
        className="inline-block h-[0.85em] w-24 max-w-[45%] animate-pulse rounded-[2px] bg-[var(--bg-muted)] align-middle motion-reduce:animate-none"
      />
      <span className="sr-only">{label}</span>
    </p>
  );
}
