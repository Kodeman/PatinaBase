"use client";

import { useId, useState, type FormEvent, type KeyboardEvent } from "react";
import { useAddLaborLine } from "@patina/supabase";
import type { FfeLineUnit } from "@patina/types";
import {
  LABOR_STAMP_LABEL,
  isLaborLine,
  lineStampLabel,
  type LineStage,
} from "@/lib/document/stamp-derivation";
import {
  pieceLineStage,
  type PieceLineStageRow,
} from "@/lib/document/pieces/line-stage";
import { perUnit, unitWord } from "./placement-chips";

/**
 * T-30 (S4, D4/D5, Q5, a7): `ADD LABOR` on a piece. Labor is its own line,
 * indented `↳` under its piece, with its own unit and rough price; it bills on
 * its own line and is released with its piece, never on the maker's PO.
 * `add_labor_line` (00732) is the only writer and refuses the same pieces the
 * act is gated on here.
 */

export type LaborPieceRow = PieceLineStageRow & {
  id: string;
  name: string;
  unit?: string | null;
  purchase_order_id?: string | null;
};

export type LaborLineRow = PieceLineStageRow & {
  id: string;
  name: string;
  unit?: string | null;
  rough_cents?: number | null;
};

const UNITS: FfeLineUnit[] = [
  "each",
  "sq_ft",
  "lin_ft",
  "roll",
  "yard",
  "box",
  "hour",
  "lot",
];

const ACT_CLS =
  "inline-flex min-h-[44px] min-w-[44px] items-center font-mono text-[12px] font-medium uppercase tracking-[.06em] text-[color:var(--sheet-ink,#1A1816)] underline decoration-1 underline-offset-4 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--clay-ink)] aria-disabled:cursor-not-allowed aria-disabled:text-[color:var(--sheet-ink-faint,#6B655E)]";
const INPUT_CLS =
  "h-8 rounded-[2px] border border-[color:var(--sheet-rule-strong,#1A1816)] bg-[color:var(--sheet,#FFFFFF)] px-2 font-sans text-[14px] text-[color:var(--sheet-ink,#1A1816)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--clay-ink)]";
const LABEL_CLS =
  "font-mono text-[11px] font-medium uppercase text-[color:var(--sheet-ink-muted,#4A4540)]";
const STAMP_CLS =
  "rounded-[2px] border px-2 py-1 font-mono text-[11px] uppercase leading-none tracking-[.06em]";

const STAGE_STAMP_CLS: Record<LineStage, string> = {
  placeholder:
    "border-dashed border-[color:var(--sheet-ink-faint,#6B655E)] text-[color:var(--sheet-ink-faint,#6B655E)]",
  specced:
    "border-[color:var(--sheet-rule-strong,#1A1816)] text-[color:var(--sheet-ink,#1A1816)]",
  ready:
    "border-[color:var(--sheet-rule-strong,#1A1816)] text-[color:var(--sheet-ink,#1A1816)]",
  released:
    "border-[color:var(--sheet-ink,#1A1816)] bg-[color:var(--sheet-ink,#1A1816)] text-[color:var(--sheet,#FFFFFF)]",
};

/** Whole dollars or dollars and cents, typed with or without `$` and commas. */
export function parseRoughCents(raw: string): number | null | "invalid" {
  const text = raw.replace(/[~$,\s]/g, "");
  if (text === "") return null;
  if (!/^\d+(\.\d{1,2})?$/.test(text)) return "invalid";
  return Math.round(Number(text) * 100);
}

/** Why the piece takes no labor now, as `add_labor_line` refuses it; null when it can. */
export function laborGate(piece: LaborPieceRow): string | null {
  if (piece.parent_ffe_item_id)
    return "Labor attaches to a piece, not to a line that supplies one.";
  if (piece.trade_scope_document_id)
    return "This line is a Trade Scope; its work is billed by the scope.";
  if (piece.purchase_order_id || pieceLineStage(piece).lock === "ordered")
    return "The piece is on an order. Labor changes through Record a change.";
  if (piece.ffe_line_authorization)
    return "The piece is released. Labor changes through Record a change.";
  return null;
}

function LaborLine({
  line,
  piece,
}: {
  line: LaborLineRow;
  piece: LaborPieceRow;
}) {
  const { kind, stage } = pieceLineStage(line, piece);
  const quantity = line.quantity ?? 0;
  return (
    <li
      data-testid="labor-line"
      className="flex min-h-[var(--row,40px)] flex-wrap items-center gap-x-3 border-b border-[color:var(--sheet-rule,#D9D4CC)] pl-6"
    >
      <span
        aria-hidden="true"
        className="text-[color:var(--sheet-ink-faint,#6B655E)]"
      >
        ↳
      </span>
      <span className="font-sans text-[14px] font-medium text-[color:var(--sheet-ink,#1A1816)]">
        {line.name}
      </span>
      <span
        className={`${STAMP_CLS} border-[color:var(--sheet-rule,#D9D4CC)] text-[color:var(--sheet-ink-muted,#4A4540)]`}
      >
        {LABOR_STAMP_LABEL}
      </span>
      <span className={`${STAMP_CLS} ${STAGE_STAMP_CLS[stage ?? "specced"]}`}>
        {lineStampLabel(kind)}
      </span>
      <span className="font-sans text-[14px] tabular-nums text-[color:var(--sheet-ink,#1A1816)]">
        {quantity} {unitWord(line.unit)}
      </span>
      {line.rough_cents != null && (
        <span className="font-sans text-[14px] tabular-nums text-[color:var(--sheet-ink-faint,#6B655E)]">
          ~{perUnit(line.rough_cents, line.unit)}
        </span>
      )}
    </li>
  );
}

export function LaborAct({
  projectId,
  piece,
  laborLines,
  canEdit,
}: {
  projectId: string;
  piece: LaborPieceRow;
  /** The piece's labor lines, already in hand (`parent_ffe_item_id` = piece, `line_kind` labor). */
  laborLines: readonly LaborLineRow[];
  canEdit: boolean;
}) {
  const addLabor = useAddLaborLine();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [quantity, setQuantity] = useState("");
  const [unit, setUnit] = useState<FfeLineUnit>("each");
  const [rough, setRough] = useState("");
  const [error, setError] = useState<string | null>(null);
  const gatedId = useId();

  // A labor line is not a piece: it takes no labor of its own.
  if (isLaborLine(piece)) return null;

  const gate = laborGate(piece);
  const pieceUnit = UNITS.includes(piece.unit as FfeLineUnit)
    ? (piece.unit as FfeLineUnit)
    : "each";

  const start = () => {
    if (gate) return;
    setName("");
    setQuantity(
      String(piece.quantity && piece.quantity > 0 ? piece.quantity : 1),
    );
    setUnit(pieceUnit);
    setRough("");
    setError(null);
    setOpen(true);
  };

  const close = () => {
    setOpen(false);
    setError(null);
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (addLabor.isPending) return;
    const trimmed = name.trim();
    if (!trimmed) {
      setError("A labor line needs a name.");
      return;
    }
    const count = Number(quantity.trim());
    if (!Number.isInteger(count) || count <= 0) {
      setError("Quantity is a whole number above 0.");
      return;
    }
    const roughCents = parseRoughCents(rough);
    if (roughCents === "invalid") {
      setError("Rough $ is an amount in dollars, like 85 or 4,800.");
      return;
    }
    setError(null);
    addLabor
      .mutateAsync({
        projectId,
        parentItemId: piece.id,
        name: trimmed,
        quantity: count,
        unit,
        roughCents,
      })
      .then(() => setOpen(false))
      .catch((e: Error) =>
        setError(e.message || "The labor line was not added."),
      );
  };

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === "Escape") {
      event.stopPropagation();
      close();
    }
  };

  return (
    <div data-testid="labor-act" className="flex flex-col gap-1">
      {laborLines.length > 0 && (
        <ul aria-label={`Labor on ${piece.name}`}>
          {laborLines.map((line) => (
            <LaborLine key={line.id} line={line} piece={piece} />
          ))}
        </ul>
      )}
      {canEdit && !open && (
        <div className="flex flex-wrap items-center gap-x-3">
          <button
            type="button"
            className={ACT_CLS}
            aria-disabled={gate ? true : undefined}
            aria-describedby={gate ? gatedId : undefined}
            onClick={start}
          >
            ADD LABOR
          </button>
          {gate && (
            <span
              id={gatedId}
              className="font-sans text-[13px] text-[color:var(--sheet-ink-faint,#6B655E)]"
            >
              {gate}
            </span>
          )}
        </div>
      )}
      {open && (
        <form
          onSubmit={submit}
          onKeyDown={onKeyDown}
          aria-label={`Add labor to ${piece.name}`}
          className="flex flex-wrap items-end gap-x-3 gap-y-2 pl-6"
        >
          <span
            aria-hidden="true"
            className="self-center text-[color:var(--sheet-ink-faint,#6B655E)]"
          >
            ↳
          </span>
          <label className="flex flex-col gap-1">
            <span className={LABEL_CLS}>Labor</span>
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Install, wallpaper hanger"
              className={`${INPUT_CLS} w-[260px]`}
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className={LABEL_CLS}>Qty</span>
            <input
              inputMode="numeric"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              className={`${INPUT_CLS} w-[72px] tabular-nums`}
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className={LABEL_CLS}>Unit</span>
            <select
              value={unit}
              onChange={(e) => setUnit(e.target.value as FfeLineUnit)}
              className={INPUT_CLS}
            >
              {UNITS.map((u) => (
                <option key={u} value={u}>
                  {unitWord(u)}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className={LABEL_CLS}>
              Rough $ {unit === "each" ? "each" : `/ ${unitWord(unit)}`}
            </span>
            <input
              inputMode="decimal"
              value={rough}
              onChange={(e) => setRough(e.target.value)}
              placeholder="~"
              className={`${INPUT_CLS} w-[120px] tabular-nums`}
            />
          </label>
          <button
            type="submit"
            className={ACT_CLS}
            aria-busy={addLabor.isPending || undefined}
          >
            ADD THE LABOR LINE
          </button>
          <button type="button" className={ACT_CLS} onClick={close}>
            PUT BACK
          </button>
        </form>
      )}
      {error && (
        <p
          role="alert"
          className="font-sans text-[13px] text-[color:var(--color-terracotta-ink)]"
        >
          {error}
        </p>
      )}
    </div>
  );
}
