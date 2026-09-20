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

function wrapper({ children }: { children: React.ReactNode }) {
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
  stubTables([report()]);
});

it("states the claim in plain words, with the hours and the task", () => {
  render(<TimeReportCard report={report({ note: "gate was locked at 7" })} />, {
    wrapper,
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
  render(<TimeReportCard report={report()} />, { wrapper });
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
  render(<TimeReportCard report={report()} />, { wrapper });
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
  render(<TimeReportCard report={report()} />, { wrapper });
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
  render(<TimeReportCard report={report()} />, { wrapper });
  fireEvent.click(screen.getByRole("button", { name: "Accept" }));
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "This one changed — take another look.",
  );
  expect(
    screen.queryByText("Couldn’t save — try again."),
  ).not.toBeInTheDocument();
});

it("mounts the hours population on the Desk when there is something to decide", async () => {
  render(<FieldDesk population={{ ...emptyDesk }} />, { wrapper });
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
  render(<FieldDesk population={{ ...emptyDesk }} />, { wrapper });
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
  render(<FieldDesk population={{ ...emptyDesk }} />, { wrapper });
  await waitFor(() =>
    expect(mockFrom).toHaveBeenCalledWith("field_time_report_queue"),
  );
  expect(
    screen.queryByRole("heading", { name: "Hours reported by text" }),
  ).not.toBeInTheDocument();
  expect(screen.queryByText(/reported/)).not.toBeInTheDocument();
});
