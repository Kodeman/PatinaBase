import { assert, assertEquals, assertStringIncludes } from
  "https://deno.land/std@0.208.0/assert/mod.ts";
import {
  formatFromAddress,
  letterSubject,
  longDate,
  renderClientLetter,
  senderDisplayName,
  shortDate,
  standingSentence,
  type ClientLetterSnapshot,
} from "./client-letter.ts";

// Fixture 1 — everything: studio, city, project, client name, a note.
const F1: ClientLetterSnapshot = {
  kind: "invite",
  recipientEmail: "dave@okonkwo.net",
  recipientName: "Dave Okonkwo",
  designerFullName: "Leah Hartwell",
  designerGivenName: "Leah",
  studioName: "Middle West Studio",
  studioLogoUrl: null,
  signatureCity: "Madison",
  projectName: "Van Hise kitchen and back hall",
  personalMessage:
    "Dave — this is the same file I work from, not a summary of it. The kitchen cabinet drawings are in there now; the back hall isn't drawn yet. Anything you want changed, say so on the page and I'll see it.",
  sentAt: "2026-09-08T14:00:00.000Z",
  expiresAt: "2026-09-15T14:00:00.000Z",
  ctaUrl: "https://client.patina.cloud/auth/invite/tok1",
};

// Fixture 2 — a designer, an email address, and nothing else.
const F2: ClientLetterSnapshot = {
  kind: "invite",
  recipientEmail: "priya@ramanhouse.com",
  recipientName: "Priya Raman",
  designerFullName: "Nora Feld",
  designerGivenName: "Nora",
  studioName: null,
  studioLogoUrl: null,
  signatureCity: null,
  projectName: null,
  personalMessage: null,
  sentAt: "2026-09-08T14:00:00.000Z",
  expiresAt: "2026-09-15T14:00:00.000Z",
  ctaUrl: "https://client.patina.cloud/auth/invite/tok2",
};

Deno.test("dates print as real dates, never countdowns", () => {
  assertEquals(longDate("2026-09-08T14:00:00.000Z"), "8 September");
  assertEquals(shortDate("2026-09-08T14:00:00.000Z"), "8 Sept");
});

Deno.test("R3 — the subject invites, and never names Patina", () => {
  assertEquals(
    letterSubject(F1),
    "Leah Hartwell invited you to the Van Hise kitchen and back hall",
  );
  assertEquals(
    letterSubject(F2),
    "Nora Feld set up a page for your work together",
  );
  for (const s of [letterSubject(F1), letterSubject(F2)]) {
    assert(!/patina/i.test(s), `subject names Patina: ${s}`);
  }
});

Deno.test("the standing sentence still says 'added you to' (R3)", () => {
  assertEquals(
    standingSentence(F1),
    "Leah Hartwell of Middle West Studio added you to the Van Hise kitchen and back hall on 8 September. The page below holds the studio's record of the job — the plans, the papers, and the numbers.",
  );
  assertEquals(
    standingSentence(F2),
    "Nora Feld set up a page for your work together on 8 September. It's where Nora keeps the record — the plans, the papers, and the numbers, as they come.",
  );
});

Deno.test("R1 — the envelope leads with the studio and discloses the relay", () => {
  assertEquals(senderDisplayName(F1), "Middle West Studio via Patina");
  assertEquals(senderDisplayName(F2), "Nora Feld via Patina");
  assertEquals(
    formatFromAddress("Middle West Studio via Patina", "hello@patina.cloud"),
    "Middle West Studio via Patina <hello@patina.cloud>",
  );
  // A studio name carrying an RFC 5322 special must be quoted, not smuggled.
  assertEquals(
    formatFromAddress("Whitfield, Blake & Co. via Patina", "hello@patina.cloud"),
    '"Whitfield, Blake & Co. via Patina" <hello@patina.cloud>',
  );
  // Control characters and quotes are stripped, never escaped into the header.
  assertEquals(
    formatFromAddress('Ev"il\r\nBcc: x@y.z via Patina', "hello@patina.cloud"),
    '"Evil Bcc: x@y.z via Patina" <hello@patina.cloud>',
  );
});

Deno.test("PP-1 — the letter never wears the Patina wordmark", () => {
  const letter = renderClientLetter(F1);
  // Patina appears exactly once, in the colophon.
  const hits = letter.html.match(/Patina/g) ?? [];
  assertEquals(hits.length, 1);
  assertStringIncludes(
    letter.html,
    "Prepared by Middle West Studio &middot; Sent through Patina",
  );
  assertStringIncludes(letter.html, "MIDDLE WEST STUDIO");
  assertStringIncludes(letter.html, "Madison &middot; 8 September 2026");
  assertStringIncludes(letter.html, "Prepared for Dave Okonkwo");
});

Deno.test("the note is a callout, and a designer typing HTML cannot break it", () => {
  const letter = renderClientLetter({
    ...F1,
    personalMessage: "<script>alert(1)</script> & a plan for <the> hall",
  });
  assert(!letter.html.includes("<script>"));
  assertStringIncludes(letter.html, "&lt;script&gt;alert(1)&lt;/script&gt;");
  assertStringIncludes(letter.html, "&amp; a plan for &lt;the&gt; hall");
});

Deno.test("the CTA url is escaped in both hrefs — the button and the fallback link", () => {
  const letter = renderClientLetter({
    ...F1,
    ctaUrl: 'https://client.patina.cloud/auth/invite/"><script>alert(1)</script>',
  });
  assert(!letter.html.includes("<script>"));
  // Two href attributes carry the CTA url: the button (ctaButton) and the
  // "paste this link" fallback. Both must be escaped, or a token that
  // happens to collide with a quote/bracket breaks out of the attribute.
  assertEquals(
    (letter.html.match(/href="[^"]*&quot;&gt;&lt;script&gt;/g) ?? []).length,
    2,
  );
});

Deno.test("the letter reads whole with no note", () => {
  const letter = renderClientLetter({ ...F1, personalMessage: null });
  assertStringIncludes(letter.html, "added you to the Van Hise kitchen");
  // No empty frame, no substitute sentence in her voice.
  assert(!/didn.t leave a note/i.test(letter.html));
  assert(!letter.html.includes("border-left:3px solid"));
});

Deno.test("R3 — the CTA names the outcome; never the transaction", () => {
  assertStringIncludes(renderClientLetter(F1).html, "Open the project");
  assertStringIncludes(renderClientLetter(F2).html, "Open the page");
  for (const s of [F1, F2]) {
    const html = renderClientLetter(s).html;
    for (const banned of ["Accept invitation", "Get started", "Create your account", "Join Patina", "Activate"]) {
      assert(!html.includes(banned), `letter says "${banned}"`);
    }
  }
});

Deno.test("A.7 — one dated expiry line with its remedy, and no clock", () => {
  const html = renderClientLetter(F1).html;
  assertStringIncludes(html, "The link works until 15 September; Leah can send another.");
  assert(!/expires in/i.test(html));
  assert(!/don.t miss/i.test(html));
});

Deno.test("R13 — the notice letter has nothing to expire", () => {
  const notice = renderClientLetter({
    ...F1,
    kind: "notice",
    ctaUrl: "https://client.patina.cloud/",
  });
  assert(!/The link works until/.test(notice.html));
  assert(!/lapses on its own/.test(notice.html));
  assertStringIncludes(notice.html, "If this isn&rsquo;t for you, nothing happens &mdash; ignore it.");
});

Deno.test("R7' — the first letter signs with the full name, dropping empty segments", () => {
  assertStringIncludes(
    renderClientLetter(F1).html,
    "&mdash; Leah Hartwell &middot; Middle West Studio &middot; Madison",
  );
  const solo = renderClientLetter(F2).html;
  assertStringIncludes(solo, "&mdash; Nora Feld");
  assert(!solo.includes("&mdash; Nora Feld &middot;"), "a missing segment left its separator behind");
});

Deno.test("the letterhead prints no slot it has no fact for", () => {
  const html = renderClientLetter({ ...F2, recipientName: null }).html;
  assert(!html.includes("Prepared for"));
  assertStringIncludes(html, "8 September 2026");
  assert(!html.includes("&middot; 8 September 2026"), "a missing city left its separator behind");
});

Deno.test("the plain-text part is mandatory and carries the whole letter", () => {
  const letter = renderClientLetter(F1);
  assert(letter.text.length > 0);
  assertStringIncludes(letter.text, "MIDDLE WEST STUDIO");
  assertStringIncludes(letter.text, "added you to the Van Hise kitchen and back hall on 8 September.");
  assertStringIncludes(letter.text, "Dave — this is the same file I work from");
  assertStringIncludes(letter.text, "Open the project: https://client.patina.cloud/auth/invite/tok1");
  assertStringIncludes(letter.text, "Prepared by Middle West Studio · Sent through Patina");
  assert(!letter.text.includes("<"), "the text part carries markup");
});

Deno.test("golden shell — the letter's shape is a diff, not a memory", async () => {
  const html = renderClientLetter(F1).html;
  const path = new URL("./__snapshots__/client-letter.baseline.html", import.meta.url);
  if (Deno.env.get("UPDATE_SNAPSHOTS") === "1") {
    await Deno.writeTextFile(path, html);
  }
  assertEquals(html, await Deno.readTextFile(path));
});
