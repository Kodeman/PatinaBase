// Deno test for po-send's spec snapshot and revision (C-34, SQ-432).
// Run: deno test --config supabase/functions/deno.json --allow-read supabase/functions/po-send/revision.test.ts
//
// The pure helpers run directly. index.ts boots Deno.serve on import, so its
// wiring is checked from the source: one render, preceded by the snapshot.

import { assert, assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import type { CallerRpcClient } from "./lib.ts";
import {
  revisionedPoNumber,
  snapshotPurchaseOrderSpec,
  snapshotsSpecOnSend,
} from "./revision.ts";

function recordingClient(result: { data: unknown; error: unknown }) {
  const calls: Array<{ fn: string; args: Record<string, unknown> }> = [];
  const client: CallerRpcClient = {
    rpc(fn, args) {
      calls.push({ fn, args });
      return Promise.resolve(result);
    },
  };
  return { client, calls };
}

Deno.test("send and mark_sent take a snapshot; preview does not", () => {
  assertEquals(snapshotsSpecOnSend("send"), true);
  assertEquals(snapshotsSpecOnSend("mark_sent"), true);
  assertEquals(snapshotsSpecOnSend("preview"), false);
});

Deno.test("snapshotPurchaseOrderSpec calls snapshot_purchase_order_spec with the PO and returns its revision", async () => {
  const { client, calls } = recordingClient({ data: 2, error: null });
  const result = await snapshotPurchaseOrderSpec(client, "po-1043");
  assertEquals(calls, [{ fn: "snapshot_purchase_order_spec", args: { p_po_id: "po-1043" } }]);
  assertEquals(result, { ok: true, revision: 2 });
});

Deno.test("a resend with changed lines prints the next revision; an unchanged resend keeps it", async () => {
  // The RPC owns the increment (00711): first send 1, a changed resend 2,
  // an unchanged resend returns 2 again.
  const revisions = [1, 2, 2];
  const printed: string[] = [];
  for (const revision of revisions) {
    const { client } = recordingClient({ data: revision, error: null });
    const result = await snapshotPurchaseOrderSpec(client, "po-1043");
    assert(result.ok);
    printed.push(revisionedPoNumber("PO-1043", result.revision));
  }
  assertEquals(printed, ["PO-1043", "PO-1043 · Revision 2", "PO-1043 · Revision 2"]);
});

Deno.test("snapshotPurchaseOrderSpec reports a refused or empty answer instead of guessing", async () => {
  const refused = recordingClient({ data: null, error: { message: "access denied" } });
  assertEquals(await snapshotPurchaseOrderSpec(refused.client, "po-1"), {
    ok: false,
    detail: "access denied",
  });
  const empty = recordingClient({ data: null, error: null });
  assertEquals(await snapshotPurchaseOrderSpec(empty.client, "po-1"), {
    ok: false,
    detail: "spec snapshot returned no revision",
  });
});

Deno.test("revisionedPoNumber prints a revision only above 1", () => {
  assertEquals(revisionedPoNumber("PO-1043", null), "PO-1043");
  assertEquals(revisionedPoNumber("PO-1043", 0), "PO-1043");
  assertEquals(revisionedPoNumber("PO-1043", 1), "PO-1043");
  assertEquals(revisionedPoNumber("PO-1043", 3), "PO-1043 · Revision 3");
});

Deno.test("index.ts renders the PDF once, after the snapshot, and prints the revisioned number", async () => {
  const source = await Deno.readTextFile(new URL("./index.ts", import.meta.url));
  assertEquals(source.match(/buildPoPdf\(/g)?.length, 1, "mark_sent and send render exactly once");
  const snapshotAt = source.indexOf("snapshotPurchaseOrderSpec(userClient, po.id)");
  const renderAt = source.indexOf("buildPoPdf(");
  const shipToGuardAt = source.indexOf("resolvePoShipTo(");
  assert(snapshotAt > shipToGuardAt, "the snapshot sits after the refusal guards");
  assert(snapshotAt > 0 && snapshotAt < renderAt, "the snapshot precedes the render");
  assert(source.includes("if (snapshotsSpecOnSend(mode))"), "only send and mark_sent snapshot");
  assert(
    source.includes(
      "poNumber: poNumber ? revisionedPoNumber(poNumber, revision) : DRAFT_PO_NUMBER_LABEL",
    ),
    "a numbered PO prints the revisioned number; a draft preview prints the draft label (R6)",
  );
});
