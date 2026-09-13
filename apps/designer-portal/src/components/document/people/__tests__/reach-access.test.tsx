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
  NO_RULE_SENTENCE,
  REACH_EMPTY_SENTENCE,
} from "../reach-access";
import { consentSentence } from "../consent-sentence";
import { grantEndsSentence, NO_GRANT_SENTENCE } from "../access-grant-list";

const channelsData: { current: unknown[] } = { current: [] };
const grantsData: { current: unknown[] } = { current: [] };
const ruleData: { current: Record<string, unknown> | null } = { current: null };
const consentData: { current: Record<string, unknown> | null } = {
  current: null,
};
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
  isAccessGrantRevokable: (tier: string) => tier === "field_link",
  ACCESS_GRANT_NOT_REVOKABLE_SENTENCE:
    "This door is closed somewhere else in Patina, not from here.",
  ACCESS_GRANT_TIER_LABELS: { field_link: "Field link" },
  ACCESS_GRANT_TIER_OPENS: {
    field_link: "the Call Sheet and the site access card",
  },
  CONTACT_CHANNEL_KIND_LABELS: { mobile: "Mobile", email: "Email" },
  isContactChannelHeld: (s: string) => !!s && s !== "active",
  fieldLinkUrl: (token: string) => `https://patina.cloud/field/${token}`,
}));

jest.mock("@/lib/analytics/people-events", () => ({
  peopleEvents: {
    consentRecorded: jest.fn(),
    grantMinted: jest.fn(),
    grantRevoked: jest.fn(),
  },
}));

const NOW = new Date("2026-10-20T00:00:00Z");

function renderReach(over: Record<string, unknown> = {}) {
  render(
    <ReachAccess
      cardId="card-dana"
      cardKind="person"
      organizationId="org-1"
      personName="Dana Kowalski"
      seatId="seat-1"
      seatProjectId="proj-okonkwo"
      seatProjectName="Okonkwo residence"
      seatWindowEnd="2027-08-13"
      warrantyEnd={null}
      onAnnounce={jest.fn()}
      now={NOW}
      {...over}
    />,
  );
}

beforeEach(() => {
  channelsData.current = [];
  grantsData.current = [];
  ruleData.current = null;
  consentData.current = null;
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

describe("minting a door", () => {
  it("says what it opens and when it closes, in words", () => {
    renderReach();
    const act = screen.getByRole("button", { name: "Mint access" });
    const reason = document.getElementById(
      act.getAttribute("aria-describedby") as string,
    );
    expect(reason).toHaveTextContent(
      "This opens the Call Sheet and the site access card to Dana Kowalski until the job's window closes, 13 August 2027. It never opens billing or the agreement.",
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
        expires_at: "2027-08-13T00:00:00Z",
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
        status: "bounced",
        status_at: "2026-03-12T00:00:00Z",
      } as never),
    ).toBe(
      "This address bounced back, 12 March 2026. Texts and calls still reach them.",
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

  it("the mint sentence never promises a window it does not have", () => {
    expect(mintConsequenceSentence("Erin Sato", null)).toBe(
      "This opens the Call Sheet and the site access card to Erin Sato until the job's window closes. It never opens billing or the agreement.",
    );
  });
});
