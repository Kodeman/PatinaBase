/**
 * The ladder — one segment per stop this spread actually puts on the paper,
 * and the doors filed beneath them (C-3, OD-2/OD-8/OD-14).
 *
 * Two rules govern every string here.
 *
 * The value is the rail's register of a fact the paper already carries: ≤30
 * characters of mono, read off the SAME counts `deriveTicket` states in
 * sentences. `ticket-derivation.ts` is byte-untouched (OD-8), so the counts are
 * re-read from its own input rather than from its rows — one source, two
 * registers, and no second query.
 *
 * The extent is a COUNT — lines, rooms, rungs, records — never a measured
 * height. The ladder draws order and reach above a floor and lets the value
 * line carry scale; a `ResizeObserver` over the region roots would be measuring
 * the 112px reserve L-4 has just put there, which is the instrument erasing its
 * own subject.
 */

import {
  LADDER_SEGMENT_MIN_PX,
  LENS_COUNT_MAX_CHARS,
  LENS_VALUE_MAX_CHARS,
} from './lens-constants';
import {
  DOCUMENT_INDEX_LABELS,
  paperRegionFor,
  paperRegionsForSection,
  type DocumentIndexKey,
} from './document-index';
import { money } from './project-commerce';
import type { TicketInput } from './ticket-derivation';

export type LadderTier = 'full' | 'narrow';

export interface LadderRoomRung {
  id: string;
  name: string;
  held: boolean;
}

export type LadderFallback = 'NOTHING YET' | 'NOT KNOWN YET';

export interface LadderSegment {
  key: DocumentIndexKey;
  /** 13px register — `DOCUMENT_INDEX_LABELS`, so the rail and the paper's own
   *  head can never name a stop two ways. */
  name: string;
  /** ≤30 chars at the 168px measure (≥1440). Null when the stop carries no
   *  number, and then `fallback` is the sentence beneath the name. */
  value: string | null;
  /** ≤30 chars at the 112px measure (1180–1439) — the same string except where
   *  OD-14 splices `· N ROOMS` in and drops the date to stay inside the cap. */
  narrowValue: string | null;
  /** The paper's own count line, sentence case — OD-7's announcement reads it. */
  countLine: string;
  fallback: LadderFallback | null;
  /** A count, never a rect. */
  extent: number;
  /** Whether the stop's root is on the paper; a stop with none is not a press
   *  target. */
  mounted: boolean;
  /** `max(36, lines × 15.4 + 8)` at the 168px measure (OD-14). */
  floorPx: number;
  /** The same formula at the 112px measure, where the value wraps further. */
  narrowFloorPx: number;
  rooms?: LadderRoomRung[];
}

export type LadderDoorKey =
  | 'planroom'
  | 'specbook'
  | 'moodboards'
  | 'callsheet'
  | 'clientcopy'
  | 'release-room';

export interface LadderDoor {
  key: LadderDoorKey;
  label: string;
  /** The page this door has of its own below 1440 (`shelfRouteFor`). Null where
   *  the door opens in place — the call sheet's overlay, the room's release. */
  href: string | null;
  onOpen: () => void;
}

/** What the approvals region counts. `deriveTicket` states no approvals row, so
 *  these are the region's own figures, passed in rather than re-queried. */
export interface LadderApprovalsFacts {
  settled: boolean;
  awaiting: number;
  overdue: number;
  /** Days the OLDEST overdue approval has been standing. */
  overdueDays: number | null;
  /** Every approval record on the paper — the segment's extent. */
  records: number;
}

export interface LadderCareFacts {
  settled: boolean;
  closed: number;
  total: number;
}

export interface LadderRecordFacts {
  settled: boolean;
  complete: number;
}

/**
 * The pre-work stops' own figures (Wave 5, OD-2). `deriveTicket` states none of
 * them — a proposal's lifecycle, its scope and its total are the paper's, not
 * the job's — so they are passed in, from reads `page.tsx` already makes.
 *
 * `brief`, `discovery`, `direction` and `vision` carry NO number and take no
 * fact here: prose has nothing to count, so those four rows print their name
 * over `NOTHING YET` at every state (OD-2, DL-02).
 */
export interface LadderPreworkFacts {
  settled: boolean;
  /** The day the proposal went to the client. */
  sentOn: string | null;
  /** The day the client first opened it, where they have. */
  openedOn: string | null;
  /** Rooms in the proposal's scope — `Scope & engagement`'s extent. */
  scopeRooms: number;
  /** The proposal's own total, in cents (`proposals.total_amount`). */
  investmentCents: number | null;
}

export interface LadderInput {
  /** The same facts the ticket is derived from (OD-8). */
  ticket: TicketInput;
  approvals: LadderApprovalsFacts;
  care: LadderCareFacts;
  record: LadderRecordFacts;
  /** The carrier window on the damaged line — a date the ticket's own
   *  `TicketLine` does not carry, and the only fact the Pieces value adds. */
  damagedOn?: string | null;
  heldRoomId?: string | null;
  /** The pre-work spreads' figures. Absent on a Project spread, which prints
   *  none of those stops. */
  prework?: LadderPreworkFacts;
  /** Stops whose root is actually on the paper. Defaults to every stop this
   *  spread prints. */
  mountedKeys?: readonly DocumentIndexKey[];
}

const READING = 'READING…';

/** The value line's two measures: 168px inside the 200px rail's `px-4`, 112px
 *  inside the 136px rail's `px-3` (OD-14). One string, both tiers. */
const CHARS_PER_LINE: Record<LadderTier, number> = { full: 23, narrow: 15 };
const VALUE_LINE_PX = 15.4;
const VALUE_LEAD_PX = 8;

function floorFor(value: string | null, tier: LadderTier): number {
  const chars = value?.length ?? 0;
  const lines = Math.max(1, Math.ceil(chars / CHARS_PER_LINE[tier]));
  return Math.max(
    LADDER_SEGMENT_MIN_PX,
    Math.round(lines * VALUE_LINE_PX + VALUE_LEAD_PX),
  );
}

/** Bare DATE columns must parse as LOCAL midnight, or the printed day slips
 *  back one in a negative-offset timezone. */
const asLocalDate = (iso: string) =>
  new Date(/^\d{4}-\d{2}-\d{2}$/.test(iso) ? `${iso}T00:00:00` : iso);

const DAY_MS = 86_400_000;

function calendarDaysUntil(iso: string, now: Date): number | null {
  const then = asLocalDate(iso);
  if (Number.isNaN(then.getTime())) return null;
  const midnight = (d: Date) =>
    new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  return Math.round((midnight(then) - midnight(now)) / DAY_MS);
}

/** `SEP 15` — the rail's register of a day. */
function railDate(iso: string): string | null {
  const day = asLocalDate(iso);
  if (Number.isNaN(day.getTime())) return null;
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' })
    .format(day)
    .toUpperCase();
}

/** `Aug 19` — the count line's register of a day the paper states without a
 *  weekday. A send has no weekday in the print contract; an install does. */
function plainDate(iso: string): string | null {
  const day = asLocalDate(iso);
  if (Number.isNaN(day.getTime())) return null;
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
  }).format(day);
}

/** `Tue Sep 15` — the count line's register of the same day. */
function countDate(iso: string): string | null {
  const day = asLocalDate(iso);
  if (Number.isNaN(day.getTime())) return null;
  return new Intl.DateTimeFormat('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  }).format(day);
}

const cap = (value: string, max: number) =>
  value.length <= max ? value : value.slice(0, max).trimEnd();

interface PieceCounts {
  total: number;
  damaged: number;
  rooms: number;
}

/** The Pieces row's own rule: a damaged line is counted under the word that
 *  matters most, whatever else is true of it (`countPieces`). */
function countPieces(input: TicketInput): PieceCounts {
  let damaged = 0;
  for (const line of input.pieces.lines) {
    if (line.stamp === 'damaged') damaged += 1;
  }
  return {
    total: input.pieces.lines.length,
    damaged,
    rooms: input.rooms.list.length,
  };
}

interface Register {
  value: string | null;
  narrowValue: string | null;
  countLine: string;
  fallback: LadderFallback | null;
  extent: number;
}

const empty = (
  countLine: string,
  fallback: LadderFallback = 'NOTHING YET',
): Register => ({
  value: null,
  narrowValue: null,
  countLine,
  fallback,
  extent: 0,
});

const reading = (): Register => ({
  value: READING,
  narrowValue: READING,
  countLine: 'Reading…',
  fallback: null,
  extent: 0,
});

function approvalsRegister(facts: LadderApprovalsFacts): Register {
  if (!facts.settled) return reading();
  if (facts.awaiting === 0 && facts.overdue === 0) {
    return { ...empty('Nothing awaiting the client'), extent: facts.records };
  }
  const parts: string[] = [];
  const words: string[] = [];
  if (facts.awaiting > 0) {
    parts.push(`${facts.awaiting} AWAITING`);
    words.push(`${facts.awaiting} awaiting the client`);
  }
  if (facts.overdue > 0) {
    const days = facts.overdueDays;
    parts.push(
      days != null && days > 0
        ? `${facts.overdue} OVERDUE ${days}D`
        : `${facts.overdue} OVERDUE`,
    );
    words.push(
      days != null && days > 0
        ? `${facts.overdue} overdue ${days}d`
        : `${facts.overdue} overdue`,
    );
  }
  const value = cap(parts.join(' · '), LENS_VALUE_MAX_CHARS);
  return {
    value,
    narrowValue: value,
    countLine: cap(words.join(' · '), LENS_COUNT_MAX_CHARS),
    fallback: null,
    extent: facts.records,
  };
}

function scheduleRegister(input: TicketInput): Register {
  if (!input.dates.settled) return reading();
  const schedule = input.dates.schedule;
  const install = schedule?.install ?? null;
  // R107/R108 — only the committed and record registers carry a day the rail
  // may state. A band or a frame is a position, not a date.
  const stateable =
    install?.date != null &&
    (install.fidelity === 'committed' || install.fidelity === 'record');
  if (!stateable || install?.date == null) {
    if (schedule?.positionText) {
      const value = cap(
        schedule.positionText.toUpperCase(),
        LENS_VALUE_MAX_CHARS,
      );
      return {
        value,
        narrowValue: value,
        countLine: cap(schedule.positionText, LENS_COUNT_MAX_CHARS),
        fallback: null,
        extent: 1,
      };
    }
    return empty('Not known yet', 'NOT KNOWN YET');
  }
  const days = calendarDaysUntil(install.date, input.now ?? new Date());
  const rail = railDate(install.date);
  const long = countDate(install.date);
  if (days === null || rail === null || long === null) {
    return empty('Not known yet', 'NOT KNOWN YET');
  }
  let tail: string;
  let words: string;
  if (days < 0) {
    tail = '';
    words = '';
  } else if (days === 0) {
    tail = ' · TODAY';
    words = ' · today';
  } else if (days === 1) {
    tail = ' · TOMORROW';
    words = ' · tomorrow';
  } else if (days < 14) {
    tail = ` · ${days} DAYS`;
    words = ` · ${days} days out`;
  } else {
    const weeks = Math.round(days / 7);
    tail = ` · ${weeks} ${weeks === 1 ? 'WEEK' : 'WEEKS'}`;
    words = ` · ${weeks} ${weeks === 1 ? 'week' : 'weeks'} out`;
  }
  const lead = days < 0 ? 'INSTALLED' : 'INSTALL';
  const value = cap(`${lead} ${rail}${tail}`, LENS_VALUE_MAX_CHARS);
  return {
    value,
    narrowValue: value,
    countLine: cap(
      `${days < 0 ? 'Installed' : 'Install'} ${long}${words}`,
      LENS_COUNT_MAX_CHARS,
    ),
    fallback: null,
    extent: 1,
  };
}

function piecesRegister(input: LadderInput): Register {
  const ticket = input.ticket;
  if (!ticket.pieces.settled) return reading();
  const counts = countPieces(ticket);
  if (counts.total === 0) return empty('Nothing yet');

  const lines = `${counts.total} LINES`;
  const rooms = counts.rooms > 0 ? `${counts.rooms} ROOMS` : null;
  const damageDate = input.damagedOn ? railDate(input.damagedOn) : null;
  const damaged =
    counts.damaged > 0
      ? `${counts.damaged} DAMAGED${damageDate ? ` ${damageDate}` : ''}`
      : null;

  // OD-14: the narrow measure splices the room count in and drops the damage
  // date first to stay inside the cap — the date prints on the paper's own
  // count line, and on the band's line 2 when it is the worst thing standing.
  const full = [lines, damaged].filter(Boolean).join(' · ');
  const narrowFull = [lines, rooms, damaged].filter(Boolean).join(' · ');
  const narrow =
    narrowFull.length <= LENS_VALUE_MAX_CHARS
      ? narrowFull
      : [lines, rooms, counts.damaged > 0 ? `${counts.damaged} DAMAGED` : null]
          .filter(Boolean)
          .join(' · ');

  const words = [
    `${counts.total} ${counts.total === 1 ? 'line' : 'lines'}`,
    counts.rooms > 0
      ? `${counts.rooms} ${counts.rooms === 1 ? 'room' : 'rooms'}`
      : null,
    counts.damaged > 0 ? `${counts.damaged} damaged` : null,
  ]
    .filter(Boolean)
    .join(' · ');

  return {
    value: cap(full, LENS_VALUE_MAX_CHARS),
    narrowValue: cap(narrow, LENS_VALUE_MAX_CHARS),
    countLine: cap(words, LENS_COUNT_MAX_CHARS),
    fallback: null,
    extent: counts.total + counts.rooms,
  };
}

function moneyRegister(input: TicketInput): Register {
  const { settled, failed, ladder } = input.money;
  if (failed) return empty('Money could not be read', 'NOT KNOWN YET');
  if (!settled) return reading();
  const out = ladder.owed.cents ?? 0;
  const undrawn = ladder.notDrawn.cents ?? 0;
  const rungs = Object.values(ladder).filter(
    (rung) => rung.cents != null && rung.cents > 0,
  ).length;
  if (out <= 0 && undrawn <= 0) {
    return { ...empty('Nothing moving yet'), extent: rungs };
  }
  const parts: string[] = [];
  const words: string[] = [];
  if (out > 0) {
    parts.push(`${money(out)} OUT`);
    words.push(`${money(out)} out`);
  }
  if (undrawn > 0) {
    parts.push(`${money(undrawn)} UNDRAWN`);
    words.push(`${money(undrawn)} not drawn`);
  }
  const value = cap(parts.join(' · '), LENS_VALUE_MAX_CHARS);
  return {
    value,
    narrowValue: value,
    countLine: cap(words.join(' · '), LENS_COUNT_MAX_CHARS),
    fallback: null,
    extent: rungs,
  };
}

function careRegister(facts: LadderCareFacts): Register {
  if (!facts.settled) return reading();
  if (facts.total === 0) return empty('Nothing yet');
  const value = cap(
    `${facts.closed} OF ${facts.total} CLOSED OUT`,
    LENS_VALUE_MAX_CHARS,
  );
  return {
    value,
    narrowValue: value,
    countLine: cap(
      `${facts.closed} of ${facts.total} closed out`,
      LENS_COUNT_MAX_CHARS,
    ),
    fallback: null,
    extent: facts.total,
  };
}

function recordRegister(facts: LadderRecordFacts): Register {
  if (!facts.settled) return reading();
  if (facts.complete === 0) return empty('Nothing yet');
  const value = cap(`${facts.complete} COMPLETE`, LENS_VALUE_MAX_CHARS);
  return {
    value,
    narrowValue: value,
    countLine: cap(`${facts.complete} complete`, LENS_COUNT_MAX_CHARS),
    fallback: null,
    extent: facts.complete,
  };
}

/** `SENT AUG 19 · UNOPENED 6D` — the proposal's own lifecycle, the one dated
 *  fact a pre-work spread carries (OD-2). */
function proposalRegister(facts: LadderPreworkFacts | undefined, now: Date): Register {
  if (!facts) return empty('Nothing yet');
  if (!facts.settled) return reading();
  if (!facts.sentOn) return empty('Not sent yet');
  const rail = railDate(facts.sentOn);
  const long = plainDate(facts.sentOn);
  if (rail === null || long === null) return empty('Nothing yet');
  if (facts.openedOn) {
    return {
      value: cap(`SENT ${rail} · OPENED`, LENS_VALUE_MAX_CHARS),
      narrowValue: cap(`SENT ${rail} · OPENED`, LENS_VALUE_MAX_CHARS),
      countLine: cap(`Sent ${long} · opened`, LENS_COUNT_MAX_CHARS),
      fallback: null,
      extent: 1,
    };
  }
  const days = calendarDaysUntil(facts.sentOn, now);
  // Days SINCE, so the sign flips: the send is behind her.
  const since = days === null ? null : -days;
  const tail = since != null && since > 0 ? ` · UNOPENED ${since}D` : '';
  const words = since != null && since > 0 ? ` · unopened ${since}d` : ' · not opened';
  return {
    value: cap(`SENT ${rail}${tail}`, LENS_VALUE_MAX_CHARS),
    narrowValue: cap(`SENT ${rail}${tail}`, LENS_VALUE_MAX_CHARS),
    countLine: cap(`Sent ${long}${words}`, LENS_COUNT_MAX_CHARS),
    fallback: null,
    extent: 1,
  };
}

function scopeRegister(facts: LadderPreworkFacts | undefined): Register {
  if (!facts) return empty('Nothing yet');
  if (!facts.settled) return reading();
  if (facts.scopeRooms <= 0) return empty('Nothing yet');
  const word = facts.scopeRooms === 1 ? 'ROOM' : 'ROOMS';
  // W5-C6/F3 — W5-R2 §2 rules the rail's own value as `4 ROOMS IN SCOPE` and
  // counts it (16 chars ≤ 30). Dropping `IN SCOPE` left the rail and the paper
  // stating one stop two ways, which is the thing one derivation exists to
  // prevent.
  return {
    value: cap(`${facts.scopeRooms} ${word} IN SCOPE`, LENS_VALUE_MAX_CHARS),
    narrowValue: cap(
      `${facts.scopeRooms} ${word} IN SCOPE`,
      LENS_VALUE_MAX_CHARS,
    ),
    countLine: cap(
      `${facts.scopeRooms} ${word.toLowerCase()} in scope`,
      LENS_COUNT_MAX_CHARS,
    ),
    fallback: null,
    extent: facts.scopeRooms,
  };
}

function investmentRegister(facts: LadderPreworkFacts | undefined): Register {
  if (!facts) return empty('Nothing yet');
  if (!facts.settled) return reading();
  const cents = facts.investmentCents ?? 0;
  if (cents <= 0) return empty('Nothing yet');
  const figure = money(cents);
  return {
    value: cap(figure, LENS_VALUE_MAX_CHARS),
    narrowValue: cap(figure, LENS_VALUE_MAX_CHARS),
    countLine: cap(figure, LENS_COUNT_MAX_CHARS),
    fallback: null,
    extent: 1,
  };
}

function registerFor(key: DocumentIndexKey, input: LadderInput): Register {
  switch (key) {
    case 'approvals':
      return approvalsRegister(input.approvals);
    case 'schedule':
      return scheduleRegister(input.ticket);
    case 'ffe':
      return piecesRegister(input);
    case 'money':
      return moneyRegister(input.ticket);
    case 'care':
      return careRegister(input.care);
    case 'record':
      return recordRegister(input.record);
    case 'proposal':
      return proposalRegister(input.prework, input.ticket.now ?? new Date());
    case 'scope':
      return scopeRegister(input.prework);
    case 'investment':
      return investmentRegister(input.prework);
    // The three stage stops and the vision have no number to state — a brief,
    // a discovery, a direction and a vision are prose. They print their name
    // over `NOTHING YET` at every state (OD-2, DL-02).
    case 'brief':
    case 'discovery':
    case 'direction':
      return empty('Nothing yet');
    case 'vision':
      return empty('Not written yet');
  }
}

/**
 * One segment per region this spread mounts, in the spread's own mount order.
 * Wave 5 gave the four pre-work spreads their rows, so the empty track and its
 * one line are now reachable only where a section declares no region at all.
 */
export function deriveLadderSegments(input: LadderInput): LadderSegment[] {
  // The declared keys already ride the spread's own mount order (`page.tsx`
  // builds them from `paperRegionsForSection`), and a pre-work spread's order
  // is not `PROJECT_PAPER_ORDER`'s — so the list is resolved key by key rather
  // than filtered through the Project array.
  const declared =
    input.ticket.paperRegions != null
      ? input.ticket.paperRegions.map(paperRegionFor)
      : paperRegionsForSection(input.ticket.section);
  const mounted = input.mountedKeys
    ? new Set(input.mountedKeys)
    : new Set(declared.map((region) => region.key));

  return declared.map((region) => {
    const register = registerFor(region.key, input);
    const segment: LadderSegment = {
      key: region.key,
      name: DOCUMENT_INDEX_LABELS[region.key],
      value: register.value,
      narrowValue: register.narrowValue,
      countLine: register.countLine,
      fallback: register.fallback,
      extent: register.extent,
      mounted: mounted.has(region.key),
      floorPx: floorFor(register.value, 'full'),
      narrowFloorPx: floorFor(register.narrowValue, 'narrow'),
    };
    if (region.key === 'ffe') {
      segment.rooms = input.ticket.rooms.list.map((room) => ({
        id: room.id,
        name: room.name,
        held: room.id === (input.heldRoomId ?? null),
      }));
    }
    return segment;
  });
}

export interface LadderDoorsInput {
  ticket: TicketInput;
  /** A room is in hand, so the release gets its second home under the doors. */
  held: boolean;
  /**
   * The `call-sheet` flag. The sections sheet gates its own Call sheet row on
   * it (`mobile-sheets.tsx`), and with the flag off nothing mounts the overlay
   * the door dispatches into — so the rail must gate the same door the same
   * way, or the reader at 1180+ presses a door onto nothing. Defaults to
   * printing it: a caller that does not know about the flag is not asserting
   * the flag is off.
   */
  callSheetEnabled?: boolean;
  /** `shelfRouteFor(key, projectId)` — the page a leaf has of its own below
   *  1440. Absent for a door that opens in place. */
  routes?: Partial<Record<LadderDoorKey, string | null>>;
  onOpenLeaf?: (
    key: 'planroom' | 'specbook' | 'moodboards' | 'clientcopy',
  ) => void;
  onOpenCallSheet?: () => void;
  onReleaseRoom?: () => void;
}

const noop = () => {};

const PROJECT_DOORS: readonly {
  key: 'planroom' | 'specbook' | 'moodboards';
  label: string;
}[] = [
  { key: 'planroom', label: 'Plan room' },
  { key: 'specbook', label: 'Spec book' },
  // F62 / D-B8 — one name for one thing. The shelf registry, the leaf, the
  // page and ⌘K all read `Boards`; the key stays `moodboards` (it is an
  // address, `shelves.ts`).
  { key: 'moodboards', label: 'Boards' },
];

/**
 * Doors are PER SPREAD (OD-8/DL-04). The four project doors are project-keyed
 * and open nothing off a project, so a proposal with no project behind it
 * prints none of them; `The client's copy` prints only where `deriveTicket`
 * returns its ninth row. Five print only where a proposal document also has a
 * project.
 */
export function deriveLadderDoors(input: LadderDoorsInput): LadderDoor[] {
  const doors: LadderDoor[] = [];
  const href = (key: LadderDoorKey) => input.routes?.[key] ?? null;

  if (input.ticket.project) {
    for (const door of PROJECT_DOORS) {
      doors.push({
        key: door.key,
        label: door.label,
        href: href(door.key),
        onOpen: () => input.onOpenLeaf?.(door.key),
      });
    }
    if (input.callSheetEnabled ?? true) {
      doors.push({
        key: 'callsheet',
        label: 'Call sheet',
        href: href('callsheet'),
        onOpen: input.onOpenCallSheet ?? noop,
      });
    }
  }

  if (input.held) {
    doors.push({
      key: 'release-room',
      label: 'Put down the room',
      href: null,
      onOpen: input.onReleaseRoom ?? noop,
    });
  }

  if (input.ticket.clientCopy) {
    doors.push({
      key: 'clientcopy',
      label: 'The client’s copy',
      href: href('clientcopy'),
      onOpen: () => input.onOpenLeaf?.('clientcopy'),
    });
  }

  return doors;
}
