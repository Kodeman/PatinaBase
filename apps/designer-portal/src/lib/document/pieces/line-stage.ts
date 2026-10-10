/**
 * A line's stage in the Build room (US-21 D1, T-33c). Every lens, the head's
 * counts and the Pieces overview read a line through `pieceLineStage`, so the
 * same line gets the same word, the same count and the same lock everywhere.
 *
 * D1's precedence is stamp-derivation's: a Trade Scope presence line prints
 * its trade word (R3), and a line from `ordered` on prints its goods word
 * (R5); only a line before an order reads D1's pre-order word
 * (`deriveLineStage`). The rules are not restated here: both words come from
 * `deriveLineStamp` and `deriveLineStage`.
 *
 * R1 and R2 decide first, as on the paper and in Release: `useProjectFFEItems`
 * embeds `blocked`, `blocking_decision` and `item_claims`, so a pending
 * blocking decision reads DECISION DUE and an open damage claim DAMAGED. Such
 * a line is not ready to release, so before an order a READY line counts as
 * specced until the decision or claim is settled.
 */
import {
  deriveLineStage,
  deriveLineStamp,
  lineStageInputFromRow,
  type LineStage,
  type LineStageRow,
  type LineStampKind,
  type TradeLineProgress,
} from "@/lib/document/stamp-derivation";

/** The refusal on every act of a Trade Scope presence line. */
export const TRADE_SCOPE_REASON = "Trade Scope lines change in their scope.";

/** Where `ffe_line_stage` (00736) returns NULL and the goods words take over (R5). */
const ORDERED_ON: ReadonlySet<string> = new Set([
  "ordered",
  "production",
  "shipped",
  "delivered",
  "installed",
]);

export interface PieceLineStageRow extends LineStageRow {
  trade_scope_document_id?: string | null;
  received_quantity?: number | null;
  blocked?: boolean | null;
  blocking_decision?: { status: string; due_date: string | null } | null;
  item_claims?: { state: string }[] | null;
}

/** R1 and R2: the words that win over every stage. */
const HELD: ReadonlySet<LineStampKind> = new Set(["decision_due", "damaged"]);

/** Why no act in any lens may change the line; null when it is open. */
export type PieceLineLock = "trade_scope" | "ordered" | null;

export interface PieceLineStage {
  /** The word the line prints, through `lineStampLabel`. */
  kind: LineStampKind;
  /**
   * What the counts read: D1's stage before an order, and `released` from
   * `ordered` on. Null on a Trade Scope line before an order: it is not a
   * piece and has no pre-order stage, so it is never a placeholder.
   */
  stage: LineStage | null;
  lock: PieceLineLock;
}

/**
 * The one reading of a line's stage in the Build room. Pass a labor line's
 * piece as `piece` (`laborPiece(line, lines)`); it is ignored on any other
 * line. `tradeProgress` follows `deriveLineStamp`: omitted, a presence line
 * reads `Engaged`.
 */
export function pieceLineStage(
  line: PieceLineStageRow,
  piece?: LineStageRow | null,
  tradeProgress?: TradeLineProgress | null,
): PieceLineStage {
  const input = lineStageInputFromRow(line, piece);
  const trade = line.trade_scope_document_id != null;
  const ordered = ORDERED_ON.has(line.status ?? "");
  const { kind } = deriveLineStamp(
    {
      status: line.status ?? "",
      blocked: line.blocked ?? null,
      blocking_decision: line.blocking_decision ?? null,
      item_claims: line.item_claims ?? null,
      received_quantity: line.received_quantity ?? null,
      quantity: line.quantity ?? null,
      trade_scope_document_id: line.trade_scope_document_id ?? null,
      stage: input,
    },
    tradeProgress,
  );
  if (!trade && !ordered) {
    const stage = deriveLineStage(input);
    if (!HELD.has(kind)) return { kind: stage, stage, lock: null };
    return { kind, stage: stage === "ready" ? "specced" : stage, lock: null };
  }
  return {
    kind,
    stage: ordered ? "released" : null,
    lock: trade ? "trade_scope" : "ordered",
  };
}
