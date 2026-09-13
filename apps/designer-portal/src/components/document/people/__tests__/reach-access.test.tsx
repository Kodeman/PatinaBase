/**
 * REACH & ACCESS (W2b) — the one control, three fixed sections, and the rules
 * that make consent readable: one sentence everywhere (R-Q), a held channel
 * keeps its row with its reason in words, and a grant's end date prints in
 * words rather than as a countdown (PR-d).
 */
import { fireEvent, render, screen, within } from "@testing-library/react";
import {
  ReachAccess,
  channelRowParts,
  heldChannelReason,
  isPhoneChannel,
  mintConsequenceSentence,
  MINT_CLIENT_SIDE_SENTENCE,
  NO_RULE_SENTENCE,
  REACH_EMPTY_SENTENCE,
} from "../reach-access";
import {
  consentSentence,
  consentSentenceForRecord,
} from "../consent-sentence";
import { grantEndsSentence, NO_GRANT_SENTENCE } from "../access-grant-list";

const channelsData: { current: unknown[] } = { current: [] };
const grantsData: { current: unknown[] } = { current: [] };
const ruleData: { current: Record<string, unknown> | null } = { current: null };
const consentData: { current: Record<string, unknown> | null } = {
  current: null,
};
/** CR-8: the studio roster `set_by` is resolved against. */
const studioMembers: { current: unknown[] } = { current: [] };
const recordConsent = jest.fn();
const recordReconsent = jest.fn();
const mintLink = jest.fn();
// CR3-4 — the two writers the card grew: "Add a channel" (direction §3.2 R2)
// and the per-row held status (§5.1). Both had ZERO call sites before this.
const addChannel = jest.fn();
const setChannelStatus = jest.fn();

jest.mock("@patina/supabase", () => ({
  useStudioContactChannels: () => ({ data: channelsData.current }),
  useContactRule: () => ({ data: ruleData.current }),
  // CR-8: the rule's provenance needs the studio's roster to name its setter.
  useOrganizationMembers: () => ({ data: studioMembers.current }),
  useAccessGrants: () => ({ data: grantsData.current }),
  useChannelConsent: () => ({ data: consentData.current }),
  useRecordChannelConsent: () => ({ mutate: recordConsent, isPending: false }),
  // PR-m / CR-25 — the way back from a refusal the studio may record itself.
  useRecordChannelReconsent: () => ({ mutate: recordReconsent, isPending: false }),
  useSetContactRule: () => ({ mutate: jest.fn(), isPending: false }),
  useAddStudioContactChannel: () => ({ mutate: addChannel, isPending: false }),
  useSetStudioContactChannelStatus: () => ({
    mutate: setChannelStatus,
    isPending: false,
  }),
  ALL_CONTACT_CHANNEL_STATUSES: ["active", "bounced", "unsubscribed", "dead"],
  PERSON_CHANNEL_KINDS: ["mobile", "email"],
  COMPANY_CHANNEL_KINDS: ["office", "dispatch", "ap_email"],
  useCreateFieldLink: () => ({ mutate: mintLink, isPending: false }),
  useRevokeAccessGrant: () => ({ mutate: jest.fn(), isPending: false }),
  isAccessGrantRevokable: (tier: string) =>
    tier === "field_link" || tier === "project_review",
  // CR5-2: the row asks the routing table what a revoke actually closes and
  // whether the RPC demands a reason.
  accessGrantRevokeRoute: (tier: string) =>
    tier === "field_link"
      ? { rpc: "revoke_field_link", idArg: "p_token_id", keySegment: 1 }
      : tier === "project_review"
        ? {
            rpc: "revoke_project_review_access",
            idArg: "p_edition_id",
            reasonArg: "p_reason",
            reasonRequired: true,
            revokesWholeScope: true,
            keySegment: 1,
          }
        : null,
  ACCESS_GRANT_NOT_REVOKABLE_SENTENCE:
    "This door is closed somewhere else in Patina, not from here.",
  ACCESS_GRANT_TIER_LABELS: {
    field_link: "Field link",
    project_review: "Review access",
    // CR7-2 — the one tier keyed on a FIRM (`subject_type = 'contact'`).
    agreement_link: "Agreement link",
  },
  ACCESS_GRANT_TIER_OPENS: {
    field_link: "the Call Sheet and the site access card",
    project_review: "one review edition",
    agreement_link: "one trade agreement",
  },
  CONTACT_CHANNEL_KIND_LABELS: { mobile: "Mobile", email: "Email" },
  isContactChannelHeld: (s: string) => !!s && s !== "active",
  fieldLinkUrl: (token: string) => `https://patina.cloud/field/${token}`,
}));

/** CR-9: the channel row resolves a consent record's ORIGIN job by name. */
const projectsData: { current: unknown[] } = { current: [] };
jest.mock("@/hooks/use-projects", () => ({
  useProjects: () => ({ data: projectsData.current }),
}));

jest.mock("@/lib/analytics/people-events", () => ({
  peopleEvents: {
    consentRecorded: jest.fn(),
    grantMinted: jest.fn(),
    grantRevoked: jest.fn(),
  },
}));

const NOW = new Date("2026-10-20T00:00:00Z");

/** The mint prop when a case names one, else the seat prop it mirrors. */
function pick(
  props: Record<string, unknown>,
  mintKey: string,
  seatKey: string,
): string | null {
  const key = mintKey in props ? mintKey : seatKey;
  return (props[key] ?? null) as string | null;
}

function renderReach(over: Record<string, unknown> = {}) {
  // QA-R11-1: a field link is minted on a FIELD seat, which the card resolves
  // separately from the identity's first live seat. Dana Kowalski is a sub, so
  // the two are the same seat here unless a case overrides the mint props.
  const props: Record<string, unknown> = {
    seatId: "seat-1",
    seatProjectId: "proj-okonkwo",
    seatProjectName: "Okonkwo residence",
    seatWindowEnd: "2027-08-13",
    warrantyEnd: null,
    ...over,
  };
  render(
    <ReachAccess
      cardId="card-dana"
      cardKind="person"
      organizationId="org-1"
      personName="Dana Kowalski"
      {...(props as never)}
      mintSeatId={pick(props, "mintSeatId", "seatId")}
      mintProjectId={pick(props, "mintProjectId", "seatProjectId")}
      mintProjectName={pick(props, "mintProjectName", "seatProjectName")}
      mintWindowEnd={pick(props, "mintWindowEnd", "seatWindowEnd")}
      onAnnounce={jest.fn()}
      now={NOW}
    />,
  );
}

beforeEach(() => {
  channelsData.current = [];
  grantsData.current = [];
  ruleData.current = null;
  consentData.current = null;
  studioMembers.current = [];
  projectsData.current = [];
  recordConsent.mockClear();
  mintLink.mockClear();
  addChannel.mockClear();
  setChannelStatus.mockClear();
});

describe("the three sections", () => {
  it("prints them in this order: Channels, Contact rule, Access grants", () => {
    renderReach();
    const heads = screen.getAllByRole("heading").map((h) => h.textContent);
    expect(heads).toEqual(["Channels", "Contact rule", "Access grants"]);
  });

  it("says so in words when nothing is on file", () => {
    renderReach();
    expect(screen.getByText(REACH_EMPTY_SENTENCE)).toBeInTheDocument();
    expect(screen.getByText(NO_RULE_SENTENCE)).toBeInTheDocument();
    expect(screen.getByText(NO_GRANT_SENTENCE)).toBeInTheDocument();
  });

  // QA-R4-3 — direction §5.1: "Company variant: … Contact rule is replaced by
  // three designations". The firm card printed the heading, the fallback and a
  // LIVE "Edit the rule" whose save wrote a `subject_type = 'company'` row no
  // reader in this build ever queries.
  it("gives a COMPANY card no contact rule region at all", () => {
    renderReach({ cardKind: "company", personName: "Northgate Electric" });
    const heads = screen.getAllByRole("heading").map((h) => h.textContent);
    expect(heads).toEqual(["Channels", "Access grants"]);
    expect(screen.queryByText(NO_RULE_SENTENCE)).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /Edit the rule/ }),
    ).not.toBeInTheDocument();
  });
});

describe("a channel row", () => {
  beforeEach(() => {
    channelsData.current = [
      {
        id: "ch-1",
        owner_type: "person",
        owner_id: "card-dana",
        channel_kind: "mobile",
        value: "(612) 555-0111",
        preferred: true,
        verified: true,
        verified_at: "2026-10-12T00:00:00Z",
        status: "active",
        status_at: null,
        sms_capable: true,
      },
    ];
  });

  it("prints its kind, its markers, its number as a tel: link and its consent word", () => {
    consentData.current = {
      verdict: "granted",
      record: {
        status: "granted",
        source: "written",
        consented_at: "2025-05-02",
        opt_out_at: null,
        opt_out_source: null,
      },
    };
    renderReach();
    expect(
      screen.getByText("Mobile · preferred · verified 12 Oct 2026"),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "(612) 555-0111" }),
    ).toHaveAttribute("href", "tel:+16125550111");
    expect(screen.getByText("Texting")).toBeInTheDocument();
  });

  /**
   * QA-4 (w2 r5) — the Directory row printed "(612) 555-0111" and this row,
   * two clicks away on the same person, printed "+16125550111", because a
   * channel's value is commonly stored in E.164. The stored value still dials.
   */
  it("prints a number stored in E.164 in the same shape the Directory row uses", () => {
    channelsData.current = [
      { ...channelsData.current[0], id: "ch-e164", value: "+16125550111" },
    ];
    renderReach();
    expect(
      screen.getByRole("link", { name: "(612) 555-0111" }),
    ).toHaveAttribute("href", "tel:+16125550111");
  });

  it("R-Q — the consent sentence reads the one wording, with source, date and job", () => {
    consentData.current = {
      verdict: "granted",
      record: {
        status: "granted",
        source: "written",
        consented_at: "2025-05-02",
        opt_out_at: null,
        opt_out_source: null,
      },
    };
    renderReach({ seatProjectName: "Lindqvist kitchen" });
    expect(
      screen.getByText(
        "Written consent, 2 May 2025, on the Lindqvist kitchen.",
      ),
    ).toBeInTheDocument();
  });

  /**
   * CR-9 — SPEC §5.2 #4 IS TWO SENTENCES. The first names the job the consent
   * came FROM (`origin_project_id`), the second where it landed; the card used
   * to print only the first, and named the SEAT's job in it rather than the
   * record's own.
   */
  it("R-Q + CR-9 — the origin job in the first sentence, the carry-forward in the second", () => {
    consentData.current = {
      verdict: "granted",
      record: {
        status: "granted",
        source: "written",
        consented_at: "2025-05-02",
        opt_out_at: null,
        opt_out_source: null,
        origin_project_id: "proj-lindqvist",
      },
    };
    projectsData.current = [
      { id: "proj-lindqvist", name: "Lindqvist kitchen" },
      { id: "proj-okonkwo", name: "Okonkwo residence" },
    ];
    renderReach({ seatWindowStart: "2026-10-12" });
    expect(
      screen.getByText(
        "Written consent, 2 May 2025, on the Lindqvist kitchen. Carried forward to the Okonkwo residence, 12 Oct 2026.",
      ),
    ).toBeInTheDocument();
  });

  it("CR-9 — a consent recorded on the job in hand has been carried nowhere", () => {
    consentData.current = {
      verdict: "granted",
      record: {
        status: "granted",
        source: "written",
        consented_at: "2026-10-12",
        opt_out_at: null,
        opt_out_source: null,
        origin_project_id: "proj-okonkwo",
      },
    };
    projectsData.current = [{ id: "proj-okonkwo", name: "Okonkwo residence" }];
    renderReach({ seatWindowStart: "2026-10-12" });
    expect(screen.queryByText(/Carried forward/)).not.toBeInTheDocument();
  });

  it("prints NO consent word where the studio holds no record (R-BB)", () => {
    consentData.current = { verdict: null, record: null };
    const { container } = render(
      <ReachAccess
        cardId="card-dana"
        cardKind="person"
        organizationId="org-1"
        personName="Dana Kowalski"
        onAnnounce={jest.fn()}
        now={NOW}
      />,
    );
    expect(container.querySelector('[data-state-family="consent"]')).toBeNull();
  });

  it("a held channel keeps its row, its ground and its reason in words", () => {
    channelsData.current = [
      {
        id: "ch-2",
        owner_type: "person",
        owner_id: "card-dana",
        channel_kind: "email",
        value: "dana@northgateelectric.com",
        preferred: false,
        verified: false,
        verified_at: null,
        status: "bounced",
        status_at: "2026-03-12T00:00:00Z",
        sms_capable: false,
      },
    ];
    renderReach();
    const row = document.querySelector(
      '[data-reach-channel-held="true"]',
    ) as HTMLElement;
    expect(row).toBeInTheDocument();
    expect(
      within(row).getByText(/This address bounced back, 12 March 2026\./),
    ).toBeInTheDocument();
  });

  it("records consent through the studio’s own ledger, with a method and evidence", () => {
    renderReach();
    fireEvent.click(screen.getByRole("button", { name: "Record consent" }));
    fireEvent.change(screen.getByLabelText("How consent was given"), {
      target: { value: "verbal" },
    });
    fireEvent.change(screen.getByLabelText("Where and when they agreed"), {
      target: { value: "Recorded by Priya at the site kickoff." },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Put it on the books" }),
    );
    expect(recordConsent).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: "org-1",
        channelKind: "sms",
        channelValue: "(612) 555-0111",
        status: "granted",
        source: "verbal",
      }),
      expect.anything(),
    );
  });

  it("PR-m — the studio may record a refusal it heard", () => {
    renderReach();
    fireEvent.click(screen.getByRole("button", { name: "Record consent" }));
    fireEvent.change(screen.getByLabelText("How consent was given"), {
      target: { value: "verbal" },
    });
    fireEvent.change(screen.getByLabelText("Where and when they agreed"), {
      target: { value: "Told Priya to stop on site." },
    });
    fireEvent.click(screen.getByLabelText("They told the studio to stop"));
    fireEvent.click(
      screen.getByRole("button", { name: "Put it on the books" }),
    );
    expect(recordConsent).toHaveBeenCalledWith(
      expect.objectContaining({ status: "opted_out" }),
      expect.anything(),
    );
  });

  it("refuses to write a consent with no source or evidence", () => {
    renderReach();
    fireEvent.click(screen.getByRole("button", { name: "Record consent" }));
    fireEvent.click(
      screen.getByRole("button", { name: "Put it on the books" }),
    );
    expect(recordConsent).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Record how and where they agreed before this goes on the books.",
    );
  });
});

/** CR-8 — SPEC §5.2 #5: the rule says who set it, not only when. */
describe("the rule's provenance", () => {
  it("names the setter off the studio's own roster", () => {
    ruleData.current = {
      id: "rule-dana",
      channels_allowed: [],
      channels_forbidden: ["email"],
      route_to_person_id: null,
      reason: "Never email. Text only. The email on file bounces.",
      set_at: "2026-09-13T00:00:00Z",
      set_by: "user-priya",
    };
    studioMembers.current = [
      { user_id: "user-priya", profiles: { full_name: "Priya Natarajan" } },
    ];
    renderReach();
    expect(
      screen.getByText(
        "Never email. Text only. The email on file bounces. Set by Priya Natarajan, 13 Sep 2026.",
      ),
    ).toBeInTheDocument();
  });

  it("with no name to give, the date still stands alone", () => {
    ruleData.current = {
      id: "rule-dana",
      channels_allowed: [],
      channels_forbidden: ["email"],
      route_to_person_id: null,
      reason: "Never email. Text only. The email on file bounces.",
      set_at: "2026-09-13T00:00:00Z",
      set_by: "user-gone",
    };
    renderReach();
    expect(
      screen.getByText(
        "Never email. Text only. The email on file bounces. Set 13 Sep 2026.",
      ),
    ).toBeInTheDocument();
  });
});

describe("minting a door", () => {
  it("says what it opens and when it closes, in words", () => {
    renderReach();
    const act = screen.getByRole("button", { name: "Mint access" });
    const reason = document.getElementById(
      act.getAttribute("aria-describedby") as string,
    );
    expect(reason).toHaveTextContent(
      // CR7-3: the sentence names the JOB the door is minted on, not a date
      // alone — a person on two live seats holds two possible doors.
      "This opens the Call Sheet and the site access card to Dana Kowalski, on the Okonkwo residence, until the job's window closes, 13 August 2027. It never opens billing or the agreement.",
    );
    fireEvent.click(act);
    expect(mintLink).toHaveBeenCalledWith(
      expect.objectContaining({ partyId: "seat-1", projectId: "proj-okonkwo" }),
      expect.anything(),
    );
  });

  it("is held, with the reason beside it, when the person holds no seat", () => {
    renderReach({ seatId: null });
    const act = screen.getByRole("button", { name: "Mint access" });
    expect(act).not.toBeDisabled();
    expect(act).toHaveAttribute("aria-disabled", "true");
  });

  /**
   * QA-R11-1 — the one mint control used to be wired unconditionally to
   * `useCreateFieldLink()`, so pressing it on a CLIENT's card minted a
   * field-crew grant whose declared scope is the Call Sheet and the site
   * access card — the card PR-w rules studio-only and never client-facing.
   */
  it("QA-R11-1 — a client-side card holds the act and never mints a field link", () => {
    renderReach({
      mintSeatId: null,
      mintHeldSentence: MINT_CLIENT_SIDE_SENTENCE,
    });
    const act = screen.getByRole("button", { name: "Mint access" });
    expect(act).toHaveAttribute("aria-disabled", "true");
    const reason = document.getElementById(
      act.getAttribute("aria-describedby") as string,
    );
    expect(reason).toHaveTextContent(MINT_CLIENT_SIDE_SENTENCE);
    fireEvent.click(act);
    expect(mintLink).not.toHaveBeenCalled();
  });

  /**
   * CR3-6 — PR-l's two radios chose NOTHING, so they are gone and the room
   * states the one date the RPC will land on.
   *
   * `create_field_link(uuid, timestamptz)` (00627) computes
   * `max(on_site_to, warranty_until)` and takes it whenever it is still ahead;
   * the caller's `p_expires_at` is only read when there is no live window at
   * all. So "Ends with the job" on a seat whose warranty outlives its window
   * still minted to the warranty end, the sentence above the act named a date
   * the token did not carry, and the analytics event recorded a choice that
   * never reached the database. Restoring the choice is a W3 migration.
   */
  it("CR3-6 — a warranty that outlives the window IS the date, and the card says so", () => {
    renderReach({ warrantyEnd: "2027-11-21" });
    expect(screen.queryByLabelText("Ends with the job")).not.toBeInTheDocument();
    const act = screen.getByRole("button", { name: "Mint access" });
    const reason = document.getElementById(
      act.getAttribute("aria-describedby") as string,
    );
    expect(reason).toHaveTextContent(
      "until the job's window closes, 21 November 2027",
    );
    expect(
      screen.getByText(
        "This seat runs out a warranty, so the door ends with the warranty.",
      ),
    ).toBeInTheDocument();
  });

  it("CR3-6 — a seat with no window at all says the ninety-day term, not a date", () => {
    renderReach({ seatWindowEnd: null, warrantyEnd: null });
    const act = screen.getByRole("button", { name: "Mint access" });
    const reason = document.getElementById(
      act.getAttribute("aria-describedby") as string,
    );
    expect(reason).toHaveTextContent(
      "the door runs ninety days from today and renews when they use it",
    );
  });

  it("CR3-6 — a window that has already closed is the same fact as no window", () => {
    renderReach({ seatWindowEnd: "2026-01-04", warrantyEnd: null });
    const act = screen.getByRole("button", { name: "Mint access" });
    const reason = document.getElementById(
      act.getAttribute("aria-describedby") as string,
    );
    expect(reason).toHaveTextContent("ninety days from today");
  });
});

describe("a grant row", () => {
  it("prints the tier, what it opens, the dates and a Revoke that confirms first", () => {
    grantsData.current = [
      {
        grant_id: "field_link:tok-1",
        tier: "field_link",
        subject_type: "engagement",
        subject_id: "card-dana",
        scope_type: "project",
        scope_id: "proj-okonkwo",
        granted_by: null,
        granted_at: "2026-10-12T00:00:00Z",
        // QA-R8-1: what `create_field_link` actually stores for R-D's window
        // (13 Aug 2027) — the window's last day PLUS one, an EXCLUSIVE
        // boundary "through the end of that day" (00627:578-585). The row
        // prints the last day the door is open, so it must read 13 August.
        expires_at: "2027-08-14T00:00:00Z",
        last_used_at: "2026-10-17T00:00:00Z",
        revoked_at: null,
        revoke_reason: null,
      },
    ];
    renderReach();
    expect(
      screen.getByText(
        "Field link · the Call Sheet and the site access card · minted 12 Oct 2026 · used 17 Oct 2026",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "Ends with the job, 13 August 2027. Renews when they use it.",
      ),
    ).toBeInTheDocument();
    const revoke = screen.getByRole("button", { name: "Revoke" });
    expect(revoke).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(revoke);
    expect(revoke).toHaveAttribute("aria-expanded", "true");
    expect(
      screen.getByRole("button", { name: "Close this door" }),
    ).toBeInTheDocument();
  });
});

/**
 * CR5-2 (w2 r5) — `revoke_project_review_access` revokes EVERY reviewer on the
 * edition and raises on a reason under five characters. The row offered the
 * same fixed "Optional" prompt it offers a field link, and said nothing about
 * who else the press closes the door on.
 */
describe("a whole-scope revoke says so, and asks for the reason its RPC demands", () => {
  beforeEach(() => {
    grantsData.current = [
      {
        grant_id: "project_review:edition-9:actor-1",
        tier: "project_review",
        subject_type: "profile",
        subject_id: "profile-dana",
        scope_type: "edition",
        scope_id: "edition-9",
        granted_by: null,
        granted_at: "2026-10-12T00:00:00Z",
        expires_at: null,
        last_used_at: null,
        revoked_at: null,
        revoke_reason: null,
      },
    ];
  });

  it("names everyone the press closes the door on, before the act", () => {
    renderReach();
    fireEvent.click(screen.getByRole("button", { name: "Revoke" }));
    expect(
      screen.getByText(
        "This closes the review for everyone on this edition, not only Dana Kowalski.",
      ),
    ).toBeInTheDocument();
  });

  it("asks for a reason as REQUIRED, never optional, and refuses a short one", () => {
    renderReach();
    fireEvent.click(screen.getByRole("button", { name: "Revoke" }));
    expect(
      screen.getByText(
        "Say why the door closes. Required, at least five characters, kept with the record.",
      ),
    ).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Why it closes"), {
      target: { value: "no" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Close this door" }));
    expect(
      screen.getByText("Write at least five characters saying why it closes."),
    ).toBeInTheDocument();
  });
});

describe("the pure parts", () => {
  it("names the phone kinds", () => {
    expect(isPhoneChannel("mobile")).toBe(true);
    expect(isPhoneChannel("email")).toBe(false);
  });

  it("channelRowParts leaves out a marker it does not hold", () => {
    expect(
      channelRowParts({
        channel_kind: "email",
        preferred: false,
        verified: false,
        verified_at: null,
      } as never),
    ).toEqual(["Email"]);
  });

  it("heldChannelReason says why, and what still reaches them", () => {
    expect(
      heldChannelReason({
        channel_kind: "email",
        status: "bounced",
        status_at: "2026-03-12T00:00:00Z",
      } as never),
    ).toBe(
      "This address bounced back, 12 March 2026. Texts and calls still reach them.",
    );
  });

  /**
   * CR10-3 — the status editor offers "It bounces" on every kind, so a
   * bouncing MOBILE printed "This address bounced back… Texts and calls still
   * reach them." beside a phone number: it called a number an address, then
   * promised texts still reach the line it had just declared held.
   */
  it("gives a bouncing PHONE its own words", () => {
    expect(
      heldChannelReason({
        channel_kind: "mobile",
        status: "bounced",
        status_at: "2026-03-12T00:00:00Z",
      } as never),
    ).toBe(
      "Texts to this number bounced back, 12 March 2026. Calls still reach them.",
    );
  });

  it("a grant with no end date still ends with the job", () => {
    expect(grantEndsSentence(null, NOW)).toBe(
      "Ends with the job. Renews when they use it.",
    );
  });

  it("a grant inside fourteen days adds the count, and nothing outside it does", () => {
    expect(grantEndsSentence("2026-10-27T00:00:00Z", NOW)).toContain(
      "7 days left.",
    );
    expect(grantEndsSentence("2027-08-13T00:00:00Z", NOW)).not.toContain(
      "days left",
    );
  });

  /**
   * QA-R8-1 — the field link's stored expiry is an EXCLUSIVE boundary, so the
   * row names the last day the door is open. Dana Kowalski's Okonkwo seat runs
   * to 24 May 2027; `create_field_link` stores 25 May 00:00, and the card's
   * Seats region and Mint sentence both say 24 May.
   */
  it("the field link's end date is the seat's own last day, not the day after", () => {
    expect(grantEndsSentence("2027-05-25T00:00:00Z", NOW, "field_link")).toBe(
      "Ends with the job, 24 May 2027. Renews when they use it.",
    );
    // The ninety-day fallback and a caller-supplied end-of-day both stay on
    // their own day — one rule, all three branches of the RPC.
    expect(
      grantEndsSentence("2027-05-24T23:59:59Z", NOW, "field_link"),
    ).toContain("24 May 2027");
    expect(
      grantEndsSentence("2027-05-24T14:33:21Z", NOW, "field_link"),
    ).toContain("24 May 2027");
    // A tier that stores a plain instant is untouched.
    expect(grantEndsSentence("2027-05-25T00:00:00Z", NOW, "doc_share")).toBe(
      "Ends 25 May 2027.",
    );
  });

  it("a refusal reads as a refusal, with the date it was made", () => {
    expect(
      consentSentence({
        status: "opted_out",
        optOutSource: "inbound_sms",
        optOutAt: "2025-12-03",
        projectName: "Lindqvist kitchen",
      }),
    ).toBe("Opted out by text, 3 Dec 2025, on the Lindqvist kitchen.");
  });

  it("a record with no date prints no sentence at all", () => {
    expect(consentSentence({ status: "granted", source: "verbal" })).toBeNull();
  });

  /**
   * CR-2 — THE WORD AND THE CLAUSE ON ONE LINE MUST AGREE.
   * `channel_consent_status()` folds `refusal_unanswered` into `opted_out`
   * whatever `status` says, and 00594 mints `granted` rows carrying that flag
   * on purpose. Reading `record.status` printed "Written consent, 2 May 2025"
   * beside a terracotta `Opted out`.
   */
  it("the VERDICT decides which half of the record the sentence reads", () => {
    const record = {
      status: "granted",
      refusal_unanswered: true,
      source: "written",
      consented_at: "2025-05-02",
      opt_out_source: "inbound_sms",
      opt_out_at: "2025-12-03",
    } as never;
    expect(
      consentSentenceForRecord({ verdict: "opted_out", record }, "Lindqvist kitchen"),
    ).toBe("Opted out by text, 3 Dec 2025, on the Lindqvist kitchen.");
    expect(
      consentSentenceForRecord({ verdict: "granted", record }, "Lindqvist kitchen"),
    ).toBe("Written consent, 2 May 2025, on the Lindqvist kitchen.");
  });

  it("the mint sentence never promises a window it does not have", () => {
    expect(mintConsequenceSentence("Erin Sato", null)).toBe(
      "This opens the Call Sheet and the site access card to Erin Sato until the job's window closes. It never opens billing or the agreement.",
    );
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Round 7
// ═══════════════════════════════════════════════════════════════════════════

describe("CR7-2 — a firm's card reads firm-scoped tokens only", () => {
  const crewFieldLink = {
    grant_id: "field_link:tok-1",
    tier: "field_link",
    subject_type: "engagement",
    subject_id: "seat-dana",
    scope_type: "project",
    scope_id: "proj-okonkwo",
    granted_by: null,
    granted_at: "2026-10-12",
    expires_at: "2027-08-13",
    last_used_at: null,
    revoked_at: null,
    revoke_reason: null,
  };
  const firmAgreementLink = {
    ...crewFieldLink,
    grant_id: "agreement_link:agr-1",
    tier: "agreement_link",
    subject_type: "contact",
    subject_id: "card-northgate",
  };

  it("withholds a crew member's personal door — its word AND its Revoke", () => {
    grantsData.current = [crewFieldLink];
    renderReach({ cardKind: "company", personName: "Northgate Electric" });
    // "Field link" is one of the three reach words, and SPEC §5.3 #9 bars every
    // one of them from a company card.
    expect(screen.queryByText(/Field link/)).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /Revoke/ }),
    ).not.toBeInTheDocument();
    expect(screen.getByText(NO_GRANT_SENTENCE)).toBeInTheDocument();
  });

  it("still prints a token the FIRM itself holds", () => {
    grantsData.current = [firmAgreementLink];
    renderReach({ cardKind: "company", personName: "Northgate Electric" });
    expect(screen.queryByText(NO_GRANT_SENTENCE)).not.toBeInTheDocument();
    expect(screen.getByText(/Agreement link/)).toBeInTheDocument();
  });

  it("leaves a PERSON's own card untouched", () => {
    grantsData.current = [crewFieldLink];
    renderReach();
    expect(screen.getByText(/Field link/)).toBeInTheDocument();
  });
});

describe("CR7-3 — the acts name the job they land on", () => {
  it("names the job in the mint consequence sentence", () => {
    expect(
      mintConsequenceSentence("Dana Kowalski", "2027-08-13", "Okonkwo residence"),
    ).toBe(
      "This opens the Call Sheet and the site access card to Dana Kowalski, on the Okonkwo residence, until the job's window closes, 13 August 2027. It never opens billing or the agreement.",
    );
  });

  it("names the job in the Record-consent band", () => {
    channelsData.current = [
      {
        id: "ch-1",
        owner_type: "person",
        owner_id: "card-dana",
        channel_kind: "mobile",
        value: "+16125550111",
        status: "active",
        is_preferred: true,
      },
    ];
    renderReach();
    fireEvent.click(screen.getByRole("button", { name: "Record consent" }));
    expect(
      screen.getByText("This is recorded on the Okonkwo residence."),
    ).toBeInTheDocument();
  });
});
