// Deno tests for the Trade Agreement email builder (Wave 3, P14/R16 —
// trade-agreement-send).
// Run: deno test --allow-all --config supabase/functions/deno.json supabase/functions/_shared/trade-agreement-emails.test.ts
//
// Pure HTML/subject assembly — no network. Mirrors trade-rfq-emails.test.ts:
// assert the composed subject/body carry the right identity and the eight
// essentials, that free text is HTML-escaped, that the CTA carries the
// /trade/<token> link — and, the privacy-load-bearing assertion for this
// template (DENO-5), that the ONLY figure that can ever appear is the sub's
// own price.

import {
  assert,
  assertEquals,
  assertStringIncludes,
} from "https://deno.land/std@0.168.0/testing/asserts.ts";
import {
  buildTradeAgreementEmail,
  type TradeAgreementEmailParams,
} from "./trade-agreement-emails.ts";

function baseParams(
  overrides: Partial<TradeAgreementEmailParams> = {},
): TradeAgreementEmailParams {
  return {
    contactDisplayName: "Hewn Woodworks",
    studioName: "Middle West Studio",
    designerName: "Leah Rowe",
    agreementTitle: "Cabinetry & millwork",
    scope: "Fabricate and install the kitchen and mudroom cabinetry.",
    priceCents: 3_800_000,
    schedule: { startOn: "2026-10-05", durationDays: 21, sequencing: null },
    retainageBps: 500,
    payWhenPaidDays: 7,
    insuranceCertificateRequired: true,
    lienWaiverPolicy: "conditional_then_unconditional",
    ctaUrl:
      "https://client.patina.cloud/trade/0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
    ...overrides,
  };
}

Deno.test("subject names the studio and the agreement, and calls it a Trade Agreement", () => {
  const { subject } = buildTradeAgreementEmail(baseParams());
  assertEquals(
    subject,
    "Middle West Studio sent you a Trade Agreement — Cabinetry & millwork",
  );
});

Deno.test("subject falls back when studio + title are blank", () => {
  const { subject } = buildTradeAgreementEmail(
    baseParams({ studioName: "   ", agreementTitle: "  ", designerName: "" }),
  );
  assertEquals(
    subject,
    "a Patina studio sent you a Trade Agreement — a scope of work",
  );
});

Deno.test("body greets the sub, names the studio, and says no account is needed", () => {
  const { html } = buildTradeAgreementEmail(baseParams());
  assertStringIncludes(html, "Hello Hewn Woodworks,");
  assertStringIncludes(html, "Middle West Studio");
  assertStringIncludes(html, "no account, no password");
});

Deno.test("all eight essentials render as labelled lines", () => {
  const { html } = buildTradeAgreementEmail(baseParams());
  assertStringIncludes(
    html,
    "<strong>Scope:</strong> Fabricate and install the kitchen and mudroom cabinetry.",
  );
  assertStringIncludes(html, "<strong>Price:</strong> $38,000.00");
  assertStringIncludes(
    html,
    "<strong>Schedule:</strong> starting 2026-10-05, 21 days on site",
  );
  assertStringIncludes(html, "<strong>Retainage:</strong> 5% is held back");
  assertStringIncludes(
    html,
    "<strong>Payment:</strong> Within 7 days of Middle West Studio being paid",
  );
  assertStringIncludes(
    html,
    "<strong>Insurance:</strong> A current certificate of insurance is required",
  );
  assertStringIncludes(html, "<strong>Lien waivers:</strong> A conditional waiver");
});

Deno.test("CTA carries the /trade/<token> link with the signing label", () => {
  const { html } = buildTradeAgreementEmail(
    baseParams({ ctaUrl: "https://client.patina.cloud/trade/tok_xyz" }),
  );
  assertStringIncludes(html, "https://client.patina.cloud/trade/tok_xyz");
  assertStringIncludes(html, "Read and sign");
});

Deno.test("an already-signed agreement reads as a receipt, not a second ask", () => {
  const { subject, html } = buildTradeAgreementEmail(
    baseParams({ alreadySigned: true }),
  );
  assertEquals(subject, "Your signed Trade Agreement — Cabinetry & millwork");
  assertStringIncludes(html, "Your signed Trade Agreement");
  assertStringIncludes(html, "Open your agreement");
  assertEquals(html.includes("Read and sign"), false);
});

Deno.test("retainage of zero says nothing is held back", () => {
  const { html } = buildTradeAgreementEmail(baseParams({ retainageBps: 0 }));
  assertStringIncludes(
    html,
    "<strong>Retainage:</strong> Nothing is held back from your payments.",
  );
});

Deno.test("a fractional retainage renders without float noise", () => {
  const { html } = buildTradeAgreementEmail(baseParams({ retainageBps: 250 }));
  assertStringIncludes(html, "<strong>Retainage:</strong> 2.5% is held back");
});

Deno.test("pay-when-paid omits its line entirely when no term applies", () => {
  const withTerm = buildTradeAgreementEmail(baseParams()).html;
  assertStringIncludes(withTerm, ">Payment:<");

  const without =
    buildTradeAgreementEmail(baseParams({ payWhenPaidDays: null })).html;
  assertEquals(without.includes(">Payment:<"), false);
});

Deno.test("a single day is singular in both the schedule and the payment term", () => {
  const { html } = buildTradeAgreementEmail(
    baseParams({
      schedule: { startOn: null, durationDays: 1, sequencing: null },
      payWhenPaidDays: 1,
    }),
  );
  assertStringIncludes(html, "<strong>Schedule:</strong> 1 day on site");
  assertStringIncludes(html, "Within 1 day of");
});

Deno.test("an empty schedule omits its line rather than printing a naked label", () => {
  for (
    const schedule of [
      null,
      {},
      { startOn: "  ", durationDays: 0, sequencing: "  " },
    ]
  ) {
    const { html } = buildTradeAgreementEmail(baseParams({ schedule }));
    assertEquals(html.includes(">Schedule:<"), false);
  }
});

Deno.test("insurance and lien-waiver copy follow the stored policy", () => {
  assertStringIncludes(
    buildTradeAgreementEmail(
      baseParams({ insuranceCertificateRequired: false }),
    ).html,
    "No certificate of insurance is required",
  );
  assertStringIncludes(
    buildTradeAgreementEmail(baseParams({ lienWaiverPolicy: "none" })).html,
    "No lien waiver is required for this work.",
  );
  assertStringIncludes(
    buildTradeAgreementEmail(
      baseParams({ lienWaiverPolicy: "unconditional_on_payment" }),
    ).html,
    "An unconditional waiver is due once each payment clears.",
  );
});

Deno.test("an unrecognised lien-waiver policy never prints its stored value at the sub", () => {
  const { html } = buildTradeAgreementEmail(
    baseParams({ lienWaiverPolicy: "conditional_progress_only" }),
  );
  assertStringIncludes(
    html,
    "Lien waivers are exchanged as this agreement describes.",
  );
  assertEquals(html.includes("conditional_progress_only"), false);
});

Deno.test("HTML-escapes every free-text field (no injection)", () => {
  const { html } = buildTradeAgreementEmail(
    baseParams({
      contactDisplayName: "<b>Sub</b>",
      studioName: "S & Co",
      agreementTitle: "<script>alert(1)</script>",
      scope: 'quote "this" & <that>',
      schedule: {
        startOn: "2026-10-05",
        durationDays: 21,
        sequencing: "<img src=x onerror=alert(1)>",
      },
    }),
  );
  assertStringIncludes(html, "&lt;b&gt;Sub&lt;/b&gt;");
  assertStringIncludes(html, "S &amp; Co");
  assertStringIncludes(html, "&lt;script&gt;alert(1)&lt;/script&gt;");
  assertStringIncludes(html, "quote &quot;this&quot; &amp; &lt;that&gt;");
  assertStringIncludes(html, "&lt;img src=x onerror=alert(1)&gt;");
  assertEquals(html.includes("<script>"), false);
  assertEquals(html.includes("<img "), false);
});

// ─── The load-bearing privacy assertion (DENO-5, R13) ────────────────────────
//
// The sub's own price is the ONLY figure this letter may carry. There is no
// param that could carry a client name, a project name, the GMP, the schedule
// of values, a draw, or another sub's number — this test is the regression
// guard: if a future edit ever threads one through, it fails here.

Deno.test("the sub's price and their link are present; nothing else with a figure is", () => {
  const { subject, html } = buildTradeAgreementEmail(
    baseParams({
      designerEmail: "leah@studio.test",
      // Free text a careless studio might paste the wrong thing into. It is
      // escaped and rendered as scope prose, and it is the only route by which
      // any of the forbidden facts below could reach this letter at all.
      scope: "Fabricate and install the kitchen and mudroom cabinetry.",
    }),
  );

  assertStringIncludes(html, "$38,000.00");
  assertStringIncludes(
    html,
    "https://client.patina.cloud/trade/0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
  );

  const haystack = `${subject} ${html}`.toLowerCase();
  const forbidden = [
    "halvorsen", // the client's surname — and the project name that carries it
    "84,134", // the GMP
    "8413400",
    "71,300", // the cost basis
    "schedule of values",
    "draw ", // no draw label, number, or amount
    "gmp",
    "bid",
    "other sub",
    "homeowner",
    "client price",
  ];
  for (const term of forbidden) {
    assertEquals(
      haystack.includes(term),
      false,
      `expected no "${term}" in the rendered Trade Agreement email`,
    );
  }

  // Exactly one currency figure reaches the sub: their own price.
  const figures = html.match(/\$[\d,]+(?:\.\d{2})?/g) ?? [];
  assertEquals(figures, ["$38,000.00"]);
  assert(figures.length === 1);
});
