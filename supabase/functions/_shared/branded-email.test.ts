// Deno test for the studio co-brand byline in the branded email shell (Wave 2).
// Run: deno test --allow-read --config supabase/functions/deno.json \
//        supabase/functions/_shared/branded-email.test.ts
//
// The load-bearing guarantee (plan D4): when NO studio params are passed the
// output is BYTE-IDENTICAL to the committed plain-shell snapshot in
// ./__snapshots__/branded-shell.baseline.html — i.e. the co-brand path is a
// true no-op and the plain shell never drifts by accident. It is generated with
// the same deterministic opts used below — explicit footerLinks +
// businessAddress so portalBase()/env never influence the bytes.
//
// Regenerate ONLY if the plain shell is intentionally restyled, and only by
// re-rendering with baseOpts() (never by hand-editing the snapshot). Lineage:
//   b2c2af22 — original capture, the pre-co-brand shell (wave 2).
//   2026-08-02 — re-rendered for the Outlook/M365 converter hardening. The
//     converter strips table ATTRIBUTES (width/cellpadding/…) and the CSS
//     `height` property, but keeps inline width/padding/font-size/line-height,
//     so the shell now states those inline as well as by attribute:
//       · inline width:100% on the layout tables that only had width="100%";
//       · font-size:4px + line-height:4px + height:4px + padding:0 on the
//         tri-colour bar tds (padding:0 because losing cellpadding="0" falls
//         back to the 1px HTML default, which would render the bar 6px);
//       · padding:0 on the cell WRAPPING the bar table and border-collapse on
//         the bar table itself — losing cellspacing="0" falls back to
//         border-spacing:2px, so the cells alone were not enough.
//     Measured in Chromium: healthy renderers are pixel-identical to the old
//     markup (4px bar, same cell widths); the converted body goes from a 2px
//     stub to the intended 4px full-width bar. The band around that bar
//     measured 10px with the cell fix alone → 8px once the wrapping cell took
//     padding:0 → 4px with border-collapse on the bar table.
//     No spacing/colour/type changes.

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
        href: "https://app.patina.cloud/desk?account=notifications",
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
