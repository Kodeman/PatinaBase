/**
 * BRING FORWARD — the picker's own sentences (SPEC §5.7, Leah task 5).
 *
 * "Bring Dana, Pete, Ingrid and the Stonehaven rep onto Okonkwo. Each arrives
 *  with current consent, document status and one history line, never with old
 *  pricing."
 *
 * Every string here is pure and `today`-free, so the picker's face can be
 * tested without a database and both widths print the same bytes.
 */

import { rosterShortDate } from "./roster-derivation";

/** Small counts read as words on a face; past twelve, a numeral is honest. */
const NUMBER_WORDS = [
  "no",
  "one",
  "two",
  "three",
  "four",
  "five",
  "six",
  "seven",
  "eight",
  "nine",
  "ten",
  "eleven",
  "twelve",
];

export function countInWords(n: number): string {
  return NUMBER_WORDS[n] ?? String(n);
}

/**
 * PR-i — REPEAT COUNT AND DATES ONLY, never a verdict at the pick.
 *
 * "Worked 1 prior project, Lindqvist kitchen, closed 2025."
 * "Worked 2 prior projects, Lindqvist kitchen, 2025."  (still open: no "closed")
 * "Never on a job yet"
 *
 * The word "closed" is only spent where `projects.completed_at` says the job
 * actually closed — a claim the seat's own `created_at` cannot make.
 */
export function pickerHistoryLine(
  history:
    | {
        projectCount: number;
        lastProjectName: string | null;
        lastAt?: string | null;
        lastClosedYear?: string | null;
      }
    | undefined,
): string {
  if (!history || history.projectCount === 0) return "Never on a job yet";
  const count = `Worked ${history.projectCount} prior ${
    history.projectCount === 1 ? "project" : "projects"
  }`;
  const closed = history.lastClosedYear;
  const year = closed
    ? `closed ${closed}`
    : (history.lastAt ?? "").slice(0, 4) || null;
  return (
    [count, history.lastProjectName, year].filter(Boolean).join(", ") + "."
  );
}

/**
 * SPEC §5.7 #3 — "4 of 5 from the Lindqvist kitchen selected".
 *
 * The job is named only when every row on offer came from the SAME prior job;
 * a mixed page of hits says "4 of 5 selected", because naming one of several
 * jobs would be a claim about the other four rows that is not true.
 */
export function bringForwardSelectionLine(
  selected: number,
  offered: number,
  sharedJobName: string | null,
): string {
  const where = sharedJobName ? ` from the ${sharedJobName}` : "";
  return `${selected} of ${offered}${where} selected`;
}

/** SPEC §5.7 #6's terminal act label: "Add four to the roster". */
export function bringForwardActLabel(selected: number): string {
  return `Add ${countInWords(selected)} to the roster`;
}

export interface BringForwardRowFacts {
  name: string;
  /** The studio's consent verdict for this identity's number. */
  consent: string | null;
  /** The firm whose paper the row carries, for the lapse clause. */
  firmName: string | null;
  /** The clause the expiry notice already wrote, where the sweep wrote one. */
  paperClause: string | null;
}

/**
 * SPEC §5.7 #7 — the consequence sentence, directly under the act row.
 *
 * "Adds four seats to the Okonkwo residence. Pete Rusk arrives opted out of
 *  texting. Northgate Electric's insurance lapsed 31 Mar 2026."
 *
 * Three clauses, in one order: what the act does, who arrives carrying a
 * refusal, and which paper is not standing. Only the picked rows speak — a
 * row the studio unticked is not a cost of this act.
 */
export function bringForwardConsequence(
  projectName: string | null | undefined,
  picked: readonly BringForwardRowFacts[],
): string {
  const job = (projectName ?? "").trim();
  const n = picked.length;
  const head = `Adds ${countInWords(n)} ${n === 1 ? "seat" : "seats"}${
    job ? ` to the ${job}` : ""
  }.`;
  const refusals = picked
    .filter((row) => row.consent === "opted_out")
    .map((row) => `${row.name} arrives opted out of texting.`);
  const papers = [
    ...new Set(
      picked
        .map((row) => row.paperClause)
        .filter((clause): clause is string => !!clause),
    ),
  ];
  return [head, ...refusals, ...papers].join(" ");
}

/**
 * R-Q / direction §5.2's Birth rule, at the moment of the pick: a seat on an
 * opted-out number is born reading the refusal it inherits, never "Not asked".
 *
 * "Opted out by text, 3 Dec 2025, on the Lindqvist kitchen."
 */
export function carriedConsentNotice(record: {
  optOutSource?: string | null;
  optOutAt?: string | null;
  originProjectName?: string | null;
}): string | null {
  const when = rosterShortDate(record.optOutAt);
  if (!when) return null;
  const how =
    record.optOutSource === "inbound_stop" ? "by text" : "to the studio";
  const where = record.originProjectName
    ? `, on the ${record.originProjectName}`
    : "";
  return `Opted out ${how}, ${when}${where}.`;
}
