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
    expect(sentence).toContain(
      "Consent stays with the number, not with the card",
    );
    // M2R-2: paper does NOT travel. 00629 §5 moves an absorbed document only
    // where the survivor already holds a qualifying successor, so the sheet may
    // not promise the count above it moves.
    expect(sentence).toContain("Chidi Okonkwo’s paper stays on Chidi Okonkwo’s card");
    expect(sentence).toContain("the older one is marked superseded");
    expect(sentence).not.toContain("contact rule, paper and firm designations move");
    expect(sentence).toContain("both ways of reaching this person still work");
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

  it("announces the survivor and closes when the merge lands", async () => {
    const onMerged = jest.fn();
    render(<CompareMergeSheet {...props} onMerged={onMerged} />);
    fireEvent.click(
      screen.getByRole("button", { name: "Merge into Adaeze Okonkwo" }),
    );
    await waitFor(() => expect(onMerged).toHaveBeenCalled());
    expect(onMerged.mock.calls[0][0]).toBe(
      "Two cards are now one. Adaeze Okonkwo carries everything Chidi Okonkwo held.",
    );
    expect(onMerged.mock.calls[0][1]).toBe("card-adaeze");
    expect(props.onClose).toHaveBeenCalled();
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
