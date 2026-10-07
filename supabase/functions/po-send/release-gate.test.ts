// Deno test for po-send's held-for-release refusal (C-32, SQ-430).
// Run: deno test supabase/functions/po-send/release-gate.test.ts

import { assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import {
  CHANGED_SINCE_RELEASE_DETAIL,
  checkPoReleaseGate,
  HELD_FOR_RELEASE_DETAIL,
} from "./release-gate.ts";

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
  assertEquals(await checkPoReleaseGate(client, "po-1", "send"), { ok: true, sendable: true });
});

Deno.test("preview never refuses, so a held paper can be read; it carries the sendable answer (R6)", async () => {
  for (
    const [answer, sendable] of [
      [{ data: true, error: null }, true],
      [{ data: false, error: null }, false],
      [{ data: null, error: { message: "boom" } }, false],
    ] as const
  ) {
    const client = rpcClient(answer);
    assertEquals(await checkPoReleaseGate(client, "po-1", "preview"), { ok: true, sendable });
    assertEquals(client.calls, [{ fn: "po_is_sendable", args: { p_po_id: "po-1" } }]);
  }
});

Deno.test("SQ-448: a hold that lands during the render refuses the pre-email recheck with the same 409", async () => {
  // First read (before render): sendable. A co-member holds the draft. The
  // second read (right before the email) answers false.
  const answers = [true, false];
  const calls: string[] = [];
  const client = {
    rpc(fn: string) {
      calls.push(fn);
      return Promise.resolve({ data: answers.shift(), error: null });
    },
  };
  assertEquals(await checkPoReleaseGate(client, "po-1", "send"), { ok: true, sendable: true });
  assertEquals(await checkPoReleaseGate(client, "po-1", "send"), {
    ok: false,
    status: 409,
    error: "held_for_release",
    detail: HELD_FOR_RELEASE_DETAIL,
  });
  assertEquals(calls, ["po_is_sendable", "po_is_sendable"]);
});

/** Answers each RPC by name, recording the calls in order. */
function rpcByName(answers: Record<string, { data: unknown; error: unknown }>) {
  const calls: Array<{ fn: string; args: Record<string, unknown> }> = [];
  return {
    calls,
    rpc(fn: string, args: Record<string, unknown>) {
      calls.push({ fn, args });
      return Promise.resolve(answers[fn]);
    },
  };
}

const CHANGED_ERROR = {
  code: "23514",
  message:
    "changed_since_release: purchase order po-1 changed after it was sent; a change order sends the maker a revision",
};

Deno.test("R1 F2: a resend of paper changed since its release is refused 409 changed_since_release", async () => {
  for (const mode of ["send", "mark_sent"] as const) {
    const client = rpcByName({
      po_is_sendable: { data: true, error: null },
      assert_po_resend_cleared: { data: null, error: CHANGED_ERROR },
    });
    assertEquals(await checkPoReleaseGate(client, "po-1", mode, true), {
      ok: false,
      status: 409,
      error: "changed_since_release",
      detail: CHANGED_SINCE_RELEASE_DETAIL,
    });
    assertEquals(client.calls, [
      { fn: "po_is_sendable", args: { p_po_id: "po-1" } },
      { fn: "assert_po_resend_cleared", args: { p_po_id: "po-1" } },
    ]);
  }
  assertEquals(
    CHANGED_SINCE_RELEASE_DETAIL,
    "This order changed after it was sent. Open a change order to send the maker a revision.",
  );
});

Deno.test("R1 F2: a resend of the released paper passes; a first send and a preview never ask", async () => {
  const resend = rpcByName({
    po_is_sendable: { data: true, error: null },
    assert_po_resend_cleared: { data: null, error: null },
  });
  assertEquals(await checkPoReleaseGate(resend, "po-1", "send", true), { ok: true, sendable: true });
  assertEquals(resend.calls.map((call) => call.fn), ["po_is_sendable", "assert_po_resend_cleared"]);

  const first = rpcByName({
    po_is_sendable: { data: true, error: null },
    assert_po_resend_cleared: { data: null, error: CHANGED_ERROR },
  });
  assertEquals(await checkPoReleaseGate(first, "po-1", "send"), { ok: true, sendable: true });
  assertEquals(first.calls.map((call) => call.fn), ["po_is_sendable"]);

  const preview = rpcByName({
    po_is_sendable: { data: true, error: null },
    assert_po_resend_cleared: { data: null, error: CHANGED_ERROR },
  });
  assertEquals(await checkPoReleaseGate(preview, "po-1", "preview", true), { ok: true, sendable: true });
  assertEquals(preview.calls.map((call) => call.fn), ["po_is_sendable"]);
});

Deno.test("R1 F2: a failed resend check refuses 500 rather than guessing", async () => {
  const client = rpcByName({
    po_is_sendable: { data: true, error: null },
    assert_po_resend_cleared: { data: null, error: { message: "boom" } },
  });
  const gate = await checkPoReleaseGate(client, "po-1", "send", true);
  assertEquals(gate.ok, false);
  if (!gate.ok) {
    assertEquals(gate.status, 500);
    assertEquals(gate.error, "release_check_failed");
  }
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
