/**
 * The RoomSkeleton family (US-34 F13a–c; US-33 D1 §5, Q "Quiet paper").
 *
 * One shaped placeholder per room that rendered blank, or read as empty,
 * while it loaded: the Build room (`/doc/[id]/pieces`), Measured rooms
 * (`/rooms`), the Room view (`/room/[id]`) and People (`/people`).
 *
 * The frame is real and instant: the room's fixed title, eyebrows and rules,
 * drawn with the same classes and measure the room itself uses, so nothing
 * moves when the data lands (D1.19). Only data-dependent lines are bars, and
 * they wait 150 ms before they appear (`LoadingRegion`). Inputs, tabs and
 * buttons are bars until the room hydrates (H3); no count is ever printed as
 * a number (D1 §2).
 *
 * Row counts are drawn to the fold, with the extra rows dropped at 390.
 */

import type { ReactNode } from "react";
import { Bar, LoadingRegion } from "./placeholder";

/** The Section eyebrow's clay ornament (S1's `.orn`). */
export function Ornament() {
  return (
    <svg
      className="orn"
      viewBox="0 0 34 12"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M0 2h34M0 6h28M0 10h20" />
    </svg>
  );
}

/** A 44 px act drawn as a bar: real acts wait for hydration (H3). */
export function ActBar({ width }: { width: number }) {
  return (
    <span className="inline-flex min-h-11 items-center">
      <Bar width={width} height={8} />
    </span>
  );
}

/**
 * RoomShell's frame without its behaviour: the Header line at the room's own
 * measure, the double rule, and the paper below. The raise and the leave veil
 * belong to the live shell.
 */
export function RoomFrameSkeleton({
  label,
  title,
  heading,
  measure = "mx-auto max-w-[976px] px-4 sm:px-6",
  back = false,
  count = false,
  countAtEveryWidth = false,
  action,
  actionAtEveryWidth = false,
  children,
}: {
  label: string;
  title: string;
  /** A richer head in place of the plain title, as RoomShell's `heading`. */
  heading?: ReactNode;
  measure?: string;
  /** A nested room's way out ("← The desk"), drawn as a bar. */
  back?: boolean;
  /** A count beside the title, drawn as a bar and never as "0". */
  count?: boolean;
  countAtEveryWidth?: boolean;
  /** The width of the room's act, drawn as a bar. */
  action?: number;
  actionAtEveryWidth?: boolean;
  children: ReactNode;
}) {
  return (
    <LoadingRegion
      label={label}
      className="relative flex min-h-screen flex-col bg-[var(--doc-paper)]"
    >
      <div className={`relative z-10 w-full ${measure}`}>
        <header className="hline" data-room-header-line>
          <div className="hline-l">
            {back && (
              <span className="inline-flex min-h-11 items-center gap-2 font-mono text-[12px] text-[var(--text-muted)]">
                <span aria-hidden="true">←</span>
                <Bar width={88} height={8} />
              </span>
            )}
            {heading ?? (
              <h1 className="t-d2 m-0 text-[var(--text-primary)]">{title}</h1>
            )}
            {count && (
              <span
                className={`t-meta ${countAtEveryWidth ? "inline" : "hidden sm:inline"}`}
              >
                <Bar width={96} height={7} />
              </span>
            )}
          </div>
          {action != null && (
            <div
              className={
                actionAtEveryWidth ? "hline-r" : "hline-r room-acts-wide"
              }
            >
              <ActBar width={action} />
            </div>
          )}
        </header>
        <div className="rule-strong" role="presentation" />
      </div>
      <div className="relative z-10 flex-1 pb-[96px] min-[1180px]:pb-[84px]">
        {children}
      </div>
    </LoadingRegion>
  );
}

// ── People (F13c) ────────────────────────────────────────────────────────────

/** people-room.tsx's measure. */
const PEOPLE_MEASURE = "mx-auto max-w-[1296px] px-4 sm:px-6 min-[1180px]:px-8";
const PEOPLE_ROWS: ReadonlyArray<readonly [string, string]> = [
  ["62%", "40%"],
  ["74%", "52%"],
  ["56%", "46%"],
  ["68%", "38%"],
  ["60%", "50%"],
  ["78%", "44%"],
];

/** The Directory's ledger rows: avatar, name, kind, sentence, when. 6 at 1440, 4 at 390. */
export function PeopleRowsSkeleton() {
  return (
    <section className="section ledger">
      <div className="sec-head">
        <p className="eb">
          <Ornament />
          <Bar width={72} height={7} />
        </p>
      </div>
      <ul className="rows m-0 list-none p-0">
        {PEOPLE_ROWS.map(([name, sentence], i) => (
          <li key={i} className={i >= 4 ? "lrow max-sm:hidden" : "lrow"}>
            <div className="lname">
              <span className="people-who">
                <span className="ph-disc" aria-hidden="true" />
                <span className="t-d4 inline-flex min-h-11 flex-1 items-center">
                  <Bar width={name} height={10} />
                </span>
              </span>
            </div>
            <span className="lphase t-meta">
              <Bar width={52} height={7} />
            </span>
            <div className="lsent t-body-sm min-w-0">
              <Bar width={sentence} height={8} />
            </div>
            <span className="lwhen t-meta">
              <Bar width={64} height={7} />
            </span>
            <span className="lact" />
          </li>
        ))}
      </ul>
    </section>
  );
}

export function PeopleSkeleton() {
  return (
    <RoomFrameSkeleton
      label="Loading the directory."
      title="Studio contacts"
      measure={PEOPLE_MEASURE}
      count
      countAtEveryWidth
      action={112}
    >
      <div className={PEOPLE_MEASURE}>
        <div className="people-search">
          <p className="eb">Search the directory</p>
          <div className="people-search-row">
            <div className="people-search-field" aria-hidden="true">
              <Bar width="30%" height={9} />
            </div>
          </div>
        </div>
        <div className="people-filter-line">
          <div className="filters">
            {[72, 56, 44, 56, 52, 44].map((w, i) => (
              <ActBar key={i} width={w} />
            ))}
          </div>
          <div className="filters">
            <ActBar width={40} />
            <ActBar width={52} />
          </div>
        </div>
        <div className="people-sections">
          <PeopleRowsSkeleton />
        </div>
      </div>
    </RoomFrameSkeleton>
  );
}

// ── Measured rooms (F13b) ────────────────────────────────────────────────────

/** rooms-index.tsx: one job Section of room cards (3 at 1440, 1 at 390). */
export function RoomsIndexSkeleton() {
  return (
    <RoomFrameSkeleton
      label="Loading the measured rooms."
      title="Measured rooms"
      count
      action={120}
      actionAtEveryWidth
    >
      <div className="rooms-index mx-auto max-w-[976px] px-4 pb-16 sm:px-6">
        <section className="section">
          <div className="sec-head">
            <p className="eb">
              <Ornament />
              <Bar width={120} height={7} />
            </p>
          </div>
          <p className="sec-title t-d3">
            <Bar width={220} height={12} />
          </p>
          <div className="cards-wrap">
            <div className="cards">
              {[0, 1, 2].map((i) => (
                <div key={i} className={i > 0 ? "card max-sm:hidden" : "card"}>
                  <p className="eb">
                    <Bar width="48%" height={7} />
                  </p>
                  <p className="name-h t-d3">
                    <Bar width="64%" height={12} />
                  </p>
                  <div className="room-fig">
                    <span
                      className="ph-block block aspect-[3/2] w-full"
                      aria-hidden="true"
                    />
                  </div>
                  <p className="t-money mt-2">
                    <Bar width="40%" height={8} />
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>
      </div>
    </RoomFrameSkeleton>
  );
}

// ── Room view (F13b) ─────────────────────────────────────────────────────────

/**
 * The Room view's body while the scan is read: the job line, the viewer's
 * eyebrow and mode row, and a drawing board in the plan's proportion marked
 * only by its four registration corners (square at 390). No words (D1 §5).
 */
export function RoomViewSkeleton() {
  return (
    <LoadingRegion
      label="Loading the room drawing."
      className="mx-auto max-w-[1180px] px-4 pb-20 sm:px-6"
    >
      <p className="room-ctx t-body-sm">
        <span className="inline-flex min-h-11 items-center">
          <Bar width={180} height={8} />
        </span>
      </p>
      <section className="section">
        <div className="sec-head">
          <p className="eb">
            <Ornament />
            <Bar width={200} height={7} />
          </p>
        </div>
        <div className="mb-5 flex flex-wrap gap-5 border-b border-[var(--doc-ink-border)]">
          <ActBar width={76} />
          <ActBar width={96} />
        </div>
        <div
          data-room-board
          aria-hidden="true"
          className="relative mx-auto aspect-square w-full max-w-[880px] sm:aspect-[880/500]"
        >
          <i className="ph-corner left-0 top-0 border-l border-t" />
          <i className="ph-corner right-0 top-0 border-r border-t" />
          <i className="ph-corner bottom-0 left-0 border-b border-l" />
          <i className="ph-corner bottom-0 right-0 border-b border-r" />
        </div>
        <div className="mx-auto mt-4 max-w-[880px]">
          <p className="t-d4 m-0">
            <Bar width={180} height={10} />
          </p>
          <p className="t-body-sm m-0">
            <Bar width={120} height={8} />
          </p>
        </div>
      </section>
    </LoadingRegion>
  );
}

/** `/room/[id]` before its chunk lands: the nested room's frame plus the board. */
export function RoomViewPageSkeleton() {
  return (
    <RoomFrameSkeleton
      label="Loading the room."
      title="A room"
      measure="mx-auto max-w-[1180px] px-4 sm:px-6"
      back
    >
      <RoomViewSkeleton />
    </RoomFrameSkeleton>
  );
}

// ── Build room (F13a) ────────────────────────────────────────────────────────

const SHEET_ROWS: ReadonlyArray<readonly [string, number]> = [
  ["42%", 64],
  ["36%", 56],
  ["48%", 72],
];

/**
 * build-room-shell.tsx's drafting sheet: the head band (way back, title,
 * lens words, the place summary), the lens's reading sentence, the rooms
 * rail at md and up, and two room groups of schedule rows.
 */
export function PiecesSkeleton() {
  return (
    <LoadingRegion
      label="Loading the pieces."
      className="flex h-[100dvh] flex-col bg-[var(--sheet)] pb-16 text-[var(--sheet-ink)] min-[1180px]:pb-[60px]"
    >
      <header className="relative flex flex-wrap items-center gap-x-6 border-b border-[var(--sheet-rule-strong)] bg-[var(--sheet-head)] px-4 md:min-h-[var(--head)] md:flex-nowrap md:px-6">
        <span className="inline-flex min-h-11 min-w-11 shrink-0 items-center gap-1 font-mono text-[12px]">
          <span aria-hidden="true">←</span>
          <Bar width={120} height={8} />
        </span>
        <p className="sr-only m-0 font-mono text-[12px] font-medium uppercase leading-none tracking-[0.08em] md:not-sr-only md:shrink-0">
          FF&amp;E schedule
        </p>
        <div className="ml-auto md:hidden">
          <ActBar width={96} />
        </div>
        <div className="order-last -mx-4 flex w-[calc(100%+2rem)] flex-wrap justify-center gap-x-1 border-t border-[var(--sheet-rule)] md:order-none md:mx-0 md:w-auto md:flex-1 md:flex-nowrap md:gap-6 md:border-t-0">
          {[120, 96, 64, 128, 104].map((w, i) => (
            <span key={i} className="inline-flex min-h-11 items-center px-2">
              <Bar width={w} height={8} />
            </span>
          ))}
        </div>
        <p className="m-0 hidden shrink-0 font-mono text-[12px] md:block">
          <Bar width={160} height={7} />
        </p>
      </header>

      <div className="max-w-[56ch] px-4 py-3 text-[14px] leading-[1.5] md:px-6">
        <p className="m-0">
          <Bar width="100%" height={8} />
        </p>
        <p className="m-0">
          <Bar width="58%" height={8} />
        </p>
      </div>

      <div className="flex min-h-0 flex-1">
        <div className="hidden w-[200px] shrink-0 flex-col border-r border-[var(--sheet-rule)] bg-[var(--sheet)] py-3 md:flex">
          <p className="m-0 mb-1 flex min-h-11 items-center px-4 font-mono text-[11px] font-medium uppercase tracking-[0.06em]">
            Rooms
          </p>
          {[112, 88, 128].map((w, i) => (
            <span key={i} className="flex min-h-11 items-center px-4">
              <Bar width={w} height={8} />
            </span>
          ))}
        </div>

        <div className="min-h-0 flex-1 overflow-hidden px-4 md:px-6">
          {[0, 1].map((group) => (
            <div key={group} className="pt-4">
              <p className="m-0 flex min-h-11 items-center font-mono text-[12px]">
                <Bar width={140} height={8} />
              </p>
              {SHEET_ROWS.map(([name, price], i) => (
                <div
                  key={i}
                  className={`flex min-h-[var(--row)] items-center gap-4 border-b border-[var(--sheet-rule)] ${
                    group === 1 && i === 2 ? "max-md:hidden" : ""
                  }`}
                >
                  <span className="flex-1">
                    <Bar width={name} height={8} />
                  </span>
                  <Bar width={72} height={7} />
                  <Bar
                    width={price}
                    height={8}
                    className="hidden md:inline-block"
                  />
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    </LoadingRegion>
  );
}
