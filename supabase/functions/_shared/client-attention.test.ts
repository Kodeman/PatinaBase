import {
  assert,
  assertEquals,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  type AttentionRpcClient,
  notifyClientAttention,
} from "./client-attention.ts";

const USER = "d5000000-0000-4000-8000-000000000002";
const INVOICE = "d50a0000-0000-4000-8000-000000000001";

function recorder(
  result: { error: { message?: string } | null } | Error,
): { client: AttentionRpcClient; calls: Array<[string, Record<string, unknown>]> } {
  const calls: Array<[string, Record<string, unknown>]> = [];
  return {
    calls,
    client: {
      // deno-lint-ignore require-await
      rpc: async (fn, args) => {
        calls.push([fn, args]);
        if (result instanceof Error) throw result;
        return result;
      },
    },
  };
}

Deno.test("maps the input onto notify_client_attention's p_* arguments", async () => {
  const { client, calls } = recorder({ error: null });
  const out = await notifyClientAttention(client, {
    userId: USER,
    entityType: "invoice",
    entityId: INVOICE,
    title: "An invoice is ready",
    body: "Olive Studio sent invoice INV-2026-0142 for the Walker Residence.",
    metadata: { project_id: "p1", amount_cents: 425000, due_date: "2026-09-01" },
  });

  assertEquals(out, { ok: true });
  assertEquals(calls.length, 1);
  assertEquals(calls[0][0], "notify_client_attention");
  assertEquals(calls[0][1], {
    p_user_id: USER,
    p_entity_type: "invoice",
    p_entity_id: INVOICE,
    p_title: "An invoice is ready",
    p_body: "Olive Studio sent invoice INV-2026-0142 for the Walker Residence.",
    p_metadata: { project_id: "p1", amount_cents: 425000, due_date: "2026-09-01" },
  });
});

Deno.test("defaults body and metadata rather than sending undefined", async () => {
  const { client, calls } = recorder({ error: null });
  await notifyClientAttention(client, {
    userId: USER,
    entityType: "decision",
    entityId: INVOICE,
    title: "A decision needs you",
    body: "",
  });
  assertEquals(calls[0][1].p_body, "");
  assertEquals(calls[0][1].p_metadata, {});
});

Deno.test("reports an rpc error without throwing", async () => {
  const { client } = recorder({ error: { message: "permission denied" } });
  const out = await notifyClientAttention(client, {
    userId: USER,
    entityType: "proposal",
    entityId: INVOICE,
    title: "A proposal is ready for you",
    body: "Olive Studio sent it for your review.",
  });
  assertEquals(out.ok, false);
  assertEquals(out.error, "permission denied");
});

Deno.test("a thrown rpc is swallowed — a notification never fails a send", async () => {
  const { client } = recorder(new Error("socket hang up"));
  const out = await notifyClientAttention(client, {
    userId: USER,
    entityType: "invoice",
    entityId: INVOICE,
    title: "An invoice is ready",
    body: "…",
  });
  assertEquals(out.ok, false);
  assertEquals(out.error, "socket hang up");
});

Deno.test("refuses an entity type the router cannot route, and never calls the rpc", async () => {
  const { client, calls } = recorder({ error: null });
  const out = await notifyClientAttention(client, {
    userId: USER,
    // deno-lint-ignore no-explicit-any
    entityType: "order" as any,
    entityId: INVOICE,
    title: "Nope",
    body: "",
  });
  assertEquals(out.ok, false);
  assert(out.error?.startsWith("unroutable_entity_type"));
  assertEquals(calls.length, 0);
});

Deno.test("refuses incomplete input, and never calls the rpc", async () => {
  const { client, calls } = recorder({ error: null });
  const out = await notifyClientAttention(client, {
    userId: "",
    entityType: "invoice",
    entityId: INVOICE,
    title: "An invoice is ready",
    body: "",
  });
  assertEquals(out, { ok: false, error: "incomplete_attention_input" });
  assertEquals(calls.length, 0);
});
