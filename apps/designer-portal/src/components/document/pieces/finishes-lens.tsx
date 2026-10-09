"use client";

/**
 * US-21 T-57: the Finishes lens (a11; S8, D16, Q10). Minimal, by Q10's
 * ruling: one table per room, `SURFACE · PRODUCT · SHEEN · SWATCH`, with a
 * 24×24 swatch, and the act that prints the painter's schedule.
 *
 * The rows are the room's one `project_palettes` row (00760), read through
 * `useProjectPalettes` and written whole through `useSetRoomFinishes`. A cell
 * saves when it is left. Nothing here edits a line.
 */

import { useEffect, useId, useMemo, useRef, useState } from "react";
import {
  useProjectPalettes,
  useSetRoomFinishes,
  type RoomFinishEdit,
} from "@patina/supabase";
import type { RoomFinish } from "@patina/types";
import { useDocumentRooms } from "@/hooks/use-document-rooms";
import type { BuildRoomPlace } from "@/lib/document/pieces/build-room-url";
import { FinishSwatch, swatchLabel } from "./finish-swatch";

/**
 * A swatch element as it is stored. The lens writes `{surface, product,
 * brand, brand_code, sheen, hex, sort_order}` (useSetRoomFinishes); older
 * palette rows carry `{hex, name, role, brand, brand_code, paint_color_id,
 * sort_order}` (00131, 00331) and are still read (00760).
 */
interface StoredSwatch {
  surface?: unknown;
  product?: unknown;
  brand?: unknown;
  brand_code?: unknown;
  sheen?: unknown;
  hex?: unknown;
  sort_order?: unknown;
  role?: unknown;
  name?: unknown;
}

/**
 * The older roles that are a paint or a finish, as the surface they name.
 * The others (00131: foundation, accent, metal, textile, other) are kept in
 * storage but are not finishes: the lens does not show them and they never print.
 */
const OLD_ROLE_SURFACE: Record<string, string> = {
  wall: "Walls",
  ceiling: "Ceiling",
  trim: "Trim",
  floor: "Floor",
};

function storedText(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** The lens's own row (it has a surface), or an older row with a paint role. */
function isFinishSwatch(raw: unknown): raw is Record<string, unknown> {
  if (!isRecord(raw)) return false;
  if (typeof raw.surface === "string") return true;
  const role = storedText(raw.role)?.toLowerCase();
  return role != null && Object.hasOwn(OLD_ROLE_SURFACE, role);
}

/**
 * A room palette's swatches: the finishes in order, each with the swatch it
 * was read from, and the swatches that are not finishes, kept as stored.
 */
export function readRoomPalette(swatches: unknown): {
  finishes: RoomFinishEdit[];
  kept: unknown[];
} {
  if (!Array.isArray(swatches)) return { finishes: [], kept: [] };
  const finishes: RoomFinishEdit[] = [];
  const kept: unknown[] = [];
  swatches.forEach((raw, index) => {
    if (!isFinishSwatch(raw)) {
      kept.push(raw);
      return;
    }
    const s = raw as StoredSwatch;
    const role = storedText(s.role)?.toLowerCase();
    const brand = storedText(s.brand);
    const brandCode = storedText(s.brand_code);
    const product =
      storedText(s.product) ??
      ([brand, storedText(s.name), brandCode].filter(Boolean).join(" ") ||
        null);
    finishes.push({
      surface:
        storedText(s.surface) ??
        (role && Object.hasOwn(OLD_ROLE_SURFACE, role)
          ? OLD_ROLE_SURFACE[role]
          : ""),
      product,
      brand,
      brandCode,
      sheen: storedText(s.sheen),
      hex: storedText(s.hex),
      sortOrder: typeof s.sort_order === "number" ? s.sort_order : index,
      stored: raw,
    });
  });
  finishes.sort((a, b) => a.sortOrder - b.sortOrder);
  return { finishes, kept };
}

/** A room palette's finishes, in order. An older row reads its role as the surface. */
export function readRoomFinishes(swatches: unknown): RoomFinish[] {
  return readRoomPalette(swatches).finishes.map(
    (f): RoomFinish => ({
      surface: f.surface,
      product: f.product,
      brand: f.brand,
      brandCode: f.brandCode,
      sheen: f.sheen,
      hex: f.hex,
      sortOrder: f.sortOrder,
    }),
  );
}

/** Each room's finishes by room id. A project-wide palette is no room's. */
export function roomFinishesByRoom(
  palettes:
    | ReadonlyArray<{ scope_room_id: string | null; swatches: unknown }>
    | null
    | undefined,
): Map<string, RoomFinish[]> {
  const byRoom = new Map<string, RoomFinish[]>();
  for (const palette of palettes ?? []) {
    if (palette.scope_room_id) {
      byRoom.set(palette.scope_room_id, readRoomFinishes(palette.swatches));
    }
  }
  return byRoom;
}

/** The wall's swatch: the first finish on a wall surface that has a color. */
export function roomWallFinish(
  finishes: readonly RoomFinish[] | null | undefined,
): RoomFinish | null {
  return (
    finishes?.find((f) => f.hex != null && /^walls?\b/i.test(f.surface)) ?? null
  );
}

export interface FinishesLensProps {
  docId: string;
  projectId: string;
  room: BuildRoomPlace;
  /** Every lens takes it; finishes carry no money. */
  canSeeMoney?: boolean;
}

/**
 * The painter's print: one page per room (CONTRACT §3.4). It carries the
 * place it was opened from, so `← Back to Finishes` lands there again.
 */
export function finishesPrintHref(docId: string, room: BuildRoomPlace): string {
  const query = room ? `?${new URLSearchParams({ room }).toString()}` : "";
  return `/doc/${docId}/pieces/finishes/print${query}`;
}

/** `#f2dcd2`, `F2DCD2` or `#fdc` → `#F2DCD2`; anything else is not a color. */
export function normalizeHex(value: string): string | null {
  const raw = value.trim().replace(/^#/, "");
  if (/^[0-9a-f]{3}$/i.test(raw)) {
    return `#${raw
      .split("")
      .map((ch) => ch + ch)
      .join("")
      .toUpperCase()}`;
  }
  return /^[0-9a-f]{6}$/i.test(raw) ? `#${raw.toUpperCase()}` : null;
}

const ACT_CLS =
  "inline-flex min-h-[44px] min-w-[44px] items-center font-mono text-[12px] font-medium uppercase tracking-[.06em] text-[color:var(--sheet-ink-muted,#4A4540)] underline decoration-[color:var(--sheet-ink,#1A1816)] decoration-1 underline-offset-4 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--clay-ink)]";
/** The one heavy act on the surface: a second rule in clay (SPEC §2.5). */
const INKED_ACT_CLS = `${ACT_CLS} !text-[color:var(--sheet-ink,#1A1816)] border-b border-[color:var(--color-clay)]`;
const HEAD_CELL =
  "h-[40px] px-2 text-left font-mono text-[12px] font-medium uppercase leading-none tracking-[0.06em] text-[var(--sheet-ink)]";
const CELL = "h-[40px] px-2 align-middle";
const INPUT_CLS =
  "w-full min-h-[40px] border-0 bg-transparent px-0 font-sans text-[14px] leading-[1.4] text-[color:var(--sheet-ink,#1A1816)] placeholder:text-[color:var(--sheet-ink-faint,#6B655E)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--clay-ink)]";
const SENTENCE_CLS =
  "max-w-[56ch] font-sans text-[14px] leading-[1.5] text-[var(--sheet-ink)]";

const SHEENS = ["Flat", "Matte", "Eggshell", "Satin", "Semi-gloss", "Gloss"];

export function FinishesLens({ docId, projectId, room }: FinishesLensProps) {
  const { data: palettes } = useProjectPalettes(projectId);
  const { data: roomRows } = useDocumentRooms(projectId);
  const byRoom = useMemo(() => {
    const map = new Map<string, RoomPalette>();
    for (const palette of palettes ?? []) {
      if (palette.scope_room_id) {
        map.set(palette.scope_room_id, {
          name: palette.name ?? null,
          ...readRoomPalette(palette.swatches),
        });
      }
    }
    return map;
  }, [palettes]);
  const sheensId = useId();

  const rooms = (roomRows ?? []).filter((r) => room == null || r.id === room);

  if (roomRows && rooms.length === 0) {
    return (
      <p className={`${SENTENCE_CLS} py-6`}>
        {room == null
          ? "No rooms yet. Add a room, then note its surfaces here."
          : "Finishes are kept by room. Choose a room to note its surfaces."}
      </p>
    );
  }

  return (
    <div data-testid="finishes-lens" className="flex flex-col gap-8 py-6">
      <datalist id={sheensId}>
        {SHEENS.map((sheen) => (
          <option key={sheen} value={sheen} />
        ))}
      </datalist>
      {rooms.map((r) => (
        <RoomFinishesTable
          key={r.id}
          projectId={projectId}
          roomId={r.id}
          roomName={r.name}
          palette={byRoom.get(r.id) ?? NO_PALETTE}
          sheensId={sheensId}
        />
      ))}
      <div className="flex flex-col gap-1">
        <a
          href={finishesPrintHref(docId, room)}
          className={`${INKED_ACT_CLS} self-start`}
        >
          Print the paint and finish schedule
        </a>
        <p className="font-sans text-[13px] text-[var(--sheet-ink-faint)]">
          One page per room, addressed to the painter. Nothing else prints on
          it.
        </p>
      </div>
    </div>
  );
}

/** A room's palette as the lens holds it: its name, its finishes, and the swatches it keeps unseen. */
interface RoomPalette {
  name: string | null;
  finishes: RoomFinishEdit[];
  kept: unknown[];
}

const NO_PALETTE: RoomPalette = { name: null, finishes: [], kept: [] };

type Field = "surface" | "product" | "sheen" | "hex";

function blankFinish(surface: string): RoomFinishEdit {
  return {
    surface,
    product: null,
    brand: null,
    brandCode: null,
    sheen: null,
    hex: null,
    sortOrder: 0,
  };
}

function isEmptyFinish(f: RoomFinish): boolean {
  return !f.surface && !f.product && !f.sheen && !f.hex;
}

function RoomFinishesTable({
  projectId,
  roomId,
  roomName,
  palette,
  sheensId,
}: {
  projectId: string;
  roomId: string;
  roomName: string;
  palette: RoomPalette;
  sheensId: string;
}) {
  const saved = palette.finishes;
  const setFinishes = useSetRoomFinishes();
  const headingId = useId();
  const hexAlertId = useId();
  const tableRef = useRef<HTMLTableElement>(null);
  const [rows, setRows] = useState<RoomFinishEdit[]>(saved);
  const rowsRef = useRef(rows);
  const [failed, setFailed] = useState(false);
  // Set by the failed write itself, before the mutation stops pending, so
  // the saved list never replaces what she typed.
  const failedRef = useRef(false);
  const [badHex, setBadHex] = useState<number | null>(null);
  const focusAfter = useRef<number | null>(null);

  // The saved list wins whenever nothing of hers is on its way to it, or
  // left unsaved by a failed write.
  useEffect(() => {
    if (setFinishes.isPending || failedRef.current) return;
    rowsRef.current = saved;
    setRows(saved);
  }, [saved, setFinishes.isPending]);

  useEffect(() => {
    const index = focusAfter.current;
    if (index == null) return;
    focusAfter.current = null;
    tableRef.current
      ?.querySelector<HTMLInputElement>(`[data-finish-cell="product-${index}"]`)
      ?.focus();
  }, [rows]);

  const write = (next: RoomFinishEdit[]) => {
    const filled = next.filter((f) => !isEmptyFinish(f));
    rowsRef.current = filled;
    setRows(filled);
    failedRef.current = false;
    setFailed(false);
    setFinishes.mutate(
      {
        projectId,
        roomId,
        finishes: filled,
        kept: palette.kept,
        name: palette.name,
      },
      {
        onError: () => {
          failedRef.current = true;
          setFailed(true);
        },
      },
    );
  };

  const commit = (index: number, field: Field, value: string) => {
    const current = rowsRef.current[index];
    if (!current) return;
    const text = value.trim();
    let nextValue: string | null = text === "" ? null : text;
    if (field === "hex" && nextValue != null) {
      nextValue = normalizeHex(nextValue);
      if (nextValue == null) {
        setBadHex(index);
        return;
      }
    }
    if (field === "hex") setBadHex(null);
    const nextFinish: RoomFinishEdit =
      field === "surface"
        ? { ...current, surface: text }
        : { ...current, [field]: nextValue };
    // After a failed write, leaving any cell sends her list again.
    if (!failedRef.current && nextFinish[field] === current[field]) return;
    write(rowsRef.current.map((f, i) => (i === index ? nextFinish : f)));
  };

  const add = (surface: string) => {
    const text = surface.trim();
    if (!text) return;
    focusAfter.current = rowsRef.current.length;
    write([...rowsRef.current, blankFinish(text)]);
  };

  const remove = (index: number) =>
    write(rowsRef.current.filter((_, i) => i !== index));

  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-2">
      <h2
        id={headingId}
        className="font-heading text-[18px] italic leading-[1.2] text-[var(--sheet-ink)]"
      >
        {roomName} · Finishes
      </h2>
      <div className="max-w-full overflow-x-auto">
        <table
          ref={tableRef}
          aria-labelledby={headingId}
          className="w-full min-w-[560px] max-w-[860px] table-fixed border-collapse"
        >
          <colgroup>
            <col style={{ width: "200px" }} />
            <col />
            <col style={{ width: "140px" }} />
            <col style={{ width: "140px" }} />
            <col style={{ width: "88px" }} />
          </colgroup>
          <thead>
            <tr className="border-b border-[var(--sheet-rule-strong)]">
              <th scope="col" className={HEAD_CELL}>
                Surface
              </th>
              <th scope="col" className={HEAD_CELL}>
                Product
              </th>
              <th scope="col" className={HEAD_CELL}>
                Sheen
              </th>
              <th scope="col" className={HEAD_CELL}>
                Swatch
              </th>
              <th scope="col" className={HEAD_CELL}>
                <span className="sr-only">Remove</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((finish, index) => {
              const name = finish.surface || "this surface";
              return (
                <tr
                  key={index}
                  className="border-b border-[var(--sheet-rule)] hover:bg-[var(--sheet-row-hover)]"
                >
                  <td className={CELL}>
                    <Cell
                      label={`Surface ${index + 1}`}
                      value={finish.surface}
                      onCommit={(v) => commit(index, "surface", v)}
                    />
                  </td>
                  <td className={CELL}>
                    <Cell
                      label={`Product for ${name}`}
                      value={finish.product}
                      cell={`product-${index}`}
                      onCommit={(v) => commit(index, "product", v)}
                    />
                  </td>
                  <td className={CELL}>
                    <Cell
                      label={`Sheen for ${name}`}
                      value={finish.sheen}
                      list={sheensId}
                      onCommit={(v) => commit(index, "sheen", v)}
                    />
                  </td>
                  <td className={CELL}>
                    <span className="flex items-center gap-2 text-[var(--sheet-ink-faint)]">
                      <FinishSwatch
                        hex={finish.hex}
                        label={swatchLabel(finish)}
                      />
                      <Cell
                        label={`Swatch color for ${name}`}
                        value={finish.hex}
                        placeholder="#RRGGBB"
                        mono
                        invalid={badHex === index}
                        describedBy={badHex === index ? hexAlertId : undefined}
                        onCommit={(v) => commit(index, "hex", v)}
                      />
                    </span>
                  </td>
                  <td className={CELL}>
                    <button
                      type="button"
                      aria-label={`Remove ${name}`}
                      onClick={() => remove(index)}
                      className={ACT_CLS}
                    >
                      Remove
                    </button>
                  </td>
                </tr>
              );
            })}
            <tr className="border-b border-[var(--sheet-rule)]">
              <td className={CELL} colSpan={5}>
                <NewSurface roomName={roomName} onAdd={add} />
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      {badHex != null && (
        <p
          id={hexAlertId}
          role="alert"
          className="font-sans text-[13px] text-[var(--sheet-ink)]"
        >
          Write the color as #RRGGBB, for example #F2DCD2.
        </p>
      )}
      {failed && (
        <p
          role="alert"
          className="font-sans text-[13px] text-[var(--sheet-ink)]"
        >
          The finishes for {roomName} were not saved. Try again.
        </p>
      )}
    </section>
  );
}

/**
 * One editable cell. It holds her typing itself and saves when she leaves
 * it, so a save landing elsewhere never takes text out from under her.
 */
function Cell({
  label,
  value,
  onCommit,
  cell,
  list,
  placeholder,
  mono = false,
  invalid = false,
  describedBy,
}: {
  label: string;
  value: string | null;
  onCommit: (value: string) => void;
  cell?: string;
  list?: string;
  placeholder?: string;
  mono?: boolean;
  invalid?: boolean;
  describedBy?: string;
}) {
  return (
    <input
      key={value ?? ""}
      aria-label={label}
      aria-invalid={invalid || undefined}
      aria-describedby={describedBy}
      defaultValue={value ?? ""}
      data-finish-cell={cell}
      list={list}
      placeholder={placeholder}
      onBlur={(event) => onCommit(event.currentTarget.value)}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          event.currentTarget.blur();
        }
      }}
      className={`${INPUT_CLS} ${mono ? "font-mono text-[12px] uppercase" : ""}`}
    />
  );
}

function NewSurface({
  roomName,
  onAdd,
}: {
  roomName: string;
  onAdd: (surface: string) => void;
}) {
  const [text, setText] = useState("");
  const add = () => {
    if (!text.trim()) return;
    onAdd(text);
    setText("");
  };
  return (
    <input
      aria-label={`New surface in ${roomName}`}
      placeholder="New surface"
      value={text}
      onChange={(event) => setText(event.target.value)}
      onBlur={add}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          add();
        }
      }}
      className={INPUT_CLS}
    />
  );
}
