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
 * The Build room's rows carry no blocking-decision or damage-claim embeds, so
 * R1 and R2 never decide here; they stay with the paper.
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
}

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
  if (!trade && !ordered) {
    const stage = deriveLineStage(input);
    return { kind: stage, stage, lock: null };
  }
  const { kind } = deriveLineStamp(
    {
      status: line.status ?? "",
      blocked: null,
      received_quantity: line.received_quantity ?? null,
      quantity: line.quantity ?? null,
      trade_scope_document_id: line.trade_scope_document_id ?? null,
      stage: input,
    },
    tradeProgress,
  );
  return {
    kind,
    stage: ordered ? "released" : null,
    lock: trade ? "trade_scope" : "ordered",
  };
}
