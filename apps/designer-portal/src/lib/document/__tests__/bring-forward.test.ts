/**
 * The picker's own sentences (SPEC §5.7, Leah task 5).
 *
 * Every string here prints on a face at both widths, so each one is pinned as
 * a literal rather than as a shape.
 */

import {
  bringForwardActLabel,
  bringForwardConsequence,
  bringForwardSelectionLine,
  countInWords,
  pickerHistoryLine,
} from "../bring-forward";
import { consentSentence } from "@/components/document/people/consent-sentence";

describe("pickerHistoryLine (PR-i)", () => {
  it("says the year the job CLOSED when the record knows it", () => {
    expect(
      pickerHistoryLine({
        projectCount: 1,
        lastProjectName: "Lindqvist kitchen",
        lastAt: "2025-05-02T00:00:00Z",
        lastClosedYear: "2025",
      }),
    ).toBe("Worked 1 prior project, Lindqvist kitchen, closed 2025.");
  });

  it("never claims a close the record does not make", () => {
    const line = pickerHistoryLine({
      projectCount: 2,
      lastProjectName: "Okonkwo residence",
      lastAt: "2026-10-13T00:00:00Z",
      lastClosedYear: null,
    });
    expect(line).toBe("Worked 2 prior projects, Okonkwo residence, 2026.");
    expect(line).not.toMatch(/closed/);
  });

  it("says so plainly when there is no history at all", () => {
    expect(pickerHistoryLine(undefined)).toBe("Never on a job yet");
    expect(pickerHistoryLine({ projectCount: 0, lastProjectName: null })).toBe(
      "Never on a job yet",
    );
  });

  it("carries no verdict, ever", () => {
    const line = pickerHistoryLine({
      projectCount: 3,
      lastProjectName: "Lindqvist kitchen",
      lastClosedYear: "2025",
    });
    expect(line).not.toMatch(/would rehire|worked out|avoid|recommend/i);
  });
});

describe("bringForwardSelectionLine (SPEC §5.7 #3)", () => {
  it("names the prior job when every row on offer came from it", () => {
    // R-BP: six is the shipped seed's real pool for that job.
    expect(bringForwardSelectionLine(4, 6, "Lindqvist kitchen")).toBe(
      "4 of 6 from the Lindqvist kitchen selected",
    );
  });

  it("names no job on a mixed page, because it would be a claim about the rest", () => {
    expect(bringForwardSelectionLine(2, 9, null)).toBe("2 of 9 selected");
  });
});

describe("bringForwardActLabel (SPEC §5.7 #6)", () => {
  it("counts in words", () => {
    expect(bringForwardActLabel(4)).toBe("Add four to the roster");
    expect(bringForwardActLabel(1)).toBe("Add one to the roster");
    // MAJOR-4: nothing ticked is an act, not a count.
    expect(bringForwardActLabel(0)).toBe("Add to the roster");
  });

  it("falls back to a numeral past the words it has", () => {
    expect(countInWords(19)).toBe("19");
  });
});

describe("bringForwardConsequence (SPEC §5.7 #7)", () => {
  it("says what the act does, who arrives refused, and which paper is down", () => {
    expect(
      bringForwardConsequence("Okonkwo residence", [
        {
          name: "Dana Kowalski",
          consent: "granted",
          firmName: "Northgate Electric",
          paperClause: "Northgate Electric’s insurance lapsed 31 March 2026.",
        },
        {
          name: "Pete Rusk",
          consent: "opted_out",
          firmName: "Rusk Mechanical",
          paperClause: null,
        },
        {
          name: "Ingrid Halvorsen",
          consent: "not_asked",
          firmName: null,
          paperClause: null,
        },
        {
          name: "Claire Bissett",
          consent: "not_asked",
          firmName: null,
          paperClause: null,
        },
      ]),
    ).toBe(
      "Adds four seats to the Okonkwo residence. Pete Rusk arrives opted out of texting. Northgate Electric’s insurance lapsed 31 March 2026.",
    );
  });

  it("says one paper once, however many of its crew were picked", () => {
    const clause = "Northgate Electric’s insurance lapsed 31 March 2026.";
    const sentence = bringForwardConsequence("Okonkwo residence", [
      {
        name: "Dana Kowalski",
        consent: "granted",
        firmName: "Northgate Electric",
        paperClause: clause,
      },
      {
        name: "Sam Vo",
        consent: "granted",
        firmName: "Northgate Electric",
        paperClause: clause,
      },
    ]);
    expect(sentence.match(/insurance lapsed/g)).toHaveLength(1);
  });

  it("speaks only for the rows still ticked", () => {
    expect(bringForwardConsequence("Okonkwo residence", [])).toBe(
      "Adds no seats to the Okonkwo residence.",
    );
  });
});

describe("the refusal the pick carries (R-Q, direction §5.2 Birth rule, F-12)", () => {
  /**
   * The picker composes this with `consentSentence`, the ONE composer (R-Q),
   * over the record's REAL `opt_out_source` — `studio_channel_consent`'s CHECK
   * admits verbal | written | web_form | inbound_sms | other and nothing else.
   * The two tests that stood here asserted against `"inbound_stop"` and
   * `"studio_recorded"`, neither of which the constraint can produce, so both
   * passed vacuously over the picker's own wrong wording (r4 code MAJOR-1).
   */
  it("says HOW the refusal arrived, and on which job", () => {
    expect(
      consentSentence({
        status: "opted_out",
        optOutSource: "inbound_sms",
        optOutAt: "2025-12-03",
        projectName: "Lindqvist kitchen",
      }),
    ).toBe("Opted out by text, 3 Dec 2025, on the Lindqvist kitchen.");
  });

  it("reads every source the record can actually hold", () => {
    const at = "2025-12-03";
    expect(
      consentSentence({ status: "opted_out", optOutSource: "verbal", optOutAt: at }),
    ).toBe("Opted out in person, 3 Dec 2025.");
    expect(
      consentSentence({ status: "opted_out", optOutSource: "written", optOutAt: at }),
    ).toBe("Opted out in writing, 3 Dec 2025.");
    expect(
      consentSentence({ status: "opted_out", optOutSource: "web_form", optOutAt: at }),
    ).toBe("Opted out on a form, 3 Dec 2025.");
    expect(
      consentSentence({ status: "opted_out", optOutSource: "other", optOutAt: at }),
    ).toBe("Opted out, 3 Dec 2025.");
  });

  it("names no job where the record names none", () => {
    expect(
      consentSentence({
        status: "opted_out",
        optOutSource: "inbound_sms",
        optOutAt: "2025-12-03",
      }),
    ).toBe("Opted out by text, 3 Dec 2025.");
  });

  it("says nothing at all where there is no date to stand on", () => {
    expect(
      consentSentence({ status: "opted_out", optOutSource: "inbound_sms", optOutAt: null }),
    ).toBeNull();
  });
});
