import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { sendDraftBatch } from "./batch.ts";

Deno.test("outbound batch refuses non-leads and continues after a partial failure", async () => {
  const sent: string[] = [];
  const results = await sendDraftBatch(["no-lead", "send-fails", "send-ok"], "user-1", {
    loadDraft: async (id) => ({ id, organization_id: "org", project_id: "project" }),
    canSend: async (draft, userId) => userId === "user-1" && draft.id !== "no-lead",
    send: async (id) => {
      if (id === "send-fails") throw new Error("provider_down");
      sent.push(id);
      return { id, ok: true };
    },
  });
  assertEquals(results, [
    { id: "no-lead", ok: false, error: "not_authorized" },
    { id: "send-fails", ok: false, error: "provider_down" },
    { id: "send-ok", ok: true },
  ]);
  assertEquals(sent, ["send-ok"]);
});
