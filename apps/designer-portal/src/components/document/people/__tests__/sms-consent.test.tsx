/**
 * FIELD LINE PHASE 1 — consent capture and the one resend owner (P1-01).
 *
 * Four claims, and each one is a promise to a person holding a phone:
 *
 *  · THE WORD BESIDE THEIR NAME is one of six facts, never a guess: nobody
 *    asked, we asked, we asked and nobody answered, they said yes, they said
 *    no, and the handset is closed. Suppression outranks every studio record,
 *    exactly as the send gate orders it — so a `granted` record on a phone that
 *    has replied STOP reads "Blocked", not "Texting".
 *  · NOTHING SENDS WITHOUT EVIDENCE. "Send again" with an empty note writes
 *    nothing and says so. The same door in the add sheet ("They said yes on the
 *    phone") is a shortcut for TYPING the evidence, never a way around it.
 *  · THE FLOOR IS VISIBLE WORDS, not a dead control: inside 24h the act keeps
 *    its place in the tab order (§A5 held), the reason stands beside it, and
 *    pressing it sends nothing.
 *  · ONE PRESS IS ONE REQUEST. Two presses in a single tick read the same
 *    render's `isPending`, so the latch is a ref. 00644 is still the authority
 *    (advisory lock + a write-once claim per challenge version → one text and
 *    one refusal); this suite proves the room does not ask twice for one press.
 *
 * The words and reasons under test are the SHIPPED ones: `partySmsChipState`,
 * `resendUnavailableReason` and `resendRefusalWords` come through
 * `jest.requireActual`, so a copy change in @patina/supabase moves this suite.
 */
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import {
  QueryClient,
  QueryClientProvider,
  useMutation,
} from "@tanstack/react-query";
import type { PartyRole } from "@patina/supabase";
import { PartyProfileSheet } from "../party-profile-sheet";
import { AddPersonSheet } from "../directory/add-person-sheet";

const HOUR = 3_600_000;

const flags = { trades: true };
const personData: { current: Record<string, unknown> | null } = {
  current: null,
};
const challengeData: { current: Record<string, unknown> | null } = {
  current: null,
};
const suppressed = { current: false };

/** Every call that reached the resend hook, in order. */
const resendCalls: unknown[] = [];
/** What the RPC does with a call — resolved, rejected, or left in flight. */
let resendOutcome: () => Promise<unknown> = async () => ({ status: "queued" });

/** The add sheet's seat write and the chain it pulls behind it. */
const addParty = jest.fn();
const promote = jest.fn();
const addChannel = jest.fn();
const setRule = jest.fn();
const setAuthority = jest.fn();
const setAffiliation = jest.fn();
const onAdded = jest.fn();

const PROJECT = "11111111-1111-4111-8111-111111111111";

/**
 * The real mutation machinery with a counted mutationFn in place of the RPC:
 * the component's own pending/held/latch behaviour is what is under test, so
 * `useMutation` has to be the shipped one.
 */
function useCountedResend() {
  return useMutation({
    mutationFn: async (input: unknown) => {
      resendCalls.push(input);
      return resendOutcome();
    },
  });
}

jest.mock("@patina/supabase", () => ({
  ...jest.requireActual("@patina/supabase"),
  // ── the party profile sheet's reads ──────────────────────────────────────
  usePerson: () => ({ data: personData.current }),
  usePersonSeat: () => ({
    data: personData.current
      ? {
          seat: {
            seat_id: "party-1",
            project_id: personData.current.project_id,
          },
          identity: personData.current,
        }
      : { seat: null, identity: null },
  }),
  usePartySmsThread: () => ({ data: [] }),
  useSendPartySms: () => ({
    mutate: jest.fn(),
    isPending: false,
    isError: false,
    error: null,
  }),
  useActiveFieldLink: () => ({ data: null }),
  useCreateFieldLink: () => ({ mutateAsync: jest.fn(), isPending: false }),
  useRevokeFieldLink: () => ({ mutateAsync: jest.fn(), isPending: false }),
  useFieldMediaUrl: () => ({ data: null }),
  useProjectParties: () => ({ data: [] }),
  useProjectRecordedStudio: () => ({ data: "org-1", isLoading: false }),
  useRecordPartySmsConsent: () => ({ mutate: jest.fn(), isPending: false }),
  useUpdateProjectParty: () => ({ mutateAsync: jest.fn(), isPending: false }),
  fieldLinkUrl: (token: string) => `https://patina.cloud/field/${token}`,
  // ── Phase 1: the challenge row, the handset's own answer, the resend ─────
  usePartyOptinChallenge: () => ({ data: challengeData.current }),
  usePartyPhoneSuppressed: () => ({ data: suppressed.current }),
  useResendPartyInvite: () => useCountedResend(),
  // ── the add sheet's writes ───────────────────────────────────────────────
  useAddClient: () => ({ mutateAsync: jest.fn(), isPending: false }),
  useAddProjectParty: () => ({ mutateAsync: addParty, isPending: false }),
  useAddStudioContact: () => ({
    mutateAsync: jest.fn(async () => ({ id: "firm-minted" })),
    isPending: false,
  }),
  useAddStudioContactChannel: () => ({
    mutateAsync: addChannel,
    isPending: false,
  }),
  useFindOrCreateVendor: () => ({ mutateAsync: jest.fn(), isPending: false }),
  usePromoteToStudioContact: () => ({ mutateAsync: promote, isPending: false }),
  useSaveVendor: () => ({ mutateAsync: jest.fn(), isPending: false }),
  useSetContactRule: () => ({ mutateAsync: setRule, isPending: false }),
  useSetAffiliation: () => ({ mutateAsync: setAffiliation, isPending: false }),
  useSetPartyAuthority: () => ({ mutateAsync: setAuthority, isPending: false }),
  useStudioContacts: () => ({ data: [] }),
  useStudioIdentity: () => ({ data: { name: "Middle West Studio" } }),
  useUpdateStudioContact: () => ({ mutateAsync: jest.fn(), isPending: false }),
  useOrganizations: () => ({
    data: [
      { id: "org-1", type: "design_studio", membership: { role: "owner" } },
    ],
    isLoading: false,
    isError: false,
    refetch: jest.fn(),
  }),
}));

// Only the trades rail is on: every other flag stays false so the surfaces
// beside it (the promote band, the client letter) render today's shape.
jest.mock("@/hooks/use-feature-flag", () => ({
  useFeatureFlag: (name: string) => ({
    value: name === "field-line-trades" ? flags.trades : false,
    isLoading: false,
  }),
}));
jest.mock("@/hooks/use-auth", () => ({
  useAuth: () => ({ user: { id: "designer-1" } }),
}));
jest.mock("@/hooks/use-projects", () => ({
  useProjects: () => ({
    data: [
      { id: "11111111-1111-4111-8111-111111111111", name: "Okonkwo residence" },
    ],
  }),
}));
jest.mock("@/lib/analytics/events", () => ({
  clientEvents: { create: jest.fn() },
}));
jest.mock("../../roster/use-project-authority", () => ({
  useProjectAuthority: () => ({ data: {} }),
  projectAuthorityKeys: { project: () => [] },
}));

function person(over: Partial<Record<string, unknown>> = {}) {
  return {
    person_id: "party-1",
    display_name: "Sal Moretti",
    email: null,
    phone: "5551234567",
    profile_id: null,
    project_id: "project-1",
    designer_id: null,
    status_raw: "active",
    consent_status: "pending",
    reach_state: "on_paper",
    paper_state: null,
    contact_rule_summary: null,
    seat_count: 1,
    last_touch_at: null,
    meta: { phone_e164: "+15551234567" },
    scope: "mine",
    ...over,
  };
}

/** An open opt-in challenge, asked 30h ago — past 00644's floor. */
function challenge(over: Partial<Record<string, unknown>> = {}) {
  return {
    id: "prompt-1",
    version: 2,
    short_code: "47",
    created_at: new Date(Date.now() - 30 * HOUR).toISOString(),
    expires_at: new Date(Date.now() + 42 * HOUR).toISOString(),
    answered_at: null,
    resent_at: null,
    voided_at: null,
    ...over,
  };
}

function renderWithClient(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>,
  );
}

const ROLE: PartyRole = "sub";

function openProfile() {
  return renderWithClient(
    <PartyProfileSheet
      open
      partyId="party-1"
      role={ROLE}
      onClose={jest.fn()}
    />,
  );
}

beforeEach(() => {
  flags.trades = true;
  personData.current = person();
  challengeData.current = challenge();
  suppressed.current = false;
  resendCalls.length = 0;
  resendOutcome = async () => ({ status: "queued" });
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
});

describe("the chip says which of six things is true", () => {
  it.each([
    ["nobody asked", { consent: "not_asked", challenge: null }, "Not asked"],
    ["we asked, and it is fresh", { consent: "pending" }, "Invited"],
    [
      "we asked two days ago and heard nothing",
      { consent: "pending", age: 60 },
      "Invited · no reply",
    ],
    ["they said yes", { consent: "granted" }, "Texting"],
    ["they said no", { consent: "opted_out" }, "Opted out"],
  ])("%s → %s", (_name, setup, word) => {
    const s = setup as { consent: string; challenge?: null; age?: number };
    personData.current = person({ consent_status: s.consent });
    challengeData.current =
      s.challenge === null
        ? null
        : challenge(
            s.age
              ? {
                  created_at: new Date(Date.now() - s.age * HOUR).toISOString(),
                }
              : {},
          );
    openProfile();
    expect(screen.getByTestId("field-line-consent-chip")).toHaveTextContent(
      word as string,
    );
  });

  it("a closed handset reads Blocked over a studio record that says granted", () => {
    personData.current = person({ consent_status: "granted" });
    suppressed.current = true;
    openProfile();
    expect(screen.getByTestId("field-line-consent-chip")).toHaveTextContent(
      "Blocked",
    );
  });

  it("with the rail off the sheet keeps today's chip and no resend band", () => {
    flags.trades = false;
    openProfile();
    expect(screen.queryByTestId("field-line-consent-chip")).toBeNull();
    expect(screen.queryByTestId("field-line-resend-band")).toBeNull();
    expect(
      screen.getByText(/Invite sent — waiting on their reply/),
    ).toBeInTheDocument();
  });
});

describe("Send again — nothing leaves without evidence", () => {
  it("refuses an empty note in an announced alert and calls nothing", () => {
    openProfile();
    fireEvent.click(screen.getByRole("button", { name: "Send again" }));
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Write down how they said yes before asking again.",
    );
    expect(resendCalls).toHaveLength(0);
  });

  it("sends the source, the note and nothing typed by hand about the disclosure", async () => {
    openProfile();
    fireEvent.change(screen.getByLabelText("How they said yes"), {
      target: { value: "kickoff" },
    });
    fireEvent.change(screen.getByLabelText("What happened"), {
      target: { value: "  Said yes at the walk-through this morning  " },
    });
    fireEvent.click(screen.getByRole("button", { name: "Send again" }));

    await waitFor(() => expect(resendCalls).toHaveLength(1));
    expect(resendCalls[0]).toEqual({
      partyId: "party-1",
      projectId: "project-1",
      evidence: {
        source: "kickoff",
        note: "Said yes at the walk-through this morning",
      },
    });
    // The recorder and the disclosure version are stamped by the write itself
    // (auth.uid() and 00644's own evidence keys), so the room only NAMES them.
    expect(
      screen.queryByText(/Asked again\. Sal Moretti will get one more text\./),
    ).toBeInTheDocument();
  });

  it("names what is kept with the question, including the disclosure version", () => {
    openProfile();
    expect(
      screen.getByText(
        /Kept with the question: this note, the time, field-sms-v1/,
      ),
    ).toBeInTheDocument();
  });
});

describe("the 24h floor is words beside an offered act, not a dead control", () => {
  beforeEach(() => {
    challengeData.current = challenge({
      created_at: new Date(Date.now() - 2 * HOUR).toISOString(),
    });
  });

  it("holds the act, keeps it in the tab order, and points at the visible reason", () => {
    openProfile();
    const act = screen.getByRole("button", { name: "Send again" });
    expect(act).not.toBeDisabled();
    expect(act).toHaveAttribute("aria-disabled", "true");
    expect(act).toHaveAttribute("aria-describedby", "field-resend-reason");
    expect(document.getElementById("field-resend-reason")).toHaveTextContent(
      /Asked less than a day ago — you can ask again after/,
    );
  });

  it("sends nothing when it is pressed anyway, note or no note", () => {
    openProfile();
    fireEvent.change(screen.getByLabelText("What happened"), {
      target: { value: "Said yes on the phone just now" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Send again" }));
    expect(resendCalls).toHaveLength(0);
  });

  it("00644's own floor refusal reaches the designer as plain words", async () => {
    // The clock the room reads and the clock the RPC reads can disagree (a
    // stale challenge row, a clock skew), so the refusal has to be legible too.
    challengeData.current = challenge();
    resendOutcome = async () => {
      throw new Error(
        "new row violates... resend_floor_not_elapsed (next_allowed_at=2026-09-19T08:00:00+00)",
      );
    };
    openProfile();
    fireEvent.change(screen.getByLabelText("What happened"), {
      target: { value: "Said yes on the phone just now" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Send again" }));

    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent(
        "They were asked less than a day ago. Give them a day.",
      ),
    );
    expect(screen.queryByText(/resend_floor_not_elapsed/)).toBeNull();
  });
});

describe("one press is one request", () => {
  it("a double press in a single tick makes exactly one call", async () => {
    let release: ((value: unknown) => void) | null = null;
    resendOutcome = () =>
      new Promise((resolve) => {
        release = resolve;
      });
    openProfile();
    fireEvent.change(screen.getByLabelText("What happened"), {
      target: { value: "Said yes on the phone just now" },
    });
    const act = screen.getByRole("button", { name: "Send again" });
    fireEvent.click(act);
    fireEvent.click(act);

    // Both presses were issued inside one tick, before React could re-render
    // anything; react-query reaches the mutationFn a microtask later, so let
    // that settle and then count what arrived.
    await waitFor(() => expect(resendCalls).toHaveLength(1));
    release?.({ status: "queued" });
    await waitFor(() =>
      expect(screen.getByText(/Asked again\./)).toBeInTheDocument(),
    );
    expect(resendCalls).toHaveLength(1);
  });

  it("the act is busy while the first ask is in flight", async () => {
    let release: ((value: unknown) => void) | null = null;
    resendOutcome = () =>
      new Promise((resolve) => {
        release = resolve;
      });
    openProfile();
    fireEvent.change(screen.getByLabelText("What happened"), {
      target: { value: "Said yes on the phone just now" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Send again" }));

    await waitFor(() =>
      expect(screen.getByRole("button", { name: /Sending/ })).toHaveAttribute(
        "aria-busy",
        "true",
      ),
    );
    release?.({ status: "queued" });
    await waitFor(() =>
      expect(screen.getByText(/Asked again\./)).toBeInTheDocument(),
    );
  });
});

describe("the add sheet's quick capture writes the evidence, never skips it", () => {
  function openAdd() {
    renderWithClient(
      <AddPersonSheet open onClose={jest.fn()} onAdded={onAdded} />,
    );
    fireEvent.click(screen.getByRole("button", { name: "a sub" }));
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
    fireEvent.click(
      screen.getByLabelText(/They gave prior express consent for text updates/),
    );
  }

  it("one press fills the two fields the guard reads — source verbal and the day", () => {
    openAdd();
    fireEvent.click(screen.getByTestId("add-party-said-yes-on-the-phone"));
    expect(screen.getByLabelText("How consent was given")).toHaveValue(
      "verbal",
    );
    expect(screen.getByLabelText("Where and when they agreed")).toHaveValue(
      `Said yes on the phone, ${new Date().toLocaleDateString()}.`,
    );
  });

  it("the quick capture is offered only on the trades rail", () => {
    flags.trades = false;
    openAdd();
    expect(screen.queryByTestId("add-party-said-yes-on-the-phone")).toBeNull();
  });

  it("the disclosure version travels with the seat's consent record", async () => {
    openAdd();
    fireEvent.click(screen.getByTestId("add-party-said-yes-on-the-phone"));
    fireEvent.click(screen.getByRole("button", { name: "Add to the roster" }));

    await waitFor(() => expect(addParty).toHaveBeenCalledTimes(1));
    expect(addParty.mock.calls[0][0]).toMatchObject({
      textUpdates: true,
      smsConsentSource: "verbal",
      smsConsentDisclosureVersion: "field-sms-v1",
    });
    expect(addParty.mock.calls[0][0].smsConsentEvidence).toMatch(
      /^Said yes on the phone, /,
    );
  });

  it("with the note wiped the sheet refuses and writes no seat", async () => {
    openAdd();
    fireEvent.click(screen.getByTestId("add-party-said-yes-on-the-phone"));
    fireEvent.change(screen.getByLabelText("Where and when they agreed"), {
      target: { value: "   " },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add to the roster" }));

    await waitFor(() =>
      expect(
        screen.getByText(
          "Record how and where they gave prior consent before sending a text.",
        ),
      ).toBeInTheDocument(),
    );
    expect(addParty).not.toHaveBeenCalled();
  });
});
