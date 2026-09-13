'use client';

/**
 * A SEAT, BENEATH THE HUMAN.
 *
 * The redesign's unit changes from the party row to the person card, and every
 * project seat becomes a line beneath the human (direction §1 line 1). One
 * seat, one line: project · kind · trade · stage word · window.
 *
 * PR-p / C1: the STAGE WORD prints HERE and nowhere else. One human holds many
 * seats with many stages, so a single person-level stage column is a
 * fabrication the model does not claim.
 *
 * R-AA: the line is a BUTTON at both widths, whose accessible name is the
 * seat's own text, and activating it opens that person's card by the same
 * open-person path as the row's name. No inert buttons; the seat is the reason
 * the person is in the Directory at all, so the line naming it is a door.
 */

import { getFieldTradeLabel, getPartyKindLabel } from '@patina/types';
import type { PeopleDirectorySeat } from '@patina/supabase';
import { StateWord } from './state-word';

/** "12 Oct 2026 to 13 Aug 2027", "from 19 Oct 2026", "to 13 Aug 2027", or
 *  nothing at all. A seat with no window prints no window — never "unknown". */
export function seatWindowText(
  from: string | null | undefined,
  to: string | null | undefined,
): string | null {
  const start = formatSeatDate(from);
  const end = formatSeatDate(to);
  if (start && end) return `${start} to ${end}`;
  if (start) return `from ${start}`;
  if (end) return `to ${end}`;
  return null;
}

const MONTHS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];

/** `2026-10-12` → `12 Oct 2026`. Parsed by parts, never by `new Date(string)`:
 *  a DATE column parsed as a timestamp lands a day early west of UTC. */
export function formatSeatDate(value: string | null | undefined): string | null {
  if (!value) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (!match) return null;
  const [, year, month, day] = match;
  const monthName = MONTHS[Number(month) - 1];
  if (!monthName) return null;
  return `${Number(day)} ${monthName} ${year}`;
}

/**
 * THE SEAT LINE'S OWN VOCABULARY (CR13-3, SPEC §5.1 #8, C5).
 *
 * `PARTY_KIND_LABELS` is the COLUMN-HEAD vocabulary — Title Case, one noun per
 * column of a table. Spoken in a sentence under a person's name it reads as a
 * form: "Okonkwo residence · Subcontractor · Electrical". SPEC fixes the
 * studio's own words there — "… · sub · electrical · On the job · …" — and the
 * identity line two rows above already lower-cases the same trade.
 *
 * The second half matters more than the case. The Add sheet's door says "a
 * household member" and writes a `client_rep` seat; every line that seat then
 * printed said "Client Rep", so the face contradicted its own door two clicks
 * away. C5 is one door, the studio's words — on both sides of it.
 *
 * PARTY_KIND_LABELS stays exactly what it is: the column heads.
 */
const SEAT_KIND_WORDS: Record<string, string> = {
  gc: 'GC',
  sub: 'sub',
  installer: 'installer',
  receiver: 'receiver',
  // PR-c / C5: the Add sheet's own noun for the same seat.
  client_rep: 'household member',
  client: 'client',
  vendor: 'vendor',
  architect: 'architect',
  photographer: 'photographer',
  stager: 'stager',
  inspector: 'inspector',
  lender: 'lender',
  engineer: 'engineer',
  // The studio types the actual word beside these two, and it rides in the
  // seat's `trade` until the CHECK widens (add-person-sheet's SEAT_PARTY_KIND).
  other: 'contact',
  other_named: 'contact',
};

/** One seat's kind, in the studio's voice. */
export function seatKindWord(kind: string | null | undefined): string {
  if (!kind) return '';
  return SEAT_KIND_WORDS[kind] ?? getPartyKindLabel(kind).toLowerCase();
}

/** One seat's trade, in the same case the identity line above it uses. */
export function seatTradeWord(trade: string | null | undefined): string {
  return getFieldTradeLabel(trade).toLowerCase();
}

/** The words of the seat, in order, for the line and for its accessible name. */
export function seatLineParts(seat: PeopleDirectorySeat): string[] {
  const parts: string[] = [];
  if (seat.project_name) parts.push(seat.project_name);
  const kind = seatKindWord(seat.party_kind);
  if (kind) parts.push(kind);
  const trade = seatTradeWord(seat.trade);
  if (trade) parts.push(trade);
  return parts;
}

export interface SeatLineProps {
  seat: PeopleDirectorySeat;
  /** Opens the person's card at this seat. */
  onOpen: (seat: PeopleDirectorySeat) => void;
  className?: string;
}

export function SeatLine({ seat, onOpen, className }: SeatLineProps) {
  const parts = seatLineParts(seat);
  const windowText = seatWindowText(seat.on_site_from, seat.on_site_to);

  return (
    <button
      type="button"
      data-seat-line={seat.seat_id}
      onClick={() => onOpen(seat)}
      className={`flex w-full min-w-0 flex-wrap items-center gap-x-2 gap-y-1 py-[6px] text-left ${className ?? ''}`}
    >
      <span className="t-meta min-w-0 text-[var(--ink-subtle)]">
        {parts.join(' · ')}
      </span>
      <StateWord family="stage" value={seat.stage} />
      {windowText ? (
        <span className="t-meta text-[var(--ink-faint)]">{windowText}</span>
      ) : null}
    </button>
  );
}
