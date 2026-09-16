/**
 * The Directory's pure read models (W2b) — one list of two entry types.
 *
 * These are the facts the row renders and decides nothing about: which chip an
 * entry falls under, whether a paper word is owed at all, what the head counts,
 * what the ask bar matches, and which two cards share a phone.
 */

import type { PeopleDirectoryRow } from "@patina/supabase";
import type { PeopleDirectorySeat } from "@patina/supabase";
import {
  DIRECTORY_DUPLICATE_SENTENCE,
  contactRuleBlocks,
  directoryBandOf,
  directoryChipAdmits,
  directoryDuplicatePairs,
  directoryEntryCounts,
  directoryEntryKind,
  directoryEntryMatches,
  directoryHeadLine,
  directoryIdentityRows,
  directorySeatTradeIndex,
  directoryTradeAdmits,
  directoryTradeLabel,
  entryOwesPaperWord,
  entryPaperWord,
  firmIdentityLine,
  personIdentityLine,
  splitRoutedClause,
} from "@/lib/document/people-derivation";

function row(over: Partial<PeopleDirectoryRow> = {}): PeopleDirectoryRow {
  return {
    person_id: "p1",
    role: "contact",
    display_name: "Dana Kowalski",
    email: "dana@northgateelectric.com",
    phone: "(612) 555-0111",
    profile_id: null,
    project_id: null,
    designer_id: null,
    status_raw: "active",
    last_touch_at: null,
    meta: {
      entity_kind: "person",
      contact_kind: "sub",
      company_name: "Northgate Electric",
      company_id: "firm-northgate",
      specialties: ["electrical"],
    },
    scope: "studio",
    reach_state: "field_link",
    consent_status: "granted",
    paper_state: "lapsed",
    contact_rule_summary: null,
    seat_count: 1,
    ...over,
  } as PeopleDirectoryRow;
}

describe("circles and squares", () => {
  it("tells a firm from a human by entity_kind, and counts CARDS not rows", () => {
    const rows = [
      row(),
      row({ person_id: "p2", display_name: "Tom Marrow" }),
      row({
        person_id: "firm-northgate",
        display_name: "Northgate Electric",
        meta: { entity_kind: "company", contact_kind: "sub" },
      }),
    ];
    expect(directoryEntryKind(rows[0])).toBe("person");
    expect(directoryEntryKind(rows[2])).toBe("firm");
    expect(directoryEntryCounts(rows)).toEqual({ people: 2, firms: 1 });
    expect(directoryHeadLine({ people: 29, firms: 22 })).toBe(
      "29 people · 22 firms",
    );
  });

  it("says one person and one firm in the singular", () => {
    expect(directoryHeadLine({ people: 1, firms: 1 })).toBe(
      "1 person · 1 firm",
    );
  });
});

describe("the six chips", () => {
  it("sorts a card into the band its kind names", () => {
    expect(directoryBandOf(row())).toBe("crew");
    expect(directoryBandOf(row({ meta: { contact_kind: "client" } }))).toBe(
      "clients",
    );
    expect(directoryBandOf(row({ meta: { contact_kind: "team" } }))).toBe(
      "studio",
    );
    expect(directoryBandOf(row({ meta: { contact_kind: "vendor" } }))).toBe(
      "makers",
    );
    expect(
      directoryBandOf(
        row({ meta: { entity_kind: "company", contact_kind: "gc" } }),
      ),
    ).toBe("firms");
  });

  it("PR-g — a firm appears under Everyone and under the band of its crew", () => {
    const firm = row({
      person_id: "firm-northgate",
      meta: { entity_kind: "company", contact_kind: "sub" },
    });
    expect(directoryChipAdmits("everyone", firm, "crew")).toBe(true);
    expect(directoryChipAdmits("firms", firm, "crew")).toBe(true);
    expect(directoryChipAdmits("crew", firm, "crew")).toBe(true);
    expect(directoryChipAdmits("clients", firm, "crew")).toBe(false);
  });

  it("a person never answers the Firms chip", () => {
    expect(directoryChipAdmits("firms", row())).toBe(false);
  });
});

describe("R-A — who owes the studio paper", () => {
  // CR-7 / QA-2 / C18: `authority` is in this list because the seed's own
  // demonstration row — "City of Minneapolis, CPED Inspections",
  // `company_kind = contact_kind = 'authority'` — printed "NOT ON FILE"
  // while Great Northern Bank (`lender`) correctly printed nothing. The city
  // never filed insurance with a design studio.
  it.each(["lender", "inspector", "authority"])("%s prints no paper word at all", (kind) => {
    const entry = row({
      meta: { contact_kind: kind },
      paper_state: "not_on_file",
    });
    expect(entryOwesPaperWord(entry)).toBe(false);
    expect(entryPaperWord(entry)).toBeNull();
  });

  it("a sub prints the word the view reported", () => {
    expect(entryPaperWord(row())).toBe("lapsed");
  });
});

describe("the ask bar", () => {
  it("matches a name, a firm, a trade, an email and phone DIGITS", () => {
    const dana = row();
    expect(directoryEntryMatches(dana, "kowalski")).toBe(true);
    expect(directoryEntryMatches(dana, "northgate")).toBe(true);
    expect(directoryEntryMatches(dana, "electrical")).toBe(true);
    expect(directoryEntryMatches(dana, "dana@northgate")).toBe(true);
    expect(directoryEntryMatches(dana, "0111")).toBe(true);
  });

  it("needs four digits before a number is a number", () => {
    expect(directoryEntryMatches(row(), "011")).toBe(false);
  });

  it("an empty ask narrows nothing", () => {
    expect(directoryEntryMatches(row(), "   ")).toBe(true);
  });
});

describe("the row lines", () => {
  it("a person reads firm then trade", () => {
    expect(personIdentityLine(row())).toBe("Northgate Electric · electrical");
  });

  it("a firm counts its crew and its open jobs", () => {
    const firm = row({
      display_name: "Marrow & Sons",
      meta: { entity_kind: "company", contact_kind: "gc" },
    });
    // CR-6: a FIRM's kind is the company vocabulary, and SPEC §5.1 #13 fixes
    // the word as "GC" — not the party map's "General Contractor".
    expect(firmIdentityLine(firm, { crew: 3, jobs: 2 })).toBe(
      "GC · 3 on the crew · 2 open jobs",
    );
    expect(firmIdentityLine(firm, { crew: 1, jobs: 1 })).toContain(
      "1 open job",
    );
  });
});

describe("the rule clause", () => {
  it("only a forbidding rule takes the leading rule", () => {
    expect(contactRuleBlocks("Never text. Use: email.")).toBe(true);
    expect(contactRuleBlocks("Use: mobile. Hours: weekdays.")).toBe(false);
    expect(contactRuleBlocks(null)).toBe(false);
  });

  it("R-L — the routed clause is lifted out so it can carry a channel", () => {
    const { rest, routedName } = splitRoutedClause(
      "Never text. Write Rosa Delgado instead. Hours: weekdays.",
    );
    expect(routedName).toBe("Rosa Delgado");
    expect(rest).toBe("Never text. Hours: weekdays.");
  });

  it("leaves a rule with no route alone", () => {
    expect(splitRoutedClause("Never text.")).toEqual({
      rest: "Never text.",
      routedName: null,
    });
  });
});

describe("the duplicate band", () => {
  it("names two cards that share a phone, and claims nothing more", () => {
    const pairs = directoryDuplicatePairs([
      row({
        person_id: "a",
        display_name: "Adaeze Okonkwo",
        phone: "(612) 555-0104",
      }),
      row({
        person_id: "c",
        display_name: "Chidi Okonkwo",
        phone: "6125550104",
      }),
      row({ person_id: "d", display_name: "Dana Kowalski" }),
    ]);
    expect(pairs).toHaveLength(1);
    expect(pairs[0].map((p) => p.display_name)).toEqual([
      "Adaeze Okonkwo",
      "Chidi Okonkwo",
    ]);
    expect(DIRECTORY_DUPLICATE_SENTENCE).toBe("These two cards share a phone.");
  });

  // M2R-6 — W3 put an ACT on this band, and the act merges two
  // `studio_contacts` ids. Only the `contact` branch's person_id is one: a
  // `lead` row carries `leads.contact_phone` and a `team` row the teammate's
  // profile phone, so a lead or teammate the studio has since carded paired
  // with their own card and the press answered "One of these cards is no
  // longer in the book." over a row that was never a card.
  it("never pairs a row that is not a rolodex card", () => {
    for (const role of ["lead", "team", "sub", "client"]) {
      expect(
        directoryDuplicatePairs([
          row({ person_id: "card", phone: "(612) 555-0104" }),
          row({ person_id: "other", role, phone: "6125550104" }),
        ]),
      ).toHaveLength(0);
    }
    expect(
      directoryDuplicatePairs([
        row({ person_id: "card", phone: "(612) 555-0104" }),
        row({ person_id: "card-2", phone: "6125550104" }),
      ]),
    ).toHaveLength(1);
  });

  it("never pairs two firms, and never pairs on a short number", () => {
    expect(
      directoryDuplicatePairs([
        row({
          person_id: "f1",
          phone: "555",
          meta: { entity_kind: "company" },
        }),
        row({
          person_id: "f2",
          phone: "555",
          meta: { entity_kind: "company" },
        }),
      ]),
    ).toHaveLength(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Round 7
// ═══════════════════════════════════════════════════════════════════════════

function seat(over: Partial<PeopleDirectorySeat> = {}): PeopleDirectorySeat {
  return {
    identity_key: "p1",
    person_id: "p1",
    seat_id: "s1",
    project_id: "proj-okonkwo",
    project_name: "Okonkwo residence",
    project_status: "active",
    designer_id: null,
    party_kind: "sub",
    display_name: "Dana Kowalski",
    trade: "electrical",
    stage: "active",
    on_site_from: "2026-10-12",
    on_site_to: "2027-08-13",
    site_access_mode: null,
    contracted_through: null,
    company_id: "firm-northgate",
    company_name: "Northgate Electric",
    warranty_until: null,
    warranty_contact_person_id: null,
    off_job_at: null,
    off_job_reason: null,
    show_to_client: null,
    studio_contact_id: "p1",
    phone_e164: null,
    consent_status: "granted",
    reach_state: "field_link",
    paper_state: "lapsed",
    contact_rule_summary: null,
    updated_at: null,
    scope: "studio",
    ...over,
  } as PeopleDirectorySeat;
}

describe("QA-R7-1 — the trade lives on the seat", () => {
  it("prints the firm alone when nothing carries a trade", () => {
    expect(
      personIdentityLine(row({ meta: { company_name: "Northgate Electric" } })),
    ).toBe("Northgate Electric");
  });

  it("appends the seat's trade when the card carries none", () => {
    expect(
      personIdentityLine(
        row({ meta: { company_name: "Northgate Electric" } }),
        "electrical",
      ),
    ).toBe("Northgate Electric · electrical");
  });

  it("lets the card's own value outrank the seat's", () => {
    expect(personIdentityLine(row(), "plumbing")).toBe(
      "Northgate Electric · electrical",
    );
  });

  it("indexes an OPEN seat's trade over a finished one's, on both keys", () => {
    const index = directorySeatTradeIndex([
      seat({ seat_id: "s-warranty", stage: "warranty", trade: "plumbing" }),
      seat({ seat_id: "s-live", stage: "active", trade: "electrical" }),
    ]);
    expect(index.get("p1")).toBe("electrical");
  });

  it("falls back to a finished seat when nothing is open, and skips blanks", () => {
    const index = directorySeatTradeIndex([
      seat({ seat_id: "s-blank", stage: "active", trade: "  " }),
      seat({ seat_id: "s-warranty", stage: "warranty", trade: "tile" }),
    ]);
    expect(index.get("p1")).toBe("tile");
  });
});

describe("QA-R7-2 — two vocabularies, no schema words", () => {
  it("labels a maker's SPECIALTY out of the specialty list", () => {
    expect(directoryTradeLabel("tile_stone", "specialty")).toBe("Tile & stone");
    expect(
      personIdentityLine(
        row({
          display_name: "Claire Bissett",
          meta: {
            company_name: "Stonehaven Tile Gallery",
            specialties: ["tile_stone"],
          },
        }),
      ),
    ).toBe("Stonehaven Tile Gallery · tile & stone");
  });

  it("never prints a raw snake_case token, whichever list it came from", () => {
    expect(directoryTradeLabel("tile_stone")).toBe("Tile & stone");
    expect(directoryTradeLabel("radon_mitigation")).toBe("Radon mitigation");
    expect(directoryTradeLabel("chimney_sweep")).toBe("Chimney Sweep");
  });

  it("matches the ask bar on the words the row prints", () => {
    const claire = row({
      display_name: "Claire Bissett",
      meta: { specialties: ["tile_stone"] },
    });
    expect(directoryEntryMatches(claire, "tile & stone")).toBe(true);
  });
});

describe("CR8-3 — the trade chip narrows on the trade the row prints", () => {
  const dana = row({
    person_id: "card-dana",
    // 00626's contacts branch emits no `trade` key for a carded crew member.
    meta: {
      entity_kind: "person",
      contact_kind: "sub",
      company_name: "Northgate Electric",
      company_id: "firm-northgate",
    },
  });

  it("admits a carded crew member on their SEAT's trade", () => {
    expect(directoryTradeAdmits(dana, "electrical", "electrical")).toBe(true);
    expect(directoryTradeAdmits(dana, "drywall", "electrical")).toBe(false);
    // Without the seat index the chip narrowed to nothing — the defect.
    expect(directoryTradeAdmits(dana, "electrical", null)).toBe(false);
  });

  it("lets the card's own value outrank the seat, as the line does", () => {
    const claire = row({
      person_id: "card-claire",
      meta: { entity_kind: "person", specialties: ["tile_stone"] },
    });
    expect(directoryTradeAdmits(claire, "tile_stone", "drywall")).toBe(true);
    expect(directoryTradeAdmits(claire, "drywall", "drywall")).toBe(false);
  });

  it("admits everything under 'all'", () => {
    expect(directoryTradeAdmits(dana, "all", null)).toBe(true);
  });
});

describe("QA-R7-3 — a legacy designer_clients row is not a person card", () => {
  const household = row({
    person_id: "d0e80000-0000-0000-0000-000000000001",
    role: "client",
    display_name: "The Okonkwo household",
    phone: "(612) 555-0104",
    seat_count: 0,
    consent_status: null,
    paper_state: null,
    meta: {},
  });
  const adaeze = row({
    person_id: "card-adaeze",
    display_name: "Adaeze Okonkwo",
    phone: "(612) 555-0104",
    meta: { entity_kind: "person", contact_kind: "client" },
  });

  it("keeps it out of the identity list the head counts", () => {
    const rows = directoryIdentityRows([household, adaeze]);
    expect(rows.map((r) => r.display_name)).toEqual(["Adaeze Okonkwo"]);
    expect(directoryEntryCounts(rows)).toEqual({ people: 1, firms: 0 });
  });

  it("keeps it out of the duplicate-phone scan", () => {
    expect(directoryDuplicatePairs([household, adaeze])).toHaveLength(0);
  });

  /**
   * CR8-2 — the exclusion is a DUPLICATE rule, not a branch rule. A client the
   * studio holds no card for is the only record it has of that client, and
   * SPEC §3's head derivation counts Karin Lindqvist among the 29.
   */
  it("keeps a client record the studio holds no card for", () => {
    const karin = row({
      person_id: "dc-karin",
      role: "client",
      display_name: "Karin Lindqvist",
      phone: "(612) 555-0190",
      seat_count: 0,
      consent_status: null,
      paper_state: null,
      meta: {},
    });
    const rows = directoryIdentityRows([household, adaeze, karin]);
    expect(rows.map((r) => r.display_name)).toEqual([
      "Adaeze Okonkwo",
      "Karin Lindqvist",
    ]);
    expect(directoryEntryCounts(rows)).toEqual({ people: 2, firms: 0 });
  });

  it("drops a client record whose LOGIN already holds a card", () => {
    const carded = row({
      person_id: "card-ben",
      display_name: "Ben Ostrom",
      phone: null,
      profile_id: "profile-ben",
      meta: { entity_kind: "person", contact_kind: "client" },
    });
    const legacy = row({
      person_id: "dc-ben",
      role: "client",
      display_name: "Ben Ostrom",
      phone: null,
      profile_id: "profile-ben",
      meta: {},
    });
    expect(
      directoryIdentityRows([legacy, carded]).map((r) => r.person_id),
    ).toEqual(["card-ben"]);
  });

  it("still pairs the two real cards that share a number", () => {
    const chidi = row({
      person_id: "card-chidi",
      display_name: "Chidi Okonkwo",
      phone: "6125550104",
      meta: { entity_kind: "person", contact_kind: "client" },
    });
    const pairs = directoryDuplicatePairs(
      directoryIdentityRows([household, adaeze, chidi]),
    );
    expect(pairs).toHaveLength(1);
    expect(pairs[0].map((p) => p.display_name)).toEqual([
      "Adaeze Okonkwo",
      "Chidi Okonkwo",
    ]);
  });
});
