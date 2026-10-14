import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

/**
 * Applied by text (V23 R2) on the Desk. The REAL use-model-applies module runs
 * — only the Supabase client is mocked — so the table read, the today filter
 * and the group revert RPC name/argument are the ones that reach Postgres.
 * @patina/supabase has no tsconfig alias, so the mocks go through the relative
 * paths jest resolves (matching time-report-card.test.tsx).
 */
const mockRpc = jest.fn();
const mockFrom = jest.fn();
const mockCalls: { gte: unknown[][]; eq: unknown[][]; range: unknown[][]; order: unknown[][]; in: unknown[][]; abortSignal: unknown[][] } = { gte: [], eq: [], range: [], order: [], in: [], abortSignal: [] };
let mockResponses: unknown[][] = [];
let mockQueryError = false;
let queryClientForTest: QueryClient;

jest.mock("../../../../../../../packages/supabase/src/client", () => ({
  createBrowserClient: () => ({ rpc: mockRpc, from: mockFrom }),
}));
jest.mock("@patina/supabase", () => ({
  ...jest.requireActual(
    "../../../../../../../packages/supabase/src/hooks/use-model-applies",
  ),
  useUser: () => ({ user: { id: "me" } }),
  useFieldTimeReportQueue: () => ({ data: [] }),
}));
jest.mock("@patina/types", () => ({ getFieldTradeLabel: () => "" }));
jest.mock("@/hooks/use-feature-flag", () => ({
  useFeatureFlag: () => ({ value: false, isLoading: false }),
}));
jest.mock("../../date-text-input", () => ({ DateTextInput: () => null }));
jest.mock("../../document-action", () => ({
  DocumentAction: ({ children, onClick, disabled, ...rest }: any) => (
    <button
      aria-label={rest["aria-label"]}
      onClick={onClick}
      disabled={disabled}
    >
      {children}
    </button>
  ),
  DocumentActionGroup: ({ children }: any) => <div>{children}</div>,
  DocumentActionRow: ({ children }: any) => <div>{children}</div>,
}));
jest.mock("../../section-eyebrow", () => ({
  SectionEyebrow: ({ children }: any) => <h2>{children}</h2>,
}));

import { FieldDesk } from "../field-desk";

import { useModelApplies } from "../../../../../../../packages/supabase/src/hooks/use-model-applies";

function AppliesHarness() {
  const { data = [] } = useModelApplies({ since: new Date(0).toISOString() });
  return <output>{data.map((row) => row.source_id).join(",")}</output>;
}

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
  queryClientForTest = client;
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

/** A thenable PostgREST builder answering `rows`. */
function rowsBuilder(rows: unknown[]) {
  const b: any = {};
  b.select = jest.fn(() => b);
  b.order = jest.fn((...args: unknown[]) => {
    mockCalls.order.push(args);
    return b;
  });
  b.eq = jest.fn((...args: unknown[]) => {
    mockCalls.eq.push(args);
    return b;
  });
  b.in = jest.fn((...args: unknown[]) => {
    mockCalls.in.push(args);
    return b;
  });
  b.abortSignal = jest.fn((...args: unknown[]) => {
    mockCalls.abortSignal.push(args);
    return b;
  });
  b.range = jest.fn((...args: unknown[]) => {
    mockCalls.range.push(args);
    return b;
  });
  b.gte = jest.fn((...args: unknown[]) => {
    mockCalls.gte.push(args);
    return b;
  });
  b.then = (
    resolve: (v: unknown) => unknown,
    reject: (e: unknown) => unknown,
  ) => {
    const responseRows = mockResponses.length ? mockResponses.shift() : rows;
    return Promise.resolve({ data: mockQueryError ? null : responseRows, error: mockQueryError ? new Error('offline') : null }).then(resolve, reject);
  };
  return b;
}

const emptyDesk = { cards: [], lines: [], isLoading: false, isError: false };

function apply(overrides: Record<string, unknown> = {}) {
  return {
    id: "apply-1",
    studio_id: "studio-1",
    project_id: "p1",
    source: "sms",
    source_id: "sms-1",
    effect_type: "mark_done",
    target_table: "client_decisions",
    target_id: "item-1",
    inserted: false,
    summary: "Tile delivery marked done",
    applied_at: new Date().toISOString(),
    reverted_at: null,
    revert_outcome: null,
    project: { id: "p1", name: "Maple" },
    ...overrides,
  };
}

beforeEach(() => {
  mockRpc.mockReset();
  mockFrom.mockReset();
  mockCalls.gte = [];
  mockCalls.eq = [];
  mockCalls.range = [];
  mockCalls.order = [];
  mockCalls.in = [];
  mockCalls.abortSignal = [];
  mockResponses = [];
  mockQueryError = false;
});

it("is hidden entirely when nothing was applied by text today", async () => {
  mockFrom.mockImplementation(() => rowsBuilder([]));
  render(<FieldDesk population={{ ...emptyDesk }} />, { wrapper: Wrapper });
  await waitFor(() => expect(mockFrom).toHaveBeenCalledWith("model_applies"));
  // Reads today's applies only: since the viewer's local midnight.
  await waitFor(() => expect(mockCalls.gte).toHaveLength(1));
  const [column, since] = mockCalls.gte[0] as [string, string];
  const midnight = new Date();
  midnight.setHours(0, 0, 0, 0);
  expect(column).toBe("applied_at");
  expect(since).toBe(midnight.toISOString());
  expect(screen.queryByText("Applied by text")).toBeNull();
  expect(screen.queryByRole("button", { name: /^Undo/ })).toBeNull();
});

it("discovers groups across pages and fetches the complete set in one stably ordered batch", async () => {
  const discovery = Array.from({ length: 1000 }, () => ({ source_id: "sms-large" }));
  const firstFetchPage = [
    apply({ source_id: "sms-large" }),
    apply({ id: "apply-two", source_id: "sms-two" }),
    ...Array.from({ length: 998 }, (_, index) =>
      apply({ id: `apply-${index + 3}`, source_id: "sms-large" }),
    ),
  ];
  mockResponses = [
    discovery,
    [{ source_id: "sms-two" }, { source_id: "sms-three" }],
    firstFetchPage,
    [apply({ id: "apply-last", source_id: "sms-three" })],
  ];
  mockFrom.mockImplementation(() => rowsBuilder([]));

  render(<AppliesHarness />, { wrapper: Wrapper });
  await waitFor(() => expect(screen.getByRole("status").textContent).toContain("sms-three"));

  expect(mockCalls.range).toEqual([
    [0, 999],
    [1000, 1999],
    [0, 999],
    [1000, 1999],
  ]);
  expect(mockCalls.in).toEqual([
    ["source_id", ["sms-large", "sms-two", "sms-three"]],
  ]);
  expect(mockCalls.order).toHaveLength(6);
  for (let i = 0; i < mockCalls.order.length; i += 2) {
    expect(mockCalls.order[i]).toEqual(["applied_at", { ascending: false }]);
    expect(mockCalls.order[i + 1]).toEqual(["id", { ascending: false }]);
  }
  expect(mockCalls.abortSignal).toHaveLength(4);
});

it("keeps discovering past ten full pages from one text until the rows run out", async () => {
  const fullPage = Array.from({ length: 1000 }, () => ({ source_id: "sms-huge" }));
  mockResponses = [
    ...Array.from({ length: 10 }, () => fullPage),
    [{ source_id: "sms-older" }],
    [apply({ source_id: "sms-huge" }), apply({ id: "apply-older", source_id: "sms-older" })],
  ];
  mockFrom.mockImplementation(() => rowsBuilder([]));

  render(<AppliesHarness />, { wrapper: Wrapper });
  await waitFor(() => expect(screen.getByRole("status").textContent).toContain("sms-older"));

  expect(mockCalls.range.slice(0, 11)).toEqual(
    Array.from({ length: 11 }, (_, page) => [page * 1000, page * 1000 + 999]),
  );
  expect(mockCalls.in).toEqual([["source_id", ["sms-huge", "sms-older"]]]);
});

it("shows a quiet retry when the applied-by-text query fails", async () => {
  mockQueryError = true;
  mockFrom.mockImplementation(() => rowsBuilder([]));
  render(<FieldDesk population={{ ...emptyDesk }} />, { wrapper: Wrapper });

  expect(await screen.findByText("Could not load applied texts.")).toBeInTheDocument();
  const retry = screen.getByRole("button", { name: "Try again" });
  expect(retry).toBeInTheDocument();
  expect(screen.queryByRole("status")).toBeNull();
  expect(screen.queryByRole("button", { name: /^Undo/ })).toBeNull();

  mockQueryError = false;
  fireEvent.click(retry);
  await waitFor(() => expect(mockFrom).toHaveBeenCalledTimes(2));
  await waitFor(() => expect(screen.queryByText("Could not load applied texts.")).toBeNull());
  expect(screen.queryByText("Applied by text")).toBeNull();
});

it("lists one line per text with its project, and Undo puts the text back", async () => {
  mockFrom.mockImplementation(() => rowsBuilder([]));
  mockResponses = [
    [{ source_id: 'sms-1' }],
    [
      apply(),
      // mark_done also unblocked a task: the complete group arrives together.
      apply({ id: 'apply-2', target_table: 'project_tasks', target_id: 'task-1' }),
    ],
    [{ source_id: 'sms-1' }],
    [
      apply({ reverted_at: new Date().toISOString() }),
      apply({ id: 'apply-2', target_table: 'project_tasks', target_id: 'task-1', reverted_at: new Date().toISOString() }),
    ],
  ];
  mockRpc.mockResolvedValue({
    data: { outcome: "restored", sourceId: "sms-1", restored: 2 },
    error: null,
  });
  render(<FieldDesk population={{ ...emptyDesk }} />, { wrapper: Wrapper });
  const invalidateSpy = jest.spyOn(queryClientForTest, "invalidateQueries");

  expect(await screen.findByText("Applied by text")).toBeInTheDocument();
  expect(mockCalls.eq).toContainEqual(["source", "sms"]);
  expect(mockCalls.eq).not.toContainEqual(["source_id", "sms-1"]);
  expect(mockCalls.in).toContainEqual([
    "source_id",
    ["sms-1"],
  ]);
  expect(mockCalls.range).toContainEqual([0, 999]);
  expect(mockCalls.gte).toHaveLength(1);
  expect(screen.getByText("Tile delivery marked done")).toBeInTheDocument();
  expect(screen.getByText("Maple")).toBeInTheDocument();
  const undos = screen.getAllByRole("button", { name: /^Undo/ });
  expect(undos).toHaveLength(1);

  fireEvent.click(undos[0]);
  await waitFor(() =>
    expect(mockRpc).toHaveBeenCalledWith("revert_model_apply_group", {
      p_source_id: "sms-1",
    }),
  );
  const line = await screen.findByText("Undone.");
  expect(line).toHaveFocus();
  expect(screen.queryByRole("button", { name: /^Undo/ })).toBeNull();
  const invalidatedKeys = invalidateSpy.mock.calls.map(([filters]) => filters.queryKey);
  expect(invalidatedKeys).toContainEqual(["project-ffe-items", "p1"]);
  expect(invalidatedKeys).toContainEqual(["project-decisions", "p1"]);
});

it("a conflict says it changed since and offers no Undo again", async () => {
  mockFrom.mockImplementation(() => rowsBuilder([apply()]));
  mockRpc.mockResolvedValue({
    data: { outcome: "conflict", sourceId: "sms-1", conflicts: ["apply-1"] },
    error: null,
  });
  render(<FieldDesk population={{ ...emptyDesk }} />, { wrapper: Wrapper });
  fireEvent.click(await screen.findByRole("button", { name: /^Undo/ }));
  expect(
    await screen.findByText(
      "Tile delivery marked done · Changed since — left as is.",
    ),
  ).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: /^Undo/ })).toBeNull();
});
