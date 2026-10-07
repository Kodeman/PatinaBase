/**
 * The install reading — ruling D6 (US-19, `delivery/rulings.md`).
 *
 * One sentence for the Install region head's own status line, and the act it
 * leads with. The only date it reads is a piece's recorded arrival,
 * `purchase_orders.confirmed_eta`, which `useProjectFFEItems` embeds on every
 * row's `purchase_order`. The install start is not an input: it is never the
 * anchor (ADV-11). An acknowledged ship date is a ship date, not an arrival,
 * and is not read either. The reading prints the fact, never a judgement or a
 * ratio.
 *
 * "Here" is `isPieceHere`, the one selector the head and the rows share.
 */

import { ownAct, type InstallReadingState, type OwnAct } from './act-names';
import { dayMonth, legalDate, parseSourceDate, WEEKDAY_FORMAT } from './dates';
import { isPieceHere, type InstallStateInput } from './install-state';
import { compareDeadline } from './lens-band-derivation';

export interface InstallReadingPiece extends InstallStateInput {
  id: string;
  name: string;
  purchase_order?: {
    delivered_date?: string | null;
    confirmed_eta?: string | null;
  } | null;
}

export interface InstallReading {
  state: InstallReadingState;
  sentence: string;
  /** The stage's own act for this state (D1), or null where D6 is silent. */
  act: OwnAct | null;
  /** The piece the sentence names; null when everything is here. */
  firstItemId: string | null;
}

const DAY_MS = 86_400_000;

function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

/** A line's name as the reading speaks it: the piece, without the spec after
 *  its first comma (`Reading chair, oiled oak and shearling` → `Reading chair`). */
export function pieceName(name: string): string {
  return name.split(',')[0]?.trim() || name.trim();
}

/** V9's one style, day then month; the year only when it is not this year. */
export function readingDay(date: Date, today: Date): string {
  return (
    (date.getFullYear() === today.getFullYear() ? dayMonth(date) : legalDate(date)) ?? ''
  );
}

/** ownAct reads nothing but `install` at the install stage. */
const NOT_READ_AT_INSTALL = {
  inquiryOpen: false,
  firstMissingEssential: null,
  proposalState: null,
  clientFirstName: null,
  unspecifiedCount: 0,
  releaseEligible: false,
} as const;

function reading(
  state: InstallReadingState,
  sentence: string,
  firstItemId: string | null,
  windowHeld: boolean,
): InstallReading {
  return {
    state,
    sentence,
    act: ownAct('install', { ...NOT_READ_AT_INSTALL, install: { state, windowHeld } }),
    firstItemId,
  };
}

/**
 * The reading for the install-stage pieces, or null when there are none.
 *
 * Several pieces not here: the sentence names the first in the Next order and
 * counts the rest. Pieces carry no need class, so the order is W3-R1's
 * deadline order (`compareDeadline`): an arrival date passed (most days first),
 * then one ahead (soonest first), then no date; the schedule's own order
 * breaks a tie.
 */
export function installReading(
  pieces: readonly InstallReadingPiece[],
  today: Date,
  windowHeld: boolean,
): InstallReading | null {
  if (pieces.length === 0) return null;
  const day = startOfDay(today);

  const waiting = pieces
    .filter((piece) => !isPieceHere(piece))
    .map((piece, index) => {
      const eta = parseSourceDate(piece.purchase_order?.confirmed_eta ?? null);
      const days = eta
        ? Math.round((startOfDay(eta).getTime() - day.getTime()) / DAY_MS)
        : null;
      const sense = days === null ? 'none' : days < 0 ? 'past' : 'ahead';
      return { piece, index, eta, sense, deadline: { sense, distance: days, standingSince: null } } as const;
    })
    .sort((a, b) => compareDeadline(a.deadline, b.deadline) || a.index - b.index);

  const [first, ...rest] = waiting;
  if (!first) return reading('all_here', 'Everything is here.', null, windowHeld);

  const name = pieceName(first.piece.name);
  const more =
    rest.length === 0
      ? ''
      : rest.length === 1
        ? " 1 more isn't here."
        : ` ${rest.length} more aren't here.`;

  if (!first.eta) {
    return reading(
      'not_here_undated',
      `${name} isn't here, and no arrival date is recorded.${more}`,
      first.piece.id,
      windowHeld,
    );
  }
  if (first.sense === 'past') {
    return reading(
      'not_here_past',
      `${name} was due ${readingDay(first.eta, day)} and isn't here.${more}`,
      first.piece.id,
      windowHeld,
    );
  }
  return reading(
    'not_here_ahead',
    `${name} arrives ${WEEKDAY_FORMAT.format(first.eta)} ${readingDay(first.eta, day)}.${more}`,
    first.piece.id,
    windowHeld,
  );
}
