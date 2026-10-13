import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { composeAndMaybeSendReviewDraft } from "./drafts.ts";

function makeAdmin(mode: string, rolloutActive: boolean) {
  const calls: Array<{ name: string; args: Record<string, unknown> }> = [];
  const ids = new Map<string, string>();
  const admin = {
    rpc: async (name: string, args: Record<string, unknown>) => {
      calls.push({ name, args });
      if (name === "compose_outbound_draft") {
        const key = String(args.p_dedupe_key);
        if (!ids.has(key)) ids.set(key, `draft-${ids.size + 1}`);
        return { data: ids.get(key), error: null };
      }
      if (name === "studio_outbound_mode") return { data: mode, error: null };
      if (name === "outbound_review_active") return { data: rolloutActive, error: null };
      return { data: null, error: null };
    },
  } as never;
  return { admin, calls };
}

const params = {
  studioId: "studio-1", projectId: "project-1", clientId: "client-1",
  clientEmail: "client@example.com", subject: "Review", body: "Edited body",
  payload: { review_id: "review-1" }, dedupeKey: "review:project-1:client-1",
};

Deno.test("review mode composes one idempotent draft and does not send", async () => {
  const { admin, calls } = makeAdmin("review", true);
  let sends = 0;
  const send = async () => { sends++; return { ok: true }; };
  const first = await composeAndMaybeSendReviewDraft(admin, params, send);
  assertEquals(calls.filter((call) => call.name === "compose_outbound_draft").length, 1);
  const rerun = await composeAndMaybeSendReviewDraft(admin, params, send);
  assertEquals(first.ok, true);
  assertEquals(first.scheduled, false);
  assertEquals(rerun.draftId, first.draftId);
  assertEquals(calls.filter((call) => call.name === "compose_outbound_draft").length, 2);
  assertEquals(sends, 0);
});

Deno.test("scheduled mode sends with studio_schedule authority", async () => {
  const { admin } = makeAdmin("scheduled", true);
  let authority: unknown;
  const result = await composeAndMaybeSendReviewDraft(admin, params, async (_admin, _id, value) => {
    authority = value;
    return { ok: true };
  });
  assertEquals(result.scheduled, true);
  assertEquals(authority, { kind: "studio_schedule", studioId: "studio-1", outboundKind: "review_request" });
});

Deno.test("inactive rollout preserves scheduled-send behavior and authority", async () => {
  const { admin } = makeAdmin("review", false);
  let authority: unknown;
  const result = await composeAndMaybeSendReviewDraft(admin, params, async (_admin, _id, value) => {
    authority = value;
    return { ok: true };
  });
  assertEquals(result.scheduled, true);
  assertEquals(authority, { kind: "studio_schedule", studioId: "studio-1", outboundKind: "review_request" });
});
