/**
 * The job ticket — the document's map, derived once.
 *
 * Eight rows, always eight, always in this order: Rooms · Pieces · Drawings ·
 * Spec · Boards · Money · Dates · People. A row that has nothing to report
 * still prints, and says so in the product's own words — a row that vanishes
 * at zero is a row a reader cannot tell is empty from one that failed to load.
 *
 * Nothing here reads the network or the viewport: every figure arrives as a
 * fact the caller has already settled, and each fact group carries whether its
 * source has answered, so `Reading…` and an honest empty never wear one face.
 *
 * The seam is the same eight rows read twice: line one is identity, line two
 * is the worst two exceptions in the tie-break order direction-b §3.2 states
 * once — money at risk today, then a dated promise past its date, then a piece
 * that cannot move, then everything else.
 */

import type { SectionKey } from './desk-derivation';
import { paperRegionsForSection, type DocumentIndexKey } from './document-index';
import type { MoneyLadder } from './money-ladder';
import { money } from './project-commerce';
import type { SectionScheduleFacts } from './section-derivation';
import type { ShelfLeafKey } from './shelves';
import type { LineStampKind } from './stamp-derivation';

export type TicketRowKey =
  | 'rooms'
  | 'pieces'
  | 'drawings'
  | 'spec'
  | 'boards'
  | 'money'
  | 'dates'
  | 'people';

/** A room as the Rooms row expands to it: the name, and how much of the
 *  schedule belongs to it. Taking one in hand LIFTS it; nothing hides. */
export interface TicketRoomChip {
  id: string;
  name: string;
  lineCount: number;
}

/**
 * Where a row goes.
 *
 * `leaf` is one door read two ways by width — the 320px leaf beside the spine
 * at ≥1440, the leaf's own page below it — so the derivation names the shelf
 * and the component resolves the width.
 *
 * `none` is the row that states a fact this spread has nowhere to open: the
 * install and care spreads print neither the Money region nor the Schedule
 * (`paperRegionsForSection`), so those two rows print their figure and no `→`.
 * A button that fires an unfold nobody hears is a worse answer than a row that
 * plainly does not open.
 */
export type TicketDoor =
  | { kind: 'leaf'; shelf: ShelfLeafKey }
  | { kind: 'none' }
  | { kind: 'route'; href: string }
  | { kind: 'unfold-region'; region: DocumentIndexKey }
  | { kind: 'overlay'; overlay: 'call-sheet'; available: boolean }
  | { kind: 'expand'; rooms: readonly TicketRoomChip[] };

/**
 * direction-b §3.2's three standing ranks, in order. Its fourth — "work that
 * can wait, everything else, in ticket order" — is not an exception and has no
 * producer here: it IS the row order, which `deriveTicketSeam` falls back to
 * when rank and standing day tie.
 */
export type TicketExceptionRank =
  | 'money-at-risk'
  | 'promise-past-due'
  | 'piece-stuck';

export interface TicketException {
  rank: TicketExceptionRank;
  /** The seam's own words — `1 damaged`, `$17,500 owed you`. */
  phrase: string;
  /** The day this started standing. Ties inside a rank go to the older. */
  standingSince: string | null;
}

export interface TicketRow {
  key: TicketRowKey;
  /** DM Mono, uppercased by CSS — one word each. */
  label: string;
  /** Inter — the row's own state sentence. */
  value: string;
  /** The clause inside `value` that carries what is wrong, verbatim, so the row
   *  leads with it in weight where M2 keeps the census in ledger order
   *  (`direction-b.css` `.b-tk-value .b-x`). Null where nothing is wrong. */
  emphasis: string | null;
  door: TicketDoor;
  exception: TicketException | null;
}

export interface TicketSeam {
  /** Line one — section, phase, fraction. Never elided. */
  identity: string;
  /** Line two — the worst two exceptions, or `Nothing overdue`. */
  exceptions: string;
}

export interface TicketRoomFact {
  id: string;
  name: string;
}

/** One schedule line, as the ticket counts it. */
export interface TicketLine {
  /** `deriveLineStamp(row).kind` — the same stamp the paper prints, so the
   *  ticket's summary and the region below it can never disagree. */
  stamp: LineStampKind;
  roomId: string | null;
  /** Whether the line carries its spec. The Spec row's numerator, and the
   *  Pieces row's `unspecified` count. */
  specified: boolean;
}

/** `Procurement & Orders · 4 of 6` — the phase, from the schedule's own data.
 *  Never the section word (direction-b §5: two vocabularies, two jobs). */
export interface TicketPhase {
  name: string;
  position: number;
  of: number;
}

export interface TicketInput {
  section: SectionKey;
  phase: TicketPhase | null;
  rooms: { settled: boolean; list: readonly TicketRoomFact[] };
  pieces: { settled: boolean; lines: readonly TicketLine[] };
  drawings: { settled: boolean; sheetCount: number };
  boards: { settled: boolean; count: number };
  money: {
    settled: boolean;
    failed: boolean;
    ladder: MoneyLadder;
    /** `invoiceDaysOverdue` on the leading open invoice — the ladder folds it
     *  into prose the row cannot read back. */
    owedDays: number | null;
    /** `selectUndrawnVendorPayments(...).kind` — `deposit`, `balance`,
     *  `milestone`; same reason. */
    undrawnKind: string | null;
    /** The leading open invoice's own `due_date` — the day this promise came
     *  due. Carried rather than reverse-engineered from `owedDays`, because the
     *  seam's tie-break weighs it against a real install date. */
    owedSince: string | null;
  };
  dates: { settled: boolean; schedule: SectionScheduleFacts | null };
  people: { settled: boolean; callSheetEnabled: boolean; rosterCount: number };
  /**
   * The regions this spread actually mounts (C11). Defaults to what the
   * section prints; the caller passes its own where a pinned Worktable table
   * puts a different spread on the paper than the section the ticket names.
   */
  paperRegions?: readonly DocumentIndexKey[];
  now?: Date;
}

const READING = 'Reading…';

/** A region row opens the region — but only where this spread prints it. */
function regionDoor(input: TicketInput, region: DocumentIndexKey): TicketDoor {
  const regions =
    input.paperRegions ??
    paperRegionsForSection(input.section).map((entry) => entry.key);
  return regions.includes(region)
    ? { kind: 'unfold-region', region }
    : { kind: 'none' };
}

const SECTION_LABEL: Record<SectionKey, string> = {
  brief: 'Brief',
  discovery: 'Discovery',
  direction: 'Direction',
  proposal: 'Proposal',
  project: 'Project',
  install: 'Install',
  care: 'Care',
};

const RANK_ORDER: Record<TicketExceptionRank, number> = {
  'money-at-risk': 0,
  'promise-past-due': 1,
  'piece-stuck': 2,
};

const NUMBER_WORDS = [
  'zero', 'one', 'two', 'three', 'four', 'five', 'six',
  'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen',
];

const spell = (n: number) => NUMBER_WORDS[n] ?? String(n);

const plural = (n: number, one: string, many: string) =>
  `${n} ${n === 1 ? one : many}`;

/**
 * How far out a day is, spelled — one register the whole way. The words run
 * out at thirteen, so the unit steps up before the numerals would: days to a
 * fortnight, then weeks to a quarter, then months to a year. Past a year the
 * date is the whole sentence; "sixteen months out" tells a reader nothing the
 * date has not already said.
 */
function distance(days: number): string {
  if (days < 14) return ` · ${spell(days)} days out`;
  const weeks = Math.round(days / 7);
  if (weeks <= 13) return ` · ${spell(weeks)} weeks out`;
  const months = Math.round(days / 30.44);
  return months <= 13 ? ` · ${spell(months)} months out` : '';
}

/** Bare DATE columns must parse as LOCAL midnight, or the rendered day slips
 *  back a day in negative-offset timezones. */
const asLocalDate = (iso: string) =>
  new Date(/^\d{4}-\d{2}-\d{2}$/.test(iso) ? `${iso}T00:00:00` : iso);

const DAY_MS = 86_400_000;

function calendarDaysUntil(iso: string, now: Date): number | null {
  const then = asLocalDate(iso);
  if (Number.isNaN(then.getTime())) return null;
  const thenMidnight = new Date(
    then.getFullYear(),
    then.getMonth(),
    then.getDate(),
  ).getTime();
  const nowMidnight = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
  ).getTime();
  return Math.round((thenMidnight - nowMidnight) / DAY_MS);
}

const fmtWeekdayDate = (iso: string) =>
  new Intl.DateTimeFormat('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  }).format(asLocalDate(iso));

interface PieceCounts {
  ordered: number;
  delivered: number;
  inTransit: number;
  damaged: number;
  awaiting: number;
  notOrdered: number;
  unspecified: number;
  total: number;
  specified: number;
}

function countPieces(lines: readonly TicketLine[]): PieceCounts {
  const counts: PieceCounts = {
    ordered: 0,
    delivered: 0,
    inTransit: 0,
    damaged: 0,
    awaiting: 0,
    notOrdered: 0,
    unspecified: 0,
    total: lines.length,
    specified: 0,
  };
  for (const line of lines) {
    // The Spec row's numerator counts every line that carries its spec,
    // whatever else is true of it.
    if (line.specified) counts.specified += 1;
    // What is WRONG with a line is read from its stamp, which
    // `deriveLineStamp` settles from an open damage claim or a pending
    // blocking decision — neither of which needs a product on the line. So the
    // exception buckets are taken first, and they take the line out of the
    // census: one line is counted once, under the word that matters most.
    if (line.stamp === 'damaged') {
      counts.damaged += 1;
      continue;
    }
    if (line.stamp === 'decision_due') {
      counts.awaiting += 1;
      continue;
    }
    if (!line.specified) {
      counts.unspecified += 1;
      continue;
    }
    switch (line.stamp) {
      case 'shipped':
        counts.inTransit += 1;
        break;
      case 'delivered':
      case 'received':
      case 'partial':
      case 'installed':
      case 'trade_substantially_complete':
      case 'trade_accepted':
        counts.delivered += 1;
        break;
      case 'ordered':
      case 'production':
      case 'trade_engaged':
      case 'trade_in_progress':
      case 'trade_pending':
        counts.ordered += 1;
        break;
      case 'specified':
      case 'quoted':
      case 'approved':
        counts.notOrdered += 1;
        break;
    }
  }
  return counts;
}

function roomsRow(input: TicketInput): TicketRow {
  const settled = input.rooms.settled && input.pieces.settled;
  const chips: TicketRoomChip[] = input.rooms.list.map((room) => ({
    id: room.id,
    name: room.name,
    lineCount: input.pieces.lines.filter((line) => line.roomId === room.id)
      .length,
  }));
  const value = !settled
    ? READING
    : input.rooms.list.length === 0
      ? 'No rooms yet'
      : `${plural(input.rooms.list.length, 'room', 'rooms')} · ${plural(
          input.pieces.lines.length,
          'line',
          'lines',
        )}`;
  return {
    key: 'rooms',
    label: 'Rooms',
    value,
    emphasis: null,
    door: { kind: 'expand', rooms: chips },
    exception: null,
  };
}

function piecesRow(input: TicketInput): TicketRow {
  const counts = countPieces(input.pieces.lines);
  const parts: string[] = [];
  if (counts.ordered > 0) parts.push(`${counts.ordered} ordered`);
  if (counts.delivered > 0) parts.push(`${counts.delivered} delivered`);
  if (counts.inTransit > 0) parts.push(`${counts.inTransit} in transit`);
  if (counts.damaged > 0) parts.push(`${counts.damaged} damaged`);
  if (counts.awaiting > 0) {
    parts.push(`${counts.awaiting} awaiting a decision`);
  }
  if (counts.notOrdered > 0) parts.push(`${counts.notOrdered} not ordered yet`);
  if (counts.unspecified > 0) parts.push(`${counts.unspecified} unspecified`);

  const value = !input.pieces.settled
    ? READING
    : counts.total === 0
      ? 'No pieces yet'
      : parts.join(' · ');

  // A damaged line is rank one, not rank three: what expires on it is a
  // carrier window, and direction-b §3.2 names a carrier window as the
  // money-at-risk example.
  const exception: TicketException | null = !input.pieces.settled
    ? null
    : counts.damaged > 0
      ? {
          rank: 'money-at-risk',
          phrase: `${counts.damaged} damaged`,
          standingSince: null,
        }
      : counts.awaiting > 0
        ? {
            rank: 'piece-stuck',
            phrase: `${counts.awaiting} awaiting a decision`,
            standingSince: null,
          }
        : null;

  return {
    key: 'pieces',
    label: 'Pieces',
    value,
    // M2 keeps the census in ledger order and gives the wrong clause the
    // weight (`.b-tk-value .b-x`); reordering the census would print a
    // different sentence from the drawn one.
    emphasis: exception?.phrase ?? null,
    door: regionDoor(input, 'ffe'),
    exception,
  };
}

function drawingsRow(input: TicketInput): TicketRow {
  const value = !input.drawings.settled
    ? READING
    : input.drawings.sheetCount === 0
      ? 'Nothing filed'
      : `${plural(input.drawings.sheetCount, 'sheet', 'sheets')} · the drawing set`;
  return {
    key: 'drawings',
    label: 'Drawings',
    value,
    emphasis: null,
    door: { kind: 'leaf', shelf: 'planroom' },
    exception: null,
  };
}

function specRow(input: TicketInput): TicketRow {
  const counts = countPieces(input.pieces.lines);
  const value = !input.pieces.settled
    ? READING
    : counts.total === 0
      ? 'Nothing specified yet'
      : counts.specified === counts.total
        ? `${counts.total} specified · by room`
        : `${counts.specified} of ${counts.total} specified · by room`;
  const exception: TicketException | null =
    input.pieces.settled && counts.unspecified > 0
      ? {
          rank: 'piece-stuck',
          phrase: `${counts.unspecified} unspecified`,
          standingSince: null,
        }
      : null;
  return {
    key: 'spec',
    label: 'Spec',
    value,
    emphasis: null,
    door: { kind: 'leaf', shelf: 'specbook' },
    exception,
  };
}

function boardsRow(input: TicketInput): TicketRow {
  const value = !input.boards.settled
    ? READING
    : input.boards.count === 0
      ? 'No boards yet · start one'
      : plural(input.boards.count, 'board', 'boards');
  return {
    key: 'boards',
    label: 'Boards',
    value,
    emphasis: null,
    door: { kind: 'leaf', shelf: 'moodboards' },
    exception: null,
  };
}

function moneyRow(input: TicketInput): TicketRow {
  const { failed, settled, ladder, owedDays, undrawnKind, owedSince } =
    input.money;
  const { authorized, owed, notDrawn } = ladder;

  const parts: string[] = [];
  let owedClause: string | null = null;
  if (authorized.cents != null && authorized.cents > 0) {
    parts.push(`${money(authorized.cents)} ${authorized.note}`);
  }
  if (owed.cents != null && owed.cents > 0) {
    owedClause =
      owedDays != null && owedDays > 0
        ? `${money(owed.cents)} owed you, ${plural(owedDays, 'day', 'days')}`
        : `${money(owed.cents)} owed you`;
    parts.push(owedClause);
  }
  if (notDrawn.cents != null && notDrawn.cents > 0) {
    parts.push(
      `${money(notDrawn.cents)} ${undrawnKind ? `${undrawnKind} ` : ''}not drawn`,
    );
  }

  const value = failed
    ? 'Money could not be read'
    : !settled
      ? READING
      : parts.length === 0
        ? 'Nothing moving yet'
        : parts.join(' · ');

  const owedCents = owed.cents;
  const standing =
    settled &&
    !failed &&
    owedCents != null &&
    owedCents > 0 &&
    owedDays != null &&
    owedDays > 0;
  const exception: TicketException | null = standing
    ? {
        rank: 'promise-past-due',
        phrase: `${money(owedCents)} owed you`,
        // The invoice's own due date, never a day count run backwards through
        // millisecond arithmetic: this is weighed against a real install date
        // inside the same rank.
        standingSince: owedSince,
      }
    : null;

  return {
    key: 'money',
    label: 'Money',
    value,
    emphasis: standing ? owedClause : null,
    door: regionDoor(input, 'money'),
    exception,
  };
}

function datesRow(input: TicketInput): TicketRow {
  const now = input.now ?? new Date();
  const schedule = input.dates.schedule;
  const install = schedule?.install ?? null;
  // R107/R108 — only the committed and record registers carry a day this
  // sentence may state. A band never names one and a frame only approximates
  // one, so the row falls back to the position the resolver did answer with.
  const dayStateable =
    install?.date != null &&
    (install.fidelity === 'committed' || install.fidelity === 'record');
  const days =
    dayStateable && install?.date ? calendarDaysUntil(install.date, now) : null;

  let value: string;
  if (!input.dates.settled) {
    value = READING;
  } else if (!dayStateable || days === null || install?.date == null) {
    value = schedule?.positionText ?? 'No install date yet';
  } else {
    const when = fmtWeekdayDate(install.date);
    if (days < 0) value = `Installed ${when}`;
    else if (days === 0) value = `Install ${when} · today`;
    else if (days === 1) value = `Install ${when} · tomorrow`;
    else value = `Install ${when}${distance(days)}`;
  }

  // Install day behind us while the job is still on the Project spread is a
  // promise past its date. On the install and care spreads it is simply where
  // the work is.
  const exception: TicketException | null =
    input.dates.settled &&
    input.section === 'project' &&
    days !== null &&
    days < 0 &&
    install?.date != null
      ? {
          rank: 'promise-past-due',
          phrase: 'Install day has passed',
          standingSince: install.date,
        }
      : null;

  return {
    key: 'dates',
    label: 'Dates',
    value,
    emphasis: exception?.phrase ?? null,
    door: regionDoor(input, 'schedule'),
    exception,
  };
}

function peopleRow(input: TicketInput): TicketRow {
  const { settled, callSheetEnabled, rosterCount } = input.people;
  const value = !callSheetEnabled
    ? "the call sheet isn't turned on for this studio"
    : !settled
      ? READING
      : rosterCount === 0
        ? 'Nobody on it yet'
        : `${rosterCount} on the roster`;
  return {
    key: 'people',
    label: 'People',
    value,
    emphasis: null,
    door: {
      kind: 'overlay',
      overlay: 'call-sheet',
      available: callSheetEnabled,
    },
    exception: null,
  };
}

/** Eight rows, always eight, always in order. */
export function deriveTicket(input: TicketInput): TicketRow[] {
  return [
    roomsRow(input),
    piecesRow(input),
    drawingsRow(input),
    specRow(input),
    boardsRow(input),
    moneyRow(input),
    datesRow(input),
    peopleRow(input),
  ];
}

/** `The job · Project · Procurement & Orders 4 of 6` — the seam's line one
 *  (M4), which never elides and never breaks. */
export function deriveTicketIdentity(input: TicketInput): string {
  const head = `The job · ${SECTION_LABEL[input.section]}`;
  if (!input.phase) return head;
  return `${head} · ${input.phase.name} ${input.phase.position} of ${input.phase.of}`;
}

/** The unfolded ticket's own head, which M2 draws in TWO parts across the
 *  band: what this is on the left, where it stands on the right. Both are set
 *  in DM Mono and uppercased by CSS, as the seam's one line is. */
export interface TicketHead {
  subject: string;
  phase: string | null;
}

export function deriveTicketHead(input: TicketInput): TicketHead {
  return {
    subject: `The job · ${SECTION_LABEL[input.section]}`,
    phase: input.phase
      ? `${input.phase.name} · ${input.phase.position} of ${input.phase.of}`
      : null,
  };
}

/**
 * The two-line rest form. Line one is `identity`, never elided. Line two is
 * the worst two exceptions in tie-break order; a third is dropped WHOLE, never
 * abbreviated, and nothing truncates mid-word — which is why the count is
 * capped here rather than by a CSS ellipsis downstream.
 */
export function deriveTicketSeam(
  rows: readonly TicketRow[],
  identity: string,
): TicketSeam {
  const standing = rows
    .map((row, order) => ({ order, exception: row.exception }))
    .filter(
      (entry): entry is { order: number; exception: TicketException } =>
        entry.exception != null,
    )
    .sort((a, b) => {
      const rank = RANK_ORDER[a.exception.rank] - RANK_ORDER[b.exception.rank];
      if (rank !== 0) return rank;
      const aSince = a.exception.standingSince;
      const bSince = b.exception.standingSince;
      if (aSince !== bSince) {
        if (aSince == null) return 1;
        if (bSince == null) return -1;
        return aSince < bSince ? -1 : 1;
      }
      return a.order - b.order;
    });

  return {
    identity,
    exceptions:
      standing.length === 0
        ? 'Nothing overdue'
        : standing
            .slice(0, 2)
            .map((entry) => entry.exception.phrase)
            .join(' · '),
  };
}
