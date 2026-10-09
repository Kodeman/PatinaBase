import {
  deriveLineStamp,
  isLaborLine,
  laborPiece,
  lineStageInputFromRow,
  type LineStampRow,
} from "@/lib/document/stamp-derivation";
import type { TicketLine } from "@/lib/document/ticket-derivation";

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

/**
 * Whether a live line counts in a placeholder count (T-61 F7): a piece to
 * find. A labor line rides with its piece (one waiting on a vendor is not a
 * piece to find), a Trade Scope presence line is not a piece, and a line not
 * selected is off the job. The band, the overview head, the room rows and the
 * Build room counts all ask this of lines from `liveBuildRoomLines`, so their
 * placeholder counts agree.
 */
export function countsAsPiece(line: {
  line_kind?: string | null;
  trade_scope_document_id?: string | null;
  design_disposition?: string | null;
}): boolean {
  return (
    !isLaborLine(line) &&
    line.trade_scope_document_id == null &&
    line.design_disposition !== "not_selected"
  );
}

/**
 * The US-19 band's ticket lines (the Pieces, Rooms and Spec rows): the Build
 * room's live lines, each with the stamp the paper prints. Only a piece is
 * unspecified while it reads PLACEHOLDER, so the Spec row's `N placeholders`
 * is the overview head's count (T-61 F7).
 */
export function buildRoomTicketLines<
  T extends LineStampRow & {
    id: string;
    project_room_id?: string | null;
    removed_at?: string | null;
    design_disposition?: string | null;
  },
>(rows: readonly T[] | null | undefined): TicketLine[] {
  const live = liveBuildRoomLines(rows);
  return live.map((item) => {
    const stamp = deriveLineStamp({
      ...item,
      stage: lineStageInputFromRow(item, laborPiece(item, live)),
    }).kind;
    return {
      stamp,
      roomId: item.project_room_id ?? null,
      specified: stamp !== "placeholder" || !countsAsPiece(item),
    };
  });
}
