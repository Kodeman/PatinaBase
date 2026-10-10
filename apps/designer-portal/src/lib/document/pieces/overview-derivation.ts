/**
 * The Document's Pieces overview (US-21 Q14, S7, SPEC a1/a10/a12): one row per
 * room under a head that counts the job. Pure; the stage is `pieceLineStage`'s,
 * as every lens and the Build room head read it, so these words and counts
 * never disagree with a line's stamp.
 *
 * A line counts once in each room it is placed in, and once on the job. A
 * labor line counts as a line; it rides with its piece, so the head's stage
 * sentence counts pieces only (a1: `26 lines` beside `21 placeholders ·
 * 4 specced`, the 26th being the hanger's labor). A trade scope's presence
 * line is not a piece either: it counts as a line, never as a placeholder,
 * as its stamp never reads PLACEHOLDER.
 *
 * The money figure is the line's client price where it has one and its rough
 * figure where it has not, per unit, times its quantity; an allowance counts
 * at its ceiling, the line total. A placed line's money is split across its
 * rooms by placed quantity over the placed sum, so the waste is shared and
 * the rooms sum to the job (T-55b, F13), in integer cents by largest
 * remainder as the account page and 00757 split it. Ready lines are
 * `priced`, released lines `released`, the rest `roughed`. A superseded
 * predecessor never counts (`liveBuildRoomLines`).
 */
import { fmtUsd } from "@/lib/document/format";
import { laborPiece, type LineStage } from "@/lib/document/stamp-derivation";
import {
  THROUGHOUT_PLACE,
  UNASSIGNED_PLACE,
} from "@/lib/document/pieces/build-room-url";
import {
  pieceLineStage,
  type PieceLineStageRow,
} from "@/lib/document/pieces/line-stage";
import {
  countsAsPiece,
  liveBuildRoomLines,
} from "@/lib/document/pieces/live-lines";

export interface OverviewLine extends PieceLineStageRow {
  id: string;
  project_room_id?: string | null;
  assignment_scope?: string | null;
  removed_at?: string | null;
  design_disposition?: string | null;
  rough_cents?: number | null;
}

/** As `useProjectRoomPlacements` returns them (00734). */
export interface OverviewPlacement {
  ffeItemId: string;
  projectRoomId: string;
  quantity: number;
}

export interface OverviewRoom {
  id: string;
  name: string;
}

export interface OverviewTally {
  lines: number;
  /** Stage counts over pieces (labor lines ride with their piece). */
  placeholders: number;
  specced: number;
  ready: number;
  released: number;
  pricedCents: number;
  roughedCents: number;
  releasedCents: number;
}

export type OverviewMark = "settled" | "active" | "future";

export interface OverviewRow {
  /** A room id, or `throughout` / `unassigned`. Also the Build room's `?room=`. */
  key: string;
  /** The project room, or null for Throughout and Not in a room yet. */
  roomId: string | null;
  name: string;
  /** Every line the room holds, placed lines included, in schedule order. */
  lineIds: string[];
  /** Only the lines whose primary room this is (each line once on the page). */
  primaryLineIds: string[];
  tally: OverviewTally;
  /** Room placeholders count pieces only, as the head does (`6 lines ·
   *  5 placeholders`; T-61 F7, `countsAsPiece`). */
  placeholderLines: number;
  mark: OverviewMark;
}

function emptyTally(): OverviewTally {
  return {
    lines: 0,
    placeholders: 0,
    specced: 0,
    ready: 0,
    released: 0,
    pricedCents: 0,
    roughedCents: 0,
    releasedCents: 0,
  };
}

/** The line's count stage; null on a Trade Scope line before an order. */
export function overviewStage(
  line: OverviewLine,
  live: readonly OverviewLine[],
): LineStage | null {
  return pieceLineStage(line, laborPiece(line, live)).stage;
}

/**
 * The line's money, in whole cents. An allowance counts at its ceiling, which
 * is the line total (00744 step 10, the Release amount): never multiplied, and
 * never its stale unit price. Any other line counts its client price per unit,
 * else its rough figure, times its quantity.
 */
function lineCents(line: OverviewLine): number {
  if (line.item_type === "allowance" && (line.budget_max_cents ?? 0) > 0) {
    return line.budget_max_cents ?? 0;
  }
  const each =
    (line.unit_price_cents ?? 0) > 0
      ? (line.unit_price_cents ?? 0)
      : Math.max(0, line.rough_cents ?? 0);
  return Math.round(each * (line.quantity ?? 0));
}

/**
 * Split `totalCents` across rooms by placed quantity over the placed sum, so
 * the rooms add up to the total exactly: integer cents by largest remainder,
 * ties to placement order. Mirrors T-51's `splitByShare`
 * (hooks/use-account-page.ts, not exported) and 00757. A zero placed sum puts
 * the whole total in the first room.
 */
export function splitCentsByShare(
  totalCents: number,
  quantities: readonly number[],
): number[] {
  if (quantities.length === 0) return [];
  const sum = quantities.reduce((s, q) => s + q, 0);
  if (sum <= 0) return quantities.map((_, i) => (i === 0 ? totalCents : 0));
  const raw = quantities.map((q) => (totalCents * q) / sum);
  const cents = raw.map(Math.floor);
  let left = totalCents - cents.reduce((s, c) => s + c, 0);
  const byRemainder = raw
    .map((r, i) => ({ i, rem: r - cents[i] }))
    .sort((a, b) => b.rem - a.rem || a.i - b.i);
  for (const { i } of byRemainder) {
    if (left <= 0) break;
    cents[i] += 1;
    left -= 1;
  }
  return cents;
}

function add(
  tally: OverviewTally,
  line: OverviewLine,
  stage: LineStage | null,
  cents: number,
): void {
  tally.lines += 1;
  if (stage === "released") tally.releasedCents += cents;
  else if (stage === "ready") tally.pricedCents += cents;
  else tally.roughedCents += cents;
  if (!countsAsPiece(line)) return;
  if (stage === "placeholder") tally.placeholders += 1;
  else if (stage === "specced") tally.specced += 1;
  else if (stage === "ready") tally.ready += 1;
  else tally.released += 1;
}

/** The job, each live line once. Needs no placements. */
export function deriveOverviewJob(
  lines: readonly OverviewLine[] | null | undefined,
): OverviewTally {
  const live = liveBuildRoomLines(lines);
  const job = emptyTally();
  for (const line of live) {
    add(job, line, overviewStage(line, live), lineCents(line));
  }
  return job;
}

/**
 * The room rows: every project room in its order (a room with no lines still
 * prints), then Throughout and Not in a room yet when they hold a line.
 */
export function deriveOverviewRows(
  lines: readonly OverviewLine[] | null | undefined,
  placements: readonly OverviewPlacement[] | null | undefined,
  rooms: readonly OverviewRoom[] | null | undefined,
): OverviewRow[] {
  const live = liveBuildRoomLines(lines);
  const knownRooms = rooms ?? [];
  const row = (key: string, roomId: string | null, name: string): OverviewRow => ({
    key,
    roomId,
    name,
    lineIds: [],
    primaryLineIds: [],
    tally: emptyTally(),
    placeholderLines: 0,
    mark: "future",
  });
  const byKey = new Map<string, OverviewRow>();
  for (const room of knownRooms) byKey.set(room.id, row(room.id, room.id, room.name));
  const throughout = row(THROUGHOUT_PLACE, null, "Throughout");
  const unassigned = row(UNASSIGNED_PLACE, null, "Not in a room yet");

  const placementsByLine = new Map<string, OverviewPlacement[]>();
  for (const placement of placements ?? []) {
    const list = placementsByLine.get(placement.ffeItemId) ?? [];
    list.push(placement);
    placementsByLine.set(placement.ffeItemId, list);
  }

  const settledByRow = new Map<OverviewRow, boolean>();
  const place = (target: OverviewRow, line: OverviewLine, stage: LineStage | null, cents: number, primary: boolean) => {
    target.lineIds.push(line.id);
    if (primary) target.primaryLineIds.push(line.id);
    add(target.tally, line, stage, cents);
    if (stage === "placeholder" && countsAsPiece(line)) target.placeholderLines += 1;
    settledByRow.set(target, (settledByRow.get(target) ?? true) && stage === "released");
  };

  for (const line of live) {
    const stage = overviewStage(line, live);
    const quantity = line.quantity ?? 0;
    // The primary room plus every placement, each room once.
    const shares = new Map<string, number>();
    for (const placement of placementsByLine.get(line.id) ?? []) {
      shares.set(placement.projectRoomId, placement.quantity);
    }
    if (line.project_room_id && !shares.has(line.project_room_id)) {
      shares.set(line.project_room_id, shares.size === 0 ? quantity : 0);
    }
    const primaryRoom =
      line.project_room_id && byKey.has(line.project_room_id)
        ? line.project_room_id
        : [...shares.keys()].find((id) => byKey.has(id)) ?? null;

    // The rooms the overview prints, in placement order, sharing the line's
    // money by placed quantity (the waste past the placed sum included).
    const known = [...shares].filter(([roomId]) => byKey.has(roomId));
    const total = lineCents(line);
    if (known.length > 0) {
      const cents = splitCentsByShare(
        total,
        known.map(([, share]) => share),
      );
      known.forEach(([roomId], i) => {
        place(byKey.get(roomId)!, line, stage, cents[i], roomId === primaryRoom);
      });
      continue;
    }
    place(
      line.assignment_scope === "unassigned" ? unassigned : throughout,
      line,
      stage,
      total,
      true,
    );
  }

  const rows = knownRooms.map((room) => byKey.get(room.id)!);
  if (throughout.tally.lines > 0) rows.push(throughout);
  if (unassigned.tally.lines > 0) rows.push(unassigned);
  for (const r of rows) {
    r.mark = r.tally.lines === 0 ? "future" : settledByRow.get(r) ? "settled" : "active";
  }
  return rows;
}

const count = (n: number, one: string, many: string) =>
  `${n} ${n === 1 ? one : many}`;

/** Head line one: `by room · 7 rooms · 26 lines`. */
export function overviewHeadStatus(roomCount: number, job: OverviewTally): string {
  return `by room · ${count(roomCount, "room", "rooms")} · ${count(job.lines, "line", "lines")}`;
}

/** Head line two: `21 placeholders · 4 specced · nothing released`. */
export function overviewHeadStages(job: OverviewTally): string {
  const parts: string[] = [];
  if (job.placeholders > 0) parts.push(count(job.placeholders, "placeholder", "placeholders"));
  if (job.specced > 0) parts.push(`${job.specced} specced`);
  if (job.ready > 0) parts.push(`${job.ready} ready`);
  parts.push(job.released > 0 ? `${job.released} released` : "nothing released");
  return parts.join(" · ");
}

/** The front matter: `$30,760 priced · ~$36,368 roughed · nothing released`. */
export function overviewFrontMatter(job: OverviewTally): string | null {
  if (job.lines === 0) return null;
  const parts: string[] = [];
  if (job.pricedCents > 0) parts.push(`${fmtUsd(job.pricedCents)} priced`);
  if (job.roughedCents > 0) parts.push(`~${fmtUsd(job.roughedCents)} roughed`);
  parts.push(
    job.releasedCents > 0 || job.released > 0
      ? `${fmtUsd(job.releasedCents)} released`
      : "nothing released",
  );
  return parts.join(" · ");
}

/** A room row's counts: `6 lines · 5 placeholders`. */
export function overviewRowCounts(row: OverviewRow): string {
  return `${count(row.tally.lines, "line", "lines")} · ${count(
    row.placeholderLines,
    "placeholder",
    "placeholders",
  )}`;
}

/** A room row's figure: `~$23,564`, `~` while any of it is rough; none at $0. */
export function overviewRowFigure(row: OverviewRow): string | null {
  const { pricedCents, roughedCents, releasedCents } = row.tally;
  const total = pricedCents + roughedCents + releasedCents;
  if (total <= 0) return null;
  return `${roughedCents > 0 ? "~" : ""}${fmtUsd(total)}`;
}
