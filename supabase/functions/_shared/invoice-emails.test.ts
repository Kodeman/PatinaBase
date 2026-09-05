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
  buildCheckIntentEmail,
  buildInvoiceArEscalationEmail,
  buildInvoiceFinalNoticeEmail,
  buildInvoiceOverdueNoticeEmail,
  buildInvoiceSecondNoticeEmail,
  buildInvoiceSentEmail,
  buildInvoiceUpcomingReminderEmail,
  buildPaymentFailedEmail,
  buildPaymentReceiptEmail,
  buildPaymentRefundedEmail,
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
  const params: InvoiceReminderEmailParams = {
    ...PARAMS,
    projectName: STUDIO_TITLE,
    studioInvoice: true,
  };
  const ladder: Array<[string, { subject: string; html: string }]> = [
    ["upcoming", buildInvoiceUpcomingReminderEmail(params)],
    ["still open", buildInvoiceOverdueNoticeEmail(params)],
    ["second notice", buildInvoiceSecondNoticeEmail(params)],
    ["final notice", buildInvoiceFinalNoticeEmail(params)],
  ];
  for (const [name, { subject, html }] of ladder) {
    const prose = `${subject}\n${html}`.toLowerCase();
    assert(
      !prose.includes("project"),
      `the ${name} letter tells a studio-invoice reader about a project`,
    );
  }
});

// ── Ruling W5-7: the footer of a letter with no house ────────────────────────

const STUDIO_FOOTER_LETTERS: Array<[string, (studio: boolean) => string]> = [
  ["sent", (studio) =>
    buildInvoiceSentEmail({
      invoiceNumber: "INV-0031",
      projectName: STUDIO_TITLE,
      designerName: "Leah Brandt",
      clientName: "Dana Rivera",
      totalCents: 45000,
      portalUrl: "https://client.patina.cloud/invoices/inv-1",
      studioInvoice: studio,
    }).html],
  ["upcoming", (studio) =>
    buildInvoiceUpcomingReminderEmail({ ...PARAMS, studioInvoice: studio }).html],
  ["still open", (studio) =>
    buildInvoiceOverdueNoticeEmail({ ...PARAMS, studioInvoice: studio }).html],
  ["second notice", (studio) =>
    buildInvoiceSecondNoticeEmail({ ...PARAMS, studioInvoice: studio }).html],
  ["final notice", (studio) =>
    buildInvoiceFinalNoticeEmail({ ...PARAMS, studioInvoice: studio }).html],
  ["receipt", (studio) =>
    buildPaymentReceiptEmail({
      invoiceNumber: "INV-0031",
      projectName: STUDIO_TITLE,
      designerName: "Leah Brandt",
      clientName: "Dana Rivera",
      amountPaidCents: 45000,
      balanceCents: 0,
      portalUrl: "https://client.patina.cloud/invoices/inv-1",
      studioInvoice: studio,
    }).html],
  ["failed payment", (studio) =>
    buildPaymentFailedEmail({
      invoiceNumber: "INV-0031",
      projectName: STUDIO_TITLE,
      designerName: "Leah Brandt",
      clientName: "Dana Rivera",
      amountCents: 45000,
      portalUrl: "https://client.patina.cloud/invoices/inv-1",
      studioInvoice: studio,
    }).html],
];

for (const [name, render] of STUDIO_FOOTER_LETTERS) {
  Deno.test(`studio invoice: the ${name} letter's footer names her page, not a project`, () => {
    const html = render(true);
    assertStringIncludes(html, "Your page</a>");
    assert(
      !html.includes("Your project"),
      `the ${name} letter's footer offers a project a studio invoice has none of`,
    );
    assertStringIncludes(html, "Email preferences");
  });

  Deno.test(`project invoice: the ${name} letter's footer is untouched`, () => {
    const html = render(false);
    assertStringIncludes(html, "Your project");
    assert(!html.includes("Your page"), `the ${name} letter relabelled every client footer`);
  });
}

// ── Ruling W5-6: an invoice that names nothing says nothing ──────────────────
// A studio invoice's title is required, so this is the last-resort path — but
// it is the path that used to render "for your studio" to a homeowner.

const NAMELESS_LETTERS: Array<[string, () => { subject: string; html: string }]> = [
  ["sent", () =>
    buildInvoiceSentEmail({
      invoiceNumber: "INV-0031",
      projectName: null,
      designerName: "Leah Brandt",
      clientName: "Dana Rivera",
      totalCents: 45000,
      portalUrl: "https://client.patina.cloud/invoices/inv-1",
      studioInvoice: true,
    })],
  ["upcoming", () =>
    buildInvoiceUpcomingReminderEmail({ ...PARAMS, projectName: null, studioInvoice: true })],
  ["still open", () =>
    buildInvoiceOverdueNoticeEmail({ ...PARAMS, projectName: null, studioInvoice: true })],
  ["second notice", () =>
    buildInvoiceSecondNoticeEmail({ ...PARAMS, projectName: null, studioInvoice: true })],
  ["final notice", () =>
    buildInvoiceFinalNoticeEmail({ ...PARAMS, projectName: null, studioInvoice: true })],
  ["receipt", () =>
    buildPaymentReceiptEmail({
      invoiceNumber: "INV-0031",
      projectName: null,
      designerName: "Leah Brandt",
      clientName: "Dana Rivera",
      amountPaidCents: 45000,
      balanceCents: 0,
      portalUrl: "https://client.patina.cloud/invoices/inv-1",
      studioInvoice: true,
    })],
  ["failed payment", () =>
    buildPaymentFailedEmail({
      invoiceNumber: "INV-0031",
      projectName: null,
      designerName: "Leah Brandt",
      clientName: "Dana Rivera",
      amountCents: 45000,
      portalUrl: "https://client.patina.cloud/invoices/inv-1",
      studioInvoice: true,
    })],
  ["A/R escalation", () =>
    buildInvoiceArEscalationEmail({
      invoiceNumber: "INV-0031",
      projectName: null,
      clientName: "Dana Rivera",
      balanceCents: 45000,
      daysOverdue: 14,
      arUrl: "https://app.patina.cloud/invoices",
    })],
  ["refund", () =>
    buildPaymentRefundedEmail({
      invoiceNumber: "INV-0031",
      projectName: null,
      designerName: "Leah Brandt",
      refundedAmountCents: 45000,
      paymentAmountCents: 45000,
      partial: false,
      portalUrl: "https://app.patina.cloud/desk",
    })],
  ["check incoming", () =>
    buildCheckIntentEmail({
      invoiceNumber: "INV-0031",
      projectName: null,
      designerName: "Leah Brandt",
      clientName: "Dana Rivera",
      balanceCents: 45000,
      portalUrl: "https://app.patina.cloud/desk",
    })],
];

for (const [name, build] of NAMELESS_LETTERS) {
  Deno.test(`nameless invoice: the ${name} letter never says "your studio"`, () => {
    const { subject, html } = build();
    const prose = `${subject}\n${html}`.toLowerCase();
    assert(!prose.includes("your studio"), `"your studio" reached the ${name} letter`);
    assert(!prose.includes("for undefined"), `an absent name leaked into the ${name} letter`);
    assert(!prose.includes("for null"), `an absent name leaked into the ${name} letter`);
  });
}

Deno.test("nameless invoice: the sent letter closes the sentence and the subject", () => {
  const { subject, html } = buildInvoiceSentEmail({
    invoiceNumber: "INV-0031",
    projectName: null,
    designerName: "Leah Brandt",
    senderName: "Middle West Studio",
    clientName: "Dana Rivera",
    totalCents: 45000,
    portalUrl: "https://client.patina.cloud/invoices/inv-1",
    studioInvoice: true,
  });
  assertEquals(subject, "Middle West Studio sent you invoice INV-0031");
  assertStringIncludes(html, "Leah Brandt has sent you an invoice.");
});

Deno.test("nameless invoice: the reminder ladder's subjects end at the number", () => {
  const params: InvoiceReminderEmailParams = { ...PARAMS, projectName: null };
  assertEquals(
    buildInvoiceUpcomingReminderEmail(params).subject,
    "Reminder: invoice INV-1042 is due soon",
  );
  assertEquals(
    buildInvoiceOverdueNoticeEmail(params).subject,
    "Still open: invoice INV-1042",
  );
  assertEquals(
    buildInvoiceSecondNoticeEmail(params).subject,
    "Second notice: invoice INV-1042",
  );
  assertEquals(
    buildInvoiceFinalNoticeEmail(params).subject,
    "Final notice: invoice INV-1042",
  );
});
