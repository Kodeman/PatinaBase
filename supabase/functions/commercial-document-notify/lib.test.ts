import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  parseNotificationChannel,
  resolveCommercialNotificationAudiences,
} from "./lib.ts";

Deno.test("parseNotificationChannel accepts paper or absence, rejects anything else", () => {
  assertEquals(parseNotificationChannel(undefined), { ok: true, channel: null });
  assertEquals(parseNotificationChannel(null), { ok: true, channel: null });
  assertEquals(parseNotificationChannel("paper"), { ok: true, channel: "paper" });
  assertEquals(parseNotificationChannel("online").ok, false);
  assertEquals(parseNotificationChannel("Paper").ok, false);
  assertEquals(parseNotificationChannel(1).ok, false);
  assertEquals(parseNotificationChannel({}).ok, false);
  assertEquals(parseNotificationChannel(true).ok, false);
});

Deno.test("paper channel drops the studio leg on the executed family only", () => {
  assertEquals(
    resolveCommercialNotificationAudiences("furnishings_executed", "paper"),
    ["client"],
  );
  assertEquals(
    resolveCommercialNotificationAudiences("trade_scope_executed", "paper"),
    ["client"],
  );
  assertEquals(
    resolveCommercialNotificationAudiences("executed", "paper"),
    ["client"],
  );
});

Deno.test("paper channel does not touch non-executed-family, non-overridden audiences", () => {
  assertEquals(
    resolveCommercialNotificationAudiences("client_signed", "paper"),
    ["client", "studio"],
  );
  assertEquals(
    resolveCommercialNotificationAudiences("deposit_ready", "paper"),
    ["client"],
  );
  assertEquals(
    resolveCommercialNotificationAudiences("trade_draw_ready", "paper"),
    ["client"],
  );
});

Deno.test("paper channel flips trade_scope_accepted to client-only — the studio recorded it FOR the client", () => {
  assertEquals(
    resolveCommercialNotificationAudiences("trade_scope_accepted", "paper"),
    ["client"],
  );
});

Deno.test("without a channel, audiences match the pre-existing online matrix exactly", () => {
  assertEquals(
    resolveCommercialNotificationAudiences("client_signed", null),
    ["client", "studio"],
  );
  assertEquals(
    resolveCommercialNotificationAudiences("furnishings_executed", null),
    ["client", "studio"],
  );
  assertEquals(
    resolveCommercialNotificationAudiences("trade_scope_executed", null),
    ["client", "studio"],
  );
  assertEquals(resolveCommercialNotificationAudiences("executed", null), ["client"]);
  assertEquals(resolveCommercialNotificationAudiences("budget_published", null), ["client"]);
  assertEquals(resolveCommercialNotificationAudiences("furnishings_sent", null), ["client"]);
  assertEquals(resolveCommercialNotificationAudiences("deposit_ready", null), ["client"]);
  assertEquals(resolveCommercialNotificationAudiences("trade_scope_sent", null), ["client"]);
  assertEquals(resolveCommercialNotificationAudiences("trade_draw_ready", null), ["client"]);
  assertEquals(
    resolveCommercialNotificationAudiences("trade_scope_accepted", null),
    ["studio"],
  );
});
