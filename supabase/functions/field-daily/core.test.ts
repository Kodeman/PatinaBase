import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { draftExpiryFor, scheduledAuthority } from "./core.ts";

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
