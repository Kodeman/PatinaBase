/**
 * The lines the Build room counts (US-21 T-55b, F7): not removed, and not a
 * superseded predecessor. A supersede (00750) leaves the old line on the
 * schedule with `design_disposition = 'superseded'` beside its successor; it
 * never counts in a lens, a room count or the overview, or its placements and
 * money would count twice. Every pieces read of `useProjectFFEItems` passes
 * through here.
 */
export function liveBuildRoomLines<
  T extends { removed_at?: string | null; design_disposition?: string | null },
>(lines: readonly T[] | null | undefined): T[] {
  return (lines ?? []).filter(
    (line) =>
      line.removed_at == null && line.design_disposition !== "superseded",
  );
}
