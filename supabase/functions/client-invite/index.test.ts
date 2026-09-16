import { assert, assertEquals, assertStringIncludes } from
  "https://deno.land/std@0.208.0/assert/mod.ts";
import {
  buildSnapshot,
  chooseSigner,
  isServiceRoleCaller,
  parseSecretKeys,
  resendCooldownRemainingMs,
  resendEligibility,
  validateNote,
  validateToken,
  RESEND_COOLDOWN_MS,
} from "./lib.ts";
import { renderClientLetter, senderDisplayName } from "../_shared/client-letter.ts";

Deno.test("R4 — the note is optional, trimmed, and capped at 280", () => {
  assertEquals(validateNote(undefined), { ok: true, value: null });
  assertEquals(validateNote("   "), { ok: true, value: null });
  assertEquals(validateNote("  a line  "), { ok: true, value: "a line" });
  assertEquals(validateNote("x".repeat(280)).ok, true);
  assertEquals(validateNote("x".repeat(281)), { ok: false, error: "note_too_long" });
  // Trimming happens BEFORE the cap, so trailing whitespace never costs a letter.
  assertEquals(validateNote(`${"x".repeat(280)}   `).ok, true);
});

Deno.test("only the service role may reach any leg", () => {
  assert(isServiceRoleCaller("Bearer sr-key", "sr-key"));
  assert(!isServiceRoleCaller("Bearer designer-jwt", "sr-key"));
  assert(!isServiceRoleCaller(null, "sr-key"));
  assert(!isServiceRoleCaller("Bearer ", "sr-key"));
  // An empty configured key can never be satisfied.
  assert(!isServiceRoleCaller("Bearer ", ""));
});

// Helper: a legacy service-role credential is a project-signed HS256 JWT. The
// gateway verifies the signature upstream, so these fixtures only need real
// claims, not a real signature.
function legacyJwt(claims: Record<string, unknown>): string {
  const seg = (o: unknown) =>
    btoa(JSON.stringify(o)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  return `${seg({ alg: "HS256", typ: "JWT" })}.${seg(claims)}.c2ln`;
}
const SERVICE_ROLE_CLAIMS = {
  iss: "supabase",
  ref: "bkvcixdmuyejfzcijpdg",
  role: "service_role",
  iat: 1_768_268_432,
  exp: Math.floor(Date.now() / 1000) + 3600,
};

Deno.test("SUPABASE_SECRET_KEYS is parsed as a dictionary, an array, or a list", () => {
  assertEquals(parseSecretKeys(null), []);
  assertEquals(parseSecretKeys("   "), []);
  // The shape Supabase actually injects on Strata.
  assertEquals(parseSecretKeys('{"default":"sb_secret_aaa"}'), ["sb_secret_aaa"]);
  assertEquals(
    parseSecretKeys('{"default":"sb_secret_aaa","rotating":"sb_secret_bbb"}'),
    ["sb_secret_aaa", "sb_secret_bbb"],
  );
  assertEquals(parseSecretKeys('["sb_secret_aaa"]'), ["sb_secret_aaa"]);
  assertEquals(parseSecretKeys('[{"api_key":"sb_secret_aaa"}]'), ["sb_secret_aaa"]);
  assertEquals(parseSecretKeys("sb_secret_aaa, sb_secret_bbb"), [
    "sb_secret_aaa",
    "sb_secret_bbb",
  ]);
  // Garbage yields no keys rather than throwing.
  assertEquals(parseSecretKeys("{"), ["{"]);
  assertEquals(parseSecretKeys("null"), []);
});

Deno.test("the service role is one principal in three shapes", () => {
  const NEW = "sb_secret_newformat";
  const LEGACY = legacyJwt(SERVICE_ROLE_CLAIMS);
  const DICT = `{"default":"${NEW}"}`;

  // 1. The env key itself, whichever shape the platform injects.
  assert(isServiceRoleCaller(`Bearer ${NEW}`, NEW, DICT, "bkvcixdmuyejfzcijpdg"));
  assert(isServiceRoleCaller("Bearer legacy-literal", "legacy-literal", DICT, null));

  // 2. A key listed only in SUPABASE_SECRET_KEYS — the env key having moved on.
  assert(isServiceRoleCaller(`Bearer ${NEW}`, "sb_secret_someother", DICT, null));
  assert(
    isServiceRoleCaller(
      "Bearer sb_secret_bbb",
      "sb_secret_aaa",
      '{"default":"sb_secret_aaa","next":"sb_secret_bbb"}',
      null,
    ),
  );

  // 3. THE PRODUCTION DEFECT: a caller still holding the legacy service-role
  //    JWT, which matches neither the env key nor any listed secret key.
  assert(isServiceRoleCaller(`Bearer ${LEGACY}`, NEW, DICT, "bkvcixdmuyejfzcijpdg"));
  // ...but only for THIS project, and only when the project is known at all.
  assert(!isServiceRoleCaller(`Bearer ${LEGACY}`, NEW, DICT, null));
});

Deno.test("everything else is still turned away", () => {
  const NEW = "sb_secret_newformat";
  const DICT = `{"default":"${NEW}"}`;
  const REF = "bkvcixdmuyejfzcijpdg";

  // An unrelated opaque token.
  assert(!isServiceRoleCaller("Bearer sb_secret_unrelated", NEW, DICT, REF));
  assert(!isServiceRoleCaller("Bearer sb_publishable_aaa", NEW, DICT, REF));
  // No config at all can never be satisfied, by any shape.
  assert(!isServiceRoleCaller("Bearer sb_secret_newformat", "", "", REF));
  assert(!isServiceRoleCaller("Bearer sb_secret_newformat", "", null, null));
  assert(!isServiceRoleCaller(`Bearer ${legacyJwt(SERVICE_ROLE_CLAIMS)}`, "", null, null));
  assert(!isServiceRoleCaller(null, NEW, DICT, REF));
  assert(!isServiceRoleCaller("Bearer   ", NEW, DICT, REF));
  // A signed-in homeowner or designer: the gateway lets her JWT through, this
  // must not.
  assert(
    !isServiceRoleCaller(
      `Bearer ${legacyJwt({ ...SERVICE_ROLE_CLAIMS, role: "authenticated" })}`,
      NEW,
      DICT,
      REF,
    ),
  );
  assert(
    !isServiceRoleCaller(
      `Bearer ${legacyJwt({ ...SERVICE_ROLE_CLAIMS, role: "anon" })}`,
      NEW,
      DICT,
      REF,
    ),
  );
  // A service-role JWT minted for a DIFFERENT Supabase project.
  assert(
    !isServiceRoleCaller(
      `Bearer ${legacyJwt({ ...SERVICE_ROLE_CLAIMS, ref: "someotherproject" })}`,
      NEW,
      DICT,
      REF,
    ),
  );
  // An expired service-role JWT.
  assert(
    !isServiceRoleCaller(
      `Bearer ${legacyJwt({ ...SERVICE_ROLE_CLAIMS, exp: Math.floor(Date.now() / 1000) - 1 })}`,
      NEW,
      DICT,
      REF,
    ),
  );
  // Not a JWT at all, and a JWT whose payload is not JSON.
  assert(!isServiceRoleCaller("Bearer a.b", NEW, DICT, REF));
  assert(!isServiceRoleCaller("Bearer a.b.c", NEW, DICT, REF));
  assert(!isServiceRoleCaller("Bearer ..", NEW, DICT, REF));
});

Deno.test("token validation is total and orders its failures", () => {
  const base = {
    accepted_at: null as string | null,
    revoked_at: null as string | null,
    expires_at: new Date(Date.now() + 60_000).toISOString(),
  };
  assertEquals(validateToken(null), { ok: false, error: "not_found", status: 404 });
  assertEquals(validateToken(base), { ok: true });
  assertEquals(
    validateToken({ ...base, revoked_at: new Date().toISOString() }),
    { ok: false, error: "revoked", status: 403 },
  );
  assertEquals(
    validateToken({ ...base, accepted_at: new Date().toISOString() }),
    { ok: false, error: "already_accepted", status: 409 },
  );
  assertEquals(
    validateToken({ ...base, expires_at: new Date(Date.now() - 1).toISOString() }),
    { ok: false, error: "expired", status: 410 },
  );
  // Accepted beats expired: a letter she used is not a letter that lapsed.
  assertEquals(
    validateToken({
      ...base,
      accepted_at: new Date().toISOString(),
      expires_at: new Date(Date.now() - 1).toISOString(),
    }),
    { ok: false, error: "already_accepted", status: 409 },
  );
});

Deno.test("R13 — a notice has nothing to resend", () => {
  assertEquals(resendEligibility("notice"), {
    ok: false,
    error: "nothing_to_resend",
    status: 409,
  });
  assertEquals(resendEligibility("invite"), { ok: true });
});

Deno.test("R10 — one letter per hour", () => {
  const now = Date.now();
  assertEquals(resendCooldownRemainingMs(null, now), 0);
  assertEquals(
    resendCooldownRemainingMs(new Date(now - RESEND_COOLDOWN_MS - 1).toISOString(), now),
    0,
  );
  const remaining = resendCooldownRemainingMs(
    new Date(now - 60_000).toISOString(),
    now,
  );
  assertEquals(remaining, RESEND_COOLDOWN_MS - 60_000);
});

Deno.test("the snapshot is assembled once, and the letter reads only from it", () => {
  const snap = buildSnapshot({
    kind: "invite",
    email: "dave@okonkwo.net",
    clientName: "Dave Okonkwo",
    signerFullName: "Leah Hartwell",
    studioName: "Middle West Studio",
    studioLogoUrl: null,
    signatureCity: "Madison",
    projectName: "Van Hise kitchen and back hall",
    note: "a line",
    sentAt: "2026-09-08T14:00:00.000Z",
    expiresAt: "2026-09-15T14:00:00.000Z",
    ctaUrl: "https://client.patina.cloud/auth/invite/tok1",
  });
  assertEquals(snap.designerGivenName, "Leah");
  assertEquals(snap.designerFullName, "Leah Hartwell");
  assertEquals(snap.recipientName, "Dave Okonkwo");
  assertEquals(
    snap.ctaUrl,
    "https://client.patina.cloud/auth/invite/tok1",
  );
});

Deno.test("the letter's CTA is OUR token, never a GoTrue link", () => {
  const snap = buildSnapshot({
    kind: "invite",
    email: "dave@okonkwo.net",
    clientName: null,
    signerFullName: "Leah Hartwell",
    studioName: null,
    studioLogoUrl: null,
    signatureCity: null,
    projectName: null,
    note: null,
    sentAt: "2026-09-08T14:00:00.000Z",
    expiresAt: "2026-09-15T14:00:00.000Z",
    ctaUrl: "https://client.patina.cloud/auth/invite/tok9",
  });
  assert(snap.ctaUrl.includes("/auth/invite/"));
  assert(!snap.ctaUrl.includes("/auth/v1/verify"));
  assert(!snap.ctaUrl.includes("token_hash"));
});

Deno.test("R13 — a notice's CTA goes straight to the house", () => {
  const snap = buildSnapshot({
    kind: "notice",
    email: "dave@okonkwo.net",
    clientName: "Dave Okonkwo",
    signerFullName: "Leah Hartwell",
    studioName: "Middle West Studio",
    studioLogoUrl: null,
    signatureCity: "Madison",
    projectName: null,
    note: null,
    sentAt: "2026-09-08T14:00:00.000Z",
    expiresAt: "2026-09-15T14:00:00.000Z",
    ctaUrl: "https://client.patina.cloud/",
  });
  assertEquals(snap.kind, "notice");
  assertEquals(snap.ctaUrl, "https://client.patina.cloud/");
});

// ── R11 + voice rule 5: who signs, and what happens when nobody can ────────
// The production defect: Kody's studio "Middle Studio" sent a letter signed
// "Your designer" because his profiles row carries neither full_name nor
// display_name, and the old code fell back to that literal.

const OWNER = {
  id: "owner-1",
  full_name: "Leah Hartwell",
  display_name: "Leah",
  email: "leah@middlewest.studio",
  city: "Madison",
};
const WRITER = {
  id: "writer-1",
  full_name: "Nora Feld",
  display_name: null,
  email: "nora@middlewest.studio",
  city: null,
};
const NAMELESS = {
  id: "nameless-1",
  full_name: null,
  display_name: null,
  email: "nobody@middlewest.studio",
  city: null,
};

Deno.test("R11 — the studio owner signs when she has a name", () => {
  const signer = chooseSigner({
    writerId: WRITER.id,
    ownerId: OWNER.id,
    ownerProfile: OWNER,
    writerProfile: WRITER,
  });
  assertEquals(signer.signerFullName, "Leah Hartwell");
  assertEquals(signer.signerId, "owner-1");
  // display_name is the second rung, and only when full_name is empty.
  assertEquals(
    chooseSigner({
      writerId: WRITER.id,
      ownerId: OWNER.id,
      ownerProfile: { ...OWNER, full_name: "   " },
      writerProfile: WRITER,
    }).signerFullName,
    "Leah",
  );
});

Deno.test("the writer signs when the owner cannot be named", () => {
  // No owner row at all (a solo designer, or a studio with no active owner).
  assertEquals(
    chooseSigner({
      writerId: WRITER.id,
      ownerId: null,
      ownerProfile: null,
      writerProfile: WRITER,
    }),
    { signerId: "writer-1", signerFullName: "Nora Feld", profile: WRITER },
  );
  // An owner row that exists but carries no name — the same case.
  const fallback = chooseSigner({
    writerId: WRITER.id,
    ownerId: NAMELESS.id,
    ownerProfile: NAMELESS,
    writerProfile: WRITER,
  });
  assertEquals(fallback.signerFullName, "Nora Feld");
  assertEquals(fallback.signerId, "writer-1");
});

Deno.test("with neither name the letter has NO NAME, never a placeholder", () => {
  const signer = chooseSigner({
    writerId: NAMELESS.id,
    ownerId: NAMELESS.id,
    ownerProfile: NAMELESS,
    writerProfile: NAMELESS,
  });
  assertEquals(signer.signerFullName, null);
  // signer_id still points at the studio's principal, so the row stays whole.
  assertEquals(signer.signerId, "nameless-1");

  const snap = buildSnapshot({
    kind: "invite",
    email: "dave@okonkwo.net",
    clientName: "Dave Okonkwo",
    signerFullName: signer.signerFullName,
    studioName: "Middle Studio",
    studioLogoUrl: null,
    signatureCity: null,
    projectName: null,
    note: null,
    sentAt: "2026-09-09T14:00:00.000Z",
    expiresAt: "2026-09-16T14:00:00.000Z",
    ctaUrl: "https://client.patina.cloud/auth/invite/tok1",
  });
  assertEquals(snap.designerFullName, null);
  assertEquals(snap.designerGivenName, null);

  // The studio authors it, in the subject and in the standing sentence.
  const letter = renderClientLetter(snap);
  assertEquals(
    letter.subject,
    "Middle Studio set up a page for your work together",
  );
  assertEquals(
    letter.standingSentence,
    "Middle Studio set up a page for your work together on 9 September. It's where the studio keeps the record — the plans, the papers, and the numbers, as they come.",
  );
  // And nothing anywhere invents a person.
  for (const part of [letter.html, letter.text, letter.subject, letter.preheader]) {
    assert(!part.includes("Your designer"), "the letter names a placeholder");
    assert(!part.includes("Your keep"), "the letter reads 'Your keep'");
    assert(!/\bnull\b/.test(part), "a null leaked into the letter");
    assert(!/\bundefined\b/.test(part), "an undefined leaked into the letter");
  }
});

Deno.test("a studio-authored letter signs with the studio, and an unsigned one not at all", () => {
  const base = {
    kind: "invite" as const,
    email: "dave@okonkwo.net",
    clientName: "Dave Okonkwo",
    signerFullName: null,
    studioLogoUrl: null,
    signatureCity: null,
    projectName: null,
    note: null,
    sentAt: "2026-09-09T14:00:00.000Z",
    expiresAt: "2026-09-16T14:00:00.000Z",
    ctaUrl: "https://client.patina.cloud/auth/invite/tok1",
  };
  const withStudio = renderClientLetter(
    buildSnapshot({ ...base, studioName: "Middle Studio" }),
  );
  assertStringIncludes(withStudio.text, "— Middle Studio");
  assertStringIncludes(withStudio.html, "MIDDLE STUDIO");
  // R1: the envelope still leads with the studio.
  assertEquals(senderDisplayName(buildSnapshot({ ...base, studioName: "Middle Studio" })), "Middle Studio via Patina");
  // A.7's remedy names the studio rather than an unnamed somebody.
  assertStringIncludes(
    withStudio.html,
    "The link works until 16 September; Middle Studio can send another.",
  );

  // Neither a person nor a studio: no sign-off, no letterhead name, no lie.
  const bare = renderClientLetter(buildSnapshot({ ...base, studioName: null }));
  // The em dash inside the standing sentence stays; the SIGN-OFF line does not.
  assert(
    !bare.text.split("\n").some((l) => l.startsWith("— ")),
    "an unsigned letter still printed a sign-off",
  );
  // The sign-off is the only paragraph that OPENS with the dash.
  assert(!/>&mdash; /.test(bare.html), "an unsigned letter still printed a sign-off");
  assertEquals(bare.subject, "A page is set up for your work together");
  assertStringIncludes(
    bare.standingSentence,
    "A page for your work together was set up on 9 September. It's where the record is kept",
  );
  assertStringIncludes(bare.html, "Sent through Patina");
  assert(!bare.html.includes("Prepared by"), "an unnamed preparer was printed");
  for (const part of [bare.html, bare.text, bare.subject, bare.preheader]) {
    assert(!part.includes("Your designer"));
    assert(!/\bnull\b/.test(part));
  }
});

Deno.test("a project letter degrades to the studio too", () => {
  const snap = buildSnapshot({
    kind: "invite",
    email: "dave@okonkwo.net",
    clientName: null,
    signerFullName: null,
    studioName: "Middle Studio",
    studioLogoUrl: null,
    signatureCity: null,
    projectName: "Van Hise kitchen",
    note: null,
    sentAt: "2026-09-09T14:00:00.000Z",
    expiresAt: "2026-09-16T14:00:00.000Z",
    ctaUrl: "https://client.patina.cloud/auth/invite/tok1",
  });
  const letter = renderClientLetter(snap);
  assertEquals(letter.subject, "Middle Studio added you to the Van Hise kitchen");
  assertEquals(
    letter.standingSentence,
    "Middle Studio added you to the Van Hise kitchen on 9 September. The page below holds the studio's record of the job — the plans, the papers, and the numbers.",
  );
  assert(!letter.html.includes("Your designer"));
});
