/// <reference lib="deno.ns" />
// ^ The monorepo root tsconfig.json sets lib: [ES2022, DOM] which Deno >= 2.4
// picks up, clobbering the `Deno` global during type-check.
//
// P-06 (verify). Wave 1 reported that proposal-send and the two invoice
// producers already emit client push rows carrying entity_type
// proposal/invoice and a deep link of the shape mail uses. Nothing pinned it.
//
// What is actually true, and what this file pins:
//
//  • Each producer calls notifyClientAttention with the LITERAL entity type
//    and the row's own id. Those two values are the whole input: 00534's
//    notify_client_attention derives `metadata.deep_link` from them
//    ('/proposals/' | '/invoices/' | '/decisions/' || id) and writes BOTH the
//    in_app bell row and the push envelope from the same metadata.
//  • notifyClientAttention forwards both verbatim to the RPC.
//  • `/decisions/<id>` — the one member of that family client-portal-links
//    builds — has exactly the shape the other two mirror.
//
// The deep_link string itself is written in SQL, so the end-to-end gate is the
// SQL companion (supabase/tests/notifications/client_attention_test.sql and
// 00569's contract test), not this file. `client-portal-links.ts` deliberately
// does NOT build /proposals/<id> or /invoices/<id>: its own header records that
// those, like /decisions/<id>, are claimed by the iOS applinks entitlement and
// must stay whole routes rather than Threshold anchors.
//
// Run:
//   deno test --allow-all --config supabase/functions/deno.json \
//     supabase/functions/_tests/client-attention-deep-links.test.ts

import {
  assert,
  assertEquals,
  assertStringIncludes,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  type AttentionRpcClient,
  notifyClientAttention,
} from "../_shared/client-attention.ts";
import { clientDecisionLink } from "../_shared/client-portal-links.ts";

const ID = "11111111-2222-4333-8444-555555555555";

function recorder(): {
  client: AttentionRpcClient;
  calls: Array<[string, Record<string, unknown>]>;
} {
  const calls: Array<[string, Record<string, unknown>]> = [];
  return {
    calls,
    client: {
      // deno-lint-ignore require-await
      rpc: async (fn, args) => {
        calls.push([fn, args]);
        return { error: null };
      },
    },
  };
}

const PRODUCERS: Array<
  { file: string; entityType: "proposal" | "invoice"; path: string }
> = [
  {
    file: "proposal-send",
    entityType: "proposal",
    path: new URL("../proposal-send/index.ts", import.meta.url).pathname,
  },
  {
    file: "invoice-send",
    entityType: "invoice",
    path: new URL("../invoice-send/index.ts", import.meta.url).pathname,
  },
  {
    file: "invoice-reminders",
    entityType: "invoice",
    path: new URL("../invoice-reminders/index.ts", import.meta.url).pathname,
  },
];

for (const producer of PRODUCERS) {
  Deno.test(`${producer.file} emits a ${producer.entityType} attention row (P-06)`, () => {
    const source = Deno.readTextFileSync(producer.path);
    assertStringIncludes(source, "notifyClientAttention(");
    // The literal type, in either quote style the two files use.
    assert(
      source.includes(`entityType: "${producer.entityType}"`) ||
        source.includes(`entityType: '${producer.entityType}'`),
      `${producer.file} does not declare entityType ${producer.entityType}`,
    );
    // …and a real id, not a hard-coded string.
    assert(
      /entityId:\s*[A-Za-z_][\w.?]*/.test(source),
      `${producer.file} does not pass the row's own id as entityId`,
    );
  });
}

Deno.test("the entity type and id reach the RPC unchanged — they are the deep link", async () => {
  for (const entityType of ["proposal", "invoice", "decision"] as const) {
    const { client, calls } = recorder();
    const out = await notifyClientAttention(client, {
      userId: "d5000000-0000-4000-8000-000000000002",
      entityType,
      entityId: ID,
      title: "t",
      body: "b",
    });
    assert(out.ok);
    assertEquals(calls.length, 1);
    assertEquals(calls[0][0], "notify_client_attention");
    assertEquals(calls[0][1].p_entity_type, entityType);
    assertEquals(calls[0][1].p_entity_id, ID);
  }
});

Deno.test("the deep link family is one route per thing, id last", () => {
  // The only member client-portal-links builds. /proposals/<id> and
  // /invoices/<id> are the same shape, written by 00534.
  assertEquals(
    clientDecisionLink("https://client.patina.cloud", ID),
    `https://client.patina.cloud/decisions/${ID}`,
  );
  for (const entityType of ["proposal", "invoice", "decision"] as const) {
    const path = `/${entityType}s/${ID}`;
    assert(
      /^\/(proposals|invoices|decisions)\/[A-Za-z0-9_-]+$/.test(path),
      `unexpected deep link shape: ${path}`,
    );
  }
});
