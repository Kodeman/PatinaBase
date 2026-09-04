/* ── The threshold's own sentences ──────────────────────────────────────────
   The Making's standing sentence tells the client where the house stands. The
   Threshold asks a narrower question — what is closed, and until when — so it
   speaks in doors and walls rather than in papers and scopes.

   The cardinality rules, the money format and the clause joins are NOT
   restated here: they come from making/standing-sentence.ts, which is shared
   and string-pinned by its own tests. This module is the house's vocabulary
   laid over that grammar, and nothing else. ────────────────────────────── */

import { countInWords, joinClauses, moneyInWords } from '@/components/making/standing-sentence';

const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
] as const;

function capitalize(text: string): string {
  if (text.length === 0) return text;
  return `${text[0].toUpperCase()}${text.slice(1)}`;
}

function tally(value: number | undefined | null): number {
  return Number.isFinite(value) ? Math.max(0, Math.trunc(value as number)) : 0;
}

/** What is asked of the client, and what stands open behind it. */
export interface ThresholdStandingInput {
  /** Signature gates — a paper closed until she signs it. */
  doors: number;
  /** Finished trade work waiting to be accepted. */
  walls: number;
  /** The open balance, in cents. */
  balanceCents: number;
  /** True when no mark waits on her hand. */
  nothingOwed: boolean;
  /** One further sentence about a piece in motion, already composed. */
  credenzaLine?: string;
}

function doorsClause(doors: number): string | null {
  if (doors <= 0) return null;
  if (doors === 1) return 'one door in this house is closed until you sign it';
  return `${countInWords(doors)} doors in this house are closed until you sign them`;
}

/**
 * Finished work is a mass noun, and the wall is a mark on a drawing rather
 * than a paper — so however many walls stand hatched, the sentence says it
 * once. The key beneath it does the counting.
 */
function wallsClause(walls: number): string | null {
  return walls > 0 ? 'finished work waits for your acceptance' : null;
}

/**
 * The doorstep's sentence: what is closed, or — when nothing is — what stands
 * open behind an unlocked door.
 */
export function thresholdStanding(m: ThresholdStandingInput): string {
  const doors = tally(m.doors);
  const walls = tally(m.walls);

  const clauses = [doorsClause(doors), wallsClause(walls)].filter(
    (clause): clause is string => clause !== null,
  );

  // A real ask always wins over the flag. `nothingOwed` and a door count are
  // contradictory inputs, and only one direction of that contradiction is
  // dangerous: telling a client nothing waits for her name while a paper does.
  if (clauses.length > 0) {
    return `${capitalize(joinClauses(clauses))}.`;
  }

  const sentences = ['Nothing waits for your name.'];
  if (Number.isFinite(m.balanceCents) && m.balanceCents > 0) {
    sentences.push(`A balance of ${moneyInWords(m.balanceCents)} stands open.`);
  }
  const credenza = m.credenzaLine?.trim();
  if (credenza) sentences.push(credenza);
  return sentences.join(' ');
}

/**
 * A variance at the granularity a person actually speaks it: hundreds, and
 * approximate. "$1,137.40 over" is an accountant's figure; "about eleven
 * hundred past its target" is what the designer says out loud.
 *
 * The twelve-and-under cutover is standing-sentence's own rule, not a new one
 * — past twelve the word stops helping and becomes a puzzle, so the house's
 * money format takes over.
 */
function hundredsInWords(cents: number): string | null {
  const hundreds = Math.round(Math.abs(cents) / 10_000);
  if (hundreds === 0) return null;
  if (hundreds <= 12) return `${countInWords(hundreds)} hundred`;
  return moneyInWords(hundreds * 10_000);
}

/**
 * How a room's agreed total sits against what was planned for it. Null when
 * the room carries no target, when the two agree, or when the gap rounds away
 * to nothing at hundreds granularity — a room that is $40 over is, in the
 * voice this page speaks, on its target.
 */
export function roomVarianceLine(
  targetCents: number | null,
  agreedCents: number,
): string | null {
  if (targetCents === null || !Number.isFinite(targetCents)) return null;
  const delta = agreedCents - targetCents;
  if (delta === 0) return null;
  const amount = hundredsInWords(delta);
  if (!amount) return null;
  return `about ${amount} ${delta > 0 ? 'past' : 'under'} its target`;
}

/** A room named the way a sentence names it: "the dining room", once. */
function roomInSentence(name: string): string {
  const trimmed = name.trim();
  return /^the\s/i.test(trimmed) ? trimmed.slice(4).trim() : trimmed;
}

/** A band as the overage note reads it. */
export interface OverageBand {
  name: string;
  targetCents: number | null;
  agreedCents: number;
  varianceLine: string | null;
}

/**
 * The note under the ledger: the one room standing past its target, and the
 * room whose headroom absorbs it when there is one. Null when no room carries
 * a target it has passed — a house on its targets says nothing.
 */
export function houseOverageLine(bands: OverageBand[]): string | null {
  const over = bands.find(
    (band) =>
      band.targetCents !== null && band.agreedCents > band.targetCents && !!band.varianceLine,
  );
  if (!over) return null;
  const under = bands.find(
    (band) =>
      band !== over && band.targetCents !== null && band.agreedCents < band.targetCents,
  );
  const head = `The ${roomInSentence(over.name)} stands ${over.varianceLine}`;
  return under ? `${head}; the ${roomInSentence(under.name)} absorbs it.` : `${head}.`;
}

/** "19 June" — the day a thing happened, the way the deck's own line prints it. */
function dayAndMonth(date: Date): string {
  return `${date.getDate()} ${MONTHS[date.getMonth()]}`;
}

/** The one line of history the doorstep carries. Null when there is none. */
export function previouslyLine(receipt: { label: string; date: Date } | null): string | null {
  if (!receipt) return null;
  const label = receipt.label?.trim();
  if (!label) return null;
  if (Number.isNaN(receipt.date.getTime())) return null;
  return `Previously — ${label}, ${dayAndMonth(receipt.date)}.`;
}

/** The key's own heading — how much of this drawing waits on her hand. */
export function keySentence(markCount: number): string {
  const marks = tally(markCount);
  if (marks === 0) return 'Nothing stands open on this drawing.';
  if (marks === 1) return 'One mark stands open on this drawing.';
  return `${capitalize(countInWords(marks))} marks stand open on this drawing.`;
}

/* ── the day, in words ──────────────────────────────────────────────────────
   The dateline speaks a day the way a person says it out loud — "the fourth
   of August" — because it is a sentence about her last visit, not a stamp.
   The ledger's figure keeps the deck's numeric idiom ("due 15 August"): it
   stands beside money, and money is set in figures on this page. ─────────── */

const ONES = [
  '',
  'first',
  'second',
  'third',
  'fourth',
  'fifth',
  'sixth',
  'seventh',
  'eighth',
  'ninth',
  'tenth',
  'eleventh',
  'twelfth',
  'thirteenth',
  'fourteenth',
  'fifteenth',
  'sixteenth',
  'seventeenth',
  'eighteenth',
  'nineteenth',
  'twentieth',
] as const;

const TENS = ['', '', 'twentieth', 'thirtieth'] as const;
const TENS_PREFIX = ['', '', 'twenty', 'thirty'] as const;

/** "fourth", "twenty-first", "thirtieth" — a calendar day as it is spoken. */
export function dayInWords(day: number): string | null {
  if (!Number.isFinite(day)) return null;
  const value = Math.trunc(day);
  if (value < 1 || value > 31) return null;
  if (value <= 20) return ONES[value];
  const tens = Math.floor(value / 10);
  const ones = value % 10;
  return ones === 0 ? TENS[tens] : `${TENS_PREFIX[tens]}-${ONES[ones]}`;
}

/**
 * The dateline beside the since control: when she last stood here. Null when
 * there is no previous mark — a first visit has no "here" to have read from,
 * and the page says nothing rather than inventing one.
 */
export function readingMarkLine(at: Date | null | undefined): string | null {
  if (!at || Number.isNaN(at.getTime())) return null;
  const day = dayInWords(at.getDate());
  return day ? `Read here on the ${day} of ${MONTHS[at.getMonth()]}.` : null;
}

/**
 * What the owed row adds to its figure. One open invoice owes on one day;
 * several owe on several, and the row names the first of them as the first —
 * a bare "due 15 August" against a sum of three invoices would say the whole
 * balance falls due that day, which is not true.
 */
export function owedDueLine(due: Date | null | undefined, invoiceCount: number): string | null {
  if (!due || Number.isNaN(due.getTime())) return null;
  return `${tally(invoiceCount) > 1 ? 'first due' : 'due'} ${dayAndMonth(due)}`;
}

/**
 * The note as a door pins it: its opening, not its body. The full letter is
 * rendered once, by `TheNote`, and the pin carries a quote short enough to
 * read at a glance with "Read the note" beneath it. The cut lands on a word
 * and is marked, so no sentence is left looking finished when it is not.
 */
export function noteInBrief(body: string, budget = 140): string {
  const text = body.trim().replace(/\s+/g, ' ');
  if (text.length <= budget) return text;
  const cut = text.slice(0, budget);
  const lastSpace = cut.lastIndexOf(' ');
  const kept = (lastSpace > budget / 2 ? cut.slice(0, lastSpace) : cut).replace(/[\s,;:—-]+$/, '');
  return `${kept}…`;
}
