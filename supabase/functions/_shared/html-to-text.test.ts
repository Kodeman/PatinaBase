// Deno test for the HTML → plain-text alternative.
// Run: deno test --allow-all --config supabase/functions/deno.json \
//        supabase/functions/_shared/html-to-text.test.ts

import {
  assertEquals,
  assertStringIncludes,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import { assertFalse } from "https://deno.land/std@0.224.0/assert/assert_false.ts";
import { htmlToText } from "./html-to-text.ts";
import {
  ctaButton,
  heading,
  paragraph,
  renderBrandedShell,
} from "./branded-email.ts";

Deno.test("head, style, script and comments are dropped", () => {
  const text = htmlToText(
    `<head><title>Ignore me</title><style>.a{color:red}</style></head>` +
      `<!-- a plain comment --><!--[if mso]><table><tr><td>MSO ONLY</td></tr></table><![endif]-->` +
      `<script>alert("no")</script><p>Kept</p>`,
  );
  assertEquals(text, "Kept");
});

Deno.test("the hidden preheader div is dropped", () => {
  const text = htmlToText(
    `<div style="display:none; font-size:1px; max-height:0; overflow:hidden;">Inbox preview line</div>` +
      `<p>Body copy</p>`,
  );
  assertEquals(text, "Body copy");
});

Deno.test("a link becomes 'label (href)'", () => {
  assertEquals(
    htmlToText(`<p>Read the <a href="https://patina.cloud/x">proposal</a>.</p>`),
    "Read the proposal (https://patina.cloud/x).",
  );
});

Deno.test("a link whose label is its own href prints the URL once", () => {
  assertEquals(
    htmlToText(
      `<a href="https://patina.cloud/x">https://patina.cloud/x</a>`,
    ),
    "https://patina.cloud/x",
  );
});

Deno.test("block closers become newlines and list items get a dash", () => {
  assertEquals(
    htmlToText(`<ul><li>One</li><li>Two</li></ul>`),
    "- One\n- Two",
  );
  // Paragraphs sit a blank line apart: the closer and the next opener each
  // contribute a newline.
  assertEquals(
    htmlToText(`<p>First</p><p>Second</p>`),
    "First\n\nSecond",
  );
  assertEquals(htmlToText(`Line one<br>Line two`), "Line one\nLine two");
});

Deno.test("table cells separate with a space, rows with a newline", () => {
  assertEquals(
    htmlToText(`<table><tr><td>Email</td><td>a@b.test</td></tr><tr><td>Role</td><td>designer</td></tr></table>`),
    "Email a@b.test\nRole designer",
  );
});

Deno.test("entities decode, including numeric ones", () => {
  assertEquals(
    htmlToText(`<p>Ren&#233;&#39;s &quot;studio&quot; &amp; co &mdash; 5 &lt; 6</p>`),
    'René\'s "studio" & co — 5 < 6',
  );
  assertEquals(htmlToText("<p>a&#x2019;b</p>"), "a’b");
});

Deno.test("whitespace collapses and runs of blank lines cap at one", () => {
  assertEquals(
    htmlToText(`<p>  spaced    out  </p><div></div><div></div><div></div><p>after</p>`),
    "spaced out\n\nafter",
  );
});

Deno.test("a rendered branded shell drops its preheader and keeps the CTA URL", () => {
  const cta = "https://client.patina.cloud/proposals/abc-123";
  const html = renderBrandedShell({
    title: "Your proposal is ready",
    audience: "client",
    preview: "A preheader nobody should read twice",
    eyebrow: "Proposal",
    body: [
      heading("Your proposal is ready"),
      paragraph("Hi Edna,"),
      ctaButton(cta, "Review proposal", "ink"),
    ].join(""),
    footerLinks: [{ label: "Your project", href: "https://client.patina.cloud" }],
    businessAddress: "",
  });

  const text = htmlToText(html);
  assertFalse(text.includes("A preheader nobody should read twice"));
  assertStringIncludes(text, cta);
  assertStringIncludes(text, "Review proposal");
  assertStringIncludes(text, "Hi Edna,");
  // No markup, no leftover CSS from <style>, no MSO conditional wreckage.
  assertFalse(text.includes("<"));
  assertFalse(text.includes("mso-"));
  assertFalse(text.includes("endif"));
});
