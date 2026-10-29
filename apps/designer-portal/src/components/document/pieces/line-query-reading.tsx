"use client";

// Its own module so the document's FF&E section prints this line without
// pulling the whole Build-room shell into the /doc route's eager chunks (G5).

type LineQueryState = ReturnType<typeof import("./line-query").lineQueryState>;

/** Completeness belongs to the canonical query, not the currently scoped room. */
export function LineQueryReading({ state }: { state: LineQueryState }) {
  const count = state.total === null
    ? "Schedule total unknown"
    : "Whole schedule · " + state.total + (state.total === 1 ? " line" : " lines");
  const reading = state.error
    ? "The schedule could not be refreshed."
    : state.loading
      ? "Reading the schedule…"
      : state.refreshing
        ? "Refreshing the schedule…"
        : state.stale
          ? "Showing the last complete schedule; not yet refreshed."
          : "Schedule up to date.";
  return (
    <p role={state.error ? "alert" : "status"} data-line-query=""
      className="px-4 py-2 text-[12px] text-[var(--sheet-ink-muted)]">
      {count}. {state.error && state.total === null ? "The schedule could not be read." : reading}
      {state.error && state.total !== null ? " Showing the last complete schedule." : null}
    </p>
  );
}
