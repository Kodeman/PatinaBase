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
  /** FR3 F3-11 — the band's short form of the sentence (`Side table isn't
   *  here — no date recorded.`), or null where no short form is ruled: the
   *  band then prints the act alone when the sentence does not fit. */
  shortSentence?: string | null;
  /** The stage's own act for this state (D1), or null where D6 is silent. */
  act: OwnAct | null;
  /** The piece the sentence names; null when everything is here. */
  firstItemId: string | null;
}

const DAY_MS = 86_400_000;

function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

/** What R42's maker selector reads off a line: `useProjectFFEItems`'s row, or
 *  the ask route's read of the same record. */
export interface LineMakerSource {
  vendor_id?: string | null;
  vendor_name?: string | null;
  purchase_order?: { vendor_id?: string | null; vendor?: { name?: string | null } | null } | null;
  product?: { brand?: string | null } | null;
}

/**
 * The maker R42 prints, and the vendor record that name came from: the line's
 * own vendor for its `vendor_name` (00692 copies the vendor's name onto the
 * line), the PO's vendor for the PO's name, none for a brand. R7: only that
 * record's address may carry a note to the maker.
 */
export function lineMakerRecord(
  line: LineMakerSource,
): { name: string; vendorId: string | null } | null {
  const own = line.vendor_name?.trim();
  if (own) return { name: own, vendorId: line.vendor_id ?? null };
  const po = line.purchase_order?.vendor?.name?.trim();
  if (po) return { name: po, vendorId: line.purchase_order?.vendor_id ?? null };
  const brand = line.product?.brand?.trim();
  return brand ? { name: brand, vendorId: null } : null;
}

/**
 * R42 — the one maker selector: the line's `vendor_name`, else its PO's
 * vendor, else the line's maker (its product's brand). The schedule row, the
 * ask sheet's `To` and the ask route all print this. Null only when none is
 * recorded, which is R37's held form.
 */
export function lineMaker(line: LineMakerSource): string | null {
  return lineMakerRecord(line)?.name ?? null;
}

/** No studio stores a time zone yet: the studio clock is Chicago's (F6, 506-5). */
export const STUDIO_TIME_ZONE = 'America/Chicago';

const STUDIO_DAY = new Intl.DateTimeFormat('en-CA', {
  timeZone: STUDIO_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/** The studio day an instant falls on (YYYY-MM-DD). */
export const studioDay = (at: Date | string) => STUDIO_DAY.format(new Date(at));

/** 506-3: a date request that still stands: held for review, sending, or sent. */
export const LIVE_MAKER_ASK_STATUSES = ['awaiting_review', 'sending', 'sent'] as const;

interface MakerAskDraft {
  status: string;
  created_at: string;
  sent_at?: string | null;
}

/**
 * 506-3 / 511-R3 — the draft that stands against a second ask on its line, or
 * null. A held or sending draft stands until it is sent or discarded; a sent
 * one stands for the rest of the studio day it was sent on. A Discard
 * releases the day.
 */
export function standingMakerAsk<T extends MakerAskDraft>(
  drafts: readonly T[],
  now: Date,
): T | null {
  const today = studioDay(now);
  return (
    drafts.find((draft) => draft.status === 'awaiting_review' || draft.status === 'sending') ??
    drafts.find(
      (draft) => draft.status === 'sent' && studioDay(draft.sent_at ?? draft.created_at) === today,
    ) ??
    null
  );
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
  shortSentence: string | null = null,
): InstallReading {
  return {
    state,
    sentence,
    shortSentence,
    act: ownAct('install', { ...NOT_READ_AT_INSTALL, install: { state, windowHeld } }),
    firstItemId,
  };
}

/** R36's groups: a missed or unknown arrival is what the hire acts on; a known
 *  one can wait behind it. */
const PIECE_GROUP = { past: 0, none: 1, ahead: 2 } as const;

/**
 * The reading for the install-stage pieces, or null when there are none.
 *
 * Several pieces not here: the sentence names the first in the Next order and
 * counts the rest. R36's order: an arrival date passed, then no date, then a
 * date ahead; inside each group W3-R1 (`compareDeadline`: passed, most days
 * first; ahead, soonest first), then the schedule's own order.
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
    .sort(
      (a, b) =>
        PIECE_GROUP[a.sense] - PIECE_GROUP[b.sense] ||
        compareDeadline(a.deadline, b.deadline) ||
        a.index - b.index,
    );

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
      `${name} isn't here — no date recorded.`,
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
