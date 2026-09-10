/**
 * The readiness voice — synthesis §5's five sentences, and the rule that the
 * region is never empty and never wrong.
 *
 * It counts THINGS TO FINISH, not parts: two blockers filed against one part
 * are two things, and one blocker filed against a pair is one.
 */

import { composeReadinessSentence } from "../galley/readiness-voice";
import type { AgreementReadiness } from "../readiness";

const readiness = (
  blockers: AgreementReadiness["blockers"],
): AgreementReadiness => ({
  ready: blockers.length === 0,
  blockers,
  notes: [],
});

const FEE = {
  partId: null,
  message:
    "This agreement names no fee. Add a rate card, a flat fee, or a per-phase fee.",
  ask: "name a fee",
  cleared: "Role rates name the fee",
};
const CEILING = {
  partId: null,
  message:
    "An agreement that bills hourly needs a ceiling. Add a Ceiling part, or remove the role rates.",
  ask: "name a ceiling",
};
const CLIENT = {
  partId: null,
  message: "Link a client with an email address.",
  ask: "link a client",
};

describe("composeReadinessSentence", () => {
  it("says nothing is left when nothing is", () => {
    expect(composeReadinessSentence(readiness([]), null)).toBe(
      "Nothing left to finish.",
    );
  });

  it("names one thing", () => {
    expect(composeReadinessSentence(readiness([FEE]), null)).toBe(
      "One thing before this can go: name a fee.",
    );
  });

  it("counts two in words, and names both", () => {
    expect(composeReadinessSentence(readiness([FEE, CLIENT]), null)).toBe(
      "Two things before this can go: name a fee; link a client.",
    );
  });

  // LH-10 — the sentence that just cleared is replaced, never dropped with
  // nothing in its place.
  it("says what cleared when the count moves", () => {
    expect(
      composeReadinessSentence(readiness([CEILING]), readiness([FEE])),
    ).toBe("Role rates name the fee. One thing left: name a ceiling.");
  });

  it("keeps the plain form when the thing that went names no clearing", () => {
    expect(
      composeReadinessSentence(readiness([FEE]), readiness([FEE, CEILING])),
    ).toBe("One thing before this can go: name a fee.");
  });

  // §A10 — an uncoded blocker still says something true.
  it("falls back to a blocker's own sentence when it carries no ask", () => {
    expect(
      composeReadinessSentence(
        readiness([{ partId: "p1", message: "Name this part." }]),
        null,
      ),
    ).toBe("One thing before this can go: Name this part.");
  });

  it("counts things to finish, not parts", () => {
    const two = readiness([
      { partId: "p1", message: "Name this part.", ask: "name the part" },
      { partId: "p1", message: "Write Services.", ask: "write Services" },
    ]);
    expect(composeReadinessSentence(two, null)).toBe(
      "Two things before this can go: name the part; write Services.",
    );
  });

  it("counts one thing filed against a pair of parts once", () => {
    const pair = readiness([
      { partId: "p1", message: "An agreement carries only one ceiling." },
      { partId: "p2", message: "An agreement carries only one ceiling." },
    ]);
    expect(composeReadinessSentence(pair, null)).toBe(
      "One thing before this can go: An agreement carries only one ceiling.",
    );
  });
});
