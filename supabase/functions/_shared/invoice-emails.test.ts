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
  buildInvoiceUpcomingReminderEmail,
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
