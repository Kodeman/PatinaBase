import { assert, assertEquals } from
  "https://deno.land/std@0.208.0/assert/mod.ts";
import {
  buildSnapshot,
  isServiceRoleCaller,
  resendCooldownRemainingMs,
  validateNote,
  validateToken,
  RESEND_COOLDOWN_MS,
} from "./lib.ts";

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
