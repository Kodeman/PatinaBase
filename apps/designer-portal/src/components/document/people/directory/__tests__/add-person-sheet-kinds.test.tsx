/**
 * THE ADD SHEET, WIDENED (W2b / SPEC §5.5).
 *
 * Eight kind words, a household member who writes a `client_rep` seat without
 * the string ever reaching a face (C5), a named other who must be named (PR-f),
 * a trade a sub cannot be added without, and the chain a seat pulls behind it:
 * the card the rule and the channels hang on (Leah task 1).
 */
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { AddPersonSheet } from "../add-person-sheet";

const addParty = jest.fn();
const promote = jest.fn();
const addChannel = jest.fn();
const setRule = jest.fn();
const setAuthority = jest.fn();
const setAffiliation = jest.fn();
/** CR5-1 — what `project_recorded_studio()` answers for the picked project. */
const recordedStudio = { current: "org-1" as string | null };

jest.mock("@patina/supabase", () => ({
  useAddClient: () => ({ mutateAsync: jest.fn(), isPending: false }),
  useAddProjectParty: () => ({ mutateAsync: addParty, isPending: false }),
  useAddStudioContactChannel: () => ({
    mutateAsync: addChannel,
    isPending: false,
  }),
  useFindOrCreateVendor: () => ({ mutateAsync: jest.fn(), isPending: false }),
  usePromoteToStudioContact: () => ({ mutateAsync: promote, isPending: false }),
  // CR5-1: the card is minted into the studio the seat's PROJECT records —
  // the resolver `assert_project_party_cards()` checks against — never the one
  // holding the book. `recordedStudio` lets a case say the job records none.
  useProjectRecordedStudio: () => ({ data: recordedStudio.current }),
  useSaveVendor: () => ({ mutateAsync: jest.fn(), isPending: false }),
  useSetContactRule: () => ({ mutateAsync: setRule, isPending: false }),
  // CR-3: the front door now records the person-to-firm tie too.
  useSetAffiliation: () => ({ mutateAsync: setAffiliation, isPending: false }),
  useSetPartyAuthority: () => ({ mutateAsync: setAuthority, isPending: false }),
  useStudioContacts: () => ({
    data: [
      {
        id: "firm-cedar",
        entity_kind: "company",
        company_name: "Cedar & Iron Framing",
      },
      // QA-R5-1: a standing person card, so the sheet can tell the studio
      // whose card a typed number already belongs to.
      {
        id: "card-dana",
        entity_kind: "person",
        full_name: "Dana Kowalski",
        phone: "(612) 555-0111",
        phone_e164: "+16125550111",
      },
    ],
  }),
  useStudioIdentity: () => ({ data: { name: "Middle West Studio" } }),
  useUpdateStudioContact: () => ({ mutateAsync: jest.fn(), isPending: false }),
  useOrganizations: () => ({
    data: [
      {
        id: "org-1",
        type: "design_studio",
        // CR-12: the money scopes are an owner's or an admin's to grant, and
        // the sheet reads that off the caller's own membership.
        membership: { role: "owner" },
      },
    ],
  }),
  peopleKeys: { all: ["people-directory"] },
  peopleSeatKeys: { all: ["people-directory-seats"] },
  ALL_AUTHORITY_SCOPES: [
    "money",
    "change_order",
    "selections",
    "schedule",
    "site_access",
    "key",
    "draw_certify",
  ],
  AUTHORITY_SCOPE_LABELS: {
    money: "Signs money",
    change_order: "Approves change orders",
    selections: "Selections",
    schedule: "Sets the schedule",
    site_access: "Controls site access",
    key: "Holds a key",
    draw_certify: "Certifies draws",
  },
  isAdminOnlyAuthorityScope: (scope: string) =>
    scope === "money" || scope === "draw_certify",
}));

// R-J's first branch reads the project's standing grants; the sheet asks for
// them through the Call Sheet's own hook (CR-16).
jest.mock("../../../roster/use-project-authority", () => ({
  useProjectAuthority: () => ({ data: {} }),
  projectAuthorityKeys: { project: () => [] },
}));

jest.mock("@/hooks/use-projects", () => ({
  useProjects: () => ({
    data: [
      { id: "11111111-1111-4111-8111-111111111111", name: "Okonkwo residence" },
    ],
  }),
}));
jest.mock("@/hooks/use-auth", () => ({
  useAuth: () => ({ user: { id: "u1" } }),
}));
jest.mock("@/hooks/use-feature-flag", () => ({
  useFeatureFlag: () => ({ value: false, isLoading: false }),
}));
jest.mock("@/lib/analytics/events", () => ({
  clientEvents: { create: jest.fn() },
}));
jest.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({ invalidateQueries: jest.fn() }),
}));

const PROJECT = "11111111-1111-4111-8111-111111111111";

/** The Room's own confirmation channel — what the studio is actually told. */
const onAdded = jest.fn();

function openSheet() {
  render(<AddPersonSheet open onClose={jest.fn()} onAdded={onAdded} />);
}

beforeEach(() => {
  addParty.mockReset().mockResolvedValue({
    id: "seat-new",
    project_id: PROJECT,
    studio_contact_id: null,
  });
  promote.mockReset().mockResolvedValue({ id: "card-new" });
  addChannel.mockReset().mockResolvedValue({});
  setRule.mockReset().mockResolvedValue({});
  setAuthority.mockReset().mockResolvedValue({});
  setAffiliation.mockReset().mockResolvedValue({});
  onAdded.mockReset();
  recordedStudio.current = "org-1";
});

describe("the kind switch", () => {
  it("offers eight words, in order, inside a labelled group", () => {
    openSheet();
    const group = screen.getByRole("group", { name: "What kind of person" });
    expect(
      within(group)
        .getAllByRole("button")
        .map((b) => b.textContent),
    ).toEqual([
      "a client",
      "a household member",
      "a maker",
      "a GC",
      "a sub",
      "an installer",
      "a receiver",
      "someone else",
    ]);
  });

  it("marks the chosen word pressed", () => {
    openSheet();
    fireEvent.click(screen.getByRole("button", { name: "a sub" }));
    expect(screen.getByRole("button", { name: "a sub" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });
});

describe("a sub", () => {
  beforeEach(() => {
    openSheet();
    fireEvent.click(screen.getByRole("button", { name: "a sub" }));
  });

  it("needs a trade — a sub with none cannot be found by the trade line", async () => {
    fireEvent.change(screen.getByLabelText("Project"), {
      target: { value: PROJECT },
    });
    fireEvent.change(screen.getByLabelText("Full name"), {
      target: { value: "Joe Wozniak" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add to the roster" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "A sub or an installer needs the trade they work in.",
    );
    expect(addParty).not.toHaveBeenCalled();
  });

  it("matches a firm the studio already keeps, rather than typing it twice", () => {
    expect(screen.getByLabelText("Company")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Company"), {
      target: { value: "firm-cedar" },
    });
    expect(screen.queryByLabelText("New company name")).not.toBeInTheDocument();
  });

  /**
   * CR-3 — THE PICKED CARD'S ID, NOT ONLY ITS NAME. The firm select stored
   * `firmId` and used it only to fill the free-text company box, so a person
   * added through the front door had NO firm identity: `directoryFirmOf` reads
   * `meta.company_id`, and `project_parties.company_id` was unwritable from the
   * portal. The rolodex half — `useSetAffiliation` — had zero call sites
   * anywhere in apps/.
   */
  it("ties the seat and the person to the firm card that was picked", async () => {
    fireEvent.change(screen.getByLabelText("Project"), {
      target: { value: PROJECT },
    });
    fireEvent.change(screen.getByLabelText("Full name"), {
      target: { value: "Pete Rusk" },
    });
    fireEvent.change(screen.getByLabelText("Trade"), {
      target: { value: "electrical" },
    });
    fireEvent.change(screen.getByLabelText("Company"), {
      target: { value: "firm-cedar" },
    });
    fireEvent.change(screen.getByLabelText("Mobile"), {
      target: { value: "(612) 555-0117" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add to the roster" }));

    await waitFor(() => expect(setAffiliation).toHaveBeenCalled());
    expect(addParty).toHaveBeenCalledWith(
      expect.objectContaining({
        companyId: "firm-cedar",
        companyName: "Cedar & Iron Framing",
      }),
    );
    expect(setAffiliation).toHaveBeenCalledWith({
      personId: "card-new",
      companyId: "firm-cedar",
    });
  });

  it("a firm typed by hand has no card yet, so no id is sent", async () => {
    fireEvent.change(screen.getByLabelText("Project"), {
      target: { value: PROJECT },
    });
    fireEvent.change(screen.getByLabelText("Full name"), {
      target: { value: "Pete Rusk" },
    });
    fireEvent.change(screen.getByLabelText("Trade"), {
      target: { value: "electrical" },
    });
    fireEvent.change(screen.getByLabelText("New company name"), {
      target: { value: "Rusk Mechanical" },
    });
    fireEvent.change(screen.getByLabelText("Mobile"), {
      target: { value: "(612) 555-0117" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add to the roster" }));

    await waitFor(() => expect(addParty).toHaveBeenCalled());
    expect(addParty).toHaveBeenCalledWith(
      expect.objectContaining({
        companyId: null,
        companyName: "Rusk Mechanical",
      }),
    );
    expect(setAffiliation).not.toHaveBeenCalled();
  });

  it("writes the seat, mints the card, files the channels and the rule", async () => {
    fireEvent.change(screen.getByLabelText("Project"), {
      target: { value: PROJECT },
    });
    fireEvent.change(screen.getByLabelText("Full name"), {
      target: { value: "Dana Kowalski" },
    });
    fireEvent.change(screen.getByLabelText("Trade"), {
      target: { value: "electrical" },
    });
    fireEvent.change(screen.getByLabelText("Mobile"), {
      target: { value: "(612) 555-0111" },
    });
    fireEvent.change(screen.getByLabelText("How to reach them"), {
      target: { value: "Text only. The email on file bounces." },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add to the roster" }));

    await waitFor(() => expect(setRule).toHaveBeenCalled());
    expect(addParty).toHaveBeenCalledWith(
      expect.objectContaining({ partyKind: "sub", trade: "electrical" }),
    );
    expect(promote).toHaveBeenCalledWith(
      expect.objectContaining({ organizationId: "org-1" }),
    );
    expect(addChannel).toHaveBeenCalledWith(
      expect.objectContaining({
        ownerId: "card-new",
        channelKind: "mobile",
        value: "(612) 555-0111",
        smsCapable: true,
      }),
    );
    expect(setRule).toHaveBeenCalledWith(
      expect.objectContaining({
        subjectType: "person",
        subjectId: "card-new",
        reason: "Text only. The email on file bounces.",
        // CR-21: NOTHING is inferred from an empty box. "Text only. The email
        // on file bounces." typed beside a blank Email field used to write a
        // rule FORBIDDING email — which is what every send gate then read.
        channelsForbidden: [],
      }),
    );
  });

  /**
   * CR5-1 (w2 r5) — the mint used the studio holding the BOOK while
   * `assert_project_party_cards()` checks the seat's card against the studio
   * the JOB records. Where the job records none, the card INSERT landed and
   * the stamp then raised `party_card_project_has_no_studio`, so a card sat in
   * the rolodex with nothing pointing at it and every retry minted another.
   */
  it("mints no card where the job records no studio, and says what was not kept", async () => {
    recordedStudio.current = null;
    fireEvent.change(screen.getByLabelText("Project"), {
      target: { value: PROJECT },
    });
    fireEvent.change(screen.getByLabelText("Full name"), {
      target: { value: "Hector Salas" },
    });
    fireEvent.change(screen.getByLabelText("Trade"), {
      target: { value: "electrical" },
    });
    fireEvent.change(screen.getByLabelText("Mobile"), {
      target: { value: "(612) 555-0119" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add to the roster" }));

    await waitFor(() => expect(onAdded).toHaveBeenCalled());
    expect(promote).not.toHaveBeenCalled();
    expect(addChannel).not.toHaveBeenCalled();
    expect(onAdded.mock.calls[0][0]).toBe(
      "Hector Salas added to Okonkwo residence. This job isn’t attached to a studio yet, so the number and the note ride on the seat, not on a card in the book.",
    );
  });

  it("the consequence sentence names the job and says what it never opens", () => {
    fireEvent.change(screen.getByLabelText("Project"), {
      target: { value: PROJECT },
    });
    fireEvent.change(screen.getByLabelText("Full name"), {
      target: { value: "Joe Wozniak" },
    });
    const sentence = document.getElementById(
      "add-party-consequence",
    ) as HTMLElement;
    expect(sentence).toHaveTextContent("Okonkwo residence Call Sheet");
    expect(sentence).toHaveTextContent(
      "It never opens billing or the agreement.",
    );
  });

  /**
   * QA-R5-1 — 00626's `apply_party_rolodex_link_trg` attaches a new seat to
   * the ONE standing person card in the studio carrying the typed number. The
   * sheet used to write and announce identically whether that card's name was
   * the name on screen or somebody else's, so an unrelated name typed against
   * a standing number silently overwrote THAT person's contact rule and
   * channel under a success line naming the person typed.
   */
  it("names whose card a typed number is already on, before the write", () => {
    fireEvent.change(screen.getByLabelText("Project"), {
      target: { value: PROJECT },
    });
    fireEvent.change(screen.getByLabelText("Full name"), {
      target: { value: "QA Collide Person" },
    });
    fireEvent.change(screen.getByLabelText("Mobile"), {
      target: { value: "(612) 555-0111" },
    });
    const line = document.getElementById("add-party-phone-on-file") as HTMLElement;
    expect(line).toHaveTextContent(
      "This number is already on file for Dana Kowalski.",
    );
    expect(line).toHaveTextContent("land on Dana Kowalski’s card");
    // The act is described by it, so the fact reaches the ear at the act too.
    expect(
      screen.getByRole("button", { name: "Add to the roster" }),
    ).toHaveAttribute(
      "aria-describedby",
      "add-party-phone-on-file add-party-consequence",
    );
  });

  it("says nothing when the number and the name are the same person", () => {
    fireEvent.change(screen.getByLabelText("Project"), {
      target: { value: PROJECT },
    });
    fireEvent.change(screen.getByLabelText("Full name"), {
      target: { value: "dana kowalski" },
    });
    fireEvent.change(screen.getByLabelText("Mobile"), {
      target: { value: "(612) 555-0111" },
    });
    expect(document.getElementById("add-party-phone-on-file")).toBeNull();
  });

  it("names the card the seat landed on in the confirmation", async () => {
    // The stamp 00626's BEFORE-INSERT auto-link wrote: a card that already
    // stood, not one this sheet minted.
    addParty.mockResolvedValue({
      id: "seat-new",
      project_id: PROJECT,
      studio_contact_id: "card-dana",
    });
    fireEvent.change(screen.getByLabelText("Project"), {
      target: { value: PROJECT },
    });
    fireEvent.change(screen.getByLabelText("Full name"), {
      target: { value: "QA Collide Person" },
    });
    fireEvent.change(screen.getByLabelText("Trade"), {
      target: { value: "electrical" },
    });
    fireEvent.change(screen.getByLabelText("Mobile"), {
      target: { value: "(612) 555-0111" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add to the roster" }));
    await waitFor(() => expect(onAdded).toHaveBeenCalled());
    expect(onAdded.mock.calls[0][0]).toBe(
      "QA Collide Person added to Okonkwo residence. That number is already on file for Dana Kowalski, so this seat and what you wrote sit on Dana Kowalski’s card.",
    );
  });

  it("adds no such clause when the card is the person typed", async () => {
    addParty.mockResolvedValue({
      id: "seat-new",
      project_id: PROJECT,
      studio_contact_id: "card-dana",
    });
    fireEvent.change(screen.getByLabelText("Project"), {
      target: { value: PROJECT },
    });
    fireEvent.change(screen.getByLabelText("Full name"), {
      target: { value: "Dana Kowalski" },
    });
    fireEvent.change(screen.getByLabelText("Trade"), {
      target: { value: "electrical" },
    });
    fireEvent.change(screen.getByLabelText("Mobile"), {
      target: { value: "(612) 555-0111" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add to the roster" }));
    await waitFor(() => expect(onAdded).toHaveBeenCalled());
    expect(onAdded.mock.calls[0][0]).toBe(
      "Dana Kowalski added to Okonkwo residence.",
    );
  });

  it("R-J — says plainly that nothing defaulted, and offers the act (CR-16)", () => {
    expect(
      screen.getByText("Nothing defaulted from the agreement."),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Record the authority" }),
    ).toBeInTheDocument();
  });

  it("says what actually happens — nothing is sent from here (CR-4)", () => {
    fireEvent.click(
      screen.getByLabelText(/They gave prior express consent for text updates/),
    );
    // R-AS took both halves off the seat INSERT, so `fc_optin_invite_dispatch`
    // no longer fires. Telling the studio to wait for a YES to a message
    // Patina never sent is a consent-adjacent falsehood.
    expect(
      screen.getByText(/Patina has not sent them anything yet\./),
    ).toBeInTheDocument();
    expect(
      screen.queryByText(/until they reply YES/),
    ).not.toBeInTheDocument();
  });

  /**
   * CR3-1 — this sheet's consent door is `record_channel_invite`, which leaves
   * a standing grant alone and otherwise records `pending`, the word every
   * face beside it prints as "Invited". Claiming consent here contradicted
   * the Directory row, the seat line and the Call Sheet row for the same
   * number. The sheet prints the record's own word.
   */
  it("CR3-1 — names the invite, never consent, on the evidence note", () => {
    fireEvent.click(
      screen.getByLabelText(/They gave prior express consent for text updates/),
    );
    expect(
      screen.getByText(/is invited, not consenting\./),
    ).toBeInTheDocument();
    expect(
      screen.queryByText(/is recorded as consenting/),
    ).not.toBeInTheDocument();
  });
});

describe("a household member (PR-c / C5)", () => {
  it("writes a client_rep seat, and the string never reaches a face", async () => {
    openSheet();
    fireEvent.click(screen.getByRole("button", { name: "a household member" }));
    expect(document.body.textContent).not.toContain("client_rep");
    fireEvent.change(screen.getByLabelText("Project"), {
      target: { value: PROJECT },
    });
    fireEvent.change(screen.getByLabelText("Full name"), {
      target: { value: "Chidi Okonkwo" },
    });
    fireEvent.change(screen.getByLabelText("Authority"), {
      target: { value: "Signs money to $2,500" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add to the roster" }));
    await waitFor(() => expect(addParty).toHaveBeenCalled());
    expect(addParty).toHaveBeenCalledWith(
      expect.objectContaining({ partyKind: "client_rep" }),
    );
    await waitFor(() =>
      expect(setAuthority).toHaveBeenCalledWith(
        expect.objectContaining({
          engagementId: "seat-new",
          scope: "change_order",
          sourceClause: "Signs money to $2,500",
        }),
      ),
    );
  });
});

describe("someone else (PR-f)", () => {
  it("must be named before the seat is written", async () => {
    openSheet();
    fireEvent.click(screen.getByRole("button", { name: "someone else" }));
    fireEvent.change(screen.getByLabelText("Project"), {
      target: { value: PROJECT },
    });
    fireEvent.change(screen.getByLabelText("Full name"), {
      target: { value: "Ray Thao" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add to the roster" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Say what they are to this job.",
    );
    expect(addParty).not.toHaveBeenCalled();
  });

  it("carries the written label onto the seat", async () => {
    openSheet();
    fireEvent.click(screen.getByRole("button", { name: "someone else" }));
    fireEvent.change(screen.getByLabelText("Project"), {
      target: { value: PROJECT },
    });
    fireEvent.change(screen.getByLabelText("Full name"), {
      target: { value: "Ray Thao" },
    });
    fireEvent.change(screen.getByLabelText("What they are to this job"), {
      target: { value: "city inspector" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add to the roster" }));
    await waitFor(() => expect(addParty).toHaveBeenCalled());
    expect(addParty).toHaveBeenCalledWith(
      expect.objectContaining({ partyKind: "other", trade: "city inspector" }),
    );
  });
});

describe("the whole sheet", () => {
  it("carries no placeholder attribute anywhere", () => {
    const { container } = render(
      <AddPersonSheet open onClose={jest.fn()} onAdded={jest.fn()} />,
    );
    expect(container.querySelectorAll("[placeholder]")).toHaveLength(0);
  });
});
