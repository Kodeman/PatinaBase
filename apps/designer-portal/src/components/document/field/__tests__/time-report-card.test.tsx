import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

/**
 * Reported hours (Field Line Phase 3, US-4 S4/S5/S9). The REAL hook module runs
 * here — only the Supabase client is mocked — so the RPC argument names and the
 * project-scoped member read are the ones that would reach Postgres, not a
 * restatement of them. @patina/supabase has no tsconfig alias, so the mocks go
 * through the relative paths jest resolves (matching field-line-state.test.tsx).
 */
const mockRpc = jest.fn();
const mockFrom = jest.fn();
const flags = { timeReports: true };
/**
 * The viewer's own studio standing, as `useOrganizations` reports it: active
 * memberships only, role and all. `undefined` data is the read that has not
 * answered yet — the state the card must not guess a door from.
 */
const standing: {
  orgs: { id: string; membership: { role: string } }[] | undefined;
  isError: boolean;
} = { orgs: undefined, isError: false };

jest.mock("../../../../../../../packages/supabase/src/client", () => ({
  createBrowserClient: () => ({ rpc: mockRpc, from: mockFrom }),
}));
jest.mock("@patina/supabase", () => ({
  ...jest.requireActual(
    "../../../../../../../packages/supabase/src/hooks/use-field-time-reports",
  ),
  ...jest.requireActual(
    "../../../../../../../packages/supabase/src/hooks/use-project-team",
  ),
  useUser: () => ({ user: { id: "me" } }),
  useOrganizations: () => ({
    data: standing.orgs,
    isLoading: standing.orgs === undefined && !standing.isError,
    isError: standing.isError,
  }),
  useSmsReviewQueue: () => ({ data: [], isLoading: false, isError: false }),
  useFieldActivity: () => ({ data: [], isLoading: false, isError: false }),
  useReviewSmsMessage: () => ({ mutate: jest.fn(), isPending: false }),
  useTakeSmsThread: () => ({ mutateAsync: jest.fn(), isPending: false }),
  useHandBackSmsThread: () => ({ mutateAsync: jest.fn(), isPending: false }),
  useExtendSmsPause: () => ({ mutateAsync: jest.fn(), isPending: false }),
  smsThreadActionError: () => null,
  smsResultWords: () => "",
}));
jest.mock("@patina/types", () => ({ getFieldTradeLabel: () => "" }));
jest.mock("@/hooks/use-feature-flag", () => ({
  useFeatureFlag: (name: string) => ({
    value: name === "field-line-time-reports" ? flags.timeReports : false,
    isLoading: false,
  }),
}));
jest.mock("../../date-text-input", () => ({ DateTextInput: () => null }));
jest.mock("../../document-action", () => ({
  DocumentAction: ({ children, onClick, disabled, loading }: any) => (
    <button onClick={onClick} disabled={disabled || loading}>
      {children}
    </button>
  ),
  DocumentActionGroup: ({ children }: any) => <div>{children}</div>,
  DocumentActionRow: ({ children }: any) => <div>{children}</div>,
}));
jest.mock("../../section-eyebrow", () => ({
  SectionEyebrow: ({ children }: any) => <h2>{children}</h2>,
}));

import { TimeReportCard } from "../time-report-card";
import { FieldDesk } from "../field-desk";
import type { FieldTimeReportRow } from "@patina/supabase";

function Wrapper({ children }: { children: React.ReactNode }) {
  const [client] = React.useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { retry: false },
          mutations: { retry: false },
        },
      }),
  );
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

const report = (
  overrides: Partial<FieldTimeReportRow> = {},
): FieldTimeReportRow => ({
  id: "r1",
  organization_id: "org1",
  project_id: "p1",
  project_name: "Maple St",
  party_id: "party1",
  party_name: "Sal",
  task_id: "t1",
  task_title: "Rough-in plumbing",
  reported_hours: 6.5,
  note: null,
  reported_at: "2026-09-18T18:00:00Z",
  version: 3,
  ...overrides,
});

// Two people on this job and one on another: a support designer (a teammate),
// the homeowner (never a teammate), and a member of a project this card is not
// about. The picker's read is project-scoped, so only the first may appear.
const teamMembers = [
  {
    id: "m1",
    project_id: "p1",
    user_id: "user-priya",
    role: "support_designer",
    removed_at: null,
    user: { id: "user-priya", full_name: "Priya Natarajan", email: "" },
  },
  {
    id: "m2",
    project_id: "p1",
    user_id: "user-dana",
    role: "client",
    removed_at: null,
    user: { id: "user-dana", full_name: "Dana Okonkwo", email: "" },
  },
  {
    id: "m3",
    project_id: "p2",
    user_id: "user-elsewhere",
    role: "support_designer",
    removed_at: null,
    user: { id: "user-elsewhere", full_name: "Rae Elsewhere", email: "" },
  },
];

/** Table reads honour `.eq()`, so a project-scoped query really is scoped. */
function stubTables(queue: FieldTimeReportRow[]) {
  const tables: Record<string, Record<string, unknown>[]> = {
    field_time_report_queue: queue,
    project_team_members: teamMembers,
  };
  mockFrom.mockImplementation((table: string) => {
    const filters: Array<[string, unknown]> = [];
    const query: any = {
      then: (resolve: any) =>
        Promise.resolve({
          data: (tables[table] ?? []).filter((row) =>
            filters.every(([column, value]) => row[column] === value),
          ),
          error: null,
        }).then(resolve),
    };
    for (const method of ["select", "order", "is"]) {
      query[method] = jest.fn(() => query);
    }
    query.eq = jest.fn((column: string, value: unknown) => {
      filters.push([column, value]);
      return query;
    });
    return query;
  });
}

const emptyDesk = { cards: [], lines: [], isLoading: false, isError: false };

beforeEach(() => {
  mockRpc.mockReset();
  mockFrom.mockReset();
  flags.timeReports = true;
  // Default viewer: a principal of the studio this report belongs to, the only
  // standing the database lets book somebody else's hour.
  standing.orgs = [{ id: "org1", membership: { role: "owner" } }];
  standing.isError = false;
  stubTables([report()]);
});

it("states the claim in plain words, with the hours and the task", () => {
  render(<TimeReportCard report={report({ note: "gate was locked at 7" })} />, {
    wrapper: Wrapper,
  });
  expect(
    screen.getByText(
      "Sal reported 6.5 hours at Rough-in plumbing on Fri 18 September",
      { selector: "p" },
    ),
  ).toBeInTheDocument();
  expect(screen.getByText("“gate was locked at 7”")).toBeInTheDocument();
});

it("Accept decides accepted at this version, with no attribution", async () => {
  mockRpc.mockResolvedValue({ data: { status: "accepted" }, error: null });
  render(<TimeReportCard report={report()} />, { wrapper: Wrapper });
  fireEvent.click(screen.getByRole("button", { name: "Accept" }));
  await waitFor(() =>
    expect(mockRpc).toHaveBeenCalledWith("field_time_report_decide", {
      p_report_id: "r1",
      p_decision: "accepted",
      p_expected_version: 3,
      p_attribute_to_user_id: null,
    }),
  );
});

it("Not right decides rejected at this version", async () => {
  mockRpc.mockResolvedValue({ data: { status: "rejected" }, error: null });
  render(<TimeReportCard report={report()} />, { wrapper: Wrapper });
  fireEvent.click(screen.getByRole("button", { name: "Not right" }));
  await waitFor(() =>
    expect(mockRpc).toHaveBeenCalledWith("field_time_report_decide", {
      p_report_id: "r1",
      p_decision: "rejected",
      p_expected_version: 3,
      p_attribute_to_user_id: null,
    }),
  );
});

it("books to a teammate on this job only, and names them in the decision", async () => {
  mockRpc.mockResolvedValue({ data: { status: "accepted" }, error: null });
  render(<TimeReportCard report={report()} />, { wrapper: Wrapper });
  fireEvent.click(screen.getByRole("button", { name: "Book to a teammate" }));

  const teammate = await screen.findByRole("button", {
    name: "Priya Natarajan",
  });
  expect(mockFrom).toHaveBeenCalledWith("project_team_members");
  expect(
    screen.queryByRole("button", { name: "Rae Elsewhere" }),
  ).not.toBeInTheDocument();
  expect(
    screen.queryByRole("button", { name: "Dana Okonkwo" }),
  ).not.toBeInTheDocument();
  // A principal is offered the picker, not the book-to-me shortcut.
  expect(
    screen.queryByRole("button", { name: "Book to me" }),
  ).not.toBeInTheDocument();

  fireEvent.click(teammate);
  await waitFor(() =>
    expect(mockRpc).toHaveBeenCalledWith("field_time_report_decide", {
      p_report_id: "r1",
      p_decision: "accepted",
      p_expected_version: 3,
      p_attribute_to_user_id: "user-priya",
    }),
  );
});

it("asks for another look when the report moved underneath the card", async () => {
  mockRpc.mockResolvedValue({
    data: null,
    error: {
      code: "40001",
      message: "field_time_report_stale",
      details: null,
    },
  });
  render(<TimeReportCard report={report()} />, { wrapper: Wrapper });
  fireEvent.click(screen.getByRole("button", { name: "Accept" }));
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "This one changed — take another look.",
  );
  expect(
    screen.queryByText("Couldn’t save — try again."),
  ).not.toBeInTheDocument();
});

// ── 00601's refusal, and the nothing-hours one (R3 N2, story log #9) ───────
// Both arrive from BENEATH field_time_report_decide's own checks, so the card
// only ever sees them as a raise: 42501 with no token of its own, and 23514
// whose message says there is no hour to book.

it("says who may book somebody else's hour, with no retry hint", async () => {
  mockRpc.mockResolvedValue({
    data: null,
    // classify_project_time_entry_authority (00601): insufficient_privilege,
    // and deliberately no stable DETAIL token to match on.
    error: {
      code: "42501",
      message: "a time entry is logged by the person who worked the hour",
      details: null,
      hint: null,
    },
  });
  render(<TimeReportCard report={report()} />, { wrapper: Wrapper });
  fireEvent.click(screen.getByRole("button", { name: "Book to a teammate" }));
  fireEvent.click(
    await screen.findByRole("button", { name: "Priya Natarajan" }),
  );

  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Only a studio owner or admin can book hours to someone else. You can book them to yourself.",
  );
  // Nothing tells her to try again — the same press refuses the same way.
  expect(screen.queryByText(/try again/)).not.toBeInTheDocument();
  // The decision rolled back whole, so the claim is still on screen to decide.
  expect(
    screen.getByText(
      "Sal reported 6.5 hours at Rough-in plumbing on Fri 18 September",
      { selector: "p" },
    ),
  ).toBeInTheDocument();
});

it("keeps the old words for a 42501 that is decide()'s own membership refusal", async () => {
  mockRpc.mockResolvedValue({
    data: null,
    error: {
      code: "42501",
      message:
        "field_time_report_decide: field_time_report_forbidden — me is not on this report's project",
      details: "field_time_report_forbidden",
      hint: null,
    },
  });
  render(<TimeReportCard report={report()} />, { wrapper: Wrapper });
  fireEvent.click(screen.getByRole("button", { name: "Accept" }));
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Couldn’t save — try again.",
  );
  expect(screen.queryByText(/studio owner or admin/)).not.toBeInTheDocument();
});

it("says a nothing-hours report has no hour to book", async () => {
  mockRpc.mockResolvedValue({
    data: null,
    error: {
      code: "23514",
      message:
        "field_time_report_decide: field_time_report_bad_attribution — a report of 0.00 hours has no hour to book",
      details: "field_time_report_bad_attribution",
      hint: "Accept it as reported, or reject it: project_time_entries holds positive durations only.",
    },
  });
  render(<TimeReportCard report={report({ reported_hours: 0 })} />, {
    wrapper: Wrapper,
  });
  fireEvent.click(screen.getByRole("button", { name: "Book to a teammate" }));
  fireEvent.click(
    await screen.findByRole("button", { name: "Priya Natarajan" }),
  );
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "There’s no hour to book on this one — accept it or mark it not right.",
  );
});

it("offers Book to me, not the picker, to a member who is not a principal", async () => {
  // Owning a DIFFERENT studio is no standing over this report's hours: the
  // fold is scoped to the org the report itself names.
  standing.orgs = [
    { id: "org1", membership: { role: "member" } },
    { id: "org-other", membership: { role: "owner" } },
  ];
  mockRpc.mockResolvedValue({ data: { status: "accepted" }, error: null });
  render(<TimeReportCard report={report()} />, { wrapper: Wrapper });

  expect(
    screen.queryByRole("button", { name: "Book to a teammate" }),
  ).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Book to me" }));
  await waitFor(() =>
    expect(mockRpc).toHaveBeenCalledWith("field_time_report_decide", {
      p_report_id: "r1",
      p_decision: "accepted",
      p_expected_version: 3,
      p_attribute_to_user_id: "me",
    }),
  );
});

it("offers neither booking door until the membership read has answered", () => {
  standing.orgs = undefined;
  render(<TimeReportCard report={report()} />, { wrapper: Wrapper });
  // Accept and Not right never wait on standing; the booking door does, because
  // guessing it would put somebody's real hour one mis-click away.
  expect(screen.getByRole("button", { name: "Accept" })).toBeInTheDocument();
  expect(
    screen.queryByRole("button", { name: "Book to a teammate" }),
  ).not.toBeInTheDocument();
  expect(
    screen.queryByRole("button", { name: "Book to me" }),
  ).not.toBeInTheDocument();
});

it("mounts the hours population on the Desk when there is something to decide", async () => {
  render(<FieldDesk population={{ ...emptyDesk }} />, { wrapper: Wrapper });
  expect(
    await screen.findByRole("heading", { name: "Hours reported by text" }),
  ).toBeInTheDocument();
  expect(
    screen.getByText(
      "Sal reported 6.5 hours at Rough-in plumbing on Fri 18 September",
      { selector: "p" },
    ),
  ).toBeInTheDocument();
});

it("reads nothing and shows no hours section while the flag is off", () => {
  flags.timeReports = false;
  render(<FieldDesk population={{ ...emptyDesk }} />, { wrapper: Wrapper });
  // The Desk itself rendered; the hours population simply is not there, and
  // the queue was never even read.
  expect(
    screen.getByRole("heading", { name: "In the field" }),
  ).toBeInTheDocument();
  expect(mockFrom).not.toHaveBeenCalledWith("field_time_report_queue");
  expect(
    screen.queryByRole("heading", { name: "Hours reported by text" }),
  ).not.toBeInTheDocument();
});

it("shows nothing when the queue is empty, flag on", async () => {
  stubTables([]);
  render(<FieldDesk population={{ ...emptyDesk }} />, { wrapper: Wrapper });
  await waitFor(() =>
    expect(mockFrom).toHaveBeenCalledWith("field_time_report_queue"),
  );
  expect(
    screen.queryByRole("heading", { name: "Hours reported by text" }),
  ).not.toBeInTheDocument();
  expect(screen.queryByText(/reported/)).not.toBeInTheDocument();
});
