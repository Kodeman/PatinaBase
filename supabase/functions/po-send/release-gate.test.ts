// Deno test for po-send's held-for-release refusal (C-32, SQ-430).
// Run: deno test supabase/functions/po-send/release-gate.test.ts

import { assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import { checkPoReleaseGate, HELD_FOR_RELEASE_DETAIL } from "./release-gate.ts";

function rpcClient(result: { data: unknown; error: unknown }) {
  const calls: Array<{ fn: string; args: Record<string, unknown> }> = [];
  return {
    calls,
    rpc(fn: string, args: Record<string, unknown>) {
      calls.push({ fn, args });
      return Promise.resolve(result);
    },
  };
}

Deno.test("a held PO is refused 409 held_for_release for send and mark_sent", async () => {
  for (const mode of ["send", "mark_sent"] as const) {
    const client = rpcClient({ data: false, error: null });
    const gate = await checkPoReleaseGate(client, "po-1", mode);
    assertEquals(gate, {
      ok: false,
      status: 409,
      error: "held_for_release",
      detail: HELD_FOR_RELEASE_DETAIL,
    });
    assertEquals(client.calls, [{ fn: "po_is_sendable", args: { p_po_id: "po-1" } }]);
  }
});

Deno.test("a sendable PO (released, under the gate, or a resend) passes", async () => {
  const client = rpcClient({ data: true, error: null });
  assertEquals(await checkPoReleaseGate(client, "po-1", "send"), { ok: true });
});

Deno.test("preview never asks and never refuses, so a held paper can be read", async () => {
  const client = rpcClient({ data: false, error: null });
  assertEquals(await checkPoReleaseGate(client, "po-1", "preview"), { ok: true });
  assertEquals(client.calls.length, 0);
});

Deno.test("a failed check refuses 500 rather than guessing the PO may go out", async () => {
  const client = rpcClient({ data: null, error: { message: "boom" } });
  const gate = await checkPoReleaseGate(client, "po-1", "send");
  assertEquals(gate.ok, false);
  if (!gate.ok) {
    assertEquals(gate.status, 500);
    assertEquals(gate.error, "release_check_failed");
  }
});
