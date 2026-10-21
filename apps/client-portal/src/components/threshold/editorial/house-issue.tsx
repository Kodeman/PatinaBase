"use client";

import { Fragment, useEffect, useMemo, useRef, type ReactNode } from "react";

import {
  GOODS_JOURNEY_STAGES,
  journeyStageIndexForStatus,
} from "@/components/commercial/journey-stepper";
import { countInWords } from "@/components/threshold/instruments/standing-sentence";
import { useClientEditorial } from "@/hooks/use-client-editorial";
import { useFeatureFlag } from "@/hooks/use-feature-flag";
import { plateAlt } from "@/lib/editorial/caption";
import { chapterOrder, type Chapter } from "@/lib/editorial/chapters";
import {
  rankHero,
  roomPlates,
  type RoomPlateChoice,
} from "@/lib/editorial/rank";
import type {
  CaptionTriplet,
  ClientProjectEditorial,
  EditorialAsset,
  EditorialItem,
} from "@/lib/editorial/types";
import { dayMonth } from "@/lib/threshold/dates";
import type {
  InvoiceProjection,
  InvoiceRow,
} from "@/lib/threshold/invoice-rollup";
import {
  planKeyGeometry,
  type KeyMark,
  type KeyRoom,
  type PlanKeyGeometry,
} from "@/lib/threshold/plan-key";

import { ARRIVAL_PURPOSE, ArrivalLine } from "../landmark-ledger";
import { ChapterHead } from "./chapter-head";
import { HeldPlate } from "./held-plate";
import { HeroPlate } from "./hero-plate";
import {
  LetterheadCompact,
  type LetterheadCompactProps,
} from "./letterhead-compact";
import { PiecePlate } from "./piece-plate";
import { PlanPlate } from "./plan-plate";
import { Reveal } from "./reveal";
import { RoomPlate } from "./room-plate";
import { StandingRows, type StandingRowsProps } from "./standing-rows";
import { SwatchStrip } from "./swatch-strip";
import "./editorial.css";

/* The House Issue (US-49 Phase 1): the image-led composition the Threshold
   draws when `client-edition-page` is on and the plate read answered. Every
   plate stands BESIDE a section, never inside one: SinceYesterday dims only
   `[data-dimmable]`, and a plate must never dim with its section. */

// ── the hero's preload, in the server page's HTML ─────────────────────────────

export interface HeroPreloadLinksProps {
  preloads: ReadonlyArray<{
    imageSrcSet: string;
    imageSizes: string;
    media?: string;
  }>;
}

/** React hoists each `<link>` into `<head>`; nothing renders when there is no hero. */
export function HeroPreloadLinks({ preloads }: HeroPreloadLinksProps) {
  return (
    <>
      {preloads.map((p) => (
        <link
          key={p.imageSrcSet}
          rel="preload"
          as="image"
          type="image/avif"
          imageSrcSet={p.imageSrcSet}
          imageSizes={p.imageSizes}
          media={p.media}
          fetchPriority="high"
        />
      ))}
    </>
  );
}

// ── the issue: which plate stands where ──────────────────────────────────────

export interface HouseIssue {
  editorial: ClientProjectEditorial;
  hero: EditorialAsset | null;
  /** The item a hero photographs, for its drawn fallback. */
  heroItem: EditorialItem | null;
  rooms: ReadonlyMap<string, RoomPlateChoice>;
  /** The one room whose chapter plate stands held (≤1 per page). */
  heldRoomId: string | null;
  /** Where the paint chips stand: a living room chapter, else the drawn cover. */
  swatchRoomId: string | null;
}

const LIVING = /living|sitting|family|great room|lounge/i;

function heldRoom(choices: readonly RoomPlateChoice[]): string | null {
  return choices.find((c) => c.chapter?.crops.tall)?.roomId ?? null;
}

function itemFor(
  editorial: ClientProjectEditorial,
  assetId: string | undefined,
): EditorialItem | null {
  if (!assetId) return null;
  return (
    editorial.rooms
      .flatMap((r) => r.items)
      .find((i) => i.assetIds.includes(assetId)) ?? null
  );
}

export function houseIssue(editorial: ClientProjectEditorial): HouseIssue {
  const hero = rankHero(editorial);
  const choices = roomPlates(editorial, hero?.id ?? null);
  const living = editorial.rooms.find((r) => LIVING.test(r.name));
  return {
    editorial,
    hero,
    heroItem: itemFor(editorial, hero?.id),
    rooms: new Map(choices.map((c) => [c.roomId, c])),
    heldRoomId: heldRoom(choices),
    swatchRoomId: hero && living ? living.id : null,
  };
}

/** Null whenever the edition is off: every caller then renders today's page. */
export function useHouseIssue(
  editorial: ClientProjectEditorial | null | undefined,
): HouseIssue | null {
  return useMemo(() => (editorial ? houseIssue(editorial) : null), [editorial]);
}

/**
 * The flag, the plate read and the issue in one. Fail-closed: the flag off, or
 * still loading, is today's house and makes no plate read.
 */
export function useEditionIssue(
  projectId: string,
  editorial: ClientProjectEditorial | null,
): HouseIssue | null {
  const flag = useFeatureFlag("client-edition-page");
  const on = flag.value && !flag.isLoading;
  const query = useClientEditorial(projectId, editorial, on);
  return useHouseIssue(on ? query.data : null);
}

/**
 * The chapters for the sections that actually render, numbered in the order
 * the page prints them (the cover is 01), so the wayfinding never skips or
 * runs backwards. Labels and headlines are the PLAN's (`chapterOrder`).
 */
export function editionChapters(
  issue: HouseIssue | null,
  printed: ReadonlyArray<string | null | false | undefined>,
): Map<string, Chapter> | null {
  if (!issue) return null;
  const plan = new Map(
    chapterOrder(issue.editorial.project, issue.editorial.rooms).map((c) => [
      c.anchor ?? "cover",
      c,
    ]),
  );
  const kept = ["cover", ...printed].filter(
    (a): a is string => typeof a === "string" && plan.has(a),
  );
  return new Map(
    [...new Set(kept)].map((anchor, i) => {
      const number = String(i + 1).padStart(2, "0");
      const chapter = plan.get(anchor)!;
      return [
        anchor,
        { ...chapter, number, eyebrow: `${number} · ${chapter.label}` },
      ];
    }),
  );
}

/** Which optional sections a branch printed. */
export interface PrintedSections {
  /** The studio's standing note. */
  note: unknown;
  /** Past notes and the correspondence record (`#previously`). */
  previously: number;
  hasRecord: boolean;
}

function earlierPrinted(printed: PrintedSections): boolean {
  return printed.previously > 0 || printed.hasRecord;
}

/** The ground floor's order: doorstep, note, approvals, road, earlier, mat. */
export function groundFloorChapters(
  issue: HouseIssue | null,
  printed: PrintedSections,
): Map<string, Chapter> | null {
  return editionChapters(issue, [
    "doorstep",
    Boolean(printed.note) && "note",
    "approvals",
    "road",
    earlierPrinted(printed) && "previously",
    "mat",
  ]);
}

/** The sheet's order: doorstep, approvals, the key, each room, road, note, earlier, mat. */
export function sheetChapters(
  issue: HouseIssue | null,
  printed: PrintedSections & {
    roomsUnread: boolean;
    roomAnchors: readonly string[];
  },
): Map<string, Chapter> | null {
  return editionChapters(issue, [
    "doorstep",
    "approvals",
    !printed.roomsUnread && "key",
    ...printed.roomAnchors,
    "road",
    Boolean(printed.note) && "note",
    earlierPrinted(printed) && "previously",
    "mat",
  ]);
}

// ── the three standing rows ──────────────────────────────────────────────────

function money(cents: number, currency: string): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(
    cents / 100,
  );
}

function capitalise(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

const DUE_WORDS: Record<
  NonNullable<InvoiceRow["dueState"]>,
  (row: InvoiceRow) => string
> = {
  past_due: (row) =>
    `${money(row.balanceCents, row.currency)} was due on ${dayMonth(row.dueDate)}.`,
  due_today: (row) => `${money(row.balanceCents, row.currency)} is due today.`,
  upcoming: (row) =>
    `${money(row.balanceCents, row.currency)} is due on ${dayMonth(row.dueDate)}.`,
};

/** Row 1, the letterbox: the first invoice she can pay, by its due date. */
export function letterboxRow(
  invoices: InvoiceProjection | null,
): StandingRowsProps["letterbox"] {
  if (!invoices) return { sentence: null };
  if (invoices.read === "failed")
    return { sentence: "Your invoices could not be read just now." };
  const first = invoices.payable[0];
  if (first) {
    const words =
      first.dueState && first.dueDate
        ? DUE_WORDS[first.dueState](first)
        : `${money(first.balanceCents, first.currency)} is ready to pay.`;
    return { sentence: words, amountAct: true };
  }
  if (invoices.processing.length > 0)
    return { sentence: "Your payment is on its way to the studio." };
  return { sentence: null };
}

export interface ApprovalsRowInput {
  asks: ReadonlyArray<{ artifactTitle?: string | null }>;
  /** A door or wall waits in a room band. */
  gate: "door" | "wall" | null;
  readFailed: boolean;
}

/** Row 2, approvals: what waits on her name, in words. */
export function approvalsRow({
  asks,
  gate,
  readFailed,
}: ApprovalsRowInput): StandingRowsProps["approvals"] {
  if (readFailed)
    return { sentence: "The approvals could not be read just now." };
  if (gate === "door")
    return { sentence: "A document is waiting for your signature." };
  if (gate === "wall")
    return { sentence: "Finished work is waiting for your review." };
  if (asks.length === 1) {
    const title = asks[0].artifactTitle?.trim();
    return {
      sentence: title
        ? `Waiting for your approval: ${title}.`
        : "One approval is waiting for you.",
    };
  }
  if (asks.length > 1)
    return {
      sentence: `${capitalise(countInWords(asks.length))} approvals are waiting for you.`,
    };
  return { sentence: null };
}

/** Row 3, the ledger: what is open, in one currency's words. */
export function ledgerRow(
  invoices: InvoiceProjection | null,
): StandingRowsProps["ledger"] {
  if (!invoices) return { sentence: null };
  if (invoices.withheld || !invoices.outstandingTotals) {
    return {
      sentence: invoices.allClear ? null : "Your invoices are being checked.",
    };
  }
  const totals = invoices.outstandingTotals;
  const count = totals.reduce((n, t) => n + t.invoiceCount, 0);
  if (count === 0) return { sentence: null };
  const noun =
    count === 1
      ? "One invoice is open"
      : `${capitalise(countInWords(count))} invoices are open`;
  const only = totals.length === 1 ? totals[0] : null;
  return {
    sentence: only
      ? `${noun}, ${money(only.cents, only.currency)} in all.`
      : `${noun}.`,
  };
}

// ── the arrival: hero or drawn cover, then the standing rows ─────────────────

/**
 * Full bleed out of the page's measure. The width is read from the root's
 * client width (never 100vw, which counts a classic scrollbar and overflows).
 * At the phone the 16px gutter is put back so `.ed-hero`'s own −16px lands on
 * the edge. A failed hero is drawn at the hero's geometry, not a square.
 */
const BLEED = [
  "[margin-inline:calc(50%-var(--hi-page-w,100%)/2)]",
  "max-[600px]:px-4",
  "[&_.ed-silhouette.ed-hero>.ed-plate__frame]:aspect-auto",
  "[&_.ed-silhouette.ed-hero>.ed-plate__frame]:h-[340px]",
  "min-[601px]:[&_.ed-silhouette.ed-hero>.ed-plate__frame]:h-[min(72svh,648px)]",
].join(" ");

function Bleed({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () =>
      el.style.setProperty(
        "--hi-page-w",
        `${document.documentElement.clientWidth}px`,
      );
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, []);
  return (
    <div ref={ref} data-testid="house-issue-hero" className={BLEED}>
      {children}
    </div>
  );
}

interface HouseIssueArrivalProps {
  issue: HouseIssue;
  chapters: ReadonlyMap<string, Chapter>;
  /** Null until the house has spoken: the rows hold their place, never a false zero. */
  rows: StandingRowsProps | null;
  /** The key plan, for the drawn cover. */
  plan: PlanKeyGeometry | null;
  studioName?: string | null;
  today?: Date | null;
}

function planCaption(
  studioName?: string | null,
  today?: Date | null,
): CaptionTriplet {
  return {
    what: "The rooms, as drawn",
    whose: studioName ? `drawn by ${studioName}` : "drawn by the studio",
    when: today
      ? new Intl.DateTimeFormat("en-GB", {
          month: "long",
          year: "numeric",
        }).format(today)
      : "this season",
  };
}

function DrawnCover({
  issue,
  plan,
  studioName,
  today,
  chapter,
}: Omit<HouseIssueArrivalProps, "rows" | "chapters"> & { chapter: Chapter }) {
  const { palette } = issue.editorial;
  return (
    <section
      data-testid="house-issue-cover"
      aria-label="The cover"
      className="mt-6"
    >
      <ChapterHead
        number={chapter.number}
        label={chapter.label}
        headline={chapter.headline}
      />
      {plan && plan.rects.length > 0 ? (
        <PlanPlate geometry={plan} caption={planCaption(studioName, today)} />
      ) : null}
      {issue.swatchRoomId === null && palette.length > 0 ? (
        <SwatchStrip swatches={palette} />
      ) : null}
    </section>
  );
}

function HeroCover({
  issue,
  hero,
  chapter,
}: {
  issue: HouseIssue;
  hero: EditorialAsset;
  chapter: Chapter;
}) {
  const item = issue.heroItem;
  return (
    <Bleed>
      <HeroPlate
        scopeId={issue.editorial.project.id}
        asset={hero}
        eyebrow={chapter.eyebrow}
        headline={chapter.headline}
        alt={plateAlt(hero)}
        paletteHex={hero.dominantHex}
        fallback={{
          name: item?.nameAsSigned ?? issue.editorial.project.name,
          silhouetteKind: item?.silhouetteKind,
          category: item?.category,
        }}
      />
    </Bleed>
  );
}

/** The cover: the hero, or the drawn cover when the house has no photograph. */
function Cover(props: HouseIssueArrivalProps) {
  const { issue } = props;
  const chapter =
    props.chapters.get("cover") ??
    chapterOrder(issue.editorial.project, issue.editorial.rooms)[0];
  return issue.hero ? (
    <HeroCover issue={issue} hero={issue.hero} chapter={chapter} />
  ) : (
    <DrawnCover {...props} chapter={chapter} />
  );
}

function Rows({ rows }: { rows: StandingRowsProps | null }) {
  if (!rows)
    return (
      <div
        aria-hidden="true"
        data-testid="standing-rows-held"
        className="mt-2 h-[133px]"
      />
    );
  return <StandingRows {...rows} />;
}

/** What the three standing rows are read from; nothing until the house has spoken. */
export interface StandingRowsInput extends ApprovalsRowInput {
  spoken: boolean;
  invoices: InvoiceProjection | null;
}

function standingRows(input: StandingRowsInput): StandingRowsProps | null {
  if (!input.spoken) return null;
  return {
    letterbox: letterboxRow(input.invoices),
    approvals: approvalsRow(input),
    ledger: ledgerRow(input.invoices),
  };
}

export interface CoverPlanInput {
  unread: boolean;
  rooms: readonly KeyRoom[] | null;
  marks: readonly KeyMark[];
}

function coverPlan({
  unread,
  rooms,
  marks,
}: CoverPlanInput): PlanKeyGeometry | null {
  return unread ? null : planKeyGeometry([...(rooms ?? [])], [...marks]);
}

export interface HouseIssueHeadProps {
  /** Null with the edition off: the head is today's, untouched. */
  issue: HouseIssue | null;
  chapters: ReadonlyMap<string, Chapter> | null;
  /** Today's doorplate, drawn only with the edition off. */
  doorplate: ReactNode;
  letterhead: LetterheadCompactProps;
  /** The "On this page" link row. */
  ledger: ReactNode;
  /** Today's invoice arrival lines; the standing rows say them in the edition. */
  todayLines: ReactNode;
  rows: StandingRowsInput;
  plan: CoverPlanInput;
  studioName?: string | null;
  today?: Date | null;
}

/*
 * The edition's arrival. DOM and reading order at every width: letterhead,
 * purpose, cover, the three rows, the link row (PLAN §1). At 601 and up the
 * grid sets a 96px top band — letterhead left, purpose and link row right, a
 * hairline under it — over the full-bleed hero (PLAN §2). The −40px cancels
 * the page's own top padding so the band starts at the page's top edge.
 */
const HEAD = [
  "-mt-10 pt-4",
  "min-[601px]:grid min-[601px]:grid-cols-[minmax(240px,1fr)_minmax(0,auto)] min-[601px]:gap-x-12",
].join(" ");
const AT_DESK = {
  letterhead:
    "pb-2 min-[601px]:col-start-1 min-[601px]:row-start-1 min-[601px]:row-span-2 min-[601px]:pb-0",
  purpose:
    "m-0 max-w-[56ch] text-[16px] leading-[22px] text-[var(--text-primary)] min-[601px]:col-start-2 min-[601px]:row-start-1 min-[601px]:self-end",
  links:
    "min-[601px]:col-start-2 min-[601px]:row-start-2 min-[601px]:[&>nav]:!mt-0",
  rule: "hidden min-[601px]:col-span-2 min-[601px]:row-start-3 min-[601px]:mt-2 min-[601px]:block min-[601px]:h-px min-[601px]:bg-[var(--border-default)]",
  cover: "min-[601px]:col-span-2 min-[601px]:row-start-4 min-[601px]:mt-2",
  rows: "min-[601px]:col-span-2 min-[601px]:row-start-5",
} as const;

function EditionHead(props: HouseIssueHeadProps & { issue: HouseIssue }) {
  const chapters = props.chapters ?? new Map<string, Chapter>();
  const arrival = {
    ...props,
    chapters,
    rows: standingRows(props.rows),
    plan: coverPlan(props.plan),
  };
  return (
    <div data-testid="house-issue-head" className={HEAD}>
      <div className={AT_DESK.letterhead}>
        <LetterheadCompact {...props.letterhead} />
      </div>
      <p className={AT_DESK.purpose}>{ARRIVAL_PURPOSE}</p>
      {/* The first Tab stop: past the cover and its rows to the house itself. */}
      <a
        href="#doorstep"
        data-testid="house-issue-skip"
        className="sr-only focus:not-sr-only focus:absolute focus:z-10 focus:mt-2 focus:inline-flex focus:min-h-[44px] focus:items-center focus:bg-[var(--bg-primary)] focus:px-3 focus:text-[var(--text-primary)] focus:underline"
      >
        Skip to the project
      </a>
      <div aria-hidden="true" className={AT_DESK.rule} />
      <div className={AT_DESK.cover}>
        <Cover {...arrival} />
      </div>
      <div className={AT_DESK.rows}>
        <Rows rows={arrival.rows} />
      </div>
      <div className={AT_DESK.links}>{props.ledger}</div>
    </div>
  );
}

/**
 * The page's head. With the edition off it is today's head, element for
 * element: the doorplate, the purpose line, the link row and the invoice lines.
 */
export function HouseIssueHead(props: HouseIssueHeadProps) {
  if (props.issue) return <EditionHead {...props} issue={props.issue} />;
  return (
    <>
      {props.doorplate}
      {/* Under the doorplate and OUTSIDE the since-yesterday dimming: an index
          that faded with the page would be an index of nothing. */}
      <ArrivalLine>{ARRIVAL_PURPOSE}</ArrivalLine>
      {props.ledger}
      {props.todayLines}
    </>
  );
}

// ── chapter openings, beside each section ────────────────────────────────────

/**
 * The chapter head over a section. Returns the section untouched when the
 * edition is off (`chapters` null) or the section did not render, so the
 * flag-off page is the same tree it always was.
 */
export function withChapter(
  chapters: ReadonlyMap<string, Chapter> | null,
  anchor: string,
  node: ReactNode,
): ReactNode {
  const chapter = chapters?.get(anchor);
  if (!chapter || node === null || node === undefined || node === false)
    return node;
  return (
    <>
      <Reveal className="mt-12">
        <ChapterHead
          number={chapter.number}
          label={chapter.label}
          headline={chapter.headline}
        />
      </Reveal>
      {node}
    </>
  );
}

function statusWords(status: string | null): string {
  return (
    GOODS_JOURNEY_STAGES[
      journeyStageIndexForStatus((status ?? "specified") as never)
    ] ?? GOODS_JOURNEY_STAGES[0]
  );
}

function ChapterPlate({
  issue,
  choice,
  room,
}: {
  issue: HouseIssue;
  choice: RoomPlateChoice;
  room: { name: string };
}) {
  const scopeId = issue.editorial.project.id;
  const asset = choice.chapter ?? choice.concept;
  if (!asset) return null;
  const fallback = { name: room.name };
  if (choice.chapter && issue.heldRoomId === choice.roomId) {
    return (
      <HeldPlate
        scopeId={scopeId}
        asset={choice.chapter}
        alt={plateAlt(choice.chapter)}
        paletteHex={choice.chapter.dominantHex}
        fallback={fallback}
      />
    );
  }
  return (
    <RoomPlate
      scopeId={scopeId}
      asset={asset}
      alt={plateAlt(asset)}
      paletteHex={asset.dominantHex}
      fallback={fallback}
    />
  );
}

function Pieces({
  issue,
  choice,
}: {
  issue: HouseIssue;
  choice: RoomPlateChoice;
}) {
  const room = issue.editorial.rooms.find((r) => r.id === choice.roomId);
  if (!room || room.items.length === 0) return null;
  const assets = new Map(choice.pieces.map((p) => [p.itemId, p.asset]));
  return (
    <ul
      aria-label={`Pieces for the ${room.name.toLowerCase()}`}
      className="mt-6 flex flex-wrap gap-4 p-0 [list-style:none]"
    >
      {room.items.map((item) => (
        <li key={item.id}>
          <PiecePlate
            scopeId={issue.editorial.project.id}
            item={item}
            asset={assets.get(item.id) ?? null}
            statusWords={statusWords(item.status)}
          />
        </li>
      ))}
    </ul>
  );
}

/**
 * A room's opening, standing just above its RoomBand: the chapter head, the
 * room plate (or the one held plate), and the room's pieces. Three children,
 * so the reveal moves all of it.
 */
/**
 * A RoomBand with its opening above it under the edition; the band itself,
 * untouched, with the edition off. The plates stand above the band, never
 * inside it: the band is a dimmable unit and a plate never dims.
 */
export function withRoomOpening(
  issue: HouseIssue | null,
  chapters: ReadonlyMap<string, Chapter> | null,
  roomId: string,
  band: ReactNode,
): ReactNode {
  if (!issue) return band;
  return (
    <Fragment key={roomId}>
      <RoomOpening issue={issue} chapters={chapters} roomId={roomId} />
      {band}
    </Fragment>
  );
}

export function RoomOpening({
  issue,
  chapters,
  roomId,
}: {
  issue: HouseIssue | null;
  chapters: ReadonlyMap<string, Chapter> | null;
  roomId: string;
}) {
  const choice = issue?.rooms.get(roomId);
  const room = issue?.editorial.rooms.find((r) => r.id === roomId);
  const chapter = room ? chapters?.get(room.anchor) : undefined;
  if (!issue || !choice || !room || !chapter) return null;
  const swatches = issue.swatchRoomId === roomId ? issue.editorial.palette : [];
  return (
    <Reveal className="mt-12">
      <ChapterHead
        number={chapter.number}
        label={chapter.label}
        headline={chapter.headline}
      />
      <ChapterPlate issue={issue} choice={choice} room={room} />
      <div>
        {swatches.length > 0 ? <SwatchStrip swatches={swatches} /> : null}
        <Pieces issue={issue} choice={choice} />
      </div>
    </Reveal>
  );
}
