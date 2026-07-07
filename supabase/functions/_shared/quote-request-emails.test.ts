// Deno test for the vendor quote-request (RFQ) email builder (Wave 0B).
// Run: deno test supabase/functions/_shared/quote-request-emails.test.ts
//
// Pure HTML/subject assembly — no network. Mirrors the _shared test pattern
// (render-template.test.ts, po-send index.test.ts): assert the composed
// subject/body carry the right identity + request content and that
// vendor/designer-provided free text is HTML-escaped.

import { assertEquals, assertStringIncludes } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import { buildQuoteRequestEmail } from "./quote-request-emails.ts";

Deno.test("subject names the requesting studio", () => {
  const { subject } = buildQuoteRequestEmail({
    vendorName: "Hewn Woodworks",
    studioName: "Middle West Studio",
    designerName: "Leah Rowe",
    message: "Do you make a 96\" walnut dining table?",
  });
  assertEquals(subject, "Quote request from Middle West Studio");
});

Deno.test("subject falls back when the studio name is blank", () => {
  const { subject } = buildQuoteRequestEmail({
    vendorName: "Hewn Woodworks",
    studioName: "   ",
    designerName: "",
    message: "Hello",
  });
  assertEquals(subject, "Quote request from a Patina designer");
});

Deno.test("body carries the vendor greeting, studio, and the request message", () => {
  const { html } = buildQuoteRequestEmail({
    vendorName: "Hewn Woodworks",
    studioName: "Middle West Studio",
    designerName: "Leah Rowe",
    message: "Please quote a 96in walnut table, seats 10.",
  });
  assertStringIncludes(html, "Hello Hewn Woodworks,");
  assertStringIncludes(html, "Middle West Studio");
  assertStringIncludes(html, "Please quote a 96in walnut table, seats 10.");
});

Deno.test("scope + timeline render only when present", () => {
  const withContext = buildQuoteRequestEmail({
    vendorName: "V",
    studioName: "S",
    designerName: "D",
    scope: "Dining + entry",
    timeline: "Install by October",
    message: "m",
  }).html;
  assertStringIncludes(withContext, "<strong>Scope:</strong> Dining + entry");
  assertStringIncludes(withContext, "<strong>Timeline:</strong> Install by October");

  const without = buildQuoteRequestEmail({
    vendorName: "V",
    studioName: "S",
    designerName: "D",
    message: "m",
  }).html;
  assertEquals(without.includes("Scope:"), false);
  assertEquals(without.includes("Timeline:"), false);
});

Deno.test("reply prompt links the designer email when provided, else asks to reply", () => {
  const withEmail = buildQuoteRequestEmail({
    vendorName: "V",
    studioName: "S",
    designerName: "D",
    designerEmail: "leah@studio.test",
    message: "m",
  }).html;
  assertStringIncludes(withEmail, 'mailto:leah@studio.test');

  const withoutEmail = buildQuoteRequestEmail({
    vendorName: "V",
    studioName: "S",
    designerName: "D",
    message: "m",
  }).html;
  assertStringIncludes(withoutEmail, "Please reply to this email");
});

Deno.test("signoff shows the designer AND studio when they differ, else just the studio", () => {
  const differ = buildQuoteRequestEmail({
    vendorName: "V",
    studioName: "Middle West Studio",
    designerName: "Leah Rowe",
    message: "m",
  }).html;
  assertStringIncludes(differ, "Leah Rowe, Middle West Studio");

  const same = buildQuoteRequestEmail({
    vendorName: "V",
    studioName: "Leah Rowe",
    designerName: "Leah Rowe",
    message: "m",
  }).html;
  assertStringIncludes(same, "&mdash; Leah Rowe");
});

Deno.test("HTML-escapes vendor/designer-provided free text (no injection)", () => {
  const { html } = buildQuoteRequestEmail({
    vendorName: "<b>V</b>",
    studioName: "S & Co",
    designerName: "D",
    scope: "<script>alert(1)</script>",
    message: "quote \"this\" & <that>",
  });
  assertStringIncludes(html, "&lt;b&gt;V&lt;/b&gt;");
  assertStringIncludes(html, "S &amp; Co");
  assertStringIncludes(html, "&lt;script&gt;alert(1)&lt;/script&gt;");
  assertStringIncludes(html, "quote &quot;this&quot; &amp; &lt;that&gt;");
  // The raw script tag must never appear unescaped.
  assertEquals(html.includes("<script>"), false);
});
