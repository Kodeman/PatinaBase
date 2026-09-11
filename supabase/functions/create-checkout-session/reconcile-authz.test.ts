// Deno test for the reconcile authorization decision.
// Run: deno test --allow-all --config supabase/functions/deno.json \
//        supabase/functions/create-checkout-session/reconcile-authz.test.ts
//
// Tests ./reconcile-authz.ts directly — importing ./index.ts would boot
// Deno.serve. The RPC client is stubbed structurally, so no stack is needed.

import {
  assertEquals,
} from "https://deno.land/std@0.168.0/testing/asserts.ts";
import {
  authorizeInvoiceReconcile,
  type ReconcileAuthzRpcClient,
} from "./reconcile-authz.ts";

const PAYER = "11111111-1111-1111-1111-111111111111";
const DESIGNER = "22222222-2222-2222-2222-222222222222";
const COMEMBER = "33333333-3333-3333-3333-333333333333";
const STRANGER = "44444444-4444-4444-4444-444444444444";

interface RpcCall {
  fn: string;
  args: Record<string, unknown>;
}

function stubClient(
  result: { data: unknown; error: { message: string } | null },
): { client: ReconcileAuthzRpcClient; calls: RpcCall[] } {
  const calls: RpcCall[] = [];
  return {
    calls,
    client: {
      rpc(fn: string, args: Record<string, unknown>) {
        calls.push({ fn, args });
        return Promise.resolve(result);
      },
    },
  };
}

Deno.test("payer is authorized without touching the database", async () => {
  const { client, calls } = stubClient({ data: false, error: null });
  const decision = await authorizeInvoiceReconcile(client, PAYER, PAYER, DESIGNER);

  assertEquals(decision, { ok: true });
  assertEquals(calls.length, 0);
});

Deno.test("invoice designer is authorized without touching the database", async () => {
  const { client, calls } = stubClient({ data: false, error: null });
  const decision = await authorizeInvoiceReconcile(client, DESIGNER, PAYER, DESIGNER);

  assertEquals(decision, { ok: true });
  assertEquals(calls.length, 0);
});

Deno.test("active studio co-member is authorized via is_studio_comember", async () => {
  const { client, calls } = stubClient({ data: true, error: null });
  const decision = await authorizeInvoiceReconcile(client, COMEMBER, PAYER, DESIGNER);

  assertEquals(decision, { ok: true });
  // Same predicate RLS uses (00582), asked about the INVOICE's designer.
  assertEquals(calls, [{ fn: "is_studio_comember", args: { p_owner: DESIGNER } }]);
});

Deno.test("stranger gets 404 invoice_not_found, never 403", async () => {
  const { client, calls } = stubClient({ data: false, error: null });
  const decision = await authorizeInvoiceReconcile(client, STRANGER, PAYER, DESIGNER);

  assertEquals(decision, {
    ok: false,
    status: 404,
    body: { error: "invoice_not_found" },
  });
  assertEquals(calls.length, 1);
});

Deno.test("a NULL co-membership answer is not authorization", async () => {
  const { client } = stubClient({ data: null, error: null });
  const decision = await authorizeInvoiceReconcile(client, STRANGER, PAYER, DESIGNER);

  assertEquals(decision, {
    ok: false,
    status: 404,
    body: { error: "invoice_not_found" },
  });
});

Deno.test("an unpaid link attempt (payer_id NULL) does not authorize a null caller id", async () => {
  const { client } = stubClient({ data: false, error: null });
  const decision = await authorizeInvoiceReconcile(client, STRANGER, null, DESIGNER);

  assertEquals(decision, {
    ok: false,
    status: 404,
    body: { error: "invoice_not_found" },
  });
});

Deno.test("an RPC failure surfaces as 500, not as a silent denial", async () => {
  const { client } = stubClient({ data: null, error: { message: "boom" } });
  const decision = await authorizeInvoiceReconcile(client, COMEMBER, PAYER, DESIGNER);

  assertEquals(decision, {
    ok: false,
    status: 500,
    body: { error: "lookup_failed", detail: "boom" },
  });
});
