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
const mockCalls: { gte: unknown[][] } = { gte: [] };

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

/** A thenable PostgREST builder answering `rows`. */
function rowsBuilder(rows: unknown[]) {
  const b: any = {};
  b.select = jest.fn(() => b);
  b.order = jest.fn(() => b);
  b.eq = jest.fn(() => b);
  b.gte = jest.fn((...args: unknown[]) => {
    mockCalls.gte.push(args);
    return b;
  });
  b.then = (
    resolve: (v: unknown) => unknown,
    reject: (e: unknown) => unknown,
  ) => Promise.resolve({ data: rows, error: null }).then(resolve, reject);
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

it("lists one line per text with its project, and Undo puts the text back", async () => {
  mockFrom.mockImplementation(() =>
    rowsBuilder([
      apply(),
      // mark_done also unblocked a task: same text, one line, one Undo.
      apply({ id: "apply-2", target_table: "project_tasks", target_id: "task-1" }),
    ]),
  );
  mockRpc.mockResolvedValue({
    data: { outcome: "restored", sourceId: "sms-1", restored: 2 },
    error: null,
  });
  render(<FieldDesk population={{ ...emptyDesk }} />, { wrapper: Wrapper });

  expect(await screen.findByText("Applied by text")).toBeInTheDocument();
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
