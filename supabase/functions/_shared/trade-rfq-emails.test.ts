// Deno test for the trade RFQ email builder (Trade Instrument RFQ rail,
// migration 00424 / trade-rfq-send).
// Run: deno test --allow-all --config supabase/functions/deno.json supabase/functions/_shared/trade-rfq-emails.test.ts
//
// Pure HTML/subject assembly — no network. Mirrors quote-request-emails.test.ts:
// assert the composed subject/body carry the right identity + scope content,
// that free text is HTML-escaped, that the CTA link is present, and — the
// privacy-load-bearing assertion for this template — that no price ever
// appears, however the params are populated.

import {
  assertEquals,
  assertStringIncludes,
} from "https://deno.land/std@0.168.0/testing/asserts.ts";
import { buildTradeRfqEmail, type TradeRfqEmailParams } from "./trade-rfq-emails.ts";

function baseParams(overrides: Partial<TradeRfqEmailParams> = {}): TradeRfqEmailParams {
  return {
    partyDisplayName: "Hewn Woodworks",
    studioName: "Middle West Studio",
    designerName: "Leah Rowe",
    scopeTitle: "Primary suite built-ins",
    sections: [],
    ctaUrl: "https://client.patina.cloud/rfq/abc123token",
    ...overrides,
  };
}

Deno.test("subject names the requesting studio and the scope", () => {
  const { subject } = buildTradeRfqEmail(baseParams());
  assertEquals(subject, "Middle West Studio would like your number — Primary suite built-ins");
});

Deno.test("subject falls back when studio + scope title are blank", () => {
  const { subject } = buildTradeRfqEmail(
    baseParams({ studioName: "   ", scopeTitle: "  ", designerName: "" }),
  );
  assertEquals(subject, "a Patina studio would like your number — a scope of work");
});

Deno.test("body greets the party and names the studio + scope", () => {
  const { html } = buildTradeRfqEmail(baseParams());
  assertStringIncludes(html, "Hello Hewn Woodworks,");
  assertStringIncludes(html, "Middle West Studio");
  assertStringIncludes(html, "Primary suite built-ins");
});

Deno.test("CTA button links to the RFQ token URL with the 'Send your number' label", () => {
  const { html } = buildTradeRfqEmail(
    baseParams({ ctaUrl: "https://client.patina.cloud/rfq/tok_xyz" }),
  );
  assertStringIncludes(html, "https://client.patina.cloud/rfq/tok_xyz");
  assertStringIncludes(html, "Send your number");
});

Deno.test("room sections render as room-labeled prose, in order", () => {
  const { html } = buildTradeRfqEmail(
    baseParams({
      sections: [
        { roomName: "Primary bath", prose: "Floating vanity, walnut, 72in." },
        { roomName: "Mudroom", prose: "Built-in bench + lockers." },
        { roomName: null, prose: "General millwork touch-up throughout." },
      ],
    }),
  );
  assertStringIncludes(html, "<strong>Primary bath:</strong> Floating vanity, walnut, 72in.");
  assertStringIncludes(html, "<strong>Mudroom:</strong> Built-in bench + lockers.");
  assertStringIncludes(html, "General millwork touch-up throughout.");
  const bathIdx = html.indexOf("Primary bath");
  const mudroomIdx = html.indexOf("Mudroom");
  assertEquals(bathIdx < mudroomIdx, true);
});

Deno.test("blank-prose sections are omitted", () => {
  const { html } = buildTradeRfqEmail(
    baseParams({ sections: [{ roomName: "Empty room", prose: "   " }] }),
  );
  assertEquals(html.includes("Empty room"), false);
});

Deno.test("timeline + message render only when present", () => {
  const withContext = buildTradeRfqEmail(
    baseParams({ timeline: "Install by October", message: "Sub must carry own COI." }),
  ).html;
  assertStringIncludes(withContext, "<strong>Timeline:</strong> Install by October");
  assertStringIncludes(withContext, "<strong>Note:</strong> Sub must carry own COI.");

  const without = buildTradeRfqEmail(baseParams()).html;
  assertEquals(without.includes("Timeline:"), false);
  assertEquals(without.includes(">Note:<"), false);
});

Deno.test("ask prompt links the designer email when provided, else omits it", () => {
  const withEmail = buildTradeRfqEmail(
    baseParams({ designerEmail: "leah@studio.test" }),
  ).html;
  assertStringIncludes(withEmail, "mailto:leah@studio.test");

  const withoutEmail = buildTradeRfqEmail(baseParams()).html;
  assertEquals(withoutEmail.includes("mailto:"), false);
});

Deno.test("signoff shows the designer AND studio when they differ, else just the studio", () => {
  const differ = buildTradeRfqEmail(
    baseParams({ studioName: "Middle West Studio", designerName: "Leah Rowe" }),
  ).html;
  assertStringIncludes(differ, "Leah Rowe, Middle West Studio");

  const same = buildTradeRfqEmail(
    baseParams({ studioName: "Leah Rowe", designerName: "Leah Rowe" }),
  ).html;
  assertStringIncludes(same, "&mdash; Leah Rowe");
});

Deno.test("HTML-escapes party/designer/scope-provided free text (no injection)", () => {
  const { html } = buildTradeRfqEmail(
    baseParams({
      partyDisplayName: "<b>Sub</b>",
      studioName: "S & Co",
      scopeTitle: "<script>alert(1)</script>",
      sections: [{ roomName: "<i>Kitchen</i>", prose: 'quote "this" & <that>' }],
      message: "<img src=x onerror=alert(1)>",
    }),
  );
  assertStringIncludes(html, "&lt;b&gt;Sub&lt;/b&gt;");
  assertStringIncludes(html, "S &amp; Co");
  assertStringIncludes(html, "&lt;script&gt;alert(1)&lt;/script&gt;");
  assertStringIncludes(html, "&lt;i&gt;Kitchen&lt;/i&gt;");
  assertStringIncludes(html, "quote &quot;this&quot; &amp; &lt;that&gt;");
  assertStringIncludes(html, "&lt;img src=x onerror=alert(1)&gt;");
  assertEquals(html.includes("<script>"), false);
  assertEquals(html.includes("<img "), false);
});

// ─── The load-bearing privacy assertion: no price, ever ──────────────────────
//
// There is no price field on TradeRfqEmailParams to begin with — this test is
// a regression guard: if a future edit ever threads a price/amount param
// through, this must fail until the copy is re-reviewed against the "no
// client price, no bids" rule (see file header + the RFQ contract).

Deno.test("no price appears anywhere in the rendered email, under any input", () => {
  const { subject, html } = buildTradeRfqEmail(
    baseParams({
      partyDisplayName: "Hewn Woodworks",
      studioName: "Middle West Studio",
      designerName: "Leah Rowe",
      designerEmail: "leah@studio.test",
      scopeTitle: "Whole-home millwork",
      sections: [
        { roomName: "Kitchen", prose: "Custom hood surround, walnut." },
        { roomName: "Study", prose: "Built-in bookcases, floor to ceiling." },
      ],
      timeline: "Install by November",
      message: "Please include lead time.",
    }),
  );
  const haystack = (subject + " " + html).toLowerCase();
  for (const forbidden of ["$", "price", "amount", "cents", "bid", "quote of $", "budget"]) {
    assertEquals(
      haystack.includes(forbidden),
      false,
      `expected no "${forbidden}" in the rendered trade RFQ email`,
    );
  }
});
