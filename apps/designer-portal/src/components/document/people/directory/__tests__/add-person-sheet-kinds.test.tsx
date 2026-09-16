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
/** CR8-4 — the company card the sheet files for a firm typed by hand. */
const addFirmCard = jest.fn(async () => ({ id: "firm-minted" }));
/**
 * CR5-1 — what `project_recorded_studio()` answers for the picked project.
 * R-CD, amended: `data` is `undefined` in THREE states, not one — the query
 * still out (`loading`), a non-network RPC error that react-query does not
 * retry (`isError`, `fetchStatus: 'idle'`), and a fetch paused offline
 * (`fetchStatus: 'paused'`). Each of the three is "not known yet"; only a
 * resolved `null` means the job records no studio.
 */
const recordedStudio = {
  current: "org-1" as string | null,
  loading: false,
  isError: false,
  fetchStatus: "idle" as "idle" | "fetching" | "paused",
};
/** R-CD, amended: the held act's retry — pressing it asks the book again. */
const recordedStudioRefetch = jest.fn();
/**
 * F3 — the membership list the authority band's refusal is read against.
 * F-A: `undefined` there is three states too — still out, errored (react-query
 * does not retry a non-network error), or a fetch paused offline. Only a
 * resolved read is an answer about standing.
 */
const orgsState = { loading: false, isError: false };
/** F-A — the held act's retry on the standing side. */
const orgsRefetch = jest.fn();

jest.mock("@patina/supabase", () => ({
  useAddClient: () => ({ mutateAsync: jest.fn(), isPending: false }),
  useAddProjectParty: () => ({ mutateAsync: addParty, isPending: false }),
  useAddStudioContact: () => ({ mutateAsync: addFirmCard, isPending: false }),
  useAddStudioContactChannel: () => ({
    mutateAsync: addChannel,
    isPending: false,
  }),
  useFindOrCreateVendor: () => ({ mutateAsync: jest.fn(), isPending: false }),
  usePromoteToStudioContact: () => ({ mutateAsync: promote, isPending: false }),
  // CR5-1: the card is minted into the studio the seat's PROJECT records —
  // the resolver `assert_project_party_cards()` checks against — never the one
  // holding the book. `recordedStudio` lets a case say the job records none.
  useProjectRecordedStudio: () => {
    const unresolved =
      recordedStudio.loading ||
      recordedStudio.isError ||
      recordedStudio.fetchStatus === "paused";
    return {
      data: unresolved ? undefined : recordedStudio.current,
      isLoading: recordedStudio.loading,
      isError: recordedStudio.isError,
      fetchStatus: recordedStudio.fetchStatus,
      refetch: recordedStudioRefetch,
    };
  },
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
    data:
      orgsState.loading || orgsState.isError
        ? undefined
        : [
            {
              id: "org-1",
              type: "design_studio",
              // CR-12: the money scopes are an owner's or an admin's to grant,
              // and the sheet reads that off the caller's own membership.
              membership: { role: "owner" },
            },
          ],
    isLoading: orgsState.loading,
    isError: orgsState.isError,
    refetch: orgsRefetch,
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
  addFirmCard.mockReset().mockResolvedValue({ id: "firm-minted" });
  onAdded.mockReset();
  recordedStudio.current = "org-1";
  recordedStudio.loading = false;
  recordedStudio.isError = false;
  recordedStudio.fetchStatus = "idle";
  recordedStudioRefetch.mockReset().mockResolvedValue({});
  orgsState.loading = false;
  orgsState.isError = false;
  orgsRefetch.mockReset().mockResolvedValue({});
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

  /**
   * CR8-4 — a firm typed by hand is FILED, not snapshotted. It used to write
   * the name as a string with `company_id` NULL and no affiliation, so the
   * firm got no Directory row, no company card and no way ever to record its
   * COI, W-9, payee or chase — the compliance spine the company card is the
   * only writer of.
   */
  it("files a company card for a firm typed by hand, and ties the person to it", async () => {
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
    // CR5-1's rule governs the firm card too: the studio the JOB records.
    expect(addFirmCard).toHaveBeenCalledWith({
      organizationId: "org-1",
      entityKind: "company",
      contactKind: "sub",
      companyName: "Rusk Mechanical",
    });
    expect(addParty).toHaveBeenCalledWith(
      expect.objectContaining({
        companyId: "firm-minted",
        companyName: "Rusk Mechanical",
      }),
    );
    await waitFor(() =>
      expect(setAffiliation).toHaveBeenCalledWith({
        personId: "card-new",
        companyId: "firm-minted",
      }),
    );
  });

  it("matches a firm the book already holds rather than filing it twice", async () => {
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
      target: { value: "  cedar & iron framing " },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add to the roster" }));

    await waitFor(() => expect(addParty).toHaveBeenCalled());
    expect(addFirmCard).not.toHaveBeenCalled();
    expect(addParty).toHaveBeenCalledWith(
      expect.objectContaining({ companyId: "firm-cedar" }),
    );
  });

  it("files no firm card where the job records no studio", async () => {
    recordedStudio.current = null;
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
    fireEvent.click(screen.getByRole("button", { name: "Add to the roster" }));

    await waitFor(() => expect(addParty).toHaveBeenCalled());
    expect(addFirmCard).not.toHaveBeenCalled();
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
    const line = document.getElementById(
      "add-party-phone-on-file",
    ) as HTMLElement;
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
    expect(screen.queryByText(/until they reply YES/)).not.toBeInTheDocument();
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
  /**
   * CR13-7 — the door says "a household member"; the intro and the refusal
   * used to say "client rep", off the `PartyKind` the door writes. One door,
   * the studio's words (C5).
   */
  it("says the same noun in its intro and its refusal as on its door", async () => {
    openSheet();
    fireEvent.click(screen.getByRole("button", { name: "a household member" }));
    expect(document.body.textContent).toContain(
      "Add a household member to a project",
    );
    expect(document.body.textContent).not.toContain("client rep");
    fireEvent.change(screen.getByLabelText("Project"), {
      target: { value: PROJECT },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add to the roster" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "A household member needs a name.",
    );
  });

  it("takes the article its own noun takes", async () => {
    openSheet();
    fireEvent.click(screen.getByRole("button", { name: "an installer" }));
    expect(document.body.textContent).toContain(
      "Add an installer to a project",
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

/**
 * R-CD — THE ACT IS HELD WHILE THE JOB'S STUDIO IS STILL UNKNOWN.
 *
 * `recordedStudioId` is `undefined` until the query answers and `null` once it
 * answers "this job records no studio". The card-mint guard read both as
 * falsey, so a press landed during the first render wrote the seat, minted no
 * card, and printed the no-card sentence about a job that in fact keeps a
 * book. The act is held until the query resolves; only a resolved `null` takes
 * the no-card path.
 */
describe("the recorded studio, while it is still resolving", () => {
  /** The seat's fields, on a sheet that is already rendered. */
  function fillSub() {
    fireEvent.click(screen.getByRole("button", { name: "a sub" }));
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
  }

  function openSub() {
    openSheet();
    fillSub();
  }

  it("holds the act while the query is still out, and writes nothing", async () => {
    recordedStudio.loading = true;
    openSub();
    const act = screen.getByRole("button", { name: "Add to the roster" });
    expect(act).toHaveAttribute("aria-disabled", "true");
    expect(act.getAttribute("aria-describedby")).toContain(
      "add-person-recorded-studio-held",
    );
    expect(
      screen.getByText("Checking which studio keeps this job’s book."),
    ).toBeInTheDocument();

    fireEvent.click(act);
    await waitFor(() => expect(act).toHaveAttribute("aria-disabled", "true"));
    expect(addParty).not.toHaveBeenCalled();
    expect(promote).not.toHaveBeenCalled();
  });

  it("takes the no-card path on a resolved none, and says what was not kept", async () => {
    recordedStudio.current = null;
    openSub();
    const act = screen.getByRole("button", { name: "Add to the roster" });
    expect(act).not.toHaveAttribute("aria-disabled");
    fireEvent.click(act);

    await waitFor(() => expect(onAdded).toHaveBeenCalled());
    expect(promote).not.toHaveBeenCalled();
    expect(onAdded.mock.calls[0][0]).toBe(
      "Hector Salas added to Okonkwo residence. This job isn’t attached to a studio yet, so the number and the note ride on the seat, not on a card in the book.",
    );
  });

  it("mints the card into the studio the job records once it resolves", async () => {
    openSub();
    fireEvent.click(screen.getByRole("button", { name: "Add to the roster" }));

    await waitFor(() => expect(promote).toHaveBeenCalled());
    expect(promote).toHaveBeenCalledWith(
      expect.objectContaining({ organizationId: "org-1" }),
    );
    await waitFor(() =>
      expect(addChannel).toHaveBeenCalledWith(
        expect.objectContaining({
          ownerId: "card-new",
          channelKind: "mobile",
          value: "(612) 555-0119",
        }),
      ),
    );
    expect(onAdded.mock.calls[0][0]).not.toContain(
      "isn’t attached to a studio yet",
    );
  });

  /**
   * R-CD, amended (patina-merged-73) — the hold is on UNRESOLVED, not on
   * "loading". react-query.ts:180-191 turns retry off for a non-network error,
   * so an RPC failure lands `isLoading === false` with `data` still undefined:
   * the act used to release and the press wrote a seat with no card and no
   * sentence saying so.
   */
  it("holds the act when the book could not be read, and pressing it asks again", async () => {
    recordedStudio.isError = true;
    openSub();
    const act = screen.getByRole("button", { name: "Add to the roster" });
    expect(act).toHaveAttribute("aria-disabled", "true");
    expect(act.getAttribute("aria-describedby")).toContain(
      "add-person-recorded-studio-held",
    );
    expect(
      screen.getByText(
        "Couldn’t read which studio keeps this job’s book. Press again to try once more.",
      ),
    ).toBeInTheDocument();

    fireEvent.click(act);
    await waitFor(() => expect(recordedStudioRefetch).toHaveBeenCalled());
    expect(addParty).not.toHaveBeenCalled();
    expect(promote).not.toHaveBeenCalled();
  });

  /**
   * The same silence by the other road: the default `networkMode: 'online'`
   * parks an offline fetch at `fetchStatus: 'paused'`, which is neither
   * loading nor an error and leaves `data` undefined all the same.
   */
  it("holds the act while the fetch is paused offline, and writes nothing", async () => {
    recordedStudio.fetchStatus = "paused";
    openSub();
    const act = screen.getByRole("button", { name: "Add to the roster" });
    expect(act).toHaveAttribute("aria-disabled", "true");
    expect(
      screen.getByText(
        "Couldn’t read which studio keeps this job’s book. Press again to try once more.",
      ),
    ).toBeInTheDocument();

    fireEvent.click(act);
    await waitFor(() => expect(act).toHaveAttribute("aria-disabled", "true"));
    expect(addParty).not.toHaveBeenCalled();
    expect(promote).not.toHaveBeenCalled();
  });

  /** The book is a SEAT's question. A client writes no seat and no card. */
  it("never holds a client on this query", () => {
    recordedStudio.loading = true;
    openSheet();
    fireEvent.click(screen.getByRole("button", { name: "a client" }));
    const act = screen.getByRole("button", { name: "Add to the roster" });
    expect(act).not.toHaveAttribute("aria-disabled");
    expect(
      screen.queryByText("Checking which studio keeps this job’s book."),
    ).not.toBeInTheDocument();
  });

  /**
   * F3 — the same class on the standing side. `isOrgAdmin` reads the
   * membership list, so a grant asked for while that list was still out met
   * the owner/admin refusal AFTER the seat, the card, the channels and the
   * rule had been written.
   */
  it("holds the act while the studio membership behind an authority grant is still out", async () => {
    orgsState.loading = true;
    openSub();
    fireEvent.click(
      screen.getByRole("button", { name: "Record the authority" }),
    );
    fireEvent.change(screen.getByLabelText("What they may decide"), {
      target: { value: "selections" },
    });
    // A grant is only WRITTEN when a phrase or a figure was typed; without one
    // `setAuthority` is never reached and the assertion below says nothing.
    fireEvent.change(screen.getByLabelText("Authority"), {
      target: { value: "Letter of 3 March" },
    });

    const act = screen.getByRole("button", { name: "Add to the roster" });
    expect(act).toHaveAttribute("aria-disabled", "true");
    expect(act.getAttribute("aria-describedby")).toContain(
      "add-person-authority-standing-held",
    );
    expect(
      screen.getByText("Checking your standing in this job’s studio."),
    ).toBeInTheDocument();

    fireEvent.click(act);
    await waitFor(() => expect(act).toHaveAttribute("aria-disabled", "true"));
    expect(addParty).not.toHaveBeenCalled();
    expect(setAuthority).not.toHaveBeenCalled();
  });

  /**
   * F-A — an errored membership read is not an answer about standing. On
   * `isLoading` alone the act released and `isOrgAdmin` read false for a real
   * owner: the money and draw scopes rendered disabled under a notice
   * asserting a refusal nobody had read.
   */
  it("holds the act when the standing could not be read, and asserts no refusal", async () => {
    orgsState.isError = true;
    openSub();
    fireEvent.click(
      screen.getByRole("button", { name: "Record the authority" }),
    );
    fireEvent.change(screen.getByLabelText("Authority"), {
      target: { value: "Letter of 3 March" },
    });

    const act = screen.getByRole("button", { name: "Add to the roster" });
    expect(act).toHaveAttribute("aria-disabled", "true");
    expect(act.getAttribute("aria-describedby")).toContain(
      "add-person-authority-standing-held",
    );
    expect(
      screen.getByText(
        "Couldn’t read your standing in this job’s studio. Press again to try once more.",
      ),
    ).toBeInTheDocument();
    // No standing was read, so none is asserted: the scopes stay offered and
    // the owner/admin notice stays silent.
    expect(
      screen.queryByText(
        "Signing money and certifying draws are the studio owner’s or an admin’s to grant.",
      ),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("option", { name: "Signs money" }),
    ).not.toBeDisabled();

    fireEvent.click(act);
    await waitFor(() => expect(orgsRefetch).toHaveBeenCalled());
    expect(addParty).not.toHaveBeenCalled();
    expect(setAuthority).not.toHaveBeenCalled();
  });

  /** And the retry releases it: the list reads back, the owner may press. */
  it("releases the act once the standing reads back as the owner’s", async () => {
    orgsState.isError = true;
    const view = render(
      <AddPersonSheet open onClose={jest.fn()} onAdded={onAdded} />,
    );
    fillSub();
    fireEvent.click(
      screen.getByRole("button", { name: "Record the authority" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Add to the roster" }));
    await waitFor(() => expect(orgsRefetch).toHaveBeenCalled());

    orgsState.isError = false;
    view.rerender(
      <AddPersonSheet open onClose={jest.fn()} onAdded={onAdded} />,
    );

    const act = screen.getByRole("button", { name: "Add to the roster" });
    await waitFor(() => expect(act).not.toHaveAttribute("aria-disabled"));
    expect(
      screen.queryByText(
        "Couldn’t read your standing in this job’s studio. Press again to try once more.",
      ),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("option", { name: "Signs money" }),
    ).not.toBeDisabled();
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
