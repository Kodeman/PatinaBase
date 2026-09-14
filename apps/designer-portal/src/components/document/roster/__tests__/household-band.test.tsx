/**
 * The household under Client side (PR-c, PR-n, 00632).
 *
 * What this spec holds: the figure prints as a SENTENCE; only a principal may
 * edit it and the reason stands beside the act either way; "Add a household
 * member" calls `add_household_member` with the job named; and no schema word
 * reaches the face — `client_rep` is written and printed nowhere.
 */

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import {
  HouseholdBand,
  householdEmptySentence,
  householdMemberConsequence,
  householdThresholdSentence,
  parseThresholdEntry,
} from "../household-band";

const addMemberMutate = jest.fn();
const setThresholdMutate = jest.fn();
const createHouseholdMutate = jest.fn();
let household: Record<string, unknown> | null = null;
let designerClientId: string | null = "client-1";
let designerId: string | null = "designer-1";
let memberRole = "member";
let clientSideHasAuthority = false;

jest.mock("@patina/supabase", () => ({
  HOUSEHOLD_MEMBER_ROLE_LABELS: {
    client: "decides the work",
    client_rep: "signs for the household",
  },
  useProjectHousehold: () => ({
    data: {
      household,
      designerClientId,
      designerId,
      memberCardIds: ["card-adaeze"],
      clientSideHasAuthority,
    },
  }),
  useOrganizations: () => ({
    data: [{ id: "org-1", membership: { role: memberRole } }],
  }),
  useStudioContacts: () => ({
    data: [
      { id: "card-chidi", entity_kind: "person", full_name: "Chidi Okonkwo" },
      { id: "card-adaeze", entity_kind: "person", full_name: "Adaeze Okonkwo" },
      {
        id: "firm-1",
        entity_kind: "company",
        full_name: null,
        company_name: "A firm",
      },
    ],
  }),
  useAddHouseholdMember: () => ({
    mutateAsync: addMemberMutate,
    isPending: false,
  }),
  useSetHouseholdThreshold: () => ({
    mutateAsync: setThresholdMutate,
    isPending: false,
  }),
  useCreateClientHousehold: () => ({
    mutateAsync: createHouseholdMutate,
    isPending: false,
  }),
}));

const props = {
  projectId: "proj-okonkwo",
  projectName: "Okonkwo residence",
  organizationId: "org-1",
};

beforeEach(() => {
  clientSideHasAuthority = false;
  addMemberMutate.mockReset().mockResolvedValue("seat-1");
  setThresholdMutate.mockReset().mockResolvedValue({ id: "house-1" });
  createHouseholdMutate.mockReset().mockResolvedValue({ id: "house-1" });
  designerClientId = "client-1";
  designerId = "designer-1";
  memberRole = "owner";
  household = {
    id: "house-1",
    organization_id: "org-1",
    designer_id: "designer-1",
    display_name: "The Okonkwo household",
    member_person_ids: ["card-adaeze"],
    primary_member_person_id: "card-adaeze",
    co_threshold_cents: 250000,
    created_by: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
  };
});

describe("householdThresholdSentence", () => {
  it("prints the figure as a sentence, whole where whole", () => {
    expect(householdThresholdSentence(250000)).toBe(
      "Change orders over $2,500 need a signature from the household.",
    );
  });

  it("says no figure is on file rather than leaving a blank (R-V)", () => {
    expect(householdThresholdSentence(null)).toBe(
      "No change-order figure is on file for this household.",
    );
  });
});

describe("householdMemberConsequence", () => {
  it("names the money grant only for the member who signs", () => {
    expect(
      householdMemberConsequence(
        "Chidi Okonkwo",
        "client_rep",
        "Okonkwo residence",
        250000,
      ),
    ).toBe(
      // B2R-1: add_household_member() writes one grant, scope `money`, and the
      // figure is a CAP — "Signs money to $2,500" everywhere else in the
      // portal. The sentence used to promise change-order authority over the
      // figure: the wrong scope, and the limit inverted.
      "Chidi Okonkwo joins the household and takes a seat on the Okonkwo residence. They may sign money to $2,500. Nothing is sent to them.",
    );
    expect(
      householdMemberConsequence(
        "Adaeze Okonkwo",
        "client",
        "Okonkwo residence",
        250000,
      ),
    ).toBe(
      "Adaeze Okonkwo joins the household and takes a seat on the Okonkwo residence. Nothing is sent to them.",
    );
  });
});

describe("HouseholdBand", () => {
  it("prints the figure and the two acts", () => {
    render(<HouseholdBand {...props} />);
    expect(
      screen.getByText(
        "Change orders over $2,500 need a signature from the household.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Add a household member" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Set the figure" }),
    ).toBeInTheDocument();
  });

  it("adds the member on THIS job, through the one RPC", async () => {
    render(<HouseholdBand {...props} />);
    fireEvent.click(
      screen.getByRole("button", { name: "Add a household member" }),
    );
    fireEvent.change(screen.getByLabelText("Who else is in this household"), {
      target: { value: "card-chidi" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "signs for the household" }),
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Add to the household" }),
    );
    await waitFor(() => expect(addMemberMutate).toHaveBeenCalled());
    expect(addMemberMutate).toHaveBeenCalledWith({
      householdId: "house-1",
      personId: "card-chidi",
      role: "client_rep",
      projectId: "proj-okonkwo",
    });
  });

  it("names no schema word on the face (C5, SPEC §8 #3)", () => {
    render(<HouseholdBand {...props} />);
    fireEvent.click(
      screen.getByRole("button", { name: "Add a household member" }),
    );
    expect(document.body.textContent).not.toMatch(
      /client_rep|party_kind|project_parties|co_threshold_cents/,
    );
  });

  it("offers only PEOPLE as household members", () => {
    render(<HouseholdBand {...props} />);
    fireEvent.click(
      screen.getByRole("button", { name: "Add a household member" }),
    );
    const options = Array.from(
      (
        screen.getByLabelText(
          "Who else is in this household",
        ) as HTMLSelectElement
      ).options,
    ).map((o) => o.textContent);
    // The job's own client-side card leads; the rest of the book follows by name.
    expect(options).toEqual([
      "Choose someone from the book",
      "Adaeze Okonkwo",
      "Chidi Okonkwo",
    ]);
  });

  it("PR-n — holds the figure for a plain member, with the reason beside it", () => {
    memberRole = "member";
    render(<HouseholdBand {...props} />);
    const act = screen.getByRole("button", { name: "Set the figure" });
    expect(act).toHaveAttribute("aria-disabled", "true");
    expect(act).toHaveAttribute("aria-describedby", "household-figure-held");
    expect(
      screen.getByText(/The change-order figure is the principal’s to set\./),
    ).toBeInTheDocument();
    fireEvent.click(act);
    expect(setThresholdMutate).not.toHaveBeenCalled();
  });

  it("lets a principal write the figure, in cents", async () => {
    render(<HouseholdBand {...props} />);
    fireEvent.click(screen.getByRole("button", { name: "Set the figure" }));
    fireEvent.change(screen.getByLabelText("Over what figure"), {
      target: { value: "5000" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Write the figure" }));
    await waitFor(() => expect(setThresholdMutate).toHaveBeenCalled());
    expect(setThresholdMutate).toHaveBeenCalledWith({
      id: "house-1",
      coThresholdCents: 500000,
    });
  });

  it("states the absence, and offers the door, when no household is on file", () => {
    household = null;
    render(<HouseholdBand {...props} />);
    expect(
      screen.getByText(/No household is on file for this client/),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Open a household" }),
    ).toBeInTheDocument();
  });

  /**
   * QA-1 — the band may not deny what the rows above it assert. On the seeded
   * Okonkwo residence the client rows print "Okonkwo household" and "Signs
   * money to $2,500" off `project_party_authority`, and the band's bare "No
   * household is on file … nowhere to record who else may sign" stood on the
   * same screen, unqualified, contradicting them.
   */
  it("does not deny an authority the client seats already carry (QA-1)", () => {
    household = null;
    clientSideHasAuthority = true;
    render(<HouseholdBand {...props} />);
    expect(
      screen.getByText(
        "No household is on file for this client yet, so what each of them may sign is recorded seat by seat rather than in one place.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.queryByText(/there is nowhere to record who else may sign/),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Open a household" }),
    ).toBeInTheDocument();
  });

  /** r1 BLOCKING-1: the household is born holding the job's client side, or
   *  the band can never find the row it just made. */
  it("opens a household holding the job's own client-side cards", async () => {
    household = null;
    render(<HouseholdBand {...props} />);
    fireEvent.click(screen.getByRole("button", { name: "Open a household" }));
    await waitFor(() => expect(createHouseholdMutate).toHaveBeenCalled());
    expect(createHouseholdMutate.mock.calls[0][0]).toMatchObject({
      memberPersonIds: ["card-adaeze"],
    });
  });

  it("still offers the door for a no-login household (no client record)", () => {
    household = null;
    designerClientId = null;
    render(<HouseholdBand {...props} />);
    expect(
      screen.getByRole("button", { name: "Open a household" }),
    ).toBeInTheDocument();
  });

  it("offers no door where the job records no designer", () => {
    household = null;
    designerId = null;
    render(<HouseholdBand {...props} />);
    expect(
      screen.queryByRole("button", { name: "Open a household" }),
    ).not.toBeInTheDocument();
  });
});

describe("householdEmptySentence (QA-1)", () => {
  it("says there is nowhere to record it when nothing is recorded", () => {
    expect(householdEmptySentence(false)).toBe(
      "No household is on file for this client, so there is nowhere to record who else may sign.",
    );
  });

  it("acknowledges an authority the seats already carry", () => {
    expect(householdEmptySentence(true)).toBe(
      "No household is on file for this client yet, so what each of them may sign is recorded seat by seat rather than in one place.",
    );
  });
});

/**
 * r6 — A MONEY FIELD MAY NOT REVOKE AUTHORITY BY ACCIDENT (R-BO).
 *
 * Since the round-5 fix `set_household_threshold()` CLOSES every open money
 * grant the household sourced when the figure arrives NULL, so the editor's
 * old `Number.isFinite(dollars) ? … : null` turned an empty field, an `abc`
 * or a slipped `2.5.0` into the end of Chidi Okonkwo's signing authority —
 * and then announced "The change-order figure is on the record." over a band
 * re-rendering "No change-order figure is on file for this household."
 */
describe("parseThresholdEntry", () => {
  it("reads a figure, with or without the studio's own punctuation", () => {
    expect(parseThresholdEntry("5000")).toBe(500000);
    expect(parseThresholdEntry("$2,500")).toBe(250000);
    expect(parseThresholdEntry("2500.50")).toBe(250050);
  });

  it("refuses what is not a figure rather than reading it as nothing", () => {
    expect(parseThresholdEntry("")).toBeNull();
    expect(parseThresholdEntry("   ")).toBeNull();
    expect(parseThresholdEntry("abc")).toBeNull();
    expect(parseThresholdEntry("2.5.0")).toBeNull();
    expect(parseThresholdEntry("-500")).toBeNull();
  });
});

describe("the change-order figure, as an act", () => {
  it("refuses an unparsable entry and writes nothing", async () => {
    render(<HouseholdBand {...props} />);
    fireEvent.click(screen.getByRole("button", { name: "Set the figure" }));
    fireEvent.change(screen.getByLabelText("Over what figure"), {
      target: { value: "2.5.0" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Write the figure" }));
    expect(
      await screen.findByText(/Write the change-order figure in dollars/),
    ).toBeInTheDocument();
    expect(setThresholdMutate).not.toHaveBeenCalled();
  });

  it("refuses an empty field rather than taking the figure away", async () => {
    render(<HouseholdBand {...props} />);
    fireEvent.click(screen.getByRole("button", { name: "Set the figure" }));
    fireEvent.change(screen.getByLabelText("Over what figure"), {
      target: { value: "" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Write the figure" }));
    expect(
      await screen.findByText(/Write the change-order figure in dollars/),
    ).toBeInTheDocument();
    expect(setThresholdMutate).not.toHaveBeenCalled();
  });

  it("says what writing the figure will do to the members' grants", () => {
    render(<HouseholdBand {...props} />);
    fireEvent.click(screen.getByRole("button", { name: "Set the figure" }));
    fireEvent.change(screen.getByLabelText("Over what figure"), {
      target: { value: "5000" },
    });
    expect(
      screen.getByText(
        /Every household member who already signs money from this figure moves to \$5,000, on every job\./,
      ),
    ).toBeInTheDocument();
  });

  it("announces the sentence the band itself prints, never the opposite", async () => {
    const onAnnounce = jest.fn();
    render(<HouseholdBand {...props} onAnnounce={onAnnounce} />);
    fireEvent.click(screen.getByRole("button", { name: "Set the figure" }));
    fireEvent.change(screen.getByLabelText("Over what figure"), {
      target: { value: "5000" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Write the figure" }));
    await waitFor(() => expect(onAnnounce).toHaveBeenCalled());
    expect(onAnnounce).toHaveBeenCalledWith(
      "Change orders over $5,000 need a signature from the household.",
    );
  });

  it("makes taking the figure away its own two-step act (R-BO)", async () => {
    const onAnnounce = jest.fn();
    render(<HouseholdBand {...props} onAnnounce={onAnnounce} />);
    fireEvent.click(
      screen.getByRole("button", { name: "Take the figure away" }),
    );
    expect(setThresholdMutate).not.toHaveBeenCalled();
    expect(
      screen.getByText(
        /every household member's money grant of \$2,500 closes today, on every job\./,
      ),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Take it away" }));
    await waitFor(() => expect(setThresholdMutate).toHaveBeenCalled());
    expect(setThresholdMutate).toHaveBeenCalledWith({
      id: "house-1",
      coThresholdCents: null,
    });
    expect(onAnnounce).toHaveBeenCalledWith(
      "No change-order figure is on file for this household.",
    );
  });

  it("offers no way to take away a figure that is not on file", () => {
    household = {
      ...(household as Record<string, unknown>),
      co_threshold_cents: null,
    };
    render(<HouseholdBand {...props} />);
    expect(
      screen.queryByRole("button", { name: "Take the figure away" }),
    ).not.toBeInTheDocument();
  });

  it("PR-n — holds taking it away for a plain member too", () => {
    memberRole = "member";
    render(<HouseholdBand {...props} />);
    const act = screen.getByRole("button", { name: "Take the figure away" });
    expect(act).toHaveAttribute("aria-disabled", "true");
    fireEvent.click(act);
    expect(setThresholdMutate).not.toHaveBeenCalled();
  });
});
