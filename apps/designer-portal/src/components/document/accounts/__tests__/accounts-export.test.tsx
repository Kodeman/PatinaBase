/**
 * THE EXPORT ACT ON THE LEDGER HEAD, RENDERED (P3 · SQ-166 F4).
 *
 * The two ledger suites next to this one stub `useOrganizations` to `[]`, so
 * `AccountsExportAction` returns null in both and the act itself was never
 * rendered by anything: nothing asserted that the studio is NAMED on it, that
 * the sentence afterwards says what left and what was withheld, or that a
 * failing read writes no file. This suite gives the viewer a studio.
 *
 * It mocks the SUPABASE CLIENT rather than the export's own modules, so the real
 * `fetchStudioBillingExport` → `buildStudioBillingExport` →
 * `buildStudioBillingWorkbook` → `saveStudioBillingWorkbook` chain runs: the
 * paging, the tenant leg, the disclosures and the workbook write are all the
 * shipped code. A partial mock could not reach them anyway — `downloadStudio-
 * BillingExport` calls its siblings through module-local bindings. The save is
 * observed where it actually happens, at the anchor click, which is how "nothing
 * was written" can be asserted rather than asserted about a mock.
 */

import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { AccountsExportAction } from "../accounts-export";
import { selectViewerStudioId } from "@/hooks/use-viewer-studio";

const STUDIO = "studio-a-0000-0000-0000-000000000001";
const STUDIO_NAME = "Middle West Studio";
const DESIGNER = "designer-0000-0000-0000-000000000001";

type Row = Record<string, unknown>;

/** The rows the fake PostgREST serves, by table. */
const TABLES: Record<string, Row[]> = {
  invoices: [
    {
      id: "inv-1",
      studio_id: STUDIO,
      designer_id: DESIGNER,
      client_id: "client-1",
      project_id: "proj-1",
      invoice_number: "INV-0001",
      title: null,
      status: "sent",
      currency: "USD",
      issue_date: "2026-09-01",
      due_date: "2026-09-15",
      payment_terms_days: 14,
      subtotal_cents: 100_000,
      tax_rate: 0.0875,
      tax_cents: 8_750,
      total_cents: 108_750,
      amount_paid_cents: 50_000,
      memo: null,
      sent_at: "2026-09-01T16:00:00Z",
      paid_at: null,
      voided_at: null,
      created_at: "2026-09-01T15:00:00Z",
      client: {
        id: "client-1",
        full_name: "Adaeze Okonkwo",
        display_name: null,
        email: "adaeze@example.com",
      },
      designer: {
        id: DESIGNER,
        full_name: "Leah Kochaver",
        display_name: null,
        email: "leah@example.com",
      },
    },
    // 00318/00513 — readable, carries no studio stamp, so a studio-scoped file
    // cannot claim it. It is counted head-only and must show up as withheld.
    {
      id: "inv-null",
      studio_id: null,
      designer_id: DESIGNER,
      client_id: "client-1",
      project_id: null,
      invoice_number: "INV-0009",
      status: "sent",
      currency: "USD",
      total_cents: 40_000,
      amount_paid_cents: 0,
      created_at: "2026-09-02T15:00:00Z",
    },
  ],
  invoice_line_items: [
    {
      id: "line-1",
      invoice_id: "inv-1",
      kind: "milestone",
      milestone_id: "ms-1",
      ffe_item_id: null,
      description: "Concept and schematic",
      quantity: 1,
      unit_amount_cents: 100_000,
      amount_cents: 100_000,
      sort_order: 0,
      created_at: "2026-09-01T15:00:00Z",
    },
  ],
  invoice_payments: [
    {
      id: "pay-1",
      invoice_id: "inv-1",
      amount_cents: 50_000,
      surcharge_cents: 0,
      method: "stripe",
      status: "succeeded",
      reference: null,
      received_at: "2026-09-05T10:00:00Z",
      created_at: "2026-09-05T10:00:00Z",
      recorded_by: DESIGNER,
      stripe_payment_intent_id: "pi_1",
      stripe_checkout_session_id: "cs_1",
    },
  ],
  projects: [
    {
      id: "proj-1",
      name: "Hollis House",
      studio_id: STUDIO,
      client_id: "client-1",
      client: {
        id: "client-1",
        full_name: "Adaeze Okonkwo",
        display_name: null,
        email: "adaeze@example.com",
      },
    },
  ],
  client_households: [],
  designer_clients: [
    {
      id: "dc-1",
      designer_id: DESIGNER,
      client_id: "client-1",
      household_id: null,
      client_name: "Adaeze Okonkwo",
      client_email: "adaeze@example.com",
      client_phone: null,
      status: "active",
      source: "direct",
      created_at: "2026-07-01T00:00:00Z",
      updated_at: "2026-09-01T00:00:00Z",
    },
    // The co-member's roster row with no path into this studio: excluded, and
    // the count of it is what the withheld sentence must carry.
    {
      id: "dc-2",
      designer_id: DESIGNER,
      client_id: "client-9",
      household_id: null,
      client_name: "Someone Elses Client",
      client_email: "b1@example.com",
      client_phone: null,
      status: "active",
      source: "direct",
      created_at: "2026-07-01T00:00:00Z",
      updated_at: "2026-09-01T00:00:00Z",
    },
  ],
};

/** The table whose read fails, or null. */
let failOn: string | null = null;

/** A fake PostgREST query builder: only the verbs this export uses. */
function makeQuery(table: string) {
  const filters: ((row: Row) => boolean)[] = [];
  let head = false;
  let pageSize = Number.POSITIVE_INFINITY;

  const api: Record<string, unknown> = {
    select(_columns: string, options?: { count?: string; head?: boolean }) {
      head = Boolean(options?.head);
      return api;
    },
    eq(column: string, value: unknown) {
      filters.push((row) => row[column] === value);
      return api;
    },
    neq(column: string, value: unknown) {
      filters.push((row) => row[column] !== value);
      return api;
    },
    is(column: string, value: null) {
      filters.push((row) => (row[column] ?? null) === value);
      return api;
    },
    not(column: string, _operator: string, value: null) {
      filters.push((row) => (row[column] ?? null) !== value);
      return api;
    },
    in(column: string, values: unknown[]) {
      filters.push((row) => values.includes(row[column]));
      return api;
    },
    gt(column: string, value: string) {
      filters.push((row) => String(row[column]) > value);
      return api;
    },
    order() {
      return api;
    },
    limit(count: number) {
      pageSize = count;
      return api;
    },
    then(resolve: (result: unknown) => unknown) {
      if (failOn === table)
        return Promise.resolve({
          data: null,
          count: null,
          error: { message: "permission denied for table " + table },
        }).then(resolve);
      const matched = (TABLES[table] ?? [])
        .filter((row) => filters.every((keep) => keep(row)))
        .sort((a, b) => String(a.id).localeCompare(String(b.id)));
      return Promise.resolve(
        head
          ? { data: null, count: matched.length, error: null }
          : { data: matched.slice(0, pageSize), count: null, error: null },
      ).then(resolve);
    },
  };
  return api;
}

jest.mock("@patina/supabase", () => ({
  useOrganizations: () => ({
    data: [
      {
        id: "studio-a-0000-0000-0000-000000000001",
        name: "Middle West Studio",
        type: "design_studio",
        membership: { role: "owner" },
      },
    ],
    isError: false,
  }),
  createBrowserClient: () => ({
    from: (table: string) => makeQuery(table),
  }),
}));

/** Every filename handed to the browser to save. */
let saved: string[] = [];

beforeEach(() => {
  failOn = null;
  saved = [];
  selectViewerStudioId(null);
  Object.defineProperty(URL, "createObjectURL", {
    writable: true,
    value: jest.fn(() => "blob:sq169"),
  });
  Object.defineProperty(URL, "revokeObjectURL", {
    writable: true,
    value: jest.fn(),
  });
  jest.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (
    this: HTMLAnchorElement,
  ) {
    saved.push(this.download);
  });
});

const exportAct = () =>
  screen.getByRole("button", { name: /Export the book/ }) as HTMLButtonElement;

/** The whole act, awaited: the click's own state update AND the four that land
 *  after the read, the build and the save resolve. */
const take = () => act(() => userEvent.click(exportAct()));

it("names the studio it would hand over, on the act and beside it", () => {
  render(<AccountsExportAction />);

  expect(exportAct().getAttribute("title")).toContain(STUDIO_NAME);
  expect(
    screen.getByText(/only, with a manifest of scope, exclusions and missing/),
  ).toHaveTextContent(STUDIO_NAME);
  // Nothing is claimed before she asks for it.
  expect(screen.queryByRole("status")).not.toBeInTheDocument();
  expect(saved).toEqual([]);
});

it("says what left the studio and what was withheld, and writes the file", async () => {
  render(<AccountsExportAction />);
  await take();

  const sentence = await screen.findByRole("status");
  expect(sentence).toHaveTextContent(
    /Saved 1 invoices, 1 lines, 1 payments and 1 client records/,
  );
  expect(sentence).toHaveTextContent(/snapshot \d{4}-\d{2}-\d{2}/);
  // The two disclosures, in the sentence and not only in the manifest sheet.
  expect(sentence).toHaveTextContent(
    /1 invoice you can read carry no studio and are not in this file/,
  );
  expect(sentence).toHaveTextContent(/1 client record/);
  expect(sentence).toHaveTextContent(/work and were left out/);
  expect(sentence).toHaveTextContent(/the manifest says so/);
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();

  expect(saved).toEqual([
    expect.stringMatching(
      /^patina-studio-billing-middle-west-studio-\d{4}-\d{2}-\d{2}\.xlsx$/,
    ),
  ]);
});

it("writes nothing when a read fails, and names the step that failed", async () => {
  failOn = "invoice_payments";
  render(<AccountsExportAction />);
  await take();

  const alert = await screen.findByRole("alert");
  expect(alert).toHaveTextContent(/invoice_payments could not be read/);
  expect(alert).toHaveTextContent(/Nothing was written/);
  // The point of the sentence: no partial file reached the disk.
  expect(saved).toEqual([]);
  expect(screen.queryByRole("status")).not.toBeInTheDocument();
  await waitFor(() => expect(exportAct()).not.toBeDisabled());
});
