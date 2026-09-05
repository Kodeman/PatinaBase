// Deno tests for the client-addressed invoice letters' vocabulary.
// Run: deno test --config supabase/functions/deno.json \
//        supabase/functions/_shared/invoice-emails.test.ts
//
// Six of these builders declare audience "client" — a homeowner reads them —
// so the program's binding refusals apply: never "overdue", no guilt copy.
// The A/R escalation letter is addressed to the DESIGNER and keeps the
// accounting word, so it is asserted the other way round.

import {
  assert,
  assertEquals,
  assertStringIncludes,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  buildInvoiceArEscalationEmail,
  buildInvoiceFinalNoticeEmail,
  buildInvoiceOverdueNoticeEmail,
  buildInvoiceSecondNoticeEmail,
  buildInvoiceSentEmail,
  buildInvoiceUpcomingReminderEmail,
  buildPaymentReceiptEmail,
  type InvoiceReminderEmailParams,
} from "./invoice-emails.ts";

const PARAMS: InvoiceReminderEmailParams = {
  invoiceNumber: "INV-1042",
  projectName: "Rivera Residence",
  designerName: "Leah Brandt",
  clientName: "Dana Rivera",
  balanceCents: 480000,
  dueDate: "2026-10-08",
  portalUrl: "https://client.patina.cloud/invoices/inv-1",
  studioName: "Middle West Studio",
};

const CLIENT_LETTERS: Array<[string, () => { subject: string; html: string }]> = [
  ["upcoming", () => buildInvoiceUpcomingReminderEmail(PARAMS)],
  ["still open", () => buildInvoiceOverdueNoticeEmail(PARAMS)],
  ["second notice", () => buildInvoiceSecondNoticeEmail(PARAMS)],
  ["final notice", () => buildInvoiceFinalNoticeEmail(PARAMS)],
];

for (const [name, build] of CLIENT_LETTERS) {
  Deno.test(`invoice ${name}: never says "overdue" or "past due" to a client`, () => {
    const { subject, html } = build();
    const prose = `${subject}\n${html}`.toLowerCase();
    assert(
      !prose.includes("overdue"),
      `"overdue" reached the client's ${name} letter`,
    );
    assert(
      !prose.includes("past due"),
      `"past due" reached the client's ${name} letter`,
    );
    assert(
      !prose.includes("gentle"),
      `guilt copy reached the client's ${name} letter`,
    );
  });
}

Deno.test("invoice still-open notice: the subject says the state, not the fault", () => {
  const { subject } = buildInvoiceOverdueNoticeEmail(PARAMS);
  assertEquals(subject, "Still open: invoice INV-1042 — Rivera Residence");
});

Deno.test("invoice second/final notices keep the ladder without the word", () => {
  assertEquals(
    buildInvoiceSecondNoticeEmail(PARAMS).subject,
    "Second notice: invoice INV-1042 — Rivera Residence",
  );
  assertEquals(
    buildInvoiceFinalNoticeEmail(PARAMS).subject,
    "Final notice: invoice INV-1042 — Rivera Residence",
  );
});

Deno.test("invoice client notices carry an Invoice eyebrow, not a status word", () => {
  for (const [, build] of CLIENT_LETTERS.slice(1)) {
    assertStringIncludes(build().html, "Invoice");
    assert(!build().html.includes(">Overdue<"));
  }
});

Deno.test("A/R escalation is the designer's letter and keeps the accounting word", () => {
  const { subject } = buildInvoiceArEscalationEmail({
    invoiceNumber: "INV-1042",
    projectName: "Rivera Residence",
    clientName: "Dana Rivera",
    balanceCents: 480000,
    dueDate: "2026-10-08",
    daysOverdue: 14,
    arUrl: "https://app.patina.cloud/invoices",
  });
  assertStringIncludes(subject, "overdue");
});

// ── The studio invoice: a letter with no house ──────────────────────────────
// An invoice drawn for the studio has no project to name, so its callers pass
// the invoice's own "regarding" title as projectName. The builders take it as
// prose, so the only thing to hold is that the title reads where a house name
// would, escaped, and that nothing invents a house.

const STUDIO_TITLE = "Design consultation · September";

Deno.test("studio invoice: the title reads where the house name would", () => {
  const { subject, html } = buildInvoiceSentEmail({
    invoiceNumber: "INV-0031",
    projectName: STUDIO_TITLE,
    designerName: "Leah Brandt",
    senderName: "Middle West Studio",
    clientName: "Dana Rivera",
    totalCents: 45000,
    dueDate: "2026-10-08",
    portalUrl: "https://client.patina.cloud/invoices/inv-1",
    studioName: "Middle West Studio",
  });
  assertEquals(
    subject,
    "Middle West Studio sent you invoice INV-0031 — Design consultation · September",
  );
  assertStringIncludes(html, "Design consultation");
  assert(
    !subject.toLowerCase().includes("project"),
    "a studio invoice must never invent a house",
  );
});

Deno.test("studio invoice: the reminder ladder names the title too", () => {
  const params: InvoiceReminderEmailParams = { ...PARAMS, projectName: STUDIO_TITLE };
  assertEquals(
    buildInvoiceUpcomingReminderEmail(params).subject,
    "Reminder: invoice INV-1042 is due soon — Design consultation · September",
  );
  assertEquals(
    buildInvoiceOverdueNoticeEmail(params).subject,
    "Still open: invoice INV-1042 — Design consultation · September",
  );
});

Deno.test("studio invoice: a title with markup in it is escaped, never rendered", () => {
  const { html } = buildPaymentReceiptEmail({
    invoiceNumber: "INV-0031",
    projectName: "<b>Retainer</b>",
    designerName: "Leah Brandt",
    clientName: "Dana Rivera",
    amountPaidCents: 45000,
    balanceCents: 0,
    portalUrl: "https://client.patina.cloud/invoices/inv-1",
  });
  assertStringIncludes(html, "&lt;b&gt;Retainer&lt;/b&gt;");
  assert(!html.includes("<b>Retainer</b>"), "the title was rendered as markup");
});

Deno.test("studio invoice: no rung of the reminder ladder invents a house", () => {
  const params: InvoiceReminderEmailParams = { ...PARAMS, projectName: STUDIO_TITLE };
  const ladder: Array<[string, { subject: string; html: string }]> = [
    ["upcoming", buildInvoiceUpcomingReminderEmail(params)],
    ["still open", buildInvoiceOverdueNoticeEmail(params)],
    ["second notice", buildInvoiceSecondNoticeEmail(params)],
    ["final notice", buildInvoiceFinalNoticeEmail(params)],
  ];
  for (const [name, { subject, html }] of ladder) {
    // The shell's client footer carries a "Your project" nav link on every
    // letter Patina sends; it is chrome, not this letter's prose, and changing
    // it would rewrite every client email in the repo.
    const prose = `${subject}\n${html}`
      .replace(/Your project<\/a>/g, "")
      .toLowerCase();
    assert(
      !prose.includes("project"),
      `the ${name} letter tells a studio-invoice reader about a project`,
    );
  }
});
