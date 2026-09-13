/**
 * The bookkeeper's Friday (W5, HT-20) — column order, RFC-4180 escaping, an
 * internal row's empty project cell, a non-org-member roster vendor's row
 * present, and the amount column summing to the ledger total.
 */

import {
  buildTimeExportCsv,
  timeExportTotalCents,
  timeExportFilename,
  type TimeExportRow,
} from "../time-export";
import type { TimeEntryLedgerRow } from "@patina/supabase";

function row(overrides: Partial<TimeExportRow> = {}): TimeExportRow {
  const base: TimeEntryLedgerRow = {
    id: "t1",
    project_id: "p1",
    project_name: "Okonkwo Residence",
    studio_id: "s1",
    user_id: "u1",
    member_name: "Maria Alvarez",
    phase_key: null,
    task_id: null,
    started_at: "2026-09-03T14:00:00Z",
    day: "2026-09-03",
    iso_week: "2026-W36",
    month: "2026-09",
    duration_minutes: 90,
    is_running: false,
    billable: true,
    activity: "design",
    source: "timer_manual",
    billing_state: "authorized",
    rate_source: "studio_member",
    rate_role: "lead_designer",
    resolved_rate_cents: 14_500,
    amount_cents: 21_750,
    invoice_id: null,
    billing_authority_id: null,
    authority_rate_id: null,
    created_at: "2026-09-03T15:30:00Z",
    updated_at: "2026-09-03T15:30:00Z",
  };
  return { ...base, ...overrides };
}

describe("buildTimeExportCsv", () => {
  it("column order — the fixed 14-column header", () => {
    const csv = buildTimeExportCsv([]);
    const [header] = csv.split("\r\n");
    expect(header).toBe(
      [
        "Member",
        "Date",
        "Project",
        "Client",
        "Activity",
        "Billable",
        "Duration (min)",
        "Rate",
        "Rate Source",
        "Rate Role",
        "Amount",
        "Billing State",
        "Invoiced",
        "Invoice #",
      ]
        .map((h) => `"${h}"`)
        .join(","),
    );
  });

  it("RFC-4180 escaping — a value carrying a comma, a quote, and a newline", () => {
    const csv = buildTimeExportCsv([
      row({
        project_name: 'The "Okonkwo, Jr." house\nWing B',
      }),
    ]);
    const lines = csv.trimEnd().split("\r\n");
    expect(lines).toHaveLength(2);
    // The quote is doubled, the comma stays inside the quoted field (so it
    // does not split the column), and the newline is flattened to a space.
    expect(lines[1]).toContain('"The ""Okonkwo, Jr."" house Wing B"');
  });

  it("an internal row's project cell is empty (W4: project_id IS NULL)", () => {
    const csv = buildTimeExportCsv([
      row({ project_id: null as unknown as string, project_name: null }),
    ]);
    const [, dataLine] = csv.trimEnd().split("\r\n");
    const fields = dataLine.split(",");
    // Member, Date, Project, ... — Project is the 3rd column (index 2).
    expect(fields[2]).toBe('""');
  });

  it("an entry by a non-org-member roster vendor is present (the W0 LEFT JOIN payoff)", () => {
    // The ledger's LEFT JOIN to profiles means an author outside the
    // caller's own profiles RLS still produces a row — just with a NULL
    // name — rather than being silently dropped.
    const csv = buildTimeExportCsv([row({ member_name: null })]);
    const [, dataLine] = csv.trimEnd().split("\r\n");
    expect(dataLine).toBeDefined();
    expect(dataLine.split(",")[0]).toBe('""');
  });

  it("billable/invoiced render as Yes/No, and rate/amount as plain decimal dollars", () => {
    const csv = buildTimeExportCsv([
      row({ billable: false, invoice_id: "inv1", invoice_number: "INV-0007" }),
    ]);
    const [, dataLine] = csv.trimEnd().split("\r\n");
    const fields = dataLine.split(",").map((f) => f.replace(/^"|"$/g, ""));
    expect(fields[5]).toBe("No"); // Billable
    expect(fields[7]).toBe("145.00"); // Rate
    expect(fields[10]).toBe("217.50"); // Amount
    expect(fields[12]).toBe("Yes"); // Invoiced
    expect(fields[13]).toBe("INV-0007"); // Invoice #
  });

  it("the amount column sums to the ledger total", () => {
    const rows = [
      row({ id: "t1", amount_cents: 21_750 }),
      row({ id: "t2", amount_cents: 7_250, member_name: "Leah Brooks" }),
      row({
        id: "t3",
        amount_cents: 0,
        billing_state: "pending_authorization",
      }),
    ];
    const csv = buildTimeExportCsv(rows);
    const dataLines = csv.trimEnd().split("\r\n").slice(1);
    const summed = dataLines.reduce((sum, line) => {
      const amount = line.split(",")[10].replace(/"/g, "");
      return sum + Math.round(parseFloat(amount) * 100);
    }, 0);
    expect(summed).toBe(timeExportTotalCents(rows));
    expect(summed).toBe(29_000);
  });
});

describe("timeExportFilename", () => {
  it("slugifies the scope and stamps the date", () => {
    expect(timeExportFilename("This Studio", "2026-09-12")).toBe(
      "patina-hours-this-studio-2026-09-12.csv",
    );
  });

  it('falls back to "hours" for an empty scope label', () => {
    expect(timeExportFilename("", "2026-09-12")).toBe(
      "patina-hours-hours-2026-09-12.csv",
    );
  });
});
