"use client";

/**
 * Shared People Room chrome: the seven stable views, the three rooms that hold
 * the six beside the directory, and the quiet title / empty-state primitives
 * each view uses.
 * Typography carries the hierarchy; the only pigment is the Strata mark and
 * active state. No shadows, lifts, menu/listbox ARIA, or dashboard furniture.
 */

import type { ReactNode } from "react";
import { PEOPLE_SUB_ROOM_SURFACES } from "@/lib/document/registry";
import type { PeopleView } from "./types";

export interface PeopleViewOption {
  key: PeopleView;
  name: string;
}

export type PeopleSubRoomKey = "client-relations" | "studio-marketing" | "the-engine";

export interface PeopleSubRoom {
  key: PeopleSubRoomKey;
  name: string;
  views: readonly PeopleViewOption[];
}

function subRoomName(key: PeopleSubRoomKey): string {
  return PEOPLE_SUB_ROOM_SURFACES.find((s) => s.key === key)?.label ?? key;
}

/**
 * US-28 (Kody, 2026-10-13: "match specimen fully") — Studio contacts is the
 * directory and Inbound only. The six views that stood beside it in the left
 * index ("IN THIS ROOM") are three rooms of their own, reached from the dock's
 * More and ⌘K, each at the `?view=` address it always had. The Engine's nudge
 * always opened the follow-ups queue, so that queue is The Engine's room. No
 * view key or destination changed.
 */
export const PEOPLE_SUB_ROOMS: readonly PeopleSubRoom[] = [
  {
    key: "client-relations",
    name: subRoomName("client-relations"),
    views: [
      { key: "threads", name: "Correspondence" },
      { key: "reviews", name: "Client reviews" },
    ],
  },
  {
    key: "studio-marketing",
    name: subRoomName("studio-marketing"),
    views: [
      { key: "portfolio", name: "Portfolio" },
      { key: "outreach", name: "Email campaigns" },
      { key: "your-eye", name: "Design profile" },
    ],
  },
  {
    key: "the-engine",
    name: subRoomName("the-engine"),
    views: [{ key: "nurture", name: "Relationship follow-ups" }],
  },
];

export const PEOPLE_VIEW_KEYS: readonly PeopleView[] = [
  "directory",
  ...PEOPLE_SUB_ROOMS.flatMap((room) => room.views.map((view) => view.key)),
];

/** The receiving end of `/people?view=<key>` redirects. */
export function peopleViewFromParam(raw: string | null): PeopleView | null {
  if (!raw) return null;
  return (PEOPLE_VIEW_KEYS as readonly string[]).includes(raw)
    ? (raw as PeopleView)
    : null;
}

/** The room a view stands in; the directory stands in none. */
export function peopleSubRoomOf(view: PeopleView): PeopleSubRoom | null {
  return (
    PEOPLE_SUB_ROOMS.find((room) => room.views.some((v) => v.key === view)) ??
    null
  );
}

export interface PeopleEngineNudge {
  count: number;
  name: string;
  since: string;
}

/** A room's own views as underline words (the S1 `.filters`), never tabs. */
export function SubRoomFilters({
  room,
  view,
  onSelect,
}: {
  room: PeopleSubRoom;
  view: PeopleView;
  onSelect: (view: PeopleView) => void;
}) {
  if (room.views.length < 2) return null;
  return (
    <div
      role="group"
      aria-label={`${room.name} views`}
      data-people-sub-room-filters={room.key}
      className="filters people-filter-line"
    >
      {room.views.map((option) => (
        <button
          key={option.key}
          type="button"
          aria-pressed={view === option.key}
          data-people-view-option={option.key}
          onClick={() => onSelect(option.key)}
        >
          {option.name}
        </button>
      ))}
    </div>
  );
}

/** The Engine's one line: the strongest dormant tie, never a tally. */
export function EngineNudgeLine({ nudge }: { nudge: PeopleEngineNudge }) {
  return (
    <p data-people-engine-nudge className="t-body people-engine-line">
      <span className="font-heading italic text-[var(--text-primary)]">
        {nudge.name}
      </span>{" "}
      is the strongest dormant tie · {nudge.since}.
    </p>
  );
}
export function ViewHeader({ title, sub }: { title: string; sub?: string }) {
  return (
    <div className="mb-5">
      <h2 className="font-heading text-[1.6rem] font-medium leading-tight text-[var(--color-charcoal)]">
        {title}
      </h2>
      {sub && <p className="doc-type-body mt-1">{sub}</p>}
    </div>
  );
}

/** A quiet notice retained for any view slot still arriving in a later track. */
export function ViewPlaceholder({ track }: { track: string }) {
  return (
    <div className="border-l border-[var(--border-default)] py-3 pl-5">
      <p className="doc-type-body max-w-[52ch] text-[var(--color-quiet-ink)]">
        This view is bound in <span className="font-mono">{track}</span>. The
        Room shell, directory, and navigation contract are in place around it.
      </p>
    </div>
  );
}

/**
 * R94 — the studio's pencil-idiom empty-state teach: what/why in Playfair
 * italic, an en-dash lead, and at most one next move. No card or illustration.
 */
export function EmptyTeach({
  children,
  action,
}: {
  children: ReactNode;
  action?: { label: string; onClick: () => void };
}) {
  return (
    <p className="px-1 py-8 font-heading text-[15px] italic leading-relaxed text-[var(--color-aged-oak)]">
      – {children}
      {action && (
        <>
          {" "}
          <button
            type="button"
            onClick={action.onClick}
            className="inline-flex min-h-11 items-center font-body text-[16px] font-medium not-italic text-[var(--text-primary)] underline decoration-[var(--color-aged-oak)] decoration-1 underline-offset-4 transition-colors hover:text-[var(--color-mocha)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)] motion-reduce:transition-none"
          >
            {action.label} <span aria-hidden>→</span>
          </button>
        </>
      )}
    </p>
  );
}
