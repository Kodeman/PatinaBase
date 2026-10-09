/**
 * US-21 T-41: the Release lens's derivations (a3; S7, D1 row 6, D18, Q13).
 *
 * - **Stage.** One call, `releaseStamp`, takes a line's word from the D1 mirror
 *   (`deriveLineStamp`), as the paper does, so a Trade Scope line or a line from
 *   `ordered` on is never READY and never released here.
 * - **Readiness.** One sentence naming what stands between the line and the
 *   client: `Needs a product or a maker`, `Needs a client price`, … or `Ready`.
 *   A READY line's sentence comes from the server's own gate
 *   (`get_project_ffe_readiness`, 00733) when it has answered.
 * - **The set.** What `Release N lines` names: every READY piece Leah has set to
 *   Selected that the server calls ready, plus every active labor line on it
 *   (00733 releases labor with its piece). A piece whose labor is not ready
 *   stays out, because the server would refuse the whole release for it.
 * - **A drafted release** (00755 `draft_release_for_project`). Its lines read
 *   `On a drafted release` and never join the set: the server refuses to
 *   release a line a live authorization already names.
 */

import {
  deriveLineStamp,
  isLaborLine,
  laborPiece,
  lineStageInputFromRow,
  type LineStageRow,
  type LineStampKind,
} from "@/lib/document/stamp-derivation";
import {
  REMOVED_PLACE,
  THROUGHOUT_PLACE,
  UNASSIGNED_PLACE,
  type BuildRoomPlace,
} from "./build-room-url";

/** A `useProjectFFEItems` row, as much of it as the Release lens reads. */
export interface ReleaseLensLine extends LineStageRow {
  id: string;
  name: string | null;
  status: string;
  blocked: boolean | null;
  received_quantity: number | null;
  blocking_decision?: { status: string; due_date: string | null } | null;
  item_claims?: { state: string }[] | null;
  trade_scope_document_id?: string | null;
  design_disposition?: string | null;
  assignment_scope?: string | null;
  project_room_id?: string | null;
  line_total_cents?: number | null;
}

/** The server's gate for one line (`useProjectFfeReadiness`). */
export interface ServerReadiness {
  ready: boolean;
  missingFields: readonly string[];
}

export interface ReleaseRoom {
  id: string;
  name: string;
}

/** Leah's three words for what the client sees (a3 `FOR THE CLIENT`). */
export const CLIENT_DISPOSITIONS = [
  "candidate",
  "selected",
  "alternate",
] as const;
export type ClientDisposition = (typeof CLIENT_DISPOSITIONS)[number];

const DISPOSITION_WORD: Record<string, string> = {
  candidate: "Candidate",
  selected: "Selected",
  alternate: "Alternate",
  not_selected: "Not selected",
};

export function dispositionWord(value: string | null | undefined): string {
  return DISPOSITION_WORD[value ?? "candidate"] ?? "Candidate";
}

export const READY_SENTENCE = "Ready";
const NEEDS_MAKER = "Needs a product or a maker";
const NEEDS_PRICE = "Needs a client price";
const NEEDS_QUANTITY = "Needs a quantity";
const WAITS_ON_PIECE = "Ready when its piece is";
const WAITS_ON_LABOR = "Waits on its labor";
const WAITS_ON_DECISION = "Waits on a decision";
export const DRAFTED_SENTENCE = "On a drafted release";

/** The ceremony's money: exact cents when there are any (`$10,499.50`),
 *  whole dollars without `.00` (`$30,760`). */
export function fmtReleaseUsd(cents: number): string {
  const whole = cents % 100 === 0;
  return (cents / 100).toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: whole ? 0 : 2,
    maximumFractionDigits: whole ? 0 : 2,
  });
}

/** D1's maker: a vendor, or a vendor name that is not blank. */
function hasVendorName(line: ReleaseLensLine): boolean {
  return (line.vendor_name ?? "").trim() !== "";
}

/** The server gate's keys (00733 `get_project_ffe_readiness`), first match
 *  printed. `designDisposition` is absent on purpose: Selected is the
 *  `FOR THE CLIENT` column's question, not a blocker. */
const SERVER_BLOCKERS: ReadonlyArray<readonly [string, string]> = [
  ["selection", NEEDS_MAKER],
  ["vendor", "Needs a maker"],
  ["clientPrice", NEEDS_PRICE],
  ["allowanceCeiling", NEEDS_PRICE],
  ["itemType", NEEDS_PRICE],
  ["quantity", NEEDS_QUANTITY],
  ["parent_not_ready", WAITS_ON_PIECE],
  ["releaseBlock", WAITS_ON_DECISION],
  ["room", "Needs a room"],
  ["name", "Needs a name"],
  ["documentCode", "Needs a document code"],
  ["image", "Needs an image"],
];

/** The line's word, from the D1 mirror. The one stage call on this lens. */
export function releaseStamp(
  line: ReleaseLensLine,
  lines: readonly ReleaseLensLine[],
): LineStampKind {
  return deriveLineStamp(
    { ...line, stage: lineStageInputFromRow(line, laborPiece(line, lines)) },
    null,
  ).kind;
}

/** What the client is asked to authorize for the line: a fixed line's total,
 *  an allowance's ceiling (Q12: a filled allowance is still an allowance). */
export function releaseAmountCents(line: ReleaseLensLine): number {
  if (line.item_type === "allowance") return line.budget_max_cents ?? 0;
  return (
    line.line_total_cents ?? (line.quantity ?? 0) * (line.unit_price_cents ?? 0)
  );
}

/** The line's amount as the ceremony prints it: an allowance is `Up to` its
 *  ceiling, everywhere it prints (F4). */
export function releaseAmountText(line: ReleaseLensLine): string {
  const usd = fmtReleaseUsd(releaseAmountCents(line));
  return line.item_type === "allowance" ? `Up to ${usd}` : usd;
}

/** The set's total: `Up to $X` when any line in the sum is an allowance. */
function releaseTotalText(set: ReleaseSet): string {
  const usd = fmtReleaseUsd(set.totalCents);
  return set.rows.some((row) => row.line.item_type === "allowance")
    ? `Up to ${usd}`
    : usd;
}

function serverBlocker(
  line: ReleaseLensLine,
  readiness: ServerReadiness | undefined,
): string | null {
  if (!readiness || readiness.ready) return null;
  for (const [key, sentence] of SERVER_BLOCKERS) {
    // The server's `vendor` key reads vendor_id only; D1 also takes a name.
    if (key === "vendor" && hasVendorName(line)) continue;
    if (readiness.missingFields.includes(key)) return sentence;
  }
  return null;
}

/** The READINESS cell. `null` prints `—`: the line is released, or past the
 *  point where release is the question (ordered on, trade work). */
export function readinessSentence(
  line: ReleaseLensLine,
  kind: LineStampKind,
  lines: readonly ReleaseLensLine[],
  server?: ServerReadiness,
): string | null {
  switch (kind) {
    case "placeholder":
      return NEEDS_MAKER;
    case "specced": {
      const stage = lineStageInputFromRow(line, laborPiece(line, lines));
      const priced =
        (stage.itemType === "fixed" && (stage.unitPriceCents ?? 0) > 0) ||
        (stage.itemType === "allowance" && (stage.budgetMaxCents ?? 0) > 0);
      if (!priced) return NEEDS_PRICE;
      if (stage.quantity <= 0) return NEEDS_QUANTITY;
      return stage.lineKind === "labor" ? WAITS_ON_PIECE : NEEDS_PRICE;
    }
    case "ready":
      return serverBlocker(line, server) ?? READY_SENTENCE;
    case "decision_due":
      return WAITS_ON_DECISION;
    default:
      return null;
  }
}

/** Whether `FOR THE CLIENT` is Leah's to set on this line (a select), or only
 *  read (released), or not a question yet (`—`). */
export type DispositionCell = "select" | "read" | "none";

export interface ReleaseRow {
  line: ReleaseLensLine;
  kind: LineStampKind;
  labor: boolean;
  readiness: string | null;
  disposition: DispositionCell;
}

export interface ReleaseGroup {
  key: string;
  name: string;
  /** A project room: the group carries `READY FOR LEAH`. */
  roomId: string | null;
  rows: ReleaseRow[];
}

export interface ReleaseSet {
  rows: ReleaseRow[];
  pieces: number;
  labor: number;
  totalCents: number;
}

export interface ReleaseLensModel {
  groups: ReleaseGroup[];
  set: ReleaseSet;
}

const THROUGHOUT_KEY = "__throughout__";
const UNASSIGNED_KEY = "__unassigned__";

function groupKey(line: ReleaseLensLine, roomIds: ReadonlySet<string>): string {
  if (
    line.assignment_scope === "room" &&
    line.project_room_id &&
    roomIds.has(line.project_room_id)
  ) {
    return line.project_room_id;
  }
  return line.assignment_scope === "throughout"
    ? THROUGHOUT_KEY
    : UNASSIGNED_KEY;
}

function placeKey(place: BuildRoomPlace): string | null {
  if (place === THROUGHOUT_PLACE) return THROUGHOUT_KEY;
  if (place === UNASSIGNED_PLACE) return UNASSIGNED_KEY;
  return place;
}

/** The ids whose server gate the lens asks for: every line the D1 mirror calls READY. */
export function readyLineIds(lines: readonly ReleaseLensLine[]): string[] {
  return lines
    .filter((line) => releaseStamp(line, lines) === "ready")
    .map((line) => line.id);
}

/**
 * The table across rooms (a3), grouped by primary room in room order, then
 * Throughout, then Not in a room yet, with each labor line under its piece;
 * and the set the ceremony names. `place` narrows both to one rail place
 * (`null` is the whole job).
 */
export function deriveReleaseLens(
  lines: readonly ReleaseLensLine[],
  rooms: readonly ReleaseRoom[],
  place: BuildRoomPlace,
  server: ReadonlyMap<string, ServerReadiness>,
  /** The line ids an unsent draft release names (`useDraftRelease`). */
  drafted: ReadonlySet<string> = new Set(),
): ReleaseLensModel {
  if (place === REMOVED_PLACE) {
    return {
      groups: [],
      set: { rows: [], pieces: 0, labor: 0, totalCents: 0 },
    };
  }
  const roomIds = new Set(rooms.map((r) => r.id));
  const kinds = new Map(lines.map((l) => [l.id, releaseStamp(l, lines)]));
  const laborOf = new Map<string, ReleaseLensLine[]>();
  for (const line of lines) {
    if (isLaborLine(line) && line.parent_ffe_item_id) {
      const held = laborOf.get(line.parent_ffe_item_id) ?? [];
      held.push(line);
      laborOf.set(line.parent_ffe_item_id, held);
    }
  }
  const lineIds = new Set(lines.map((l) => l.id));

  const releasable = (line: ReleaseLensLine) =>
    !drafted.has(line.id) &&
    kinds.get(line.id) === "ready" &&
    line.design_disposition === "selected" &&
    server.get(line.id)?.ready === true;
  const laborHolds = (piece: ReleaseLensLine) =>
    (laborOf.get(piece.id) ?? []).some((labor) => !releasable(labor));

  const toRow = (line: ReleaseLensLine): ReleaseRow => {
    const kind = kinds.get(line.id) ?? "placeholder";
    let readiness = readinessSentence(line, kind, lines, server.get(line.id));
    // Released and ordered-on lines print `—`; a drafted line is neither.
    const onDraft = readiness != null && drafted.has(line.id);
    if (onDraft) {
      readiness = DRAFTED_SENTENCE;
    } else if (
      readiness === READY_SENTENCE &&
      !isLaborLine(line) &&
      laborHolds(line)
    ) {
      readiness = WAITS_ON_LABOR;
    }
    return {
      line,
      kind,
      labor: isLaborLine(line),
      readiness,
      disposition:
        kind === "released" || onDraft
          ? "read"
          : kind === "specced" || kind === "ready"
            ? "select"
            : "none",
    };
  };

  // A labor line rides under its piece; one whose piece is not on the
  // schedule stands in its own place.
  const ordered: ReleaseLensLine[] = [];
  for (const line of lines) {
    const underPiece =
      isLaborLine(line) &&
      line.parent_ffe_item_id != null &&
      lineIds.has(line.parent_ffe_item_id);
    if (underPiece) continue;
    ordered.push(line, ...(laborOf.get(line.id) ?? []));
  }

  const byKey = new Map<string, ReleaseRow[]>();
  let pieceKey = UNASSIGNED_KEY;
  for (const line of ordered) {
    const underPiece =
      isLaborLine(line) &&
      line.parent_ffe_item_id != null &&
      lineIds.has(line.parent_ffe_item_id);
    if (!underPiece) pieceKey = groupKey(line, roomIds);
    const held = byKey.get(pieceKey) ?? [];
    held.push(toRow(line));
    byKey.set(pieceKey, held);
  }

  const wanted = placeKey(place);
  const groups: ReleaseGroup[] = [
    ...rooms.map((r) => ({ key: r.id, name: r.name, roomId: r.id })),
    { key: THROUGHOUT_KEY, name: "Throughout", roomId: null },
    { key: UNASSIGNED_KEY, name: "Not in a room yet", roomId: null },
  ]
    .filter((g) => wanted == null || g.key === wanted)
    .map((g) => ({ ...g, rows: byKey.get(g.key) ?? [] }))
    .filter((g) => g.rows.length > 0);

  const setRows: ReleaseRow[] = [];
  for (const group of groups) {
    for (const row of group.rows) {
      if (row.labor || !releasable(row.line) || laborHolds(row.line)) continue;
      setRows.push(row);
      for (const labor of laborOf.get(row.line.id) ?? []) {
        const laborRow = group.rows.find((r) => r.line.id === labor.id);
        if (laborRow) setRows.push(laborRow);
      }
    }
  }
  const labor = setRows.filter((r) => r.labor).length;
  return {
    groups,
    set: {
      rows: setRows,
      pieces: setRows.length - labor,
      labor,
      totalCents: setRows.reduce(
        (sum, r) => sum + releaseAmountCents(r.line),
        0,
      ),
    },
  };
}

/** The lines an unsent draft names, each labor line under its piece, for the
 *  ceremony to show in place of a new set. */
export function draftReleaseSet(
  lines: readonly ReleaseLensLine[],
  itemIds: readonly string[],
): ReleaseSet {
  const named = new Set(itemIds);
  const onDraft = lines.filter((line) => named.has(line.id));
  const toRow = (line: ReleaseLensLine): ReleaseRow => ({
    line,
    kind: releaseStamp(line, lines),
    labor: isLaborLine(line),
    readiness: DRAFTED_SENTENCE,
    disposition: "read",
  });
  const rows: ReleaseRow[] = [];
  for (const line of onDraft) {
    const underPiece =
      isLaborLine(line) &&
      line.parent_ffe_item_id != null &&
      named.has(line.parent_ffe_item_id);
    if (underPiece) continue;
    rows.push(toRow(line));
    for (const labor of onDraft) {
      if (isLaborLine(labor) && labor.parent_ffe_item_id === line.id) {
        rows.push(toRow(labor));
      }
    }
  }
  const labor = rows.filter((r) => r.labor).length;
  return {
    rows,
    pieces: rows.length - labor,
    labor,
    totalCents: rows.reduce((sum, r) => sum + releaseAmountCents(r.line), 0),
  };
}

const lineWord = (n: number) => (n === 1 ? "line" : "lines");

/** `Drafted, not sent · 7 lines · $30,760:` */
export function draftReleaseHead(set: ReleaseSet): string {
  const n = set.rows.length;
  return `Drafted, not sent · ${n} ${lineWord(n)} · ${releaseTotalText(set)}:`;
}

/** `This release · 7 lines · $30,760:` */
export function releaseSetHead(set: ReleaseSet): string {
  const n = set.rows.length;
  return `This release · ${n} ${lineWord(n)} · ${releaseTotalText(set)}:`;
}

/** The consequence sentence directly above the terminal act (a3). */
export function releaseConsequence(set: ReleaseSet): string {
  const n = set.rows.length;
  const head =
    n === 1
      ? "Releasing sends this line to the client for authorization"
      : `Releasing sends these ${n} lines to the client for authorization`;
  const pieceWords = `${set.pieces} ${set.pieces === 1 ? "piece" : "pieces"}`;
  const laborWords =
    set.labor === 0
      ? ""
      : set.labor === 1
        ? `: ${pieceWords} and the one labor line that goes with its piece`
        : `: ${pieceWords} and the ${set.labor} labor lines that go with ${
            set.pieces === 1 ? "its piece" : "their pieces"
          }`;
  const lock =
    n === 1
      ? "Its price locks when the client signs."
      : "Their prices lock when the client signs.";
  return `${head}${laborWords}. ${lock}`;
}

/** `Release 7 lines · $30,760 for authorization` */
export function releaseActLabel(set: ReleaseSet): string {
  const n = set.rows.length;
  return `Release ${n} ${lineWord(n)} · ${releaseTotalText(set)} for authorization`;
}
