/**
 * The Build room's counts (US-21 a5, SPEC §4.4, CONTRACT §3.6). A placed line
 * counts once in each of its rooms; a labor line counts as a line. The stage
 * is `pieceLineStage`'s, as every lens and the overview read it, so these
 * counts and the stamps never disagree: a line from `ordered` on counts as
 * released, and a Trade Scope line before an order counts in no stage.
 *
 * Rough $ is per unit (`~$4,800 each`). In a room it is multiplied by that
 * room's share of a placed line, and on the job by the line's quantity, so a
 * placed line's figure is split by share and never multiplied by its rooms.
 */
import { laborPiece, type LineStage } from "@/lib/document/stamp-derivation";
import {
  pieceLineStage,
  type PieceLineStageRow,
} from "@/lib/document/pieces/line-stage";
import {
  countsAsPiece,
  liveBuildRoomLines,
} from "@/lib/document/pieces/live-lines";

export interface RoomCounts {
  lines: number;
  placeholders: number;
  specced: number;
  ready: number;
  released: number;
  roughCents: number;
}

export interface RoomCountsLine extends PieceLineStageRow {
  id: string;
  project_room_id?: string | null;
  assignment_scope?: string | null;
  removed_at?: string | null;
  design_disposition?: string | null;
  rough_cents?: number | null;
}

/** As `useProjectRoomPlacements` returns them (00734). */
export interface RoomCountsPlacement {
  ffeItemId: string;
  projectRoomId: string;
  quantity: number;
}

export interface BuildRoomCounts {
  /** Keyed by project room id; every room passed in has an entry. */
  rooms: Record<string, RoomCounts>;
  /** Not in a known room, and not marked unassigned (the paper's "Throughout"). */
  throughout: RoomCounts;
  /** `Not in a room yet`. */
  unassigned: RoomCounts;
  /** Each live line once. */
  job: RoomCounts;
}

export function emptyRoomCounts(): RoomCounts {
  return {
    lines: 0,
    placeholders: 0,
    specced: 0,
    ready: 0,
    released: 0,
    roughCents: 0,
  };
}

function add(
  counts: RoomCounts,
  stage: LineStage | null,
  roughCents: number,
  piece: boolean,
): void {
  counts.lines += 1;
  // T-61 F7: a placeholder count counts pieces only (`countsAsPiece`).
  if (stage === "placeholder") counts.placeholders += piece ? 1 : 0;
  else if (stage === "specced") counts.specced += 1;
  else if (stage === "ready") counts.ready += 1;
  else if (stage === "released") counts.released += 1;
  counts.roughCents += roughCents;
}

export function deriveRoomCounts(
  lines: readonly RoomCountsLine[] | null | undefined,
  placements: readonly RoomCountsPlacement[] | null | undefined,
  roomIds: readonly string[],
): BuildRoomCounts {
  const rooms: Record<string, RoomCounts> = {};
  for (const id of roomIds) rooms[id] = emptyRoomCounts();
  const result: BuildRoomCounts = {
    rooms,
    throughout: emptyRoomCounts(),
    unassigned: emptyRoomCounts(),
    job: emptyRoomCounts(),
  };

  const placementsByLine = new Map<string, RoomCountsPlacement[]>();
  for (const placement of placements ?? []) {
    const list = placementsByLine.get(placement.ffeItemId) ?? [];
    list.push(placement);
    placementsByLine.set(placement.ffeItemId, list);
  }

  const live = liveBuildRoomLines(lines);
  for (const line of live) {
    const { stage } = pieceLineStage(line, laborPiece(line, live));
    const piece = countsAsPiece(line);
    const roughEach = line.rough_cents ?? 0;
    const quantity = line.quantity ?? 0;
    add(result.job, stage, roughEach * quantity, piece);

    // The primary room plus every placement, each room once.
    const shares = new Map<string, number>();
    for (const placement of placementsByLine.get(line.id) ?? []) {
      shares.set(placement.projectRoomId, placement.quantity);
    }
    if (line.project_room_id && !shares.has(line.project_room_id)) {
      shares.set(line.project_room_id, shares.size === 0 ? quantity : 0);
    }

    let inKnownRoom = false;
    for (const [roomId, share] of shares) {
      const counts = rooms[roomId];
      if (!counts) continue;
      inKnownRoom = true;
      add(counts, stage, roughEach * share, piece);
    }
    if (inKnownRoom) continue;
    add(
      line.assignment_scope === "unassigned"
        ? result.unassigned
        : result.throughout,
      stage,
      roughEach * quantity,
      piece,
    );
  }
  return result;
}
