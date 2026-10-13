import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { parseFieldMessage } from "../_shared/field-parse.ts";
import { inboundReplyAuthority } from "./index.ts";
import { fieldParseAttribution } from "./pipeline.ts";

Deno.test("SMS field parser reserves against the texting party project's organization", async () => {
  const attribution = await fieldParseAttribution({
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({ data: { organization_id: "studio-project-org" }, error: null }),
        }),
      }),
    }),
  } as never, "project-1");
  let studioReserved: string | null = null;
  let userReserved: string | null | undefined;
  await parseFieldMessage(
    { body: "the cabinet door is loose", openItems: [], recentMessages: [], today: "2026-10-13" },
    {
      getEnv: () => "test-key",
      ...attribution,
      ledger: {
        async reserve(_feature, studioId, userId) {
          studioReserved = studioId;
          userReserved = userId;
          return { granted: true, reason: null, usageId: 1 };
        },
        async settle() {},
      },
      caller: async () => ({
        stop_reason: "end_turn",
        content: [{ type: "text", text: JSON.stringify({ intent: "note", note: "site update", confidence: 0.6 }) }],
        usage: { input_tokens: 10, output_tokens: 8 },
      }),
    },
  );
  assertEquals(studioReserved, "studio-project-org");
  assertEquals(userReserved, null);
});

Deno.test("sms-inbound exempts opt-in confirmation and labels other auto-replies", () => {
  const scheduled = { kind: "studio_schedule" as const, studioId: "studio-1", outboundKind: "homeowner_window_pick" as const };
  assertEquals(inboundReplyAuthority("sms_optin_confirm", scheduled), {
    kind: "exempt", reason: "carrier_compliance",
  });
  assertEquals(inboundReplyAuthority("sms_inbound_reply", scheduled), scheduled);
});
