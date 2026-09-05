/// <reference lib="deno.ns" />
// ^ The monorepo root tsconfig.json sets lib: [ES2022, DOM] which Deno >= 2.4
// picks up, clobbering the `Deno` global during type-check — the reference
// restores it (same issue documented in catalog-normalizer.test.ts).
//
// Structural test for apns-send (Arrival Arc, I66): host selection per token
// environment, payload shape, token normalization, and dead-token
// classification. Pure helpers from apns-send/core.ts — no live stack, no
// network, no jose. Run:
//   deno test --allow-all --config supabase/functions/deno.json supabase/functions/_tests/apns-send.test.ts

import {
  assert,
  assertEquals,
} from "https://deno.land/std@0.168.0/testing/asserts.ts";
import {
  apnsDeviceUrl,
  apnsHostFor,
  badgeRowIsRead,
  bearerRole,
  buildApnsPayload,
  collapsedBadgeCount,
  isDeadTokenResponse,
  normalizePkcs8Pem,
  resolveTokens,
} from "../apns-send/core.ts";

function fakeJwt(role: string): string {
  const encode = (value: object) =>
    btoa(JSON.stringify(value)).replaceAll("+", "-").replaceAll("/", "_")
      .replaceAll("=", "");
  return `${encode({ alg: "none" })}.${encode({ role })}.signature`;
}

Deno.test("apns-send service boundary distinguishes service and user JWT roles", () => {
  assertEquals(bearerRole(`Bearer ${fakeJwt("service_role")}`), "service_role");
  assertEquals(
    bearerRole(`Bearer ${fakeJwt("authenticated")}`),
    "authenticated",
  );
  assertEquals(bearerRole(null), null);
  assertEquals(bearerRole("Bearer malformed"), null);
});

Deno.test("apnsHostFor picks the host PER TOKEN environment (I66)", () => {
  assertEquals(apnsHostFor("production"), "https://api.push.apple.com");
  assertEquals(apnsHostFor("sandbox"), "https://api.sandbox.push.apple.com");
});

Deno.test("apnsDeviceUrl embeds the token on the environment's host", () => {
  assertEquals(
    apnsDeviceUrl({ token: "abc123", environment: "sandbox" }),
    "https://api.sandbox.push.apple.com/3/device/abc123",
  );
  assertEquals(
    apnsDeviceUrl({ token: "abc123", environment: "production" }),
    "https://api.push.apple.com/3/device/abc123",
  );
});

Deno.test("buildApnsPayload carries alert + routing refs", () => {
  const payload = buildApnsPayload({
    title: "Middle Studio introduced themselves",
    body: "Middle Studio introduced themselves — pick a time.",
    entity_type: "design_request",
    entity_id: "lead-1",
    notification_log_id: "log-1",
  });
  assertEquals(payload, {
    aps: {
      alert: {
        title: "Middle Studio introduced themselves",
        body: "Middle Studio introduced themselves — pick a time.",
      },
      sound: "default",
    },
    entity_type: "design_request",
    entity_id: "lead-1",
    notification_log_id: "log-1",
  });
});

Deno.test("buildApnsPayload nulls absent routing refs (never undefined keys)", () => {
  const payload = buildApnsPayload({ title: "t", body: "b" }) as Record<
    string,
    unknown
  >;
  assertEquals(payload.entity_type, null);
  assertEquals(payload.entity_id, null);
  assertEquals(payload.notification_log_id, null);
});

Deno.test("resolveTokens: explicit environment wins; bare strings resolve from DB rows", () => {
  const { resolved, unresolved } = resolveTokens(
    [
      { token: "t-explicit", environment: "production" },
      "t-db-sandbox",
      { token: "t-db-prod" }, // object without environment → DB lookup
      "t-unknown",
    ],
    [
      { token: "t-db-sandbox", environment: "sandbox" },
      { token: "t-db-prod", environment: "production" },
    ],
  );
  assertEquals(resolved, [
    { token: "t-explicit", environment: "production" },
    { token: "t-db-sandbox", environment: "sandbox" },
    { token: "t-db-prod", environment: "production" },
  ]);
  // No environment anywhere → dropped, never guessed (I66).
  assertEquals(unresolved, ["t-unknown"]);
});

Deno.test("resolveTokens ignores malformed DB environments", () => {
  const { resolved, unresolved } = resolveTokens(
    ["t-1"],
    [{ token: "t-1", environment: "staging" }],
  );
  assertEquals(resolved, []);
  assertEquals(unresolved, ["t-1"]);
});

Deno.test("isDeadTokenResponse: 410 and Apple's dead-token reasons delete the row", () => {
  assert(isDeadTokenResponse(410));
  assert(isDeadTokenResponse(400, "BadDeviceToken"));
  assert(isDeadTokenResponse(410, "Unregistered"));
  assert(!isDeadTokenResponse(403, "ExpiredProviderToken"));
  assert(!isDeadTokenResponse(429, "TooManyRequests"));
  assert(!isDeadTokenResponse(500));
});

// ── normalizePkcs8Pem ────────────────────────────────────────────────────
// jose's importPKCS8 REQUIRES the BEGIN/END PRIVATE KEY framing; a bare
// base64 body (what `supabase secrets set KEY=<paste>` yields if the PEM
// header/footer got stripped before paste) throws
// `"pkcs8" must be PKCS#8 formatted string` — confirmed locally against the
// exact jose@v5.2.0 version pinned in index.ts, with a throwaway
// (non-Patina) ES256 test key. These tests exercise the string-shaping
// logic only (no jose/network — same "pure helper" posture as the rest of
// this file); the actual jose round-trip was verified out-of-band.
const FAKE_BODY =
  "MIGHAgEAMBMGByqGSM49AgEGCCqGSM49AwEHBG0wawIBAQQgWIFGm3azGxwHtyU" +
  "xVtaM6MRGxieVHeCMRgwPkfENr2hRANCAAQVTY9RCTvPfFAMikwlrLeICOWNWA9x" +
  "rTC9Rn3lWwWoa2Zxm8XKfEuk8KHJ5vwLGrfWzalQotF2KvZ9SX6Jl9";
const FAKE_PEM = `-----BEGIN PRIVATE KEY-----\n${
  FAKE_BODY.match(/.{1,64}/g)!.join("\n")
}\n-----END PRIVATE KEY-----`;

Deno.test("normalizePkcs8Pem: bare base64 body gets BEGIN/END framing + 64-char wrap", () => {
  const result = normalizePkcs8Pem(FAKE_BODY);
  assert(result.startsWith("-----BEGIN PRIVATE KEY-----\n"));
  assert(result.endsWith("\n-----END PRIVATE KEY-----"));
  const inner = result
    .replace("-----BEGIN PRIVATE KEY-----\n", "")
    .replace("\n-----END PRIVATE KEY-----", "");
  const lines = inner.split("\n");
  for (const line of lines.slice(0, -1)) {
    assertEquals(line.length, 64);
  }
  assert(lines[lines.length - 1].length <= 64);
  // Re-joining the wrapped body recovers the exact original base64.
  assertEquals(lines.join(""), FAKE_BODY);
});

Deno.test("normalizePkcs8Pem: bare base64 with stray whitespace/newlines is still recognized (no BEGIN marker)", () => {
  const messy = `  ${FAKE_BODY.slice(0, 40)}\n${FAKE_BODY.slice(40)}  \n`;
  const result = normalizePkcs8Pem(messy);
  assert(result.startsWith("-----BEGIN PRIVATE KEY-----\n"));
  assert(result.endsWith("\n-----END PRIVATE KEY-----"));
  const inner = result
    .replace("-----BEGIN PRIVATE KEY-----\n", "")
    .replace("\n-----END PRIVATE KEY-----", "")
    .split("\n")
    .join("");
  assertEquals(inner, FAKE_BODY);
});

Deno.test("normalizePkcs8Pem: full PEM (already framed) passes through unchanged", () => {
  assertEquals(normalizePkcs8Pem(FAKE_PEM), FAKE_PEM);
});

Deno.test("normalizePkcs8Pem: full PEM with literal \\n escapes (single-line secret) gets real newlines", () => {
  const singleLineEscaped = FAKE_PEM.split("\n").join("\\n");
  assertEquals(normalizePkcs8Pem(singleLineEscaped), FAKE_PEM);
});

// ── R5: the springboard number ──────────────────────────────────────────────
// The home-screen badge is the recipient's unread in-app count, resolved by
// index.ts and handed to the payload builder. An unreadable count omits the key
// rather than sending 0 and clearing a number that is still true.

Deno.test("buildApnsPayload carries aps.badge when a count is known (R5)", () => {
  const payload = buildApnsPayload({
    title: "An approval is waiting",
    body: "Leah sent the kitchen plan set.",
    entity_type: "decision",
    entity_id: "decision-1",
  }, 3);
  assertEquals(payload, {
    aps: {
      alert: {
        title: "An approval is waiting",
        body: "Leah sent the kitchen plan set.",
      },
      sound: "default",
      badge: 3,
    },
    entity_type: "decision",
    entity_id: "decision-1",
    notification_log_id: null,
  });
});

Deno.test("buildApnsPayload omits aps.badge when the count is unknown (R5)", () => {
  for (const badge of [undefined, Number.NaN, -1]) {
    const aps = (buildApnsPayload({ title: "t", body: "b" }, badge) as {
      aps: Record<string, unknown>;
    }).aps;
    assert(!("badge" in aps), `badge should be absent for ${String(badge)}`);
  }
});

Deno.test("buildApnsPayload sends a true zero, which clears the badge", () => {
  const aps = (buildApnsPayload({ title: "t", body: "b" }, 0) as {
    aps: Record<string, unknown>;
  }).aps;
  assertEquals(aps.badge, 0);
});

// ── R5, second pass: the badge counts what the bell counts ──────────────────
// `collapseDuplicates` on iOS folds rows on `entity_type|entity_id`; a raw row
// count would paint a springboard number the app itself never draws, and it
// would stand for as long as the app stayed closed.

Deno.test("collapsedBadgeCount folds two rows naming one entity (M1)", () => {
  const rows = [
    { metadata: { entity_type: "design_request", entity_id: "dr-1" } },
    { metadata: { entity_type: "design_request", entity_id: "dr-1" } },
    { metadata: { entity_type: "decision", entity_id: "dec-9" } },
  ];
  assertEquals(collapsedBadgeCount(rows), 2);
});

Deno.test("collapsedBadgeCount counts entity-less rows individually", () => {
  const rows = [
    { metadata: null },
    { metadata: {} },
    { metadata: { entity_type: "decision" } },
    { metadata: { entity_type: "decision", entity_id: "dec-9" } },
    { metadata: { entity_type: "decision", entity_id: "dec-9" } },
  ];
  assertEquals(collapsedBadgeCount(rows), 4);
});

Deno.test("collapsedBadgeCount is zero for no unread rows", () => {
  assertEquals(collapsedBadgeCount([]), 0);
});

Deno.test("collapsedBadgeCount keeps distinct entities of the same kind", () => {
  const rows = [
    { metadata: { entity_type: "invoice", entity_id: "inv-1" } },
    { metadata: { entity_type: "invoice", entity_id: "inv-2" } },
    { metadata: { entity_type: "proposal", entity_id: "inv-1" } },
  ];
  assertEquals(collapsedBadgeCount(rows), 3);
});

// ── The bell's read rule (r2-M1) ────────────────────────────────────────────
// The bell collapses two rows naming one entity and lets a READ row mark the
// survivor read (NotificationsViewModel.collapseDuplicates; pinned by
// BellQueueFallbackTests "a read twin marks the surviving row read"). The icon
// must break the tie the same way or it paints a number the app never draws.

Deno.test("badgeRowIsRead follows the bell: opened_at, or an opened/clicked status", () => {
  assert(badgeRowIsRead({ opened_at: "2026-09-05T10:00:00Z" }));
  assert(badgeRowIsRead({ opened_at: null, status: "opened" }));
  assert(badgeRowIsRead({ opened_at: null, status: "clicked" }));
  assert(!badgeRowIsRead({ opened_at: null, status: "delivered" }));
  assert(!badgeRowIsRead({}));
});

Deno.test("collapsedBadgeCount drops an entity as soon as one of its rows is read (r2-M1)", () => {
  // She taps the newer row in the bell; markOpened stamps that row alone and
  // the older twin stays unstamped. Bell: 0. The icon must say 0 too.
  const rows = [
    {
      metadata: { entity_type: "design_request", entity_id: "dr-1" },
      opened_at: "2026-09-05T10:00:00Z",
      status: "delivered",
    },
    {
      metadata: { entity_type: "design_request", entity_id: "dr-1" },
      opened_at: null,
      status: "delivered",
    },
  ];
  assertEquals(collapsedBadgeCount(rows), 0);
});

Deno.test("collapsedBadgeCount reads an entity read from a clicked twin, whatever the order", () => {
  const readFirst = [
    {
      metadata: { entity_type: "decision", entity_id: "dec-9" },
      opened_at: null,
      status: "clicked",
    },
    {
      metadata: { entity_type: "decision", entity_id: "dec-9" },
      opened_at: null,
      status: "delivered",
    },
  ];
  const readLast = [readFirst[1], readFirst[0]];
  assertEquals(collapsedBadgeCount(readFirst), 0);
  assertEquals(collapsedBadgeCount(readLast), 0);
});

Deno.test("collapsedBadgeCount still counts an entity whose every row is unread", () => {
  const rows = [
    {
      metadata: { entity_type: "decision", entity_id: "dec-9" },
      opened_at: null,
      status: "delivered",
    },
    {
      metadata: { entity_type: "decision", entity_id: "dec-9" },
      opened_at: null,
      status: "queued",
    },
  ];
  assertEquals(collapsedBadgeCount(rows), 1);
});

Deno.test("collapsedBadgeCount skips read rows that name no entity", () => {
  const rows = [
    { metadata: null, opened_at: "2026-09-05T10:00:00Z" },
    { metadata: {}, opened_at: null, status: "opened" },
    { metadata: { entity_type: "decision" }, opened_at: null },
  ];
  assertEquals(collapsedBadgeCount(rows), 1);
});

Deno.test("collapsedBadgeCount counts a read window as the bell counts it", () => {
  const rows = [
    // one invoice, read on its second row → not counted
    {
      metadata: { entity_type: "invoice", entity_id: "inv-1" },
      opened_at: null,
      status: "delivered",
    },
    {
      metadata: { entity_type: "invoice", entity_id: "inv-1" },
      opened_at: "2026-09-04T09:00:00Z",
      status: "opened",
    },
    // one proposal, wholly unread → counted once
    {
      metadata: { entity_type: "proposal", entity_id: "pr-2" },
      opened_at: null,
      status: "delivered",
    },
    {
      metadata: { entity_type: "proposal", entity_id: "pr-2" },
      opened_at: null,
      status: "delivered",
    },
    // one keyless unread row → counted on its own
    { metadata: null, opened_at: null, status: "delivered" },
  ];
  assertEquals(collapsedBadgeCount(rows), 2);
});
