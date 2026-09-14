/**
 * Compare & merge (direction §8 P2, PR-o, crm-model §4).
 *
 * What this spec holds: the older card is pre-picked and the pick FLIPS; the
 * two columns print field by field; the consequence sentence names what moves
 * and says consent does not; the terminal act calls `merge_studio_contacts`
 * with the pair the studio actually chose.
 */

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import {
  CompareMergeSheet,
  mergeConsequenceSentence,
  preferredSurvivorId,
} from "../compare-merge-sheet";

const mergeMutate = jest.fn();
const cards: Record<string, unknown> = {};

jest.mock("@patina/supabase", () => ({
  useStudioContact: (id: string | null) => ({ data: id ? cards[id] : null }),
  // r7 MAJOR-1 / B-1: the sheet resolves the firm and the three designation
  // ids through the book, the way the Directory and the picker do.
  useStudioContacts: () => ({ data: Object.values(cards) }),
  useStudioContactChannelsFor: () => ({ data: [] }),
  useContactRules: () => ({ data: [] }),
  useComplianceDocuments: () => ({ data: [] }),
  usePeopleSeats: () => ({ data: [] }),
  useMergeStudioContacts: () => ({
    mutateAsync: mergeMutate,
    isPending: false,
  }),
  ALL_MERGE_MATCHED_ON: ["profile", "phone", "email", "company_name", "manual"],
  MERGE_MATCHED_ON_LABELS: {
    profile: "They sign in with the same account",
    phone: "They share a phone number",
    email: "They share an email address",
    company_name: "Same firm, same name",
    manual: "The studio says so",
  },
}));

jest.mock("@/lib/document/contact-rule", () => ({
  contactRuleClause: () => null,
  indexContactRules: () => new Map(),
}));

const OLDER = {
  id: "card-adaeze",
  organization_id: "org-1",
  entity_kind: "person",
  company_id: null,
  contact_kind: "client",
  full_name: "Adaeze Okonkwo",
  company_name: null,
  email: "adaeze@okonkwo.example",
  phone: "(612) 555-0104",
  phone_e164: "+16125550104",
  specialties: [],
  archived_at: null,
  created_at: "2026-01-04T00:00:00.000Z",
  updated_at: "2026-01-04T00:00:00.000Z",
};

const NEWER = {
  ...OLDER,
  id: "card-chidi",
  contact_kind: "client_rep",
  full_name: "Chidi Okonkwo",
  email: "chidi@okonkwo.example",
  created_at: "2026-06-09T00:00:00.000Z",
};

const props = {
  open: true,
  onClose: jest.fn(),
  leftId: "card-adaeze",
  rightId: "card-chidi",
};

beforeEach(() => {
  mergeMutate.mockReset().mockResolvedValue("card-adaeze");
  props.onClose.mockReset();
  cards["card-adaeze"] = OLDER;
  cards["card-chidi"] = NEWER;
});

describe("preferredSurvivorId (PR-o)", () => {
  it("pre-picks the OLDER card", () => {
    expect(preferredSurvivorId(OLDER, NEWER)).toBe("card-adaeze");
    expect(preferredSurvivorId(NEWER, OLDER)).toBe("card-adaeze");
  });

  it("is stable when two cards were written the same instant", () => {
    const twin = { ...NEWER, created_at: OLDER.created_at };
    expect(preferredSurvivorId(OLDER, twin)).toBe(
      preferredSurvivorId(twin, OLDER),
    );
  });
});

describe("mergeConsequenceSentence", () => {
  it("names what moves, and says consent does not", () => {
    const sentence = mergeConsequenceSentence(
      "Adaeze Okonkwo",
      "Chidi Okonkwo",
    );
    expect(sentence).toContain("seats, channels, contact rule and firm designations");
    // r11 BLOCKING-1 — the three facts 00629 does NOT reduce by picking one.
    // The old sentence swept `trades` into "the survivor's own words stand",
    // which the UNION at 00629:1717-1724 makes false.
    expect(sentence).toContain(
      "The trades and specialties on both cards are kept together",
    );
    expect(sentence).toContain(
      "a card recorded as a sole proprietor keeps that either way",
    );
    expect(sentence).toContain(
      "the verdict, the notes and the payee facts \u2014 travels the same way",
    );
    expect(sentence).not.toContain("the verdict, the trades, the notes");
    expect(sentence).toContain(
      "Consent stays with the number, not with the card",
    );
    // r3 W3-R3-1: the paper MOVES. Leaving the remainder on the absorbed card
    // stranded it where no surface can open it, so the sheet says what the RPC
    // now does — and W3-R3-4's channel mint is stated beside it.
    expect(sentence).toContain(
      "Chidi Okonkwo’s own number and address travel with them",
    );
    expect(sentence).toContain("Chidi Okonkwo’s paper moves onto Adaeze Okonkwo too");
    expect(sentence).toContain("the older one is marked superseded");
    // MAJOR-4: the closing clause is about the ID, which is what the merge
    // record actually guarantees — never a promise about two numbers.
    expect(sentence).toContain("an old link still opens this person");
    expect(sentence).not.toContain("both ways of reaching this person still work");
  });

  // r4 B-2 — one rule row per subject, so the absorbed card's rule moves only
  // where the survivor carries none. The sentence said it moved either way.
  it("says the rule moves only where the survivor has none", () => {
    const withRule = mergeConsequenceSentence(
      "Adaeze Okonkwo",
      "Chidi Okonkwo",
      true,
    );
    expect(withRule).toContain("seats, channels and firm designations");
    expect(withRule).not.toContain(
      "seats, channels, contact rule and firm designations",
    );
    expect(withRule).toContain(
      "Adaeze Okonkwo’s own contact rule stands, and Chidi Okonkwo’s stays on the folded card as a record.",
    );
  });
});

describe("CompareMergeSheet", () => {
  it("prints the two cards field by field", () => {
    render(<CompareMergeSheet {...props} />);
    const fields = Array.from(
      document.querySelectorAll("[data-compare-field]"),
    ).map((el) => el.getAttribute("data-compare-field"));
    expect(fields).toEqual([
      "Name",
      "What they are",
      "Firm",
      "Mobile",
      "Email",
      "Contact rule",
      "Papers on file",
      "Seats on jobs",
      "In the book since",
    ]);
    expect(screen.getByText("adaeze@okonkwo.example")).toBeInTheDocument();
    expect(screen.getByText("chidi@okonkwo.example")).toBeInTheDocument();
  });

  /**
   * r5 B-1 — the studio's choice of survivor decides which of two typed
   * values the room keeps (00629 COALESCEs the survivor's own over the
   * absorbed card's), and the table printed none of them. It prints them now,
   * and only where a card actually holds one — the nine rows above are still
   * the whole table for two thin duplicate cards.
   */
  it("prints the typed facts a merge decides, where either card holds one", () => {
    cards["card-chidi"] = {
      ...NEWER,
      studio_verdict: "Good crew. Slow to send paper.",
      trades: ["framing"],
      specialties: ["millwork"],
      notes: "Ask for Pete, not the office.",
      legal_name: "Ostrom Builders LLC",
      dba_name: "Ostrom",
      remit_to: "PO Box 44, Minneapolis MN",
      retainage_bps: 1000,
      tax_id_last4: "4417",
      w9_on_file_at: "2026-08-15",
      warranty_until: "2027-09-14",
    };
    render(<CompareMergeSheet {...props} />);
    const fields = Array.from(
      document.querySelectorAll("[data-compare-field]"),
    ).map((el) => el.getAttribute("data-compare-field"));
    expect(fields).toEqual([
      "Name",
      "What they are",
      "Firm",
      "Mobile",
      "Email",
      "Contact rule",
      "Papers on file",
      "Seats on jobs",
      "In the book since",
      "Verdict",
      "Trades",
      "Specialties",
      "Notes",
      "Legal name",
      "Trading as",
      "Remit-to",
      "Retainage",
      "Tax ID",
      "W-9 on file",
      "Warranty until",
    ]);
    expect(
      screen.getByText("Good crew. Slow to send paper."),
    ).toBeInTheDocument();
    expect(screen.getByText("PO Box 44, Minneapolis MN")).toBeInTheDocument();
    expect(screen.getByText("10%")).toBeInTheDocument();
    expect(screen.getByText("14 September 2027")).toBeInTheDocument();
  });

  /**
   * r5 M-4 — 00629 refuses a merge onto a card the studio put away, because
   * every channel, document, seat and login would land where the rolodex read
   * (`includeArchived: false`) cannot reach them. The column head said only
   * "Keeps the card", so the studio could not see it coming.
   */
  it("marks a column whose card has been put away", () => {
    cards["card-adaeze"] = {
      ...OLDER,
      archived_at: "2026-05-01T00:00:00.000Z",
    };
    render(<CompareMergeSheet {...props} />);
    expect(
      document.querySelector("[data-survivor-archived=\"card-adaeze\"]"),
    ).not.toBeNull();
    expect(
      document.querySelector("[data-survivor-archived=\"card-chidi\"]"),
    ).toBeNull();
  });

  it("pre-picks the older card and lets the studio flip it (PR-o)", () => {
    render(<CompareMergeSheet {...props} />);
    const older = document.querySelector(
      '[data-survivor-pick="card-adaeze"]',
    ) as HTMLElement;
    const newer = document.querySelector(
      '[data-survivor-pick="card-chidi"]',
    ) as HTMLElement;
    expect(older).toHaveAttribute("aria-pressed", "true");
    expect(newer).toHaveAttribute("aria-pressed", "false");

    fireEvent.click(newer);
    expect(newer).toHaveAttribute("aria-pressed", "true");
    expect(older).toHaveAttribute("aria-pressed", "false");
  });

  it("names the survivor in the terminal act and in the sentence", () => {
    render(<CompareMergeSheet {...props} />);
    expect(
      screen.getByRole("button", { name: "Merge into Adaeze Okonkwo" }),
    ).toBeInTheDocument();
    expect(
      document.querySelector("[data-merge-consequence]")?.textContent,
    ).toContain("Chidi Okonkwo’s seats");
  });

  it("merges the pair the studio chose, with the evidence it named", async () => {
    render(<CompareMergeSheet {...props} />);
    fireEvent.change(
      screen.getByLabelText("What makes these the same person"),
      {
        target: { value: "email" },
      },
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Merge into Adaeze Okonkwo" }),
    );
    await waitFor(() => expect(mergeMutate).toHaveBeenCalled());
    expect(mergeMutate).toHaveBeenCalledWith({
      survivorId: "card-adaeze",
      mergedId: "card-chidi",
      matchedOn: "email",
    });
  });

  it("merges the OTHER way once the pick is flipped", async () => {
    render(<CompareMergeSheet {...props} />);
    fireEvent.click(
      document.querySelector(
        '[data-survivor-pick="card-chidi"]',
      ) as HTMLElement,
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Merge into Chidi Okonkwo" }),
    );
    await waitFor(() => expect(mergeMutate).toHaveBeenCalled());
    expect(mergeMutate).toHaveBeenCalledWith({
      survivorId: "card-chidi",
      mergedId: "card-adaeze",
      matchedOn: "phone",
    });
  });

  /**
   * r7 MAJOR-1 — `studio_contacts.company_name` on a PERSON row is 00417's
   * typed-by-hand snapshot and nothing since the affiliation model populates
   * it, so the sheet printed "—" (its own mark for "not read") where the
   * Directory, the person-card header and the picker all print the firm.
   */
  it("resolves the Firm the way the Directory and the picker do", () => {
    cards["card-adaeze"] = {
      ...OLDER,
      company_name: null,
      company_id: "firm-northgate",
    };
    cards["firm-northgate"] = {
      ...OLDER,
      id: "firm-northgate",
      entity_kind: "company",
      full_name: null,
      company_name: "Northgate Electric",
      company_id: null,
    };
    render(<CompareMergeSheet {...props} />);
    const firm = document.querySelector('[data-compare-field="Firm"]');
    expect(firm?.textContent).toContain("Northgate Electric");
  });

  /**
   * r7 B-1 — 00629 now carries the folded card's own three designations onto
   * the survivor, and the consequence sentence has always said so out loud.
   * R-BN: the sheet shows both values wherever a reduction will pick one.
   */
  it("prints the three firm designations, resolved to names", () => {
    cards["card-chidi"] = {
      ...NEWER,
      paperwork_contact_person_id: "card-tom",
      signer_person_id: "card-tom",
      site_contact_person_id: null,
    };
    cards["card-tom"] = { ...OLDER, id: "card-tom", full_name: "Tom Marrow" };
    render(<CompareMergeSheet {...props} />);
    const fields = Array.from(
      document.querySelectorAll("[data-compare-field]"),
    ).map((el) => el.getAttribute("data-compare-field"));
    expect(fields).toContain("Paperwork contact");
    expect(fields).toContain("Signer");
    // nobody holds a site contact, so the row stays off the table
    expect(fields).not.toContain("Site contact");
    expect(
      document.querySelector('[data-compare-field="Signer"]')?.textContent,
    ).toContain("Tom Marrow");
  });

  it("announces the survivor and closes when the merge lands", async () => {
    const onMerged = jest.fn();
    render(<CompareMergeSheet {...props} onMerged={onMerged} />);
    fireEvent.click(
      screen.getByRole("button", { name: "Merge into Adaeze Okonkwo" }),
    );
    await waitFor(() => expect(onMerged).toHaveBeenCalled());
    // r5 B-1 — "carries everything" was a false fact on a face: the RPC moved
    // profile_id and email and dropped the other thirteen typed columns. 00629
    // carries them all now, COALESCEd, so the sentence names the rule the
    // studio's own choice of survivor decides.
    expect(onMerged.mock.calls[0][0]).toBe(
      "Two cards are now one. Adaeze Okonkwo carries what Chidi Okonkwo held, " +
        "and where both cards said something, Adaeze Okonkwo\u2019s own words stand \u2014 " +
        "except the trades and specialties, which are kept together.",
    );
    expect(onMerged.mock.calls[0][1]).toBe("card-adaeze");
    expect(props.onClose).toHaveBeenCalled();
  });

  /**
   * r11 BLOCKING-1 — `trades`, `specialties` and `is_sole_proprietor` are
   * UNIONed / OR'd by the RPC, so the two-column table may not imply a pick
   * the survivor flip does not make.
   */
  it("marks the rows the merge keeps together rather than picks", () => {
    cards["card-adaeze"] = { ...OLDER, trades: ["electrical"] };
    cards["card-chidi"] = {
      ...NEWER,
      trades: ["plumbing"],
      specialties: ["millwork"],
      is_sole_proprietor: true,
    };
    render(<CompareMergeSheet {...props} />);
    for (const label of ["Trades", "Specialties", "Sole proprietor"]) {
      const row = document.querySelector(`[data-compare-field="${label}"]`);
      expect(row?.querySelector("[data-compare-kept]")).not.toBeNull();
    }
    expect(
      document.querySelector('[data-compare-field="Trades"] [data-compare-kept]')
        ?.textContent,
    ).toBe("both kept");
    expect(
      document.querySelector('[data-compare-field="Notes"] [data-compare-kept]'),
    ).toBeNull();
  });

  it("prints a refusal as an alert and stays open", async () => {
    mergeMutate.mockRejectedValue(
      new Error(
        "A firm and a person are different kinds of card. A firm folds into a person only where the person is recorded as a sole proprietor.",
      ),
    );
    render(<CompareMergeSheet {...props} />);
    fireEvent.click(
      screen.getByRole("button", { name: "Merge into Adaeze Okonkwo" }),
    );
    expect(await screen.findByRole("alert")).toHaveTextContent(
      /sole proprietor/,
    );
    expect(props.onClose).not.toHaveBeenCalled();
  });
});
