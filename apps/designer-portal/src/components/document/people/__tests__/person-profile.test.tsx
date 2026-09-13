/**
 * THE PERSON CARD (W2b). Rewritten: the four role-branched documents this
 * spec tested — Style DNA, the woven journey, Engagements / Track record, the
 * team colophon — collapse into one card with silent regions (direction §4).
 *
 * What it pins is the rule those silent regions rest on (R-V / C32): a region
 * never vanishes because its record is empty. A region that vanishes reads as
 * an oversight; a region that says "none on file" reads as a fact, and the
 * studio must be able to tell the two apart at a glance.
 *
 * The last block pins the one affordance carried across from the four
 * documents: HT-8's Hours door, which lived in the deleted team renderer and
 * is the only entry point into the Hours sheet's member scope.
 */
import { fireEvent, render, screen } from "@testing-library/react";
import type { PeopleDirectoryRow, PeopleDirectorySeat } from "@patina/supabase";
import { PersonProfile } from "../views/person-profile";

const personData: { current: PeopleDirectoryRow | null } = { current: null };
const seatData: { current: PeopleDirectorySeat[] } = { current: [] };
const cardData: { current: Record<string, unknown> | null } = { current: null };
const authorityData: { current: unknown[] } = { current: [] };
/** CR3-9 — the rule row governing this person, which the composers must read. */
const rulesData: { current: unknown[] } = { current: [] };
/** QA-R9-1 — the studio's other cards, so a routed rule can name its door. */
const rolodexData: { current: unknown[] } = { current: [] };

/** The acting viewer's seat in her own studio — HT-8 gates the Hours door on it. */
let viewerStudioRole: "owner" | "admin" | "member" = "owner";

jest.mock("@patina/supabase", () => ({
  AUTHORITY_SCOPE_LABELS: {
    money: "Signs money",
    change_order: "Approves change orders",
    selections: "Selections",
  },
  // CR10-1 — the composer hangs off a FIELD seat, so the card asks which kinds
  // are field kinds before it offers "Send a text".
  isFieldRosterRole: (role: string | null) =>
    ["gc", "sub", "installer", "receiver"].includes(role ?? ""),
  usePerson: () => ({ data: personData.current, isLoading: false }),
  useStudioContact: () => ({ data: cardData.current }),
  useAffiliations: () => ({
    data: [
      {
        id: "aff-1",
        person_id: "card-dana",
        company_id: "firm-northgate",
        role_at_firm: "owner-operator",
        from_date: "2025-03-01",
        is_paperwork_contact: true,
        is_signer: true,
        holds_trade_license: true,
      },
    ],
  }),
  usePeopleSeats: () => ({ data: seatData.current }),
  useComplianceDocuments: () => ({ data: [] }),
  useComplianceState: () => ({ data: "lapsed" }),
  usePartyAuthority: () => ({ data: authorityData.current }),
  // CR-10 / QA-R2-3: the card resolves the rule, the route and the studio's
  // other cards, so "Do not contact" can say where to write instead.
  useStudioContacts: () => ({ data: rolodexData.current }),
  useContactRules: () => ({ data: rulesData.current }),
  useStudioContactChannelsFor: () => ({ data: [] }),
  // Reach & access reads these; the card's own regions are what this spec is
  // about, so each is answered with the "nothing on file" shape.
  useStudioContactChannels: () => ({ data: [] }),
  useContactRule: () => ({ data: null }),
  useOrganizationMembers: () => ({ data: [] }),
  useAccessGrants: () => ({ data: [] }),
  useChannelConsent: () => ({ data: null }),
  useRecordChannelConsent: () => ({ mutate: jest.fn(), isPending: false }),
  useSetContactRule: () => ({ mutate: jest.fn(), isPending: false }),
  // CR3-4 — the two channel writers the card grew.
  useAddStudioContactChannel: () => ({ mutate: jest.fn(), isPending: false }),
  useSetStudioContactChannelStatus: () => ({
    mutate: jest.fn(),
    isPending: false,
  }),
  ALL_CONTACT_CHANNEL_STATUSES: ["active", "bounced", "unsubscribed", "dead"],
  PERSON_CHANNEL_KINDS: ["mobile", "email"],
  COMPANY_CHANNEL_KINDS: ["office", "dispatch", "ap_email"],
  useCreateFieldLink: () => ({ mutate: jest.fn(), isPending: false }),
  useRevokeAccessGrant: () => ({ mutate: jest.fn(), isPending: false }),
  useRecordComplianceDocument: () => ({
    mutateAsync: jest.fn(),
    isPending: false,
  }),
  isAccessGrantRevokable: () => false,
  ACCESS_GRANT_NOT_REVOKABLE_SENTENCE:
    "This door is closed somewhere else in Patina, not from here.",
  ACCESS_GRANT_TIER_LABELS: { field_link: "Field link" },
  ACCESS_GRANT_TIER_OPENS: {
    field_link: "the Call Sheet and the site access card",
  },
  CONTACT_CHANNEL_KIND_LABELS: { mobile: "Mobile", email: "Email" },
  isContactChannelHeld: (s: string) => !!s && s !== "active",
  fieldLinkUrl: (token: string) => `https://patina.cloud/field/${token}`,
  ALL_COMPLIANCE_BLOCKS: ["site_access", "payment", "draw"],
  ALL_COMPLIANCE_DOC_TYPES: ["coi_gl"],
  COMPLIANCE_BLOCK_LABELS: {
    site_access: "site access",
    payment: "payment",
    draw: "the draw",
  },
  COMPLIANCE_DOC_TYPE_LABELS: { coi_gl: "COI, general liability" },
  complianceDocRequiresExpiry: () => true,
  // HT-8 — the card's "Hours" door carries the scope lens's own owner/admin
  // gate, so the branch reads the viewer's studio membership.
  useOrganizations: () => ({
    data: [
      {
        id: "studio-1",
        name: "Leah Mbeki Studio",
        type: "design_studio",
        membership: { role: viewerStudioRole, status: "active" },
      },
    ],
  }),
}));

jest.mock("../profile/maker-profile", () => ({
  MakerProfile: () => <div data-testid="maker-profile" />,
}));

jest.mock("@/lib/analytics/people-events", () => ({
  peopleEvents: {
    personCardOpened: jest.fn(),
    consentRecorded: jest.fn(),
    grantMinted: jest.fn(),
    grantRevoked: jest.fn(),
  },
}));

function person(over: Partial<PeopleDirectoryRow> = {}): PeopleDirectoryRow {
  return {
    person_id: "card-dana",
    role: "contact",
    display_name: "Dana Kowalski",
    email: "dana@northgateelectric.com",
    phone: "(612) 555-0111",
    profile_id: null,
    project_id: null,
    designer_id: null,
    status_raw: "active",
    last_touch_at: "2026-10-17T12:00:00Z",
    meta: {
      entity_kind: "person",
      contact_kind: "sub",
      company_name: "Northgate Electric",
    },
    scope: "studio",
    reach_state: "field_link",
    consent_status: "granted",
    paper_state: "lapsed",
    contact_rule_summary: null,
    seat_count: 2,
    ...over,
  } as PeopleDirectoryRow;
}

function seat(over: Partial<PeopleDirectorySeat> = {}): PeopleDirectorySeat {
  return {
    identity_key: "card-dana",
    person_id: "card-dana",
    seat_id: "seat-1",
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
    site_access_mode: "escorted",
    contracted_through: "Marrow & Sons",
    company_id: "firm-northgate",
    company_name: "Northgate Electric",
    warranty_until: null,
    warranty_contact_person_id: null,
    off_job_at: null,
    off_job_reason: null,
    show_to_client: false,
    studio_contact_id: "card-dana",
    phone_e164: "+16125550111",
    consent_status: "granted",
    reach_state: "field_link",
    paper_state: "lapsed",
    contact_rule_summary: null,
    updated_at: null,
    scope: "studio",
    ...over,
  } as PeopleDirectorySeat;
}

function renderCard(props: Record<string, unknown> = {}) {
  const onOpenSeat = jest.fn();
  render(
    <PersonProfile
      personId="card-dana"
      role="contact"
      organizationId="org-1"
      onBack={jest.fn()}
      openPerson={jest.fn()}
      openThread={jest.fn()}
      goView={jest.fn()}
      notify={jest.fn()}
      onOpenSeat={onOpenSeat}
      {...props}
    />,
  );
  return { onOpenSeat };
}

beforeEach(() => {
  personData.current = person();
  rulesData.current = [];
  rolodexData.current = [];
  seatData.current = [seat()];
  cardData.current = {
    id: "card-dana",
    is_sole_proprietor: true,
    organization_id: "org-1",
    warranty_until: null,
  };
  authorityData.current = [];
});

describe("the regions", () => {
  it("prints every region head, in order", () => {
    renderCard();
    for (const head of [
      "Reach & access",
      "Seats on projects",
      "Past seats",
      "Paper",
      "History",
    ]) {
      expect(screen.getByRole("heading", { name: head })).toBeInTheDocument();
    }
  });

  it("R-V — an absent record prints its own sentence, exactly", () => {
    seatData.current = [];
    renderCard();
    expect(screen.getByText("No contact rule on file.")).toBeInTheDocument();
    expect(screen.getByText("No grant on file.")).toBeInTheDocument();
    expect(
      screen.getByText("No open seat on this project."),
    ).toBeInTheDocument();
  });

  it("names the firm and the role at it", () => {
    renderCard();
    expect(
      screen.getByText("Northgate Electric · owner-operator, since 2025"),
    ).toBeInTheDocument();
    expect(screen.getByText("Sole proprietor")).toBeInTheDocument();
  });
});

describe("the seats beneath the human", () => {
  it("prints the seat, its stage word and its window", () => {
    renderCard();
    const line = screen.getByRole("button", {
      name: /Okonkwo residence · Subcontractor · Electrical/,
    });
    expect(line).toHaveTextContent("On the job");
    expect(line).toHaveTextContent("12 Oct 2026 to 13 Aug 2027");
  });

  it("authority prints as plain text, never as a state word", () => {
    authorityData.current = [
      { scope: "money", threshold_cents: 250000, prepares_only: false },
    ];
    const { container } = render(
      <PersonProfile
        personId="card-dana"
        role="contact"
        organizationId="org-1"
        onBack={jest.fn()}
        openPerson={jest.fn()}
        openThread={jest.fn()}
        goView={jest.fn()}
        notify={jest.fn()}
      />,
    );
    const phrase = screen.getByText("Signs money to $2,500");
    expect(phrase).toBeInTheDocument();
    expect(phrase.closest("[data-state-word]")).toBeNull();
    expect(container).toBeTruthy();
  });

  it("says so plainly when the seat carries no grant", () => {
    renderCard();
    expect(screen.getByText("No authority on this job")).toBeInTheDocument();
  });

  it("prints the seat’s own facts beside it", () => {
    renderCard();
    expect(
      screen.getByText(
        "Escorted on site · Contracted through Marrow & Sons · Hidden from the client",
      ),
    ).toBeInTheDocument();
  });

  it("folds a closed seat into Past seats, never into the live list", () => {
    seatData.current = [
      seat(),
      seat({
        seat_id: "seat-0",
        project_name: "Lindqvist kitchen",
        stage: "warranty",
        off_job_at: "2025-11-21",
        warranty_until: "2026-11-21",
      }),
    ];
    renderCard();
    const past = screen
      .getByText(/Lindqvist kitchen/)
      .closest("li") as HTMLElement;
    expect(past).toHaveTextContent("Warranty");
    expect(past).toHaveTextContent("Closed 21 Nov 2025");
    expect(past).toHaveTextContent("Warranty through 21 Nov 2026");
    // The live list still holds only the open seat.
    expect(
      screen.getByRole("button", { name: /Okonkwo residence · Subcontractor/ }),
    ).toBeInTheDocument();
  });
});

/**
 * CR11-3 — `seat_count` is `identity_seat_count()` (R-BG), the seats
 * `people_directory_seats` NESTS. Printed as a project count, a person holding
 * two seats on one job read "Worked 2 of the studio's projects."
 */
describe("the History sentence counts projects, not seats", () => {
  it("two seats on one job are one project", () => {
    personData.current = person({ seat_count: 2 });
    seatData.current = [seat(), seat({ seat_id: "seat-1b" })];
    renderCard();
    expect(
      screen.getByText(/Worked 1 of the studio's project\./),
    ).toBeInTheDocument();
  });

  it("two seats on two jobs are two projects", () => {
    personData.current = person({ seat_count: 2 });
    seatData.current = [
      seat(),
      seat({
        seat_id: "seat-2",
        project_id: "proj-lindqvist",
        project_name: "Lindqvist kitchen",
      }),
    ];
    renderCard();
    expect(
      screen.getByText(/Worked 2 of the studio's projects\./),
    ).toBeInTheDocument();
  });
});

describe("Send a text", () => {
  it("is held, with the reason beside it, when the studio holds no consent", () => {
    personData.current = person({ consent_status: "opted_out" });
    renderCard();
    const act = screen.getByRole("button", { name: "Send a text" });
    expect(act).not.toBeDisabled();
    expect(act).toHaveAttribute("aria-disabled", "true");
    const reason = document.getElementById(
      act.getAttribute("aria-describedby") as string,
    );
    expect(reason).toHaveTextContent(
      "The studio holds no standing consent for this number, so no text may go out.",
    );
  });

  it("opens the seat’s own sheet when consent stands", () => {
    const { onOpenSeat } = renderCard();
    fireEvent.click(screen.getByRole("button", { name: "Send a text" }));
    expect(onOpenSeat).toHaveBeenCalled();
  });

  /**
   * CR10-1 — AN ENABLED ACT THAT SENDS NOTHING. The composer lives on the
   * field party sheet, which only a gc / sub / installer / receiver seat
   * opens. On a client or a client_rep seat the act was held only by the
   * seed's missing consent, so recording consent made it live and inert.
   */
  it("is held, with its own sentence, when no seat is a field seat", () => {
    seatData.current = [seat({ party_kind: "client_rep", trade: null })];
    const { onOpenSeat } = renderCard();
    const act = screen.getByRole("button", { name: "Send a text" });
    expect(act).toHaveAttribute("aria-disabled", "true");
    expect(act).not.toBeDisabled();
    const reason = document.getElementById(
      act.getAttribute("aria-describedby") as string,
    );
    expect(reason).toHaveTextContent(
      "A text goes out from a seat on a job’s field crew, and this person holds none.",
    );
    fireEvent.click(act);
    expect(onOpenSeat).not.toHaveBeenCalled();
  });

  it("reaches past a non-field seat to the field seat that carries the thread", () => {
    seatData.current = [
      seat({ seat_id: "seat-client", party_kind: "client", trade: null }),
      seat({ seat_id: "seat-sub", party_kind: "sub" }),
    ];
    const { onOpenSeat } = renderCard();
    fireEvent.click(screen.getByRole("button", { name: "Send a text" }));
    expect(onOpenSeat).toHaveBeenCalledWith(
      expect.objectContaining({ seat_id: "seat-sub" }),
    );
  });

  /**
   * CR3-9 — THE RULE OUTRANKS THE GRANT (C7). Direction §2.2 lists E7's readers
   * as "every composer before consent"; this act read `consent_status` alone,
   * so a person with a recorded grant AND a "Never text" rule got a live act
   * and a live Send — exactly what PR-m's manual path and the Add sheet's
   * free-text rule can produce together.
   */
  it("is held by a 'never text' rule even where the grant stands", () => {
    rulesData.current = [
      {
        id: "rule-1",
        subject_type: "person",
        subject_id: "card-dana",
        channels_allowed: [],
        channels_forbidden: ["sms"],
        route_to_person_id: null,
        contact_hours: null,
        escalation_by_class: {},
        reason: "Never text. Office phone only.",
        set_by: null,
        set_at: "2026-10-06T00:00:00Z",
        created_at: "",
        updated_at: "",
      },
    ];
    const { onOpenSeat } = renderCard();
    const act = screen.getByRole("button", { name: "Send a text" });
    expect(act).toHaveAttribute("aria-disabled", "true");
    const reason = document.getElementById(
      act.getAttribute("aria-describedby") as string,
    );
    expect(reason).toHaveTextContent(
      "The studio’s rule for this person says never text. Change the rule above before any text goes out.",
    );
    fireEvent.click(act);
    expect(onOpenSeat).not.toHaveBeenCalled();
  });

  /**
   * QA-R9-1 — a full do-not-contact block is not "never text". Frank Bauer's
   * rule shuts every direct channel and routes the contact to Rosa Delgado;
   * the old literal named the one channel the rule does not single out and
   * dropped the only door it leaves open.
   */
  it("names a do-not-contact block, and its route, instead of 'never text'", () => {
    rolodexData.current = [
      {
        id: "card-rosa",
        entity_kind: "person",
        full_name: "Rosa Delgado",
        email: "rosa@bauer.example",
        phone: null,
      },
    ];
    rulesData.current = [
      {
        id: "rule-frank",
        subject_type: "person",
        subject_id: "card-dana",
        channels_allowed: [],
        channels_forbidden: ["sms", "mobile", "office", "email"],
        route_to_person_id: "card-rosa",
        contact_hours: null,
        escalation_by_class: {},
        reason: "No direct contact, at his request.",
        set_by: null,
        set_at: "2026-10-06T00:00:00Z",
        created_at: "",
        updated_at: "",
      },
    ];
    renderCard();
    const act = screen.getByRole("button", { name: "Send a text" });
    expect(act).toHaveAttribute("aria-disabled", "true");
    const reason = document.getElementById(
      act.getAttribute("aria-describedby") as string,
    );
    expect(reason).toHaveTextContent(
      "The studio’s rule for this person says do not contact directly. Write Rosa Delgado instead. Change the rule above before any text goes out.",
    );
  });
});

/**
 * CR3-11 — ONE LIVE REGION, and it is the Room's. This card kept its own
 * `role="status"` beside the Room's (people-room.tsx), so every consent, grant
 * and document change was announced TWICE from two live regions on one screen.
 */
describe("CR3-11 — the card announces through the Room, not beside it", () => {
  it("mounts no live region of its own", () => {
    renderCard();
    expect(screen.queryAllByRole("status")).toHaveLength(0);
  });
});

describe("the one surviving branch", () => {
  it("a maker opens the vendor’s own book", () => {
    renderCard({ role: "maker" });
    expect(screen.getByTestId("maker-profile")).toBeInTheDocument();
  });
});

describe("the Hours door on a teammate (HT-8)", () => {
  const renderTeammate = () => {
    personData.current = person({
      person_id: "party-team-1",
      role: "team",
      display_name: "Maria Obi",
      profile_id: "maria",
      status_raw: "lead_designer",
      meta: { role: "lead_designer" },
    });
    cardData.current = null;
    seatData.current = [];
    return renderCard({ personId: "party-team-1", role: "team" });
  };

  it("opens for an owner — the one door into the member scope", () => {
    viewerStudioRole = "owner";
    renderTeammate();
    expect(screen.getByRole("button", { name: "Hours" })).toBeInTheDocument();
  });

  it("is absent for a plain member, who has no lens to leave that scope by", () => {
    // The Hours sheet renders no lens, no rollup and no own rows in the member
    // scope for a viewer without the admin's instrument, so an ungated door led
    // her somewhere she could only leave by closing the sheet.
    viewerStudioRole = "member";
    renderTeammate();
    expect(
      screen.queryByRole("button", { name: "Hours" }),
    ).not.toBeInTheDocument();
    viewerStudioRole = "owner";
  });

  it("is absent on a card with no linked account, whatever the viewer", () => {
    viewerStudioRole = "owner";
    renderCard();
    expect(
      screen.queryByRole("button", { name: "Hours" }),
    ).not.toBeInTheDocument();
  });

  it("is absent on a client card with an account — the member scope is the studio’s, not the house’s", () => {
    viewerStudioRole = "owner";
    personData.current = person({
      person_id: "party-client-1",
      role: "client",
      display_name: "Adaeze Okonkwo",
      profile_id: "adaeze",
    });
    cardData.current = null;
    seatData.current = [];
    renderCard({ personId: "party-client-1", role: "client" });
    expect(
      screen.queryByRole("button", { name: "Hours" }),
    ).not.toBeInTheDocument();
  });
});
