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
 * SPEC §5.7 #3 — "4 of 6 from the Lindqvist kitchen selected" (R-BP: the pool
 * is whatever the studio's book holds for that prior job, which on the seed is
 * six).
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

/**
 * SPEC §5.7 #6's terminal act label: "Add four to the roster".
 *
 * With nothing ticked it reads "Add to the roster" and not "Add no to the
 * roster" — `countInWords(0)` is the word "no", which belongs in a count
 * ("Adds no seats to the Okonkwo residence.") and not in an act. The act row
 * renders as soon as there are hits and `picked` resets on every open, so the
 * broken phrase was the sheet's OPENING state on every single use, and the
 * state it returned to after "Put back" (code review r1 MAJOR-4). R-I forbids
 * gating the act, so the wording is the whole fix.
 */
export function bringForwardActLabel(selected: number): string {
  return selected === 0
    ? "Add to the roster"
    : `Add ${countInWords(selected)} to the roster`;
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
  /**
   * r16 MAJOR-2 — THE NAMES THE PRESS WILL REFUSE.
   *
   * `addPicked` drops every ticked card already seated here from the batch and
   * writes only the rest (r11 QA MAJOR-1), so a sentence counting all of them
   * promised seats the act would not add: Leah's task 5, performed on the
   * seeded Okonkwo exactly as SPEC §5.7 draws it, read "Adds four seats to the
   * Okonkwo residence." and added zero. Only the FRESH picks are counted here,
   * and the ones already on the sheet are named in their own clause.
   */
  alreadySeatedNames: readonly string[] = [],
): string {
  const job = (projectName ?? "").trim();
  const n = picked.length;
  const head = `Adds ${countInWords(n)} ${n === 1 ? "seat" : "seats"}${
    job ? ` to the ${job}` : ""
  }.`;
  const seated =
    alreadySeatedNames.length > 0
      ? [
          `${alreadySeatedNames.join(", ")} ${
            alreadySeatedNames.length === 1 ? "is" : "are"
          } already on the call sheet.`,
        ]
      : [];
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
  return [head, ...seated, ...refusals, ...papers].join(" ");
}

/**
 * R-Q / direction §5.2's Birth rule, at the moment of the pick, is composed by
 * `components/document/people/consent-sentence.ts` — the ONE composer — and
 * not here.
 *
 * `carriedConsentNotice` used to live at this spot and branched on
 * `optOutSource === "inbound_stop"`, a value `studio_channel_consent`'s own
 * CHECK can never produce (verbal | written | web_form | inbound_sms | other),
 * so the "by text" branch was dead code and a real inbound STOP read "Opted
 * out to the studio" on the picker while the Directory row, the collapsed
 * roster row (R-T) and the person card read "Opted out by text, 3 Dec 2025, on
 * the Lindqvist kitchen." off the SAME record. R-Q fixes one wording
 * everywhere; a second composer beside the first can only disagree with it
 * (r4 code MAJOR-1 / QA finding 1, F-12 Pete Rusk).
 */
