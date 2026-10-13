import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { scheduledAuthority } from "./core.ts";

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
