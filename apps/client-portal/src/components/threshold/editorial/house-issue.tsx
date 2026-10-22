"use client";

import {
  Fragment,
  useLayoutEffect,
  useMemo,
  useRef,
  type ReactNode,
} from "react";

import {
  GOODS_JOURNEY_STAGES,
  journeyStageIndexForStatus,
} from "@/components/commercial/journey-stepper";
import { countInWords } from "@/components/threshold/instruments/standing-sentence";
import {
  editionHero,
  plateScope,
  useClientEditorial,
} from "@/hooks/use-client-editorial";
import { plateAlt } from "@/lib/editorial/caption";
import { chapterOrder, type Chapter } from "@/lib/editorial/chapters";
import { heroPicture, shortFramePosition } from "@/lib/editorial/crop";
import type { HeroDesktopLayout } from "@/lib/editorial/floors";
import { roomPlates, type RoomPlateChoice } from "@/lib/editorial/rank";
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
import { isStandingSentence, StandingRows, type StandingRowsProps } from "./standing-rows";
import { SwatchStrip } from "./swatch-strip";
import "./editorial.css";

/* The House Issue (US-49 Phase 1): the image-led composition the Threshold
   draws when the plate read answered. Every
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
  /** The plate route's scope: the approved edition's id, else the project's. */
  scopeId: string;
  /** The edition's pick when it has one the page can draw, else the code's rank. */
  hero: EditorialAsset | null;
  /** The item a hero photographs, for its drawn fallback. */
  heroItem: EditorialItem | null;
  rooms: ReadonlyMap<string, RoomPlateChoice>;
  /** The one room whose chapter plate stands held (≤1 per page). */
  heldRoomId: string | null;
  /** An approved job-level held plate, before the house/key chapter. */
  heldHouseAsset: EditorialAsset | null;
  /** Where the paint chips stand: a living room chapter, else the drawn cover. */
  swatchRoomId: string | null;
}

const LIVING = /living|sitting|family|great room|lounge/i;

/** Phase 1, no approved edition: the first room whose chapter plate has a tall crop. */
function heldRoom(choices: readonly RoomPlateChoice[]): string | null {
  return choices.find((c) => c.chapter?.crops.tall)?.roomId ?? null;
}

interface HeldPlacement {
  /** Null names the job-level house/key opening, not a room. */
  roomId: string | null;
  asset: EditorialAsset;
}

/**
 * An approved edition's held plate: the lowest-ranked `held` image the
 * composition approved, at the house or room its chapter key names. None when the
 * edition approved none; the code never picks one in its place.
 */
function approvedHeld(editorial: ClientProjectEditorial): HeldPlacement | null {
  const approved = new Set(editorial.composition?.held ?? []);
  const rooms = new Map(editorial.rooms.map((r) => [r.anchor, r.id]));
  const ranked = [...(editorial.images ?? [])].sort((a, b) => (a.rank ?? Infinity) - (b.rank ?? Infinity));
  for (const image of ranked) {
    if (image.plateRole !== "held" || !approved.has(image.assetId)) continue;
    const roomId = image.chapterKey === "house" ? null : rooms.get(image.chapterKey ?? "");
    const asset = editorial.assets.find((a) => a.id === image.assetId);
    if (roomId !== undefined && asset?.crops.tall) return { roomId, asset };
  }
  return null;
}

/** Each room's choice, with an edition's held plate standing in its own room. */
function roomChoices(
  editorial: ClientProjectEditorial,
  hero: EditorialAsset | null,
  held: HeldPlacement | null,
): RoomPlateChoice[] {
  const placed = [hero?.id, held?.asset.id].filter((id): id is string => Boolean(id));
  return roomPlates(editorial, placed).map((choice) =>
    choice.roomId === held?.roomId ? { ...choice, chapter: held.asset } : choice,
  );
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

/**
 * Which plate stands where. With an approved edition its own placement holds:
 * the composition's hero and held plate (ranked Phase 1 picks never replace
 * them); the code's rank fills only what the edition does not place.
 */
export function houseIssue(editorial: ClientProjectEditorial): HouseIssue {
  const hero = editionHero(editorial);
  const held = editorial.edition ? approvedHeld(editorial) : null;
  const choices = roomChoices(editorial, hero, held);
  const living = editorial.rooms.find((r) => LIVING.test(r.name));
  return {
    editorial,
    scopeId: plateScope(editorial),
    hero,
    heroItem: itemFor(editorial, hero?.id),
    rooms: new Map(choices.map((c) => [c.roomId, c])),
    heldRoomId: editorial.edition ? (held?.roomId ?? null) : heldRoom(choices),
    heldHouseAsset: held?.roomId === null ? held.asset : null,
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
 * The plate read and the issue in one. Null data keeps today's house.
 */
export function useEditionIssue(
  projectId: string,
  editorial: ClientProjectEditorial | null,
): HouseIssue | null {
  const query = useClientEditorial(projectId, editorial);
  return useHouseIssue(query.data);
}

/** A chapter as the page prints it: the edition may give it a standing sentence. */
export type EditionChapter = Chapter & {
  standing?: string | null;
  heldPlate?: { scopeId: string; asset: EditorialAsset };
};

/** The composition's chapter keys that are not a room's own anchor. */
const COMPOSED_ANCHOR: Readonly<Record<string, string>> = {
  cover: "cover",
  house: "key",
  progress: "road",
};

/**
 * The edition's words by the anchor they stand over: cover, the key, the road
 * and each room. Any other key, and any order the composition carries, is
 * ignored: the chapter order and every anchor are fixed (PLAN idea 2).
 */
function composedWords(
  editorial: ClientProjectEditorial,
): Map<string, { headline: string | null; standing: string | null }> {
  const rooms = new Set(editorial.rooms.map((r) => r.anchor));
  const words = new Map<string, { headline: string | null; standing: string | null }>();
  if (!editorial.edition) return words;
  for (const c of editorial.composition?.chapters ?? []) {
    const anchor = COMPOSED_ANCHOR[c.key] ?? (rooms.has(c.key) ? c.key : null);
    if (anchor) words.set(anchor, { headline: c.headline, standing: c.standing });
  }
  return words;
}

/** The PLAN's chapters (`chapterOrder`), keyed by anchor, with the edition's words. */
function plannedChapters(editorial: ClientProjectEditorial): Map<string, EditionChapter> {
  const words = composedWords(editorial);
  return new Map(
    chapterOrder(editorial.project, editorial.rooms).map((c) => {
      const anchor = c.anchor ?? "cover";
      const own = words.get(anchor);
      return [
        anchor,
        own
          ? { ...c, headline: own.headline ?? c.headline, standing: own.standing }
          : c,
      ];
    }),
  );
}

/**
 * The chapters for the sections that actually render, numbered in the order
 * the page prints them (the cover is 01), so the wayfinding never skips or
 * runs backwards. Labels and order are the PLAN's (`chapterOrder`); an
 * approved edition supplies headlines and standing sentences.
 */
export function editionChapters(
  issue: HouseIssue | null,
  printed: ReadonlyArray<string | null | false | undefined>,
): Map<string, EditionChapter> | null {
  if (!issue) return null;
  const plan = plannedChapters(issue.editorial);
  const kept = ["cover", ...printed].filter(
    (a): a is string => typeof a === "string" && plan.has(a),
  );
  return new Map(
    [...new Set(kept)].map((anchor, i) => {
      const number = String(i + 1).padStart(2, "0");
      const chapter = plan.get(anchor)!;
      return [
        anchor,
        {
          ...chapter, number, eyebrow: `${number} · ${chapter.label}`,
          ...(anchor === "key" && issue.heldHouseAsset
            ? { heldPlate: { scopeId: issue.scopeId, asset: issue.heldHouseAsset } }
            : {}),
        },
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
): Map<string, EditionChapter> | null {
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
): Map<string, EditionChapter> | null {
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

/** What the first payable invoice says: when it is due, or that it is ready. */
function payableWords(first: InvoiceRow): string {
  if (first.dueState && first.dueDate) return DUE_WORDS[first.dueState](first);
  return `${money(first.balanceCents, first.currency)} is ready to pay.`;
}

/** Row 1, the letterbox: the first invoice she can pay, by its due date. */
export function letterboxRow(
  invoices: InvoiceProjection | null,
): StandingRowsProps["letterbox"] {
  if (!invoices) return { sentence: null };
  if (invoices.read === "failed")
    return { sentence: "Your invoices could not be read just now." };
  const first = invoices.payable[0];
  if (first) return { sentence: payableWords(first), amountAct: true };
  if (invoices.processing.length > 0)
    return { sentence: "Your payment is on its way to the studio." };
  return { sentence: null };
}

/**
 * Read off the page's own "Waiting on you" projection (threshold.tsx
 * `waitingAsk`), never off which gates are drawn: a door kept as the receipt
 * of her signature, or an approval waiting on the studio, asks nothing.
 */
export interface ApprovalsRowInput {
  /** Approvals still owed her answer. */
  asks: ReadonlyArray<{ artifactTitle?: string | null }>;
  /** Finished work to review, or a document still unsigned, in a room band. */
  gate: "door" | "wall" | null;
  /** Any other ask owed her: a review request, an edition, a scope change. */
  waiting?: { label: string } | null;
  /** Any read an ask is drawn from failed. */
  readFailed: boolean;
}

const GATE_WORDS: Record<"door" | "wall", string> = {
  door: "A document is waiting for your signature.",
  wall: "Finished work is waiting for your review.",
};

function oneAskWords(ask: { artifactTitle?: string | null }): string {
  const title = ask.artifactTitle?.trim();
  return title
    ? `Waiting for your approval: ${title}.`
    : "One approval is waiting for you.";
}

function askWords(asks: ApprovalsRowInput["asks"]): string | null {
  if (asks.length === 1) return oneAskWords(asks[0]);
  if (asks.length > 1)
    return `${capitalise(countInWords(asks.length))} approvals are waiting for you.`;
  return null;
}

function approvalSentence(sentence: string | null): string | null {
  return sentence === null || isStandingSentence(sentence)
    ? sentence
    : "A request is waiting for you.";
}

/** Row 2, approvals: what waits on her name, in words. */
export function approvalsRow({
  asks,
  gate,
  waiting,
  readFailed,
}: ApprovalsRowInput): StandingRowsProps["approvals"] {
  if (readFailed)
    return { sentence: "The approvals could not be read just now." };
  if (gate) return { sentence: GATE_WORDS[gate] };
  const other = waiting ? `Waiting for you: ${waiting.label}.` : null;
  return { sentence: approvalSentence(askWords(asks) ?? other) };
}

type OutstandingTotals = NonNullable<InvoiceProjection["outstandingTotals"]>;

/** What is open, counted in words, with one currency's total. */
function openWords(totals: OutstandingTotals): string | null {
  const count = totals.reduce((n, t) => n + t.invoiceCount, 0);
  if (count === 0) return null;
  const noun =
    count === 1
      ? "One invoice is open"
      : `${capitalise(countInWords(count))} invoices are open`;
  if (totals.length !== 1) return `${noun}.`;
  return `${noun}, ${money(totals[0].cents, totals[0].currency)} in all.`;
}

/** Row 3, the ledger: what is open, in one currency's words. */
export function ledgerRow(
  invoices: InvoiceProjection | null,
): StandingRowsProps["ledger"] {
  if (!invoices) return { sentence: null };
  const totals = invoices.withheld ? null : invoices.outstandingTotals;
  if (!totals)
    return {
      sentence: invoices.allClear ? null : "Your invoices are being checked.",
    };
  return { sentence: openWords(totals) };
}

// ── the arrival: hero or drawn cover, then the standing rows ─────────────────

/**
 * Full bleed out of the page's measure. Once hydrated the width is read from
 * the root's client width (100vw counts a classic scrollbar and overflows);
 * the server paint uses 100vw, exact at the phone, so the hero never jumps.
 * The width is set in a layout effect so the paper tab's own measure (a
 * child's effect) already sees the bled width. At the phone the 16px gutter is
 * put back so `.ed-hero`'s own −16px lands on the edge. Every layout bleeds at
 * the phone; at 601 and up only `bleed` leaves the measure (editorial.css sets
 * the measure and portrait plates inside it).
 */
const BLEED: Readonly<Record<HeroDesktopLayout, string>> = {
  bleed: "[margin-inline:calc(50%-var(--hi-page-w,100vw)/2)] max-[600px]:px-4",
  measure:
    "max-[600px]:[margin-inline:calc(50%-var(--hi-page-w,100vw)/2)] max-[600px]:px-4",
  portrait:
    "max-[600px]:[margin-inline:calc(50%-var(--hi-page-w,100vw)/2)] max-[600px]:px-4",
};

/**
 * Past this many characters a hero headline takes the smaller display step
 * (editorial.css, `[data-headline='long']`): an edition may write up to 60,
 * and the standing rows keep their fold whatever it writes (R-v2-2). At the
 * phone the frame also shortens, but only when its subject still fits.
 */
export const LONG_HEADLINE = 24;

function Bleed({
  layout,
  headline,
  shortFrame,
  children,
}: {
  layout: HeroDesktopLayout;
  headline: string;
  /** The phone frame gives up its extra lines (39:30): the subject fits it. */
  shortFrame: boolean;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
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
    <div
      ref={ref}
      data-testid="house-issue-hero"
      data-headline={headline.length > LONG_HEADLINE ? "long" : undefined}
      data-hero-frame={shortFrame ? "short" : undefined}
      className={BLEED[layout]}
    >
      {children}
    </div>
  );
}

interface HouseIssueArrivalProps {
  issue: HouseIssue;
  chapters: ReadonlyMap<string, EditionChapter>;
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
  // A long headline shortens the phone frame only where the subject box still
  // fits it whole; otherwise the hero keeps its taller frame.
  const phonePosition =
    chapter.headline.length > LONG_HEADLINE ? shortFramePosition(hero) : null;
  return (
    <Bleed
      layout={heroPicture(hero).layout}
      headline={chapter.headline}
      shortFrame={phonePosition !== null}
    >
      <HeroPlate
        phoneObjectPosition={phonePosition}
        scopeId={issue.scopeId}
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
  chapters: ReadonlyMap<string, EditionChapter> | null;
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
  "-mt-10 pt-2 min-[601px]:pt-4",
  "min-[601px]:grid min-[601px]:grid-cols-[auto_minmax(0,1fr)] min-[601px]:gap-x-8",
].join(" ");
const AT_DESK = {
  letterhead:
    "pb-1 min-[601px]:col-start-1 min-[601px]:row-start-1 min-[601px]:row-span-2 min-[601px]:pb-0",
  purpose:
    "m-0 max-w-[56ch] text-[16px] leading-[22px] text-[var(--text-primary)] min-[601px]:col-start-2 min-[601px]:row-start-1 min-[601px]:self-end",
  links:
    "min-[601px]:col-start-2 min-[601px]:row-start-2 min-[601px]:[&>nav]:!mt-0",
  rule: "hidden min-[601px]:col-span-2 min-[601px]:row-start-3 min-[601px]:mt-2 min-[601px]:block min-[601px]:h-px min-[601px]:bg-[var(--border-default)]",
  cover: "min-[601px]:col-span-2 min-[601px]:row-start-4 min-[601px]:mt-2",
  rows: "[&>ul]:mt-0 min-[601px]:col-span-2 min-[601px]:row-start-5",
  standing:
    "mt-3 max-w-[56ch] text-[16px] leading-[24px] text-[var(--text-body)] min-[601px]:col-span-2 min-[601px]:row-start-6",
} as const;

/**
 * The approved cover's standing sentence, hero or drawn cover alike. It reads
 * after the three operational rows, never between the cover and them: up to
 * 160 characters above the rows would push them past their fold (R-v2-2).
 */
function CoverStanding({ chapter }: { chapter: EditionChapter | undefined }) {
  if (!chapter?.standing) return null;
  return (
    <p data-testid="cover-standing" className={AT_DESK.standing}>
      {chapter.standing}
    </p>
  );
}

function EditionHead(props: HouseIssueHeadProps & { issue: HouseIssue }) {
  const chapters = props.chapters ?? new Map<string, EditionChapter>();
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
      <div aria-hidden="true" className={AT_DESK.rule} />
      <div className={AT_DESK.cover}>
        <Cover {...arrival} />
      </div>
      <div className={AT_DESK.rows}>
        <Rows rows={arrival.rows} />
      </div>
      <CoverStanding chapter={chapters.get("cover")} />
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
 * A chapter's head, and under it the edition's standing sentence when it has
 * one: one revealed child either way.
 */
function ChapterOpening({ chapter }: { chapter: EditionChapter }) {
  const head = (
    <ChapterHead
      number={chapter.number}
      label={chapter.label}
      headline={chapter.headline}
    />
  );
  if (!chapter.standing) return head;
  return (
    <div>
      {head}
      <p
        data-testid="chapter-standing"
        className="mt-2 max-w-[56ch] text-[16px] leading-[24px] text-[var(--text-body)]"
      >
        {chapter.standing}
      </p>
    </div>
  );
}

function ChapterHeldPlate({ chapter }: { chapter: EditionChapter | undefined }) {
  if (!chapter?.heldPlate) return null;
  return (
    <Reveal>
      <HeldPlate
        scopeId={chapter.heldPlate.scopeId}
        asset={chapter.heldPlate.asset}
        alt={plateAlt(chapter.heldPlate.asset)}
        paletteHex={chapter.heldPlate.asset.dominantHex}
        fallback={{ name: chapter.headline }}
      />
    </Reveal>
  );
}

/** GroundFloor has no key chapter; its approved house plate follows approvals. */
export function HouseHeldPlate({ issue }: { issue: HouseIssue | null }) {
  return <ChapterHeldPlate chapter={editionChapters(issue, ["key"])?.get("key")} />;
}

/**
 * The chapter head over a section. Returns the section untouched when the
 * edition is off (`chapters` null) or the section did not render, so the
 * flag-off page is the same tree it always was.
 */
export function withChapter(
  chapters: ReadonlyMap<string, EditionChapter> | null,
  anchor: string,
  node: ReactNode,
): ReactNode {
  const chapter = chapters?.get(anchor);
  if (!chapter || node === null || node === undefined || node === false)
    return node;
  return (
    <>
      <Reveal className="mt-12">
        <ChapterOpening chapter={chapter} />
      </Reveal>
      <ChapterHeldPlate chapter={chapter} />
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
  const scopeId = issue.scopeId;
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
            scopeId={issue.scopeId}
            showMakers={issue.editorial.project.showMakers}
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
 * A RoomBand with its opening above it under the edition; the band itself,
 * untouched, with the edition off. The plates stand above the band, never
 * inside it: the band is a dimmable unit and a plate never dims.
 */
export function withRoomOpening(
  issue: HouseIssue | null,
  chapters: ReadonlyMap<string, EditionChapter> | null,
  roomId: string,
  band: ReactNode,
): ReactNode {
  if (!issue || !chapters) return band;
  return (
    <Fragment key={roomId}>
      <RoomOpening issue={issue} chapters={chapters} roomId={roomId} />
      {band}
    </Fragment>
  );
}

function roomParts(
  issue: HouseIssue,
  chapters: ReadonlyMap<string, EditionChapter>,
  roomId: string,
) {
  const room = issue.editorial.rooms.find((r) => r.id === roomId);
  if (!room) return null;
  const chapter = chapters.get(room.anchor);
  const choice = issue.rooms.get(roomId);
  if (!chapter || !choice) return null;
  return { room, chapter, choice };
}

/**
 * A room's opening, standing just above its RoomBand: the chapter head, the
 * room plate (or the one held plate), and the room's pieces. Three children,
 * so the reveal moves all of it.
 */
export function RoomOpening({
  issue,
  chapters,
  roomId,
}: {
  issue: HouseIssue;
  chapters: ReadonlyMap<string, EditionChapter>;
  roomId: string;
}) {
  const parts = roomParts(issue, chapters, roomId);
  if (!parts) return null;
  const { room, chapter, choice } = parts;
  const swatches = issue.swatchRoomId === roomId ? issue.editorial.palette : [];
  return (
    <Reveal className="mt-12">
      <ChapterOpening chapter={chapter} />
      <ChapterPlate issue={issue} choice={choice} room={room} />
      <div>
        {swatches.length > 0 ? <SwatchStrip swatches={swatches} /> : null}
        <Pieces issue={issue} choice={choice} />
      </div>
    </Reveal>
  );
}
