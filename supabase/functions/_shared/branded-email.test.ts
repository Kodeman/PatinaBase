// Deno test for the studio co-brand byline in the branded email shell (Wave 2).
// Run: deno test --allow-read --config supabase/functions/deno.json \
//        supabase/functions/_shared/branded-email.test.ts
//
// The load-bearing guarantee (plan D4): when NO studio params are passed the
// output is BYTE-IDENTICAL to the pre-co-brand shell. The baseline snapshot in
// ./__snapshots__/branded-shell.baseline.html was generated from the shell at
// b2c2af22 (before this wave) with the same deterministic opts used below —
// explicit footerLinks + businessAddress so portalBase()/env never influence
// the bytes. Regenerate ONLY if the plain shell is intentionally restyled.

import {
  assert,
  assertEquals,
  assertStringIncludes,
} from "https://deno.land/std@0.168.0/testing/asserts.ts";
import { renderBrandedShell, paragraph } from "./branded-email.ts";

const BASELINE_URL = new URL(
  "./__snapshots__/branded-shell.baseline.html",
  import.meta.url,
);

/** The exact opts used to generate the committed baseline snapshot. */
function baseOpts() {
  return {
    title: "Studio W2 baseline",
    preview: "Byte-identical baseline for the co-brand shell.",
    eyebrow: "Invoice",
    body: paragraph("Hello <strong>world</strong>."),
    footerLinks: [
      { label: "Dashboard", href: "https://app.patina.cloud" },
      { label: "Help center", href: "https://app.patina.cloud/help" },
      {
        label: "Email preferences",
        href: "https://app.patina.cloud/portal/settings/notifications",
      },
    ],
    businessAddress:
      "A workshop for interior designers and the makers they trust.",
  };
}

Deno.test("no studio params → byte-identical to the pre-co-brand baseline", async () => {
  const baseline = await Deno.readTextFile(BASELINE_URL);
  const rendered = renderBrandedShell(baseOpts());
  assertEquals(rendered, baseline);
  // Belt-and-braces: the plain shell carries no co-brand markup at all.
  assert(!rendered.includes("Sent on behalf of"));
  assert(!rendered.includes("max-height:24px"));
});

Deno.test("undefined studio params render identically to omitting them", () => {
  const withUndef = renderBrandedShell({
    ...baseOpts(),
    studioName: undefined,
    studioLogoUrl: undefined,
  });
  assertEquals(withUndef, renderBrandedShell(baseOpts()));
});

Deno.test("studioName only → escaped name, no <img>", () => {
  const html = renderBrandedShell({ ...baseOpts(), studioName: "Oakline Studio" });
  assertStringIncludes(html, "Sent on behalf of Oakline Studio");
  // Name-only variant must not emit a logo image row.
  assert(!html.includes("max-height:24px"), "name-only must not render a logo <img>");
});

Deno.test("studioName + studioLogoUrl → <img> with the logo URL and the name", () => {
  const logo = "https://cdn.patina.cloud/studio-logos/abc/1.png?v=123";
  const html = renderBrandedShell({
    ...baseOpts(),
    studioName: "Oakline Studio",
    studioLogoUrl: logo,
  });
  // Bulletproof inline img, height ≤24px, carrying the studio logo URL.
  assertStringIncludes(html, `<img src="${logo}"`);
  assertStringIncludes(html, "max-height:24px");
  assertStringIncludes(html, "height=\"20\"");
  // Name still rendered as the byline label; NOT the "on behalf of" fallback.
  assertStringIncludes(html, ">Oakline Studio</td>");
  assert(!html.includes("Sent on behalf of"), "logo variant uses the name label, not the fallback line");
  // The logo URL is used as the alt text's studio name too (escaped context).
  assertStringIncludes(html, 'alt="Oakline Studio"');
});

Deno.test("hostile studioName is HTML-escaped (no raw markup)", () => {
  const hostile = '<script>alert("x")</script> & "Co" <b>';
  const nameOnly = renderBrandedShell({ ...baseOpts(), studioName: hostile });
  assert(!nameOnly.includes("<script>alert"), "raw <script> must not appear");
  assertStringIncludes(nameOnly, "&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt; &amp; &quot;Co&quot; &lt;b&gt;");

  // Same escaping in the logo+name variant (name label + img alt attribute).
  const withLogo = renderBrandedShell({
    ...baseOpts(),
    studioName: hostile,
    studioLogoUrl: "https://cdn.patina.cloud/x.png",
  });
  assert(!withLogo.includes("<script>alert"), "raw <script> must not appear in logo variant");
  assertStringIncludes(withLogo, "&lt;script&gt;");
});

Deno.test("hostile studioLogoUrl is attribute-escaped (no quote breakout)", () => {
  const evil = 'https://x.png"><script>alert(1)</script>';
  const html = renderBrandedShell({
    ...baseOpts(),
    studioName: "Oakline Studio",
    studioLogoUrl: evil,
  });
  assert(!html.includes('"><script>'), "the URL must not break out of the src attribute");
  assertStringIncludes(html, "&quot;&gt;&lt;script&gt;");
});
