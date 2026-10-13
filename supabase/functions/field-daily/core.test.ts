import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { draftExpiryFor, fieldDraftIdentity, fieldDraftRecipient, scheduledAuthority } from "./core.ts";

Deno.test("field-daily scheduled SMS carries the studio and outbound kind", async () => {
  const fake = {
    rpc: () => Promise.resolve({
      data: [{ studio_id: "studio-1", name: "Studio", logo_url: null, website: null, source: "studio" }],
      error: null,
    }),
  };
  assertEquals(await scheduledAuthority(fake as never, "project-1", "trade_day_of"), {
    kind: "studio_schedule", studioId: "studio-1", outboundKind: "trade_day_of",
  });
});

Deno.test("field SMS drafts expose the party phone as their To address", () => {
  assertEquals(fieldDraftRecipient("party-1", "+13125550123"), {
    party_id: "party-1", address: "+13125550123",
  });
});

Deno.test("same-day field templates retain separate logical draft identities", () => {
  const identity = (templateKey: string, dedupeKey: string) => fieldDraftIdentity({
    kind: templateKey === "sms_daily_digest" || templateKey === "sms_site_card"
      ? "trade_site_digest" : "homeowner_window_pick",
    partyId: "party-1", projectId: "project-1", templateKey, dedupeKey,
    dedupeDay: "2026-01-10", vars: {},
  });
  const digest = identity("sms_daily_digest", "field-daily:party-1:2026-01-10");
  const siteCard = identity("sms_site_card", "field-site_card:party-1:2026-01-10");
  assertEquals(digest.dedupeKey === siteCard.dedupeKey, false);
  assertEquals(digest.refType === siteCard.refType, false);

  const selectionReady = identity("sms_selection_ready", "client-batch:batch-1");
  const windowPick = identity("sms_window_pick", "client-window:batch-1");
  assertEquals(selectionReady.dedupeKey === windowPick.dedupeKey, false);
  assertEquals(selectionReady.refType === windowPick.refType, false);
});

Deno.test("re-running one logical field message retains its draft key and reference", () => {
  const input = {
    kind: "trade_site_digest" as const, partyId: "party-1", projectId: "project-1",
    templateKey: "sms_daily_digest", dedupeKey: "field-daily:party-1:2026-01-10",
    dedupeDay: "2026-01-10", vars: {},
  };
  assertEquals(fieldDraftIdentity(input), fieldDraftIdentity(input));
});

Deno.test("field SMS drafts expire at their local useful-window boundary", () => {
  const now = new Date("2026-01-10T14:30:00.000Z");
  assertEquals(
    draftExpiryFor("sms_daily_digest", now, "America/Chicago").toISOString(),
    "2026-01-10T18:00:00.000Z",
  );
  assertEquals(
    draftExpiryFor("sms_hours_prompt", now, "America/Chicago").toISOString(),
    "2026-01-11T13:30:00.000Z",
  );
  assertEquals(
    draftExpiryFor("sms_delivery_confirm", now, "America/Chicago", {
      __draft_expires_at: "2026-01-12T06:00:00.000Z",
    }).toISOString(),
    "2026-01-12T06:00:00.000Z",
  );
});
