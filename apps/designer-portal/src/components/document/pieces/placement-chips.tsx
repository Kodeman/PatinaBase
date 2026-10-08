"use client";

import { useId, useState, type FormEvent, type KeyboardEvent } from "react";
import { useSetLinePlacements } from "@patina/supabase";
import type { FfeLineUnit, FfeRoomPlacement } from "@patina/types";

/**
 * T-30 (S2, D7 phase 1, a5): one line in several rooms. The chips carry each
 * room's share (`Hall · 120 sq ft`), edit it in place and add a room through
 * `set_line_placements` (00734), which replaces the line's whole set; the
 * first room is the primary. The line's quantity may exceed the shares; the
 * difference prints as waste and is never a further room (D7 case 1).
 *
 * The drafting-stock tokens (T-22) are read with their SPEC §2.1 values as
 * fallbacks, so the sheet prints the same before and after they land.
 */

export interface PieceRoom {
  id: string;
  name: string;
}

/** The line, as the chips read it. `unitPriceCents` is the client unit price. */
export interface PlacedLine {
  id: string;
  quantity: number;
  unit: FfeLineUnit | string | null;
  unitPriceCents: number | null;
  /** The primary room (`project_room_id`); a line with no placements sits here alone. */
  projectRoomId: string | null;
}

type Share = { roomId: string; quantity: number; areaNote: string | null };

const UNIT_WORD: Record<FfeLineUnit, string> = {
  each: "each",
  sq_ft: "sq ft",
  lin_ft: "lin ft",
  roll: "roll",
  yard: "yard",
  box: "box",
  hour: "hour",
  lot: "lot",
};

/** `sq_ft` → `sq ft`; an unknown or missing unit reads as `each`. */
export function unitWord(unit: string | null | undefined): string {
  return UNIT_WORD[(unit ?? "each") as FfeLineUnit] ?? "each";
}

const isEach = (unit: string | null | undefined) => unitWord(unit) === "each";

/** A quantity in its unit: `120 sq ft`, `9 roll`, and `×2` for pieces. */
export function shareText(
  quantity: number,
  unit: string | null | undefined,
): string {
  return isEach(unit) ? `×${quantity}` : `${quantity} ${unitWord(unit)}`;
}

const moneyFormat = (fractionDigits: number) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  });
const WHOLE = moneyFormat(0);
const CENTS = moneyFormat(2);

/** `$9,545`, and `$11.50` or `$10,499.50` when there are cents. */
export function money(cents: number): string {
  return (cents % 100 === 0 ? WHOLE : CENTS).format(cents / 100);
}

/** A price per unit: `$11.50 / sq ft`, `$38 each`. */
export function perUnit(
  cents: number,
  unit: string | null | undefined,
): string {
  return isEach(unit)
    ? `${money(cents)} each`
    : `${money(cents)} / ${unitWord(unit)}`;
}

/** The line's quantity left over after the room shares; 0 when it has none. */
export function wasteQuantity(
  lineQuantity: number,
  placements: readonly { quantity: number }[],
): number {
  if (placements.length === 0) return 0;
  const placed = placements.reduce((sum, p) => sum + p.quantity, 0);
  return Math.max(0, lineQuantity - placed);
}

/**
 * The sentence under the chips (a5): `830 sq ft × $11.50 / sq ft = $9,545`,
 * then `· waste 83 sq ft` when the line is longer than its rooms. An unpriced
 * line prints its quantity alone.
 */
export function totalsSentence(
  line: PlacedLine,
  placements: readonly { quantity: number }[],
): string {
  const waste = wasteQuantity(line.quantity, placements);
  const quantity = isEach(line.unit)
    ? `${line.quantity}`
    : `${line.quantity} ${unitWord(line.unit)}`;
  const price = line.unitPriceCents ?? 0;
  const head =
    price > 0
      ? `${quantity} × ${perUnit(price, line.unit)} = ${money(price * line.quantity)}`
      : isEach(line.unit)
        ? `×${line.quantity}`
        : quantity;
  return waste > 0 ? `${head} · waste ${waste} ${unitWord(line.unit)}` : head;
}

/**
 * The also-in line printed under a placed line's name in one room's table
 * (SPEC §2.6, a5, a8): the other rooms in placement order, then this room's
 * share and its area note. `null` when the line is in no other room.
 */
export function alsoInText(
  placements: readonly Pick<
    FfeRoomPlacement,
    "projectRoomId" | "quantity" | "areaNote" | "sortOrder"
  >[],
  rooms: readonly PieceRoom[],
  hereRoomId: string,
  unit: string | null | undefined,
): string | null {
  const ordered = [...placements].sort((a, b) => a.sortOrder - b.sortOrder);
  const others = ordered
    .filter((p) => p.projectRoomId !== hereRoomId)
    .map((p) => rooms.find((r) => r.id === p.projectRoomId)?.name)
    .filter((name): name is string => !!name);
  if (others.length === 0) return null;
  const parts = [`Also in ${others.join(" · ")}`];
  const here = ordered.find((p) => p.projectRoomId === hereRoomId);
  if (here) {
    parts.push(`${shareText(here.quantity, unit)} here`);
    if (here.areaNote?.trim()) parts.push(here.areaNote.trim());
  }
  return parts.join(" · ").toUpperCase();
}

export function AlsoInLine(props: {
  placements: readonly FfeRoomPlacement[];
  rooms: readonly PieceRoom[];
  hereRoomId: string;
  unit: string | null | undefined;
}) {
  const text = alsoInText(
    props.placements,
    props.rooms,
    props.hereRoomId,
    props.unit,
  );
  if (!text) return null;
  return (
    <p
      data-testid="also-in-line"
      className="font-mono text-[11px] leading-[1.4] text-[color:var(--sheet-ink-faint,#6B655E)]"
    >
      {text}
    </p>
  );
}

// ─── The chips ─────────────────────────────────────────────────────────────

const ACT_CLS =
  "inline-flex min-h-[44px] min-w-[44px] items-center font-mono text-[12px] font-medium uppercase tracking-[.06em] text-[color:var(--sheet-ink,#1A1816)] underline decoration-1 underline-offset-4 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--clay-ink)] aria-disabled:cursor-not-allowed aria-disabled:text-[color:var(--sheet-ink-faint,#6B655E)]";
const CHIP_CLS =
  "inline-flex items-center rounded-[2px] border border-[color:var(--sheet-rule-strong,#1A1816)] px-[10px] py-1 font-sans text-[13px] tabular-nums text-[color:var(--sheet-ink,#1A1816)]";
const INPUT_CLS =
  "h-8 rounded-[2px] border border-[color:var(--sheet-rule-strong,#1A1816)] bg-[color:var(--sheet,#FFFFFF)] px-2 font-sans text-[14px] tabular-nums text-[color:var(--sheet-ink,#1A1816)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--clay-ink)]";
const SENTENCE_CLS =
  "max-w-[56ch] font-sans text-[14px] leading-[1.5] text-[color:var(--sheet-ink,#1A1816)]";

const wholeAbove0 = (raw: string): number | null => {
  const n = Number(raw.trim());
  return Number.isInteger(n) && n > 0 ? n : null;
};

type Editing = { kind: "room"; roomId: string } | { kind: "new" } | null;

export function PlacementChips({
  projectId,
  line,
  placements,
  rooms,
  canEdit,
}: {
  projectId: string;
  line: PlacedLine;
  /** This line's placements (`useProjectRoomPlacements`, filtered to the line). */
  placements: readonly FfeRoomPlacement[];
  /** The project's rooms, in the job's order. */
  rooms: readonly PieceRoom[];
  canEdit: boolean;
}) {
  const setPlacements = useSetLinePlacements();
  const [editing, setEditing] = useState<Editing>(null);
  const [draftQuantity, setDraftQuantity] = useState("");
  const [draftRoom, setDraftRoom] = useState("");
  const [error, setError] = useState<string | null>(null);
  const gatedId = useId();

  const stored: Share[] = [...placements]
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((p) => ({
      roomId: p.projectRoomId,
      quantity: p.quantity,
      areaNote: p.areaNote,
    }));
  // A line with no placements sits in its primary room with all of its quantity.
  const shares: Share[] =
    stored.length > 0
      ? stored
      : line.projectRoomId
        ? [
            {
              roomId: line.projectRoomId,
              quantity: line.quantity,
              areaNote: null,
            },
          ]
        : [];
  const roomName = (id: string) =>
    rooms.find((r) => r.id === id)?.name ?? "A room";
  const free = rooms.filter((r) => !shares.some((s) => s.roomId === r.id));
  const placed = shares.reduce((sum, s) => sum + s.quantity, 0);
  const pending = setPlacements.isPending;

  const close = () => {
    setEditing(null);
    setError(null);
  };

  const write = (next: Share[]) => {
    const total = next.reduce((sum, s) => sum + s.quantity, 0);
    if (total > line.quantity) {
      setError(
        `The rooms would take ${shareText(total, line.unit)}; the line is ${shareText(line.quantity, line.unit)}. Raise the line's quantity first.`,
      );
      return;
    }
    setError(null);
    setPlacements
      .mutateAsync({
        projectId,
        itemId: line.id,
        placements: next.map((s) => ({
          roomId: s.roomId,
          quantity: s.quantity,
          areaNote: s.areaNote,
        })),
      })
      .then(() => setEditing(null))
      .catch((e: Error) => setError(e.message || "The rooms were not saved."));
  };

  const openRoom = (share: Share) => {
    setError(null);
    setDraftQuantity(String(share.quantity));
    setEditing({ kind: "room", roomId: share.roomId });
  };

  const openNew = () => {
    if (free.length === 0) return;
    setError(null);
    setDraftRoom(free[0].id);
    const left = line.quantity - placed;
    setDraftQuantity(left > 0 ? String(left) : "");
    setEditing({ kind: "new" });
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (pending || !editing) return;
    const quantity = wholeAbove0(draftQuantity);
    if (quantity == null) {
      setError("A room takes a whole number above 0.");
      return;
    }
    if (editing.kind === "room") {
      write(
        shares.map((s) =>
          s.roomId === editing.roomId ? { ...s, quantity } : s,
        ),
      );
    } else {
      write([...shares, { roomId: draftRoom, quantity, areaNote: null }]);
    }
  };

  const removeRoom = (roomId: string) => {
    if (pending) return;
    write(shares.filter((s) => s.roomId !== roomId));
  };

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === "Escape") {
      event.stopPropagation();
      close();
    }
  };

  const editor = (label: string, removable: string | null) => (
    <form
      onSubmit={submit}
      onKeyDown={onKeyDown}
      aria-label={label}
      className="flex flex-wrap items-center gap-x-3 gap-y-1"
    >
      {editing?.kind === "new" ? (
        <select
          aria-label="Room"
          value={draftRoom}
          onChange={(e) => setDraftRoom(e.target.value)}
          className={INPUT_CLS}
        >
          {free.map((r) => (
            <option key={r.id} value={r.id}>
              {r.name}
            </option>
          ))}
        </select>
      ) : (
        <span className="font-sans text-[13px] text-[color:var(--sheet-ink,#1A1816)]">
          {label}
        </span>
      )}
      <span className="inline-flex items-center gap-2">
        <input
          autoFocus
          inputMode="numeric"
          aria-label={`Quantity in ${unitWord(line.unit)}`}
          value={draftQuantity}
          onChange={(e) => setDraftQuantity(e.target.value)}
          className={`${INPUT_CLS} w-[88px]`}
        />
        <span className="font-sans text-[13px] text-[color:var(--sheet-ink-muted,#4A4540)]">
          {unitWord(line.unit)}
        </span>
      </span>
      <button
        type="submit"
        className={ACT_CLS}
        aria-busy={pending || undefined}
      >
        {editing?.kind === "new" ? "PLACE" : "SAVE"}
      </button>
      {removable && (
        <button
          type="button"
          className={ACT_CLS}
          onClick={() => removeRoom(removable)}
        >
          REMOVE
        </button>
      )}
      <button type="button" className={ACT_CLS} onClick={close}>
        PUT BACK
      </button>
    </form>
  );

  return (
    <div data-testid="placement-chips" className="flex flex-col gap-1">
      <ul
        aria-label="Rooms"
        className="flex flex-wrap items-center gap-x-2 gap-y-1"
      >
        {shares.map((share) => {
          const text = [
            roomName(share.roomId),
            shareText(share.quantity, line.unit),
            share.areaNote?.trim(),
          ]
            .filter(Boolean)
            .join(" · ");
          if (editing?.kind === "room" && editing.roomId === share.roomId) {
            return (
              <li key={share.roomId} className="basis-full">
                {editor(
                  roomName(share.roomId),
                  shares.length > 1 ? share.roomId : null,
                )}
              </li>
            );
          }
          return (
            <li key={share.roomId}>
              {canEdit ? (
                <button
                  type="button"
                  onClick={() => openRoom(share)}
                  aria-label={`${text}. Change ${roomName(share.roomId)}'s share`}
                  className="inline-flex min-h-[44px] items-center focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--clay-ink)]"
                >
                  <span className={CHIP_CLS}>{text}</span>
                </button>
              ) : (
                <span className={CHIP_CLS}>{text}</span>
              )}
            </li>
          );
        })}
        {canEdit && editing?.kind !== "new" && (
          <li>
            <button
              type="button"
              className={ACT_CLS}
              aria-disabled={free.length === 0 || undefined}
              aria-describedby={free.length === 0 ? gatedId : undefined}
              onClick={openNew}
            >
              + ROOM
            </button>
            {free.length === 0 && (
              <span
                id={gatedId}
                className="ml-2 font-sans text-[13px] text-[color:var(--sheet-ink-faint,#6B655E)]"
              >
                Every room already has a share.
              </span>
            )}
          </li>
        )}
      </ul>
      {editing?.kind === "new" && editor("Place in another room", null)}
      {stored.length > 0 && (
        <p data-testid="placement-totals" className={SENTENCE_CLS}>
          {totalsSentence(line, stored)}
        </p>
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
