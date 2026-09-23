/**
 * THE STUDIO BILLING EXPORT'S ROW BUILDER (P3).
 *
 * The fixtures hold TWO studios and one designer who works for both — the exact
 * shape the co-member RLS exposes (`is_studio_comember(designer_id)` matches any
 * shared organization, 00316/00584; the hole 00632:30-37 names) — plus one
 * invoice carrying no studio at all (00318/00513). The builder must write one
 * studio's book and disclose every row it did not.
 */

import {
  buildStudioBillingExport,
  invoicePaymentStanding,
  resolveInvoicePayerName,
  studioBillingExportFilename,
  studioBillingManifestText,
  type BillingExportSheet,
  type RawClientRecordRow,
  type RawHouseholdRow,
  type RawInvoiceRow,
  type RawLineRow,
  type RawPaymentRow,
  type RawProjectRow,
  type SheetCell,
  type StudioBillingSource,
} from "../studio-billing-export";

const STUDIO_A = "studio-a-0000-0000-0000-000000000001";
const STUDIO_B = "studio-b-0000-0000-0000-000000000002";
/** One designer, two studios — the co-member RLS returns both studios' rows. */
const DESIGNER = "designer-0000-0000-0000-000000000001";

// ── invoices ───────────────────────────────────────────────────────────────

function invoice(overrides: Partial<RawInvoiceRow> = {}): RawInvoiceRow {
  return {
    id: "inv-a1",
    studio_id: STUDIO_A,
    designer_id: DESIGNER,
    client_id: "client-a1",
    project_id: "proj-a1",
    invoice_number: "INV-0001",
    title: null,
    status: "partially_paid",
    currency: "USD",
    issue_date: "2026-09-01",
    due_date: "2026-09-15",
    payment_terms_days: 14,
    subtotal_cents: 100_000,
    tax_rate: 0.0875,
    tax_cents: 8_750,
    total_cents: 108_750,
    amount_paid_cents: 50_000,
    memo: "Design fee, phase one",
    sent_at: "2026-09-01T16:00:00Z",
    paid_at: null,
    voided_at: null,
    created_at: "2026-09-01T15:00:00Z",
    client: {
      id: "client-a1",
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
    ...overrides,
  };
}

/** The invoice this export exists for: a STUDIO invoice (no project, 00571)
 *  whose payer household holds a profile with no name and a roster row carrying
 *  only an email — 00588's production case. */
const STUDIO_INVOICE = invoice({
  id: "inv-a2",
  project_id: null,
  client_id: "client-a2",
  invoice_number: "INV-0002",
  title: "Retainer, September",
  status: "paid",
  subtotal_cents: 250_000,
  tax_rate: 0,
  tax_cents: 0,
  total_cents: 250_000,
  amount_paid_cents: 250_000,
  memo: null,
  paid_at: "2026-09-10T12:00:00Z",
  created_at: "2026-09-02T15:00:00Z",
  client: {
    id: "client-a2",
    full_name: null,
    display_name: null,
    email: "signup-a2@example.com",
  },
});

/** Another studio's invoice, readable here only because the designer is a
 *  co-member of both. It must never reach the file. */
const FOREIGN_INVOICE = invoice({
  id: "inv-b1",
  studio_id: STUDIO_B,
  client_id: "client-b1",
  project_id: "proj-b1",
  invoice_number: "INV-0001",
  total_cents: 999_900,
  amount_paid_cents: 0,
  client: {
    id: "client-b1",
    full_name: "Someone Elses Client",
    display_name: null,
    email: "b1@example.com",
  },
});

/** 00318/00513 — an invoice with no studio stamp at all. */
const NULL_STUDIO_INVOICE = invoice({
  id: "inv-null",
  studio_id: null,
  invoice_number: "INV-0009",
  client_id: "client-a1",
  project_id: null,
  total_cents: 40_000,
  amount_paid_cents: 0,
});

// ── children ───────────────────────────────────────────────────────────────

const LINES: RawLineRow[] = [
  {
    id: "line-a1",
    invoice_id: "inv-a1",
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
  {
    id: "line-a2",
    invoice_id: "inv-a2",
    kind: "adhoc",
    milestone_id: null,
    ffe_item_id: null,
    description: "=SUM(A1:A9) as a line description",
    quantity: 1,
    unit_amount_cents: 250_000,
    amount_cents: 250_000,
    sort_order: 0,
    created_at: "2026-09-02T15:00:00Z",
  },
  {
    id: "line-b1",
    invoice_id: "inv-b1",
    kind: "adhoc",
    milestone_id: null,
    ffe_item_id: null,
    description: "Another studio’s line",
    quantity: 1,
    unit_amount_cents: 999_900,
    amount_cents: 999_900,
    sort_order: 0,
    created_at: "2026-09-01T15:00:00Z",
  },
];

function payment(overrides: Partial<RawPaymentRow> = {}): RawPaymentRow {
  return {
    id: "pay-1",
    invoice_id: "inv-a1",
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
    ...overrides,
  };
}

const PAYMENTS: RawPaymentRow[] = [
  payment(),
  payment({
    id: "pay-2",
    invoice_id: "inv-a1",
    amount_cents: 20_000,
    status: "failed",
    stripe_payment_intent_id: "pi_2",
    received_at: null,
  }),
  payment({
    id: "pay-3",
    invoice_id: "inv-a2",
    amount_cents: 250_000,
    status: "succeeded",
    method: "check",
    reference: "=1+1",
    received_at: "2026-09-10T12:00:00Z",
  }),
  payment({
    id: "pay-b1",
    invoice_id: "inv-b1",
    amount_cents: 999_900,
    status: "succeeded",
  }),
];

const PROJECTS: RawProjectRow[] = [
  {
    id: "proj-a1",
    name: "Okonkwo residence",
    studio_id: STUDIO_A,
    client_id: "client-a1",
    client: {
      id: "client-a1",
      full_name: "Adaeze Okonkwo",
      display_name: null,
      email: "adaeze@example.com",
    },
  },
  {
    id: "proj-b1",
    name: "Another studio’s house",
    studio_id: STUDIO_B,
    client_id: "client-b1",
    client: {
      id: "client-b1",
      full_name: "Someone Elses Client",
      display_name: null,
      email: "b1@example.com",
    },
  },
];

const HOUSEHOLDS: RawHouseholdRow[] = [
  {
    id: "hh-a",
    organization_id: STUDIO_A,
    designer_id: DESIGNER,
    display_name: "Okonkwo residence",
    member_person_ids: ["person-1", "person-2"],
    co_threshold_cents: 250_000,
    created_at: "2026-08-01T00:00:00Z",
  },
  {
    id: "hh-b",
    organization_id: STUDIO_B,
    designer_id: DESIGNER,
    display_name: "Another studio’s household",
    member_person_ids: ["person-9"],
    co_threshold_cents: 500_000,
    created_at: "2026-08-01T00:00:00Z",
  },
];

function clientRecord(
  overrides: Partial<RawClientRecordRow> = {},
): RawClientRecordRow {
  return {
    id: "dc-a1",
    designer_id: DESIGNER,
    client_id: "client-a1",
    household_id: null,
    client_name: "Adaeze Okonkwo",
    client_email: "adaeze@example.com",
    client_phone: "+16085551234",
    status: "active",
    source: "direct",
    created_at: "2026-07-01T00:00:00Z",
    updated_at: "2026-09-01T00:00:00Z",
    client: {
      id: "client-a1",
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
    ...overrides,
  };
}

const CLIENT_RECORDS: RawClientRecordRow[] = [
  clientRecord(),
  // The 00588 case: named by nothing but the address the studio entered, and
  // holding this studio's household.
  clientRecord({
    id: "dc-a2",
    client_id: "client-a2",
    household_id: "hh-a",
    client_name: null,
    client_email: "okonkwo.house@example.com",
    client_phone: null,
    status: "active",
    client: {
      id: "client-a2",
      full_name: null,
      display_name: null,
      email: "signup-a2@example.com",
    },
  }),
  // The lead row the household was promoted from survives beside the active one
  // (00331) and is the OLDER of the two. Named by nothing either, so it must not
  // stop the ladder reaching the active row's address.
  clientRecord({
    id: "dc-a2-lead",
    client_id: "client-a2",
    household_id: null,
    client_name: null,
    client_email: null,
    status: "lead",
    created_at: "2026-06-01T00:00:00Z",
    client: {
      id: "client-a2",
      full_name: null,
      display_name: null,
      email: "signup-a2@example.com",
    },
  }),
  // The same designer's client in her OTHER studio. Readable here; authorized
  // by nothing in this studio.
  clientRecord({
    id: "dc-b1",
    client_id: "client-b1",
    household_id: "hh-b",
    client_name: "Someone Elses Client",
    client_email: "b1@example.com",
    client: {
      id: "client-b1",
      full_name: "Someone Elses Client",
      display_name: null,
      email: "b1@example.com",
    },
  }),
  // A roster row the studio holds with a formula-shaped name.
  clientRecord({
    id: "dc-a3",
    client_id: "client-a3",
    household_id: null,
    client_name: '=HYPERLINK("https://evil.example","Total")',
    client_email: null,
    status: "lead",
  }),
];

function source(
  overrides: Partial<StudioBillingSource> = {},
): StudioBillingSource {
  return {
    studioId: STUDIO_A,
    studioName: "Middle West Studio",
    snapshotAt: "2026-09-23T17:04:05.000Z",
    invoices: [invoice(), STUDIO_INVOICE, FOREIGN_INVOICE, NULL_STUDIO_INVOICE],
    lines: LINES,
    payments: PAYMENTS,
    projects: PROJECTS,
    clientRecords: CLIENT_RECORDS,
    households: HOUSEHOLDS,
    nullStudioInvoiceCount: 1,
    otherStudioInvoiceCount: 1,
    ...overrides,
  };
}

// ── helpers ────────────────────────────────────────────────────────────────

function sheet(built: { sheets: BillingExportSheet[] }, name: string) {
  const found = built.sheets.find((s) => s.name === name);
  if (!found) throw new Error(`no sheet named ${name}`);
  return found;
}

function column(s: BillingExportSheet, name: string): number {
  const index = s.header.indexOf(name);
  if (index < 0) throw new Error(`sheet ${s.name} has no column ${name}`);
  return index;
}

function cells(s: BillingExportSheet, name: string): SheetCell[] {
  const index = column(s, name);
  return s.rows.map((row) => row[index]);
}

function manifestValue(
  built: ReturnType<typeof buildStudioBillingExport>,
  section: string,
  key: string,
): string | number {
  const entry = built.manifest.entries.find(
    (e) => e.section === section && e.key === key,
  );
  if (!entry) throw new Error(`no manifest entry ${section}/${key}`);
  return entry.value;
}

// ═══════════════════════════════════════════════════════════════════════════

describe("buildStudioBillingExport — the tenant leg", () => {
  it("writes only this studio’s invoices; the co-member’s other studio never appears", () => {
    const built = buildStudioBillingExport(source());
    const invoices = sheet(built, "invoices");
    expect(cells(invoices, "invoice_id")).toEqual(["inv-a1", "inv-a2"]);
    expect(cells(invoices, "studio_id")).toEqual([STUDIO_A, STUDIO_A]);
    const flat = JSON.stringify(built.sheets);
    expect(flat).not.toContain("inv-b1");
    expect(flat).not.toContain(STUDIO_B);
  });

  it("drops the other studio’s lines and payments with its invoice", () => {
    const built = buildStudioBillingExport(source());
    expect(cells(sheet(built, "invoice_lines"), "line_id")).toEqual([
      "line-a1",
      "line-a2",
    ]);
    expect(cells(sheet(built, "payments"), "payment_id")).toEqual([
      "pay-1",
      "pay-2",
      "pay-3",
    ]);
    expect(
      manifestValue(
        built,
        "exclusions",
        "invoice_lines_without_included_invoice",
      ),
    ).toBe(1);
    expect(
      manifestValue(built, "exclusions", "payments_without_included_invoice"),
    ).toBe(1);
  });

  it("keeps a client record only on an unambiguous studio authorization path", () => {
    const built = buildStudioBillingExport(source());
    const clients = sheet(built, "clients");
    expect(cells(clients, "client_record_id").sort()).toEqual([
      "dc-a1",
      "dc-a2",
      "dc-a2-lead",
    ]);
    // dc-b1 is the same designer's client in her other studio; dc-a3 has no
    // studio-stamped object naming it at all.
    expect(cells(clients, "client_record_id")).not.toContain("dc-b1");
    expect(cells(clients, "client_record_id")).not.toContain("dc-a3");
    expect(
      manifestValue(built, "exclusions", "client_records_without_studio_path"),
    ).toBe(2);
    expect(cells(clients, "studio_authorization_path")).toEqual(
      expect.arrayContaining(["studio_invoice"]),
    );
  });

  it("never keys a row on another studio’s household", () => {
    const built = buildStudioBillingExport(source());
    expect(cells(sheet(built, "clients"), "household_id")).not.toContain(
      "hh-b",
    );
    expect(cells(sheet(built, "invoices"), "household_id")).not.toContain(
      "hh-b",
    );
  });

  it("counts, but never writes, a row the query’s own tenant leg should have refused", () => {
    const built = buildStudioBillingExport(source());
    expect(
      manifestValue(built, "exclusions", "fetched_rows_dropped_other_studio"),
    ).toBe(1);
    expect(
      manifestValue(built, "exclusions", "projects_read_naming_another_studio"),
    ).toBe(1);
  });
});

describe("buildStudioBillingExport — the studio-less invoice disclosure", () => {
  it("discloses the count of readable invoices carrying no studio (00318/00513)", () => {
    const built = buildStudioBillingExport(source());
    expect(
      manifestValue(built, "exclusions", "invoices_with_null_studio_id"),
    ).toBe(1);
    expect(
      manifestValue(built, "exclusions", "fetched_rows_dropped_null_studio"),
    ).toBe(1);
    expect(cells(sheet(built, "invoices"), "invoice_id")).not.toContain(
      "inv-null",
    );
  });

  it("carries the disclosure even when the fetch returned no such rows", () => {
    const built = buildStudioBillingExport(
      source({
        invoices: [invoice(), STUDIO_INVOICE],
        nullStudioInvoiceCount: 7,
        otherStudioInvoiceCount: 0,
      }),
    );
    expect(
      manifestValue(built, "exclusions", "invoices_with_null_studio_id"),
    ).toBe(7);
    expect(
      manifestValue(built, "exclusions", "fetched_rows_dropped_null_studio"),
    ).toBe(0);
  });
});

describe("buildStudioBillingExport — the studio invoice with no project", () => {
  it("is included, and its Client cell carries the 00588 household address", () => {
    const built = buildStudioBillingExport(source());
    const invoices = sheet(built, "invoices");
    const row = invoices.rows[1];
    expect(row[column(invoices, "invoice_id")]).toBe("inv-a2");
    expect(row[column(invoices, "project_id")]).toBeNull();
    expect(row[column(invoices, "project_name")]).toBeNull();
    // Not blank, not the stale lead label, not the signup email on the profile.
    expect(row[column(invoices, "client_name")]).toBe(
      "okonkwo.house@example.com",
    );
    expect(row[column(invoices, "client_id")]).toBe("client-a2");
    expect(row[column(invoices, "household_id")]).toBe("hh-a");
    expect(row[column(invoices, "household_name")]).toBe("Okonkwo residence");
    expect(row[column(invoices, "title")]).toBe("Retainer, September");
  });

  it("names a payer with a profile name from the profile", () => {
    const built = buildStudioBillingExport(source());
    const invoices = sheet(built, "invoices");
    expect(invoices.rows[0][column(invoices, "client_name")]).toBe(
      "Adaeze Okonkwo",
    );
  });
});

describe("resolveInvoicePayerName — 00588, step for step", () => {
  const roster = new Map([[DESIGNER, CLIENT_RECORDS]]);
  const profiles = new Map([
    [
      "client-a2",
      {
        id: "client-a2",
        full_name: null,
        display_name: null,
        email: "signup-a2@example.com",
      },
    ],
  ]);

  it("falls through to the payer profile’s email when the roster holds neither", () => {
    const name = resolveInvoicePayerName(
      { client_id: "client-a2", designer_id: DESIGNER, client: null },
      null,
      new Map([
        [
          DESIGNER,
          [
            clientRecord({
              id: "x",
              client_id: "client-a2",
              client_name: null,
              client_email: null,
            }),
          ],
        ],
      ]),
      profiles,
    );
    expect(name).toBe("signup-a2@example.com");
  });

  it("lets the active row’s name beat the older lead row’s", () => {
    const both = new Map([
      [
        DESIGNER,
        [
          clientRecord({
            id: "lead",
            client_id: "client-a2",
            client_name: "A stale lead label",
            status: "lead",
            created_at: "2026-06-01T00:00:00Z",
          }),
          clientRecord({
            id: "active",
            client_id: "client-a2",
            client_name: "Okonkwo residence",
            status: "active",
            created_at: "2026-07-01T00:00:00Z",
          }),
        ],
      ],
    ]);
    expect(
      resolveInvoicePayerName(
        { client_id: "client-a2", designer_id: DESIGNER, client: null },
        null,
        both,
        profiles,
      ),
    ).toBe("Okonkwo residence");
  });

  // 00588:186-189 — the value test sits in the WHERE, before the LIMIT: a
  // blank-named ACTIVE row must not be picked and then discarded, hiding a lead
  // row that does carry a name.
  it("does not let a blank-named active row hide a named lead row", () => {
    const both = new Map([
      [
        DESIGNER,
        [
          clientRecord({
            id: "lead",
            client_id: "client-a2",
            client_name: "Jodi Kurhn",
            client_email: null,
            status: "lead",
            created_at: "2026-06-01T00:00:00Z",
          }),
          clientRecord({
            id: "active",
            client_id: "client-a2",
            client_name: null,
            client_email: null,
            status: "active",
            created_at: "2026-07-01T00:00:00Z",
          }),
        ],
      ],
    ]);
    expect(
      resolveInvoicePayerName(
        { client_id: "client-a2", designer_id: DESIGNER, client: null },
        null,
        both,
        profiles,
      ),
    ).toBe("Jodi Kurhn");
  });

  it("takes the project’s client when the invoice carries no payer", () => {
    const name = resolveInvoicePayerName(
      { client_id: null, designer_id: DESIGNER, client: null },
      PROJECTS[0],
      roster,
      new Map(),
    );
    expect(name).toBe("Adaeze Okonkwo");
  });

  it("names nobody rather than guess when two email-only leads could answer", () => {
    const two = new Map([
      [
        DESIGNER,
        [
          clientRecord({ id: "l1", client_id: null, client_name: "Lead one" }),
          clientRecord({ id: "l2", client_id: null, client_name: "Lead two" }),
        ],
      ],
    ]);
    expect(
      resolveInvoicePayerName(
        { client_id: null, designer_id: DESIGNER, client: null },
        null,
        two,
        new Map(),
      ),
    ).toBeNull();
  });

  it("uses the single named email-only lead when there is exactly one", () => {
    const one = new Map([
      [
        DESIGNER,
        [
          clientRecord({
            id: "l1",
            client_id: null,
            client_name: "Jodi Kurhn",
          }),
          clientRecord({ id: "l2", client_id: null, client_name: null }),
        ],
      ],
    ]);
    expect(
      resolveInvoicePayerName(
        { client_id: null, designer_id: DESIGNER, client: null },
        null,
        one,
        new Map(),
      ),
    ).toBe("Jodi Kurhn");
  });
});

describe("buildStudioBillingExport — money, status and columns", () => {
  it("carries every money figure in minor units and again as a decimal", () => {
    const built = buildStudioBillingExport(source());
    const invoices = sheet(built, "invoices");
    const row = invoices.rows[0];
    expect(row[column(invoices, "total_minor")]).toBe(108_750);
    expect(row[column(invoices, "total_decimal")]).toBe(1087.5);
    expect(row[column(invoices, "tax_minor")]).toBe(8_750);
    expect(row[column(invoices, "tax_decimal")]).toBe(87.5);
    expect(row[column(invoices, "tax_rate")]).toBe(0.0875);
    expect(row[column(invoices, "currency")]).toBe("USD");
    expect(row[column(invoices, "balance_minor")]).toBe(58_750);
  });

  it("distinguishes failed and refunded money from collected", () => {
    const built = buildStudioBillingExport(source());
    const invoices = sheet(built, "invoices");
    const a1 = invoices.rows[0];
    expect(a1[column(invoices, "collected_minor")]).toBe(50_000);
    expect(a1[column(invoices, "failed_minor")]).toBe(20_000);
    expect(a1[column(invoices, "payment_status")]).toBe("part_collected");

    const payments = sheet(built, "payments");
    const statuses = cells(payments, "payment_status");
    const collected = cells(payments, "is_collected");
    expect(statuses).toEqual(["succeeded", "failed", "succeeded"]);
    expect(collected).toEqual(["Yes", "No", "Yes"]);
  });

  it("never calls money collected while a refund stands", () => {
    expect(
      invoicePaymentStanding(
        {
          collected: 250_000,
          pending: 0,
          failed: 0,
          refunded: 250_000,
          requiresRefund: 0,
        },
        250_000,
      ),
    ).toBe("refunded");
    expect(
      invoicePaymentStanding(
        {
          collected: 0,
          pending: 0,
          failed: 0,
          refunded: 0,
          requiresRefund: 100,
        },
        100,
      ),
    ).toBe("requires_refund");
    expect(
      invoicePaymentStanding(
        { collected: 0, pending: 0, failed: 0, refunded: 0, requiresRefund: 0 },
        100,
      ),
    ).toBe("none");
  });

  it("reconciles the payment rows against the invoice counters", () => {
    const built = buildStudioBillingExport(source());
    expect(manifestValue(built, "reconciliation", "total_billed_minor")).toBe(
      358_750,
    );
    expect(
      manifestValue(
        built,
        "reconciliation",
        "collected_minor_from_payment_rows",
      ),
    ).toBe(300_000);
    expect(
      manifestValue(
        built,
        "reconciliation",
        "amount_paid_minor_from_invoice_counters",
      ),
    ).toBe(300_000);
    expect(
      manifestValue(built, "reconciliation", "invoices_where_the_two_disagree"),
    ).toBe(0);
  });

  it("holds the household relationship keys on the clients sheet", () => {
    const built = buildStudioBillingExport(source());
    const clients = sheet(built, "clients");
    const index = cells(clients, "client_record_id").indexOf("dc-a2");
    const row = clients.rows[index];
    expect(row[column(clients, "household_id")]).toBe("hh-a");
    expect(row[column(clients, "household_name")]).toBe("Okonkwo residence");
    expect(row[column(clients, "household_member_count")]).toBe(2);
    expect(row[column(clients, "household_threshold_minor")]).toBe(250_000);
    expect(row[column(clients, "household_threshold_decimal")]).toBe(2500);
    expect(row[column(clients, "client_name")]).toBe(
      "okonkwo.house@example.com",
    );
  });

  it("neutralises a formula-shaped text cell", () => {
    const built = buildStudioBillingExport(source());
    const lines = sheet(built, "invoice_lines");
    expect(cells(lines, "description")).toContain(
      "'=SUM(A1:A9) as a line description",
    );
    const payments = sheet(built, "payments");
    expect(cells(payments, "reference")).toContain("'=1+1");
  });
});

describe("the manifest", () => {
  it("states the dated snapshot, the scope and a missing count for every column", () => {
    const built = buildStudioBillingExport(source());
    expect(manifestValue(built, "report", "snapshot_at")).toBe(
      "2026-09-23T17:04:05.000Z",
    );
    expect(manifestValue(built, "report", "snapshot_date")).toBe("2026-09-23");
    expect(manifestValue(built, "scope", "studio_id")).toBe(STUDIO_A);
    expect(manifestValue(built, "scope", "studio_name")).toBe(
      "Middle West Studio",
    );

    const columnsCovered = built.manifest.missingValues.map(
      (m) => `${m.sheet}.${m.column}`,
    );
    for (const s of built.sheets) {
      if (s.name === "manifest") continue;
      for (const c of s.header)
        expect(columnsCovered).toContain(`${s.name}.${c}`);
    }
    const projectName = built.manifest.missingValues.find(
      (m) => m.sheet === "invoices" && m.column === "project_name",
    );
    expect(projectName?.missing).toBe(1);
    const invoiceId = built.manifest.missingValues.find(
      (m) => m.sheet === "invoices" && m.column === "invoice_id",
    );
    expect(invoiceId?.missing).toBe(0);
  });

  it("counts every sheet it wrote", () => {
    const built = buildStudioBillingExport(source());
    expect(built.manifest.counts).toEqual({
      invoices: 2,
      invoice_lines: 2,
      payments: 3,
      clients: 3,
    });
    expect(built.sheets.map((s) => s.name)).toEqual([
      "invoices",
      "invoice_lines",
      "payments",
      "clients",
      "manifest",
    ]);
  });

  it("renders as plain text under its section heads", () => {
    const built = buildStudioBillingExport(source());
    const text = studioBillingManifestText(built.manifest);
    expect(text).toContain("[report]");
    expect(text).toContain("[exclusions]");
    expect(text).toContain("invoices_with_null_studio_id = 1");
    expect(text).toContain("[missing_values]");
  });
});

describe("studioBillingExportFilename", () => {
  it("slugs the studio and dates the file", () => {
    expect(
      studioBillingExportFilename("Middle West Studio", "2026-09-23"),
    ).toBe("patina-studio-billing-middle-west-studio-2026-09-23.xlsx");
  });

  it("falls back when the studio has no name to slug", () => {
    expect(studioBillingExportFilename("  ", "2026-09-23")).toBe(
      "patina-studio-billing-studio-2026-09-23.xlsx",
    );
  });
});
