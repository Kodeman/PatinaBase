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
import {
  usePeopleSeats,
  type PeopleDirectorySeat,
  type StudioContactRule,
} from "@patina/supabase";
import {
  entryPaperWord,
  personIdentityLine,
  splitRoutedClause,
  type DirectoryPerson,
} from "@/lib/document/people-derivation";
import {
  contactRuleClause,
  contactRuleIsDoNotContact,
  contactRuleIsHardBlock,
} from "@/lib/document/contact-rule";
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
  rule,
  routeTo: routeTarget,
  consentClause,
  routeTargets,
  highlighted = false,
}: {
  person: DirectoryPerson;
  onOpen: () => void;
  /** A seat line is a door to the same card (R-AA) — never an inert button. */
  onOpenSeat?: (seat: PeopleDirectorySeat) => void;
  /**
   * The rule ROW, not the rendered summary (CR-5 / CR-6 / CR-22). The clause,
   * the hard block and the route all come off the columns; the prose summary
   * below is only the fallback for a row whose rule has not loaded.
   */
  rule?: StudioContactRule | null;
  /** How to reach the person the rule routes to (R-L). */
  routeTo?: ContactRouteTarget | null;
  /** SPEC §5.1 #9 — the word AND the clause behind it (CR-13). */
  consentClause?: string | null;
  /** Legacy name-keyed lookup, kept for the summary fallback path. */
  routeTargets?: ReadonlyMap<string, ContactRouteTarget>;
  highlighted?: boolean;
}) {
  const [seatsOpen, setSeatsOpen] = useState(false);
  const seatsPanelId = useId();
  const { data: seats } = usePeopleSeats({
    personId: seatsOpen ? person.person_id : null,
  });

  const { routedName } = splitRoutedClause(person.contact_rule_summary);
  // CR3-2: THE SUMMARY IS NOT A FACE. `contact_rule_summary()` renders
  // `channels_forbidden`/`channels_allowed` as raw `channel_kind` tokens —
  // "Do not use: after_hours, ap_email, dispatch, …" — which SPEC §8 #3
  // forbids on a face, and it drops the studio's own typed reason besides.
  // `useContactRules()` is a separate query from `usePeopleDirectory()`, so
  // that fallback painted on every cold load and permanently whenever the
  // rules read failed. No clause until the rule row is in hand. The routed
  // NAME below is a person, not a schema word, so it still stands in.
  const clause = contactRuleClause(rule);
  const routeTo =
    routeTarget ??
    (routedName
      ? (routeTargets?.get(routedName.toLowerCase()) ?? { name: routedName })
      : null);
  // CR-4 / CR-16: ONE pair of predicates, read off `channels_forbidden` in
  // lib/document/contact-rule.ts, so this row, the roster row, the person card,
  // the company card's crew line and the picker all answer alike. The leading
  // rule and the silenced phone are DIFFERENT facts: Ray Thao forbids text and
  // still wants his office line printed; Frank Bauer has no direct channel left
  // open, so his own number comes off the row (SPEC §5.1 #10, §5.4). A row
  // whose rule has not loaded prints the clause without either rather than
  // guessing.
  const blocked = contactRuleIsHardBlock(rule);
  const unreachable = contactRuleIsDoNotContact(rule);
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
        <ContactRuleLine summary={clause} blocked={blocked} routeTo={routeTo} />

        {/* SPEC §5.1 #9 — the consent WORD prints in its own column; the
            clause behind it ("Opted out by text, 3 December 2025, on the
            Lindqvist kitchen.") belongs here, under the identity, where a
            studio reading the ledger can see WHY the word says what it says. */}
        {consentClause ? (
          <p data-consent-clause className="t-body-sm mt-1 text-[var(--ink-subtle)]">
            {consentClause}
          </p>
        ) : null}

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

      {/* Its own control, 8px clear of the row's own (SPEC §5.1 #15).

          A DO-NOT-CONTACT RULE TAKES THE NUMBER OFF THE ROW (SPEC §5.1 #10,
          §5.4). Frank Bauer is "do not contact, write Rosa instead" and his own
          mobile still printed here as a live `tel:` link — one tap away from
          the call the rule forbids. Channels are HIDDEN, never deleted: the
          number is still on his card, behind the rule that governs it. A rule
          that merely forbids TEXT is not that rule — Ray Thao's own line is
          what his clause tells the studio to use. */}
      {unreachable ? null : (
        <TelLink phone={person.phone} personName={person.display_name} />
      )}

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
