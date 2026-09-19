/**
 * FIELD LINE PHASE 1 — "Why didn’t they get it?" (P1-03).
 *
 * Four claims, and each one is a promise to a designer standing in front of a
 * foreman who says he never got the text:
 *
 *  · THE RAIL IS OFF UNTIL IT IS ON. With `field-line-trades` off the card is
 *    not rendered and its read never happens, so every surface that mounts this
 *    sheet keeps asking for exactly what it asked for before.
 *  · EVERY CARRIER CODE HAS WORDS. 30003, 30005, 30006, 30007 and 21610 each
 *    print a sentence a person can act on; a code the room has no words for
 *    prints the code rather than a guess.
 *  · NO CREDENTIAL EVER REACHES THE SCREEN. The card prints the LINE it built,
 *    never the row it was handed: a token (or its hash) riding in that row
 *    appears nowhere in the DOM, and there is no "copy the current link" act —
 *    the way to a fresh link is words, because the renew path is inbound.
 *  · AN EMPTY ANSWER CLAIMS NOTHING. `explain_sms_delivery` returns the same
 *    empty result for a foreign studio, a removed seat, a project attached to
 *    no studio and a seat nothing has happened to, so the room prints one plain
 *    line for all four and concludes nothing from it.
 *
 * The words under test are the SHIPPED ones: `smsDeliveryLines` and the carrier
 * map come through `jest.requireActual`, so a copy change in @patina/supabase
 * moves this suite.
 */
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  SMS_CARRIER_CODE_WORDS,
  SMS_NEW_LINK_WORDS,
  SMS_NOTHING_TO_EXPLAIN,
  type PartyRole,
} from "@patina/supabase";
import { PartyProfileSheet } from "../party-profile-sheet";

const HOUR = 3_600_000;

const flags = { trades: true };
const personData: { current: Record<string, unknown> | null } = { current: null };
const explanation: { current: Record<string, unknown> | null } = { current: null };
/** Every party id the diagnostic hook was asked about, in order. */
const explainCalls: Array<string | null | undefined> = [];

jest.mock("@patina/supabase", () => ({
  ...jest.requireActual("@patina/supabase"),
  usePerson: () => ({ data: personData.current }),
  usePersonSeat: () => ({
    data: personData.current
      ? {
          seat: { seat_id: "party-1", project_id: personData.current.project_id },
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
  usePartyOptinChallenge: () => ({ data: null }),
  usePartyPhoneSuppressed: () => ({ data: false }),
  useResendPartyInvite: () => ({ mutate: jest.fn(), isPending: false }),
  // 00647 through the portal: a zero- or one-row answer, already unwrapped by
  // the hook. `undefined` is the shape a caller outside the studio gets.
  useExplainSmsDelivery: (partyId: string | null | undefined) => {
    explainCalls.push(partyId);
    return { data: explanation.current, isLoading: false };
  },
}));

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
    data: [{ id: "11111111-1111-4111-8111-111111111111", name: "Okonkwo residence" }],
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
    consent_status: "granted",
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

/** 00647's row as the hook hands it over. */
function explained(over: Partial<Record<string, unknown>> = {}) {
  return {
    party_id: "party-1",
    project_id: "project-1",
    consent_state: "granted",
    consent_source: "verbal",
    consent_recorded_at: new Date(Date.now() - 9 * 24 * HOUR).toISOString(),
    suppressed: false,
    suppression_reason: null,
    last_attempt_at: new Date(Date.now() - 2 * HOUR).toISOString(),
    last_attempt_status: "failed",
    provider_status: "undelivered",
    carrier_code: "30003",
    deferred_due_at: null,
    link_expires_at: null,
    resent_at: null,
    next_resend_allowed_at: null,
    void_reason: null,
    budget_local_day: null,
    budget_recurring_used: null,
    budget_events_used: null,
    open_prompts: [],
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
    <PartyProfileSheet open partyId="party-1" role={ROLE} onClose={jest.fn()} />,
  );
}

function cardText(): string {
  return screen.getByTestId("field-line-diagnostic-card").textContent ?? "";
}

beforeEach(() => {
  flags.trades = true;
  personData.current = person();
  explanation.current = explained();
  explainCalls.length = 0;
});

describe("the card is behind the rail", () => {
  it("with the trades rail off there is no card at all", () => {
    flags.trades = false;
    openProfile();
    expect(screen.queryByTestId("field-line-diagnostic-card")).toBeNull();
    expect(screen.queryByText(/Why didn’t they get it/)).toBeNull();
  });

  it("with the rail on the card is mounted for this seat", () => {
    openProfile();
    expect(screen.getByTestId("field-line-diagnostic-card")).toBeInTheDocument();
    expect(screen.getByText(/Why didn’t they get it/)).toBeInTheDocument();
    expect(explainCalls).toContain("party-1");
  });
});

describe("every carrier code has words a person can act on", () => {
  it.each([
    ["30003", "phone was off or unreachable"],
    ["30005", "no longer in service"],
    ["30006", "landline"],
    ["30007", "carrier blocked it"],
    ["21610", "replied STOP"],
  ])("%s says %s", (code, fragment) => {
    explanation.current = explained({ carrier_code: code });
    openProfile();
    const line = screen.getByTestId("field-line-diagnostic-carrier");
    expect(line).toHaveTextContent(fragment as string);
    // The shipped sentence, not one invented here.
    expect(line).toHaveTextContent(
      SMS_CARRIER_CODE_WORDS[code as string],
    );
  });

  it("a code the room has no words for prints the code, never a guess", () => {
    explanation.current = explained({ carrier_code: "30034" });
    openProfile();
    expect(screen.getByTestId("field-line-diagnostic-carrier")).toHaveTextContent(
      "code 30034",
    );
  });

  it("no carrier code, no carrier line", () => {
    explanation.current = explained({
      carrier_code: null,
      last_attempt_status: "delivered",
      provider_status: "delivered",
    });
    openProfile();
    expect(screen.queryByTestId("field-line-diagnostic-carrier")).toBeNull();
  });
});

describe("delivered is the carrier's word about a handset", () => {
  it("prints that it arrived and never that anyone read it", () => {
    explanation.current = explained({
      last_attempt_status: "delivered",
      provider_status: "delivered",
      carrier_code: null,
    });
    openProfile();
    const attempt = screen.getByTestId("field-line-diagnostic-attempt");
    expect(attempt).toHaveTextContent("reached their phone");
    expect(attempt.textContent ?? "").not.toMatch(/\bread\b/i);
    expect(cardText()).not.toMatch(/\bread\b/i);
  });
});

describe("no credential ever reaches the screen", () => {
  const TOKEN = "a1".repeat(32);
  const HASH = "f0".repeat(32);

  it("a token riding in the row appears nowhere, and there is no copy act", () => {
    explanation.current = explained({
      link_expires_at: new Date(Date.now() + 30 * 24 * HOUR).toISOString(),
      // The card prints the LINES it built, never the row it was handed. A row
      // that carried a credential would surface here if it did otherwise.
      token: TOKEN,
      token_hash: HASH,
    });
    openProfile();

    expect(screen.getByTestId("field-line-diagnostic-link")).toHaveTextContent(
      "Their link works until",
    );
    expect(document.body.textContent ?? "").not.toContain(TOKEN);
    expect(document.body.textContent ?? "").not.toContain(HASH);
    expect(cardText()).not.toMatch(/Copy current link/i);
    expect(
      screen.queryByRole("button", { name: /copy current link/i }),
    ).toBeNull();
  });

  it("a fresh link is words, because the renew path is the crew's own reply", () => {
    openProfile();
    expect(screen.getByTestId("field-line-diagnostic-new-link")).toHaveTextContent(
      SMS_NEW_LINK_WORDS,
    );
    expect(
      screen.queryByRole("button", { name: /send a new link/i }),
    ).toBeNull();
  });

  it("no live link says so rather than offering one", () => {
    explanation.current = explained({ link_expires_at: null });
    openProfile();
    expect(screen.getByTestId("field-line-diagnostic-link")).toHaveTextContent(
      "no link that works right now",
    );
  });
});

describe("an empty answer claims nothing", () => {
  it("the unauthorized and the uneventful read the same plain line", () => {
    // 00647 returns the SAME empty result for a foreign studio, a removed seat,
    // a project attached to no studio and an unknown party — so the room cannot
    // print a conclusion drawn from which one it was.
    explanation.current = null;
    openProfile();
    const card = screen.getByTestId("field-line-diagnostic-card");
    expect(card).toHaveTextContent(SMS_NOTHING_TO_EXPLAIN);
    expect(screen.queryByTestId("field-line-diagnostic-attempt")).toBeNull();
    expect(screen.queryByTestId("field-line-diagnostic-consent")).toBeNull();
  });
});

describe("the rest of the picture, in plain words", () => {
  it("a held text says when it goes out, and a stop says who closed the door", () => {
    explanation.current = explained({
      last_attempt_status: "waiting",
      provider_status: "deferred",
      carrier_code: null,
      deferred_due_at: new Date(Date.now() + 9 * HOUR).toISOString(),
      suppressed: true,
      suppression_reason: "stop",
      consent_state: "opted_out",
    });
    openProfile();
    expect(screen.getByTestId("field-line-diagnostic-attempt")).toHaveTextContent(
      "held for quiet hours",
    );
    expect(
      screen.getByTestId("field-line-diagnostic-suppressed"),
    ).toHaveTextContent("replied STOP");
    expect(screen.getByTestId("field-line-diagnostic-consent")).toHaveTextContent(
      "opted out",
    );
  });

  it("the resend names the next moment the rail would allow", () => {
    const resentAt = new Date(Date.now() - 30 * HOUR);
    explanation.current = explained({
      resent_at: resentAt.toISOString(),
      next_resend_allowed_at: new Date(
        resentAt.getTime() + 24 * HOUR,
      ).toISOString(),
    });
    openProfile();
    expect(screen.getByTestId("field-line-diagnostic-resend")).toHaveTextContent(
      "the next one is allowed",
    );
  });

  it("the day's allowance and the open questions are counted, not guessed", () => {
    explanation.current = explained({
      budget_local_day: "2026-09-19",
      budget_recurring_used: 1,
      budget_events_used: 2,
      open_prompts: [
        { ref: "71", kind: "optin" },
        { ref: "72", kind: "site_card" },
      ],
    });
    openProfile();
    expect(screen.getByTestId("field-line-diagnostic-budget")).toHaveTextContent(
      "3 texts sent to them on 2026-09-19",
    );
    const open = screen.getByTestId("field-line-diagnostic-open-prompts");
    expect(open).toHaveTextContent("reply 71");
    expect(open).toHaveTextContent("the site card (reply 72)");
  });
});
