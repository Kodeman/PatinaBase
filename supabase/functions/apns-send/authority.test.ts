import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { refusesUnlabelledClientPush } from "./core.ts";

Deno.test("apns-send refuses an unlabelled client push", () => {
  assertEquals(refusesUnlabelledClientPush({ entity_type: "invoice" }), true);
  assertEquals(
    refusesUnlabelledClientPush({
      entity_type: "decision",
      authority: { kind: "unlabelled" },
    }),
    true,
  );
});

Deno.test("apns-send accepts a labelled client push", () => {
  assertEquals(
    refusesUnlabelledClientPush({
      entity_type: "invoice",
      authority: { kind: "designer", userId: "designer-1" },
    }),
    false,
  );
  assertEquals(
    refusesUnlabelledClientPush({
      entity_type: "invoice",
      authority: {
        kind: "studio_schedule",
        studioId: "studio-1",
        outboundKind: "invoice_reminder",
      },
    }),
    false,
  );
});

Deno.test("apns-send leaves internal and designer pushes unchanged", () => {
  assertEquals(
    refusesUnlabelledClientPush({ entity_type: "design_request" }),
    false,
  );
});
