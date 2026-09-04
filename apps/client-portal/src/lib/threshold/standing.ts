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
