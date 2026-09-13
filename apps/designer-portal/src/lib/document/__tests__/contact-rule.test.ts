/**
 * THE CONTACT RULE, DERIVED ONCE — the W2 round-1 pins.
 *
 * Every fixture below is a row that exists in the Okonkwo dev seed
 * (`studio_contact_rules`), so the assertions are about what the room actually
 * prints for the people the SPEC names, not about invented shapes.
 */
import type { StudioContactRule } from "@patina/supabase";
import {
  contactChannelWord,
  contactRouteTarget,
  contactRuleClause,
  contactRuleForbidsSms,
  contactRuleIsDoNotContact,
  contactRuleIsHardBlock,
  indexChannelsByOwner,
  indexContactRules,
} from "../contact-rule";

const ROSA = "d0e10000-0000-0000-0000-000000000014";
const FRANK = "d0e10000-0000-0000-0000-000000000015";

function rule(over: Partial<StudioContactRule> = {}): StudioContactRule {
  return {
    id: "r",
    subject_type: "person",
    subject_id: FRANK,
    channels_allowed: [],
    channels_forbidden: [],
    route_to_person_id: null,
    contact_hours: null,
    escalation_by_class: {},
    reason: null,
    set_by: null,
    set_at: "2026-01-01T00:00:00Z",
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    ...over,
  } as StudioContactRule;
}

/** Frank Bauer, as the seed holds him. */
const FRANK_RULE = rule({
  subject_id: FRANK,
  reason:
    "No direct contact, at his request. Write Rosa Delgado; she forwards what he has to sign.",
  channels_forbidden: [
    "mobile",
    "office",
    "dispatch",
    "after_hours",
    "email",
    "ap_email",
    "sms",
  ],
  route_to_person_id: ROSA,
});

/** Ray Thao, as the seed holds him — a preference, not a wall. */
const RAY_RULE = rule({
  subject_id: "d0e10000-0000-0000-0000-000000000027",
  reason:
    "Building inspector. Never text. Inspections are scheduled through the 311 portal.",
  channels_forbidden: ["sms"],
  channels_allowed: ["office", "email", "portal_311"],
});

describe("CR-5 — no schema word reaches a face", () => {
  it("gives every channel kind a house word", () => {
    expect(contactChannelWord("after_hours")).toBe("after hours");
    expect(contactChannelWord("ap_email")).toBe("AP email");
    expect(contactChannelWord("portal_311")).toBe("the 311 portal");
    expect(contactChannelWord("sms")).toBe("text");
  });

  it("never prints a raw enum token in the mechanical clause", () => {
    const clause = contactRuleClause(
      rule({
        channels_forbidden: ["sms", "after_hours", "ap_email"],
        channels_allowed: ["portal_311"],
      }),
    );
    expect(clause).toBe(
      "Never text. Do not use: after hours, AP email. Use: the 311 portal.",
    );
    expect(clause).not.toMatch(/after_hours|ap_email|portal_311/);
  });
});

describe("CR-6 — the studio's own sentence is the clause", () => {
  it("prints the reason, not the mechanical list", () => {
    expect(contactRuleClause(FRANK_RULE)).toBe(
      "No direct contact, at his request. Write Rosa Delgado; she forwards what he has to sign.",
    );
    expect(contactRuleClause(FRANK_RULE)).not.toMatch(/Do not use:/);
  });

  it("adds the hours the studio typed, with one stop", () => {
    expect(
      contactRuleClause(
        rule({ reason: "Text only.", contact_hours: "Weekdays 08:00 to 16:00." }),
      ),
    ).toBe("Text only. Hours: Weekdays 08:00 to 16:00.");
  });

  it("prints nothing at all where the studio wrote no rule", () => {
    expect(contactRuleClause(null)).toBeNull();
    expect(contactRuleClause(rule())).toBeNull();
  });
});

/**
 * CR3-7 — the block is the rule that CLOSES THE TEXT RAIL, or leaves no direct
 * channel open at all.
 *
 * r2's "any forbidden channel" painted the 2px leading rule on F-11 Dana
 * Kowalski — `forbidden={email}`, the canonical specimen row — which SPEC §5.1
 * #8 describes with NO leading rule while #10 and #11 name one explicitly for
 * Frank Bauer and Ray Thao.
 *
 * It does not reproduce SPEC §3's fixture exactly, and no formula can: F-26
 * Carol Nyström (`block: true`) and F-10 Sam Rowe (`block: false`) carry
 * byte-for-byte identical rule rows in the seed. That residue is an
 * orchestrator ruling still owed — the fact belongs on the rule row, or the
 * fixture moves.
 */
describe("CR3-7 — a hard block closes the text rail (SPEC §5.1 #8/#10/#11)", () => {
  it("Frank Bauer is a hard block", () => {
    expect(contactRuleIsHardBlock(FRANK_RULE)).toBe(true);
  });

  it("Ray Thao wears the leading rule too — SPEC §5.1 #11 names his row", () => {
    expect(contactRuleIsHardBlock(RAY_RULE)).toBe(true);
  });

  // SPEC §5.1 #8: her row prints the clause and NO leading rule. This is the
  // row the whole deck is built around.
  it("Dana Kowalski's bounced-email rule is a preference, not a wall", () => {
    expect(
      contactRuleIsHardBlock(
        rule({
          channels_forbidden: ["email"],
          channels_allowed: [],
          reason: "Text only. The email on file bounces.",
        }),
      ),
    ).toBe(false);
  });

  // A rule that leaves no direct channel open blocks even where it never names
  // the text rail — it has already closed everything.
  it("a rule with no direct channel left open blocks without naming sms", () => {
    expect(
      contactRuleIsHardBlock(
        rule({ channels_forbidden: ["mobile", "office", "email"] }),
      ),
    ).toBe(false);
    expect(
      contactRuleIsHardBlock(
        rule({ channels_forbidden: ["mobile", "office", "email", "sms"] }),
      ),
    ).toBe(true);
  });

  it("a rule forbidding nothing is never a block", () => {
    expect(contactRuleIsHardBlock(rule({ channels_allowed: ["email"] }))).toBe(false);
  });

  it("no rule at all is never a block", () => {
    expect(contactRuleIsHardBlock(null)).toBe(false);
  });
});

/**
 * CR3-9 — the same column, asked the send gate's own question. Direction §2.2
 * lists E7's readers as "every composer before consent"; C7 rules that the rule
 * outranks the designation.
 */
describe("CR3-9 — contactRuleForbidsSms", () => {
  it("is true for a rule that names the text rail", () => {
    expect(contactRuleForbidsSms(RAY_RULE)).toBe(true);
    expect(contactRuleForbidsSms(FRANK_RULE)).toBe(true);
  });

  it("is false for a rule that bars only the email", () => {
    expect(
      contactRuleForbidsSms(rule({ channels_forbidden: ["email"] })),
    ).toBe(false);
  });

  it("is false where there is no rule at all", () => {
    expect(contactRuleForbidsSms(null)).toBe(false);
    expect(contactRuleForbidsSms(undefined)).toBe(false);
  });
});

describe("CR-4 — 'do not contact' is the separate, narrower state", () => {
  it("Frank Bauer has no direct channel left open", () => {
    expect(contactRuleIsDoNotContact(FRANK_RULE)).toBe(true);
  });

  it("Ray Thao keeps office and email, so he is reachable", () => {
    expect(contactRuleIsDoNotContact(RAY_RULE)).toBe(false);
  });

  it("Dana Kowalski's text-only rule is a preference, not a wall", () => {
    expect(
      contactRuleIsDoNotContact(
        rule({
          channels_forbidden: ["email"],
          reason: "Text only. The email on file bounces.",
        }),
      ),
    ).toBe(false);
  });

  it("forbidding nothing is never do-not-contact", () => {
    expect(contactRuleIsDoNotContact(rule())).toBe(false);
  });
});

describe("CR-14 / QA-4 — a routed rule carries a way to reach the routed person", () => {
  const people = new Map([
    [
      ROSA,
      {
        id: ROSA,
        name: "Rosa Delgado",
        email: "rosa@twin-cities-drywall-plaster.com",
        phone: "(612) 555-0114",
      },
    ],
  ]);

  it("resolves the routed person's email and office phone", () => {
    expect(contactRouteTarget(FRANK_RULE, people)).toEqual({
      name: "Rosa Delgado",
      email: "rosa@twin-cities-drywall-plaster.com",
      officePhone: "(612) 555-0114",
    });
  });

  it("prefers the TYPED office channel over the card's phone column (R-L)", () => {
    const channels = indexChannelsByOwner([
      {
        id: "c1",
        owner_type: "person",
        owner_id: ROSA,
        channel_kind: "office",
        value: "(612) 555-0199",
        label: null,
        sms_capable: false,
        verified: true,
        verified_at: null,
        preferred: false,
        status: "active",
        status_at: null,
        created_by: null,
        created_at: "",
        updated_at: "",
      },
    ]);
    expect(contactRouteTarget(FRANK_RULE, people, channels)?.officePhone).toBe(
      "(612) 555-0199",
    );
  });

  it("routes nowhere when the rule names nobody", () => {
    expect(contactRouteTarget(RAY_RULE, people)).toBeNull();
  });
});

describe("the rule index", () => {
  it("keys a rule by the subject it sits on", () => {
    const index = indexContactRules([FRANK_RULE, RAY_RULE]);
    expect(index.get(FRANK)).toBe(FRANK_RULE);
    expect(index.get("nobody")).toBeUndefined();
  });
});
