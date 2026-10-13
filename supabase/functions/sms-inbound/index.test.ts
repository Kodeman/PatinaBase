import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { inboundReplyAuthority } from "./index.ts";

Deno.test("sms-inbound exempts opt-in confirmation and labels other auto-replies", () => {
  const scheduled = { kind: "studio_schedule" as const, studioId: "studio-1", outboundKind: "homeowner_window_pick" as const };
  assertEquals(inboundReplyAuthority("sms_optin_confirm", scheduled), {
    kind: "exempt", reason: "carrier_compliance",
  });
  assertEquals(inboundReplyAuthority("sms_inbound_reply", scheduled), scheduled);
});
