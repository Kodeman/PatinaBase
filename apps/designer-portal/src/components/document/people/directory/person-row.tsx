"use client";

/**
 * A DIRECTORY PERSON ROW — a hairline ledger row, not a bordered card (PR-q).
 *
 * The Directory is the studio's ledger and needs five columns, so it widens to
 * the 1200 band and the row spans it. What the row carries, in order:
 *
 *    34px circle · identity (name, firm, trade) · the rule clause ·
 *    reach / consent / paper · the phone · the seats disclosure
 *
 * THE ROW IS A CONTAINER, NEVER A BUTTON (C11, SPEC §7 #6). Inside it sit
 * three sibling controls: an open-person `<button>` whose accessible name is
 * the person's name and role summary ONLY, a separate `<a href="tel:">`, and a
 * seats disclosure whose panel is a `<ul>` of focusable seat rows. An anchor
 * cannot nest inside a button, and a run-on accessible name cannot be tabbed
 * into.
 *
 * STAGE IS NEVER A PERSON-LEVEL COLUMN (PR-p / C1 / R-G). One human holds many
 * seats with many stages; a single person-level stage is a fabrication the
 * model does not claim. It prints on the seat line beneath, one line per seat.
 *
 * At 390 the three words print PLAIN and inline on line 2 of every row, folded
 * or not (R-M / C23): a narrow row that hides consent and paper until unfold
 * hides exactly the facts a studio scans fastest for.
 */

import { useId, useState } from "react";
import { usePeopleSeats, type PeopleDirectorySeat } from "@patina/supabase";
import {
  contactRuleBlocks,
  entryPaperWord,
  personIdentityLine,
  splitRoutedClause,
  type DirectoryPerson,
} from "@/lib/document/people-derivation";
import { Avatar } from "../person-bits";
import { StateWord } from "../state-word";
import { TelLink } from "../tel-link";
import { ContactRuleLine, type ContactRouteTarget } from "../contact-rule-line";
import { SeatLine } from "../seat-line";

/** What the open-person control says to a screen reader, and nothing more. */
export function openPersonLabel(person: DirectoryPerson): string {
  const line = personIdentityLine(person);
  return line ? `${person.display_name}, ${line}` : person.display_name;
}

export function PersonRow({
  person,
  onOpen,
  onOpenSeat,
  routeTargets,
  highlighted = false,
}: {
  person: DirectoryPerson;
  onOpen: () => void;
  /** A seat line is a door to the same card (R-AA) — never an inert button. */
  onOpenSeat?: (seat: PeopleDirectorySeat) => void;
  /** How to reach a person the rule routes to, by name (R-L). */
  routeTargets?: ReadonlyMap<string, ContactRouteTarget>;
  highlighted?: boolean;
}) {
  const [seatsOpen, setSeatsOpen] = useState(false);
  const seatsPanelId = useId();
  const { data: seats } = usePeopleSeats({
    personId: seatsOpen ? person.person_id : null,
  });

  const { rest, routedName } = splitRoutedClause(person.contact_rule_summary);
  const routeTo = routedName
    ? (routeTargets?.get(routedName.toLowerCase()) ?? { name: routedName })
    : null;
  const blocked = contactRuleBlocks(person.contact_rule_summary);
  const paper = entryPaperWord(person);
  const seatCount = person.seat_count ?? 0;

  return (
    <li
      data-person-row={person.person_id}
      data-highlighted={highlighted ? "true" : undefined}
      className={`flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-[var(--hairline)] px-4 py-3 ${
        highlighted ? "bg-[var(--rail)]" : ""
      }`}
    >
      <Avatar name={person.display_name} role={person.role} />

      <div className="min-w-0 flex-1 basis-[320px]">
        <button
          type="button"
          data-open-person={person.person_id}
          onClick={onOpen}
          className="min-h-11 text-left text-[14px] font-semibold leading-[1.4] text-[var(--ink)]"
        >
          {person.display_name}
        </button>
        <p className="t-meta text-[var(--ink-subtle)]">
          {personIdentityLine(person)}
        </p>
        <ContactRuleLine summary={rest} blocked={blocked} routeTo={routeTo} />

        {/* 390 — line 2: reach · consent · paper, plain, on EVERY row (R-M). */}
        <p
          data-row-words-390
          className="mt-1 flex flex-wrap items-center gap-x-2 sm:hidden"
        >
          <StateWord family="reach" value={person.reach_state} plain />
          <span aria-hidden className="text-[var(--ink-faint)]">
            ·
          </span>
          <StateWord family="consent" value={person.consent_status} plain />
          {paper ? (
            <>
              <span aria-hidden className="text-[var(--ink-faint)]">
                ·
              </span>
              <StateWord family="paper" value={paper} plain />
            </>
          ) : null}
        </p>
      </div>

      {/* 1440 — three bordered word columns, in this order, and only three. */}
      <div data-row-words className="hidden shrink-0 gap-3 sm:flex">
        <StateWord
          family="reach"
          value={person.reach_state}
          className="w-[108px]"
        />
        <StateWord
          family="consent"
          value={person.consent_status}
          className="w-[108px]"
        />
        {paper ? (
          <StateWord family="paper" value={paper} className="w-[108px]" />
        ) : null}
      </div>

      {/* Its own control, 8px clear of the row's own (SPEC §5.1 #15). */}
      <TelLink phone={person.phone} personName={person.display_name} />

      {seatCount > 0 && (
        <button
          type="button"
          data-seats-disclosure={person.person_id}
          aria-expanded={seatsOpen}
          aria-controls={seatsPanelId}
          onClick={() => setSeatsOpen((open) => !open)}
          className="t-meta min-h-11 shrink-0 text-[var(--ink-faint)]"
        >
          {seatCount} {seatCount === 1 ? "seat" : "seats"}
        </button>
      )}

      <ul
        id={seatsPanelId}
        hidden={!seatsOpen}
        className="m-0 w-full list-none border-t border-[var(--hairline)] p-0 pl-[50px]"
      >
        {(seats ?? []).map((seat) => (
          <li key={seat.seat_id}>
            <SeatLine
              seat={seat}
              onOpen={(s) => (onOpenSeat ? onOpenSeat(s) : onOpen())}
            />
          </li>
        ))}
        {seatsOpen && (seats ?? []).length === 0 && (
          <li className="t-body-sm py-2 text-[var(--ink-subtle)]">
            No open seat on this project.
          </li>
        )}
      </ul>
    </li>
  );
}
