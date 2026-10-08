"use client";

/**
 * The Build room's shell (US-21 Direction A, SPEC §6 "The sheet's shell",
 * a3, a13; CONTRACT §3.4, §3.6). The head names the job, the sheet and the
 * lens; the reading sentence says what the lens does and does not do; the
 * rail names the rooms with their counts. The lens body is the children slot.
 *
 * Leaving (S7, a10, R1-F10): `←`, Esc and the browser back all land on the
 * overview at the room the reader was in, `/doc/[id]#pieces-room-<roomId>`.
 * Esc is left alone while a menu, dialog, toast, or a field with text in it
 * holds it; a child that takes Esc for itself calls `preventDefault()`.
 *
 * The drafting stock: `[data-drafting-stock]` is the one scope the `--sheet-*`
 * tokens are read under (T-22). Beige is reading, white is working.
 */

import {
  useEffect,
  useId,
  useRef,
  useState,
  type FormEvent,
  type MouseEvent,
  type ReactNode,
} from "react";
import {
  REMOVED_PLACE,
  THROUGHOUT_PLACE,
  UNASSIGNED_PLACE,
  availableLenses,
  buildRoomHref,
  buildRoomReturnHref,
  isDocumentOverviewPath,
  type BuildRoomLens,
  type BuildRoomPlace,
  type BuildRoomState,
} from "@/lib/document/pieces/build-room-url";
import type {
  BuildRoomCounts,
  RoomCounts,
} from "@/lib/document/pieces/room-counts";

export interface BuildRoomRoom {
  id: string;
  name: string;
}

export interface BuildRoomShellProps {
  /** The `/doc/[id]` segment, as the reader arrived. */
  docId: string;
  jobName: string;
  rooms: readonly BuildRoomRoom[];
  counts: BuildRoomCounts;
  removedCount: number;
  lens: BuildRoomLens;
  room: BuildRoomPlace;
  /** R1 (`useCanSeeMargin`): without it the Price lens is absent, not gated (Q7). */
  canSeeMoney: boolean;
  /** Push a lens or room change; the URL holds both. */
  onNavigate: (state: BuildRoomState) => void;
  /** Leave for the overview at `buildRoomReturnHref(docId, room)`. */
  onReturn: () => void;
  onAddRoom?: (name: string) => Promise<unknown> | void;
  /** The lens body. */
  children?: ReactNode;
}

const LENS_WORD: Record<BuildRoomLens, string> = {
  rough: "Rough in",
  spec: "Spec",
  price: "Price",
  release: "Release",
};

const LENS_READING: Record<BuildRoomLens, string> = {
  rough:
    "Rough in · Name it, count it, place it. Specs, prices and buying come later.",
  spec: "Spec · Fill each line's details and its product. No money here.",
  price:
    "Price · Line up trade cost, markup and client price. Rough figures stay as ~ until you set them.",
  release:
    "Release · Check what the client will see, then release rooms for authorization. Nothing here edits a spec or a price.",
};

function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

/** The phone head's short job name: `Whole Home Renovation` → `Whole Home` (a13). */
export function shortJobName(jobName: string): string {
  const words = jobName.trim().split(/\s+/);
  return words.length > 2 ? words.slice(0, 2).join(" ") : jobName.trim();
}

function placeName(
  room: BuildRoomPlace,
  rooms: readonly BuildRoomRoom[],
): string {
  if (room == null) return "Whole job";
  if (room === THROUGHOUT_PLACE) return "Throughout";
  if (room === UNASSIGNED_PLACE) return "Not in a room yet";
  if (room === REMOVED_PLACE) return "Removed";
  return rooms.find((r) => r.id === room)?.name ?? "Whole job";
}

function placeCounts(
  room: BuildRoomPlace,
  counts: BuildRoomCounts,
): RoomCounts {
  if (room === THROUGHOUT_PLACE) return counts.throughout;
  if (room === UNASSIGNED_PLACE) return counts.unassigned;
  if (room != null && counts.rooms[room]) return counts.rooms[room];
  return counts.job;
}

/** The head's right side: `Living Room · 6 lines · 4 placeholders`; Release counts what is ready (a3). */
export function placeSummary(
  room: BuildRoomPlace,
  lens: BuildRoomLens,
  rooms: readonly BuildRoomRoom[],
  counts: BuildRoomCounts,
  removedCount: number,
): string {
  const name = placeName(room, rooms);
  if (room === REMOVED_PLACE)
    return `${name} · ${plural(removedCount, "line", "lines")}`;
  const place = placeCounts(room, counts);
  const figure =
    lens === "release"
      ? `${place.ready} ready`
      : plural(place.placeholders, "placeholder", "placeholders");
  return `${name} · ${plural(place.lines, "line", "lines")} · ${figure}`;
}

/** Whether something on the sheet holds Esc, so leaving must wait. */
function escapeIsHeld(event: KeyboardEvent): boolean {
  if (event.defaultPrevented) return true;
  const target = event.target;
  if (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement
  ) {
    if (target.value !== "") return true;
  } else if (target instanceof HTMLSelectElement) {
    return true;
  } else if (target instanceof HTMLElement && target.isContentEditable) {
    if ((target.textContent ?? "") !== "") return true;
  }
  if (
    target instanceof Element &&
    target.closest('[role="status"], [role="alert"], [data-holds-escape]')
  ) {
    return true;
  }
  // The open-thing set the log strip reads (log-strip.tsx), plus an open menu.
  return (
    document.querySelector(
      '[role="dialog"], [role="alertdialog"], [aria-modal], [data-dismissible-popover], [data-open-thing], [role="menu"]',
    ) != null
  );
}

function isPlainClick(event: MouseEvent): boolean {
  return (
    event.button === 0 &&
    !event.metaKey &&
    !event.ctrlKey &&
    !event.shiftKey &&
    !event.altKey
  );
}

const ACT =
  "inline-flex min-h-11 min-w-11 items-center font-mono text-[12px] font-medium uppercase tracking-[0.06em] underline decoration-[var(--sheet-ink)] decoration-1 underline-offset-4 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--clay-ink)]";

const FOCUS =
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--clay-ink)]";

interface PlaceRow {
  place: BuildRoomPlace;
  label: string;
  count: number;
}

export function BuildRoomShell({
  docId,
  jobName,
  rooms,
  counts,
  removedCount,
  lens,
  room,
  canSeeMoney,
  onNavigate,
  onReturn,
  onAddRoom,
  children,
}: BuildRoomShellProps) {
  const lenses = availableLenses(canSeeMoney);
  const activeLens = lenses.includes(lens) ? lens : "rough";
  const returnHref = buildRoomReturnHref(docId, room);
  const summary = placeSummary(room, activeLens, rooms, counts, removedCount);
  const pickerId = useId();
  const [pickerOpen, setPickerOpen] = useState(false);

  // Read at popstate time: by then the URL already names the page we left for.
  const roomRef = useRef(room);
  roomRef.current = room;
  const onReturnRef = useRef(onReturn);
  onReturnRef.current = onReturn;

  // Esc leaves for the overview at this room.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || escapeIsHeld(event)) return;
      event.preventDefault();
      onReturnRef.current();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  // The browser back: when it steps out of the room onto the overview, the
  // entry it lands on is given the room's anchor. The history state is passed
  // through untouched, so the router restores the overview as it was.
  useEffect(() => {
    const onPop = () => {
      if (!isDocumentOverviewPath(window.location.pathname, docId)) return;
      window.history.replaceState(
        window.history.state,
        "",
        buildRoomReturnHref(docId, roomRef.current),
      );
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [docId]);

  const places: PlaceRow[] = rooms.map((r) => ({
    place: r.id,
    label: r.name,
    count: counts.rooms[r.id]?.lines ?? 0,
  }));
  const others: PlaceRow[] = [
    ...(counts.throughout.lines > 0
      ? [
          {
            place: THROUGHOUT_PLACE,
            label: "Throughout",
            count: counts.throughout.lines,
          },
        ]
      : []),
    {
      place: UNASSIGNED_PLACE,
      label: "Not in a room yet",
      count: counts.unassigned.lines,
    },
    { place: REMOVED_PLACE, label: "Removed", count: removedCount },
  ];

  const go = (next: BuildRoomState) => {
    setPickerOpen(false);
    onNavigate(next);
  };

  const placeLink = (row: PlaceRow, variant: "rail" | "picker") => {
    const active = row.place === room;
    return (
      <li key={row.place ?? "job"}>
        <a
          href={buildRoomHref(docId, { lens: activeLens, room: row.place })}
          aria-current={active ? "location" : undefined}
          onClick={(event) => {
            if (!isPlainClick(event)) return;
            event.preventDefault();
            go({ lens: activeLens, room: row.place });
          }}
          className={`flex min-h-11 items-center justify-between gap-3 border-l-[3px] pl-3 pr-4 text-[14px] ${FOCUS} ${
            active
              ? "border-[var(--sheet-ink)] text-[var(--sheet-ink)]"
              : "border-transparent text-[var(--sheet-ink-muted)] hover:bg-[var(--sheet-row-hover)]"
          } ${variant === "picker" ? "w-full" : ""}`}
        >
          <span>{row.label}</span>
          <span className="font-mono text-[11px] tabular-nums">
            {row.count}
          </span>
        </a>
      </li>
    );
  };

  return (
    <div
      data-drafting-stock=""
      data-testid="build-room"
      className="flex h-[100dvh] flex-col bg-[var(--sheet)] pb-16 text-[var(--sheet-ink)] min-[1180px]:pb-[60px]"
    >
      <header className="relative flex flex-wrap items-center gap-x-6 border-b border-[var(--sheet-rule-strong)] bg-[var(--sheet-head)] px-4 md:min-h-[var(--head)] md:flex-nowrap md:px-6">
        <a
          href={returnHref}
          aria-label={`Back to ${jobName}`}
          onClick={(event) => {
            if (!isPlainClick(event)) return;
            event.preventDefault();
            onReturn();
          }}
          className={`${ACT} shrink-0 text-[var(--sheet-ink)]`}
        >
          <span aria-hidden="true">←&nbsp;</span>
          <span className="md:hidden">{shortJobName(jobName)}</span>
          <span className="hidden md:inline">{jobName}</span>
        </a>
        <h1 className="sr-only font-mono text-[12px] font-medium uppercase leading-none tracking-[0.08em] md:not-sr-only md:shrink-0">
          Build the pieces
        </h1>

        <div
          className="ml-auto md:hidden"
          data-holds-escape={pickerOpen ? "" : undefined}
        >
          <button
            type="button"
            aria-expanded={pickerOpen}
            aria-controls={pickerId}
            onClick={() => setPickerOpen((open) => !open)}
            onKeyDown={(event) => {
              if (event.key === "Escape" && pickerOpen) {
                event.preventDefault();
                setPickerOpen(false);
              }
            }}
            className={`min-h-11 px-2 text-[14px] text-[var(--sheet-ink)] ${FOCUS}`}
          >
            {placeName(room, rooms)} ▾
          </button>
        </div>

        <div
          role="group"
          aria-label="Lens"
          className="order-last -mx-4 grid w-[calc(100%+2rem)] border-t border-[var(--sheet-rule)] md:order-none md:mx-0 md:flex md:w-auto md:flex-1 md:justify-center md:gap-6 md:border-t-0"
          style={{
            gridTemplateColumns: `repeat(${lenses.length}, minmax(0, 1fr))`,
          }}
        >
          {lenses.map((candidate) => {
            const pressed = candidate === activeLens;
            return (
              <button
                key={candidate}
                type="button"
                aria-pressed={pressed}
                onClick={() => go({ lens: candidate, room })}
                className={`min-h-11 border-b-2 px-2 font-mono text-[13px] font-medium uppercase leading-none tracking-[0.06em] ${FOCUS} ${
                  pressed
                    ? "border-[var(--sheet-ink)] text-[var(--sheet-ink)]"
                    : "border-transparent text-[var(--sheet-ink-faint)] hover:text-[var(--sheet-ink)]"
                }`}
              >
                {LENS_WORD[candidate]}
              </button>
            );
          })}
        </div>

        <p
          data-testid="build-room-place"
          className="hidden shrink-0 font-mono text-[12px] tabular-nums text-[var(--sheet-ink)] md:block"
        >
          {summary}
        </p>

        {pickerOpen ? (
          <nav
            id={pickerId}
            aria-label="Choose a room"
            className="absolute inset-x-0 top-full z-20 border-b border-[var(--sheet-rule-strong)] bg-[var(--sheet)] py-2 md:hidden"
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                event.preventDefault();
                setPickerOpen(false);
              }
            }}
          >
            <ul>
              {placeLink(
                { place: null, label: "Whole job", count: counts.job.lines },
                "picker",
              )}
              {places.map((row) => placeLink(row, "picker"))}
              {others.map((row) => placeLink(row, "picker"))}
            </ul>
            {/* The phone has no rail, so + ROOM lives in the room list too (a13). */}
            <AddRoom onAddRoom={onAddRoom} />
          </nav>
        ) : null}
      </header>

      <p className="max-w-[56ch] px-4 py-3 text-[14px] leading-[1.5] text-[var(--sheet-ink-muted)] md:px-6">
        {LENS_READING[activeLens]}
      </p>

      <div className="flex min-h-0 flex-1">
        <nav
          aria-label="Rooms"
          className="hidden w-[200px] shrink-0 flex-col overflow-y-auto border-r border-[var(--sheet-rule)] bg-[var(--sheet)] py-3 md:flex"
        >
          <a
            href={buildRoomHref(docId, { lens: activeLens, room: null })}
            aria-label="Rooms, whole job"
            aria-current={room == null ? "location" : undefined}
            onClick={(event) => {
              if (!isPlainClick(event)) return;
              event.preventDefault();
              go({ lens: activeLens, room: null });
            }}
            className={`mb-1 flex min-h-11 items-center px-4 font-mono text-[11px] font-medium uppercase tracking-[0.06em] text-[var(--sheet-ink)] ${FOCUS}`}
          >
            Rooms
          </a>
          <ul>{places.map((row) => placeLink(row, "rail"))}</ul>
          <ul className="mt-3 border-t border-[var(--sheet-rule)] pt-3">
            {others.map((row) => placeLink(row, "rail"))}
          </ul>
          <AddRoom onAddRoom={onAddRoom} />
        </nav>

        <main className="min-h-0 flex-1 overflow-y-auto px-4 md:px-6">
          {children}
        </main>
      </div>
    </div>
  );
}

function AddRoom({
  onAddRoom,
}: {
  onAddRoom?: (name: string) => Promise<unknown> | void;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [failed, setFailed] = useState(false);
  const [saving, setSaving] = useState(false);
  const inputId = useId();
  const errorId = useId();
  if (!onAddRoom) return null;

  const close = () => {
    setOpen(false);
    setName("");
    setFailed(false);
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const trimmed = name.trim();
    if (!trimmed || saving) return;
    setSaving(true);
    setFailed(false);
    try {
      await onAddRoom(trimmed);
      close();
    } catch {
      setFailed(true);
    } finally {
      setSaving(false);
    }
  };

  if (!open) {
    return (
      <div className="mt-3 px-4">
        <button
          type="button"
          onClick={() => setOpen(true)}
          className={`${ACT} text-[var(--sheet-ink-muted)]`}
        >
          + Room
        </button>
      </div>
    );
  }

  return (
    <form className="mt-3 px-4" onSubmit={submit}>
      <label
        htmlFor={inputId}
        className="font-mono text-[11px] font-medium uppercase tracking-[0.06em] text-[var(--sheet-ink-muted)]"
      >
        Room name
      </label>
      <input
        id={inputId}
        autoFocus
        value={name}
        onChange={(event) => setName(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            // Closes the form only; the phone's room list stays open.
            event.preventDefault();
            event.stopPropagation();
            close();
          }
        }}
        aria-invalid={failed || undefined}
        aria-describedby={failed ? errorId : undefined}
        className={`mt-1 min-h-11 w-full border-b border-[var(--sheet-rule-strong)] bg-transparent text-[14px] text-[var(--sheet-ink)] ${FOCUS}`}
      />
      {failed ? (
        <p
          id={errorId}
          role="alert"
          className="mt-1 text-[13px] text-[var(--sheet-ink)]"
        >
          The room was not added. Try again.
        </p>
      ) : null}
      <button
        type="submit"
        aria-disabled={saving || undefined}
        className={`${ACT} mt-1 text-[var(--sheet-ink)]`}
      >
        Add the room
      </button>
    </form>
  );
}
