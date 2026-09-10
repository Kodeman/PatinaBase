/**
 * The consequence sentence, pinned to synthesis §5 #25/#26 (T1R-03 / WR-18).
 *
 * `agreementConsequenceSentence` is exported from `@patina/types` and printed
 * on two surfaces — the galley's foot and the send sheet — and `@patina/types`
 * carries no `test` script, so turbo skips the package entirely and nothing
 * asserted this sentence anywhere. It is asserted here, in the app that reads
 * it, against the fixture the synthesis composed it from.
 *
 * The pronoun is `their`, not `his`: WR-03's disposition amends synthesis §5
 * #25/#26 and SPEC §5 #25/#26 rather than the code — a name carries no gender
 * and no field supplies one.
 */

import {
  agreementConsequenceSentence,
  agreementCountWord,
  agreementPartNounPhrase,
  type AgreementPart,
} from "@patina/types";

let seq = 0;
function part(
  input: Partial<AgreementPart> & { partKey: string },
): AgreementPart {
  seq += 1;
  return {
    id: input.id ?? `part-${seq}`,
    proposalId: "agreement-1",
    position: input.position ?? seq,
    kind: input.kind ?? "clause",
    variant: input.variant ?? null,
    title: input.title ?? "Part",
    payload: input.payload ?? {},
    required: input.required ?? false,
    clientVisible: input.clientVisible ?? true,
    sourceTemplateKey: null,
    sourcePartId: null,
    updatedAt: null,
    partKey: input.partKey,
  };
}

beforeEach(() => {
  seq = 0;
});

/** Synthesis §6.2's nine, in order, as the fixture writes them. */
const okonkwo = () => [
  part({
    partKey: "patina.services",
    title: "Services",
    payload: { body: "Interior design services." },
  }),
  part({
    partKey: "patina.deliverables",
    kind: "list",
    title: "Deliverables",
    payload: { items: [{ id: "a", text: "Concept package" }] },
  }),
  part({
    partKey: "patina.exclusions",
    kind: "list",
    title: "Exclusions",
    payload: { items: [{ id: "b", text: "Construction labor" }] },
  }),
  part({
    partKey: "patina.role_rates",
    kind: "schedule",
    variant: "rate_card",
    title: "Role rates",
    payload: { roles: [] },
  }),
  part({
    partKey: "patina.retainer",
    kind: "schedule",
    variant: "retainer",
    title: "Retainer",
    payload: { cents: 500_000 },
  }),
  part({
    partKey: "patina.cadence",
    kind: "schedule",
    variant: "cadence",
    title: "Billing cadence",
    payload: { cadence: "monthly" },
  }),
  part({
    partKey: "patina.terms",
    title: "Terms",
    payload: { body: "Ownership and cancellation." },
  }),
];

describe("agreementCountWord", () => {
  it("writes one through twenty as a sentence says them", () => {
    expect(agreementCountWord(1)).toBe("one");
    expect(agreementCountWord(6)).toBe("six");
    expect(agreementCountWord(9)).toBe("nine");
    expect(agreementCountWord(20)).toBe("twenty");
  });

  it("writes the figure past twenty", () => {
    expect(agreementCountWord(21)).toBe("21");
  });
});

describe("agreementPartNounPhrase", () => {
  it("says nothing for a part nobody has written", () => {
    expect(
      agreementPartNounPhrase(
        part({ partKey: "patina.services", title: "Services", payload: {} }),
        "USD",
      ),
    ).toBeNull();
  });

  it("carries money with cents", () => {
    expect(
      agreementPartNounPhrase(
        part({
          partKey: "patina.retainer",
          kind: "schedule",
          variant: "retainer",
          title: "Retainer",
          payload: { cents: 500_000 },
        }),
        "USD",
      ),
    ).toBe("the $5,000.00 retainer");
  });

  it("keeps a flat fee's own authored title", () => {
    expect(
      agreementPartNounPhrase(
        part({
          partKey: "custom.concept",
          kind: "schedule",
          variant: "flat",
          title: "Concept fee",
          payload: { cents: 240_000 },
        }),
        "USD",
      ),
    ).toBe("the Concept fee of $2,400.00");
  });
});

describe("agreementConsequenceSentence · synthesis §5 #25", () => {
  it("names only the parts the agreement has actually written", () => {
    expect(
      agreementConsequenceSentence({
        recipientName: "Dave Okonkwo",
        parts: okonkwo(),
        currency: "USD",
      }),
    ).toBe(
      "Dave Okonkwo receives the six parts this agreement has written — " +
        "the services, the deliverables, the exclusions, the $5,000.00 retainer, " +
        "the monthly billing cadence and the terms — and their signature " +
        "preserves consent; nothing is billed and no work is authorized until " +
        "the studio countersigns.",
    );
  });

  it("adds the role rates once they are written, in position order", () => {
    const parts = okonkwo();
    parts[3]!.payload = {
      roles: [{ roleName: "Principal", hourlyRateCents: 18_500 }],
    };
    expect(
      agreementConsequenceSentence({
        recipientName: "Dave Okonkwo",
        parts,
        currency: "USD",
      }),
    ).toContain(
      "the seven parts this agreement has written — the services, the " +
        "deliverables, the exclusions, the role rates, the $5,000.00 retainer",
    );
  });

  it("never names a part the client does not receive", () => {
    const parts = okonkwo();
    parts[2]!.clientVisible = false;
    const sentence = agreementConsequenceSentence({
      recipientName: "Dave Okonkwo",
      parts,
      currency: "USD",
    });
    expect(sentence).toContain("the five parts");
    expect(sentence).not.toContain("the exclusions");
  });
});

describe("agreementConsequenceSentence · synthesis §5 #26", () => {
  it("says `The client` when no name has been linked", () => {
    expect(
      agreementConsequenceSentence({ parts: okonkwo(), currency: "USD" }),
    ).toMatch(/^The client receives the six parts/);
  });

  it("says so plainly when nothing has been written yet", () => {
    expect(
      agreementConsequenceSentence({
        recipientName: "Dave Okonkwo",
        parts: [],
        currency: "USD",
      }),
    ).toBe(
      "Dave Okonkwo receives nothing this agreement has written yet; nothing " +
        "is billed and no work is authorized until the studio countersigns.",
    );
  });
});
