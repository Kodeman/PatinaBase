# Field Line synthetic gates

This directory is an offline fixture harness for the Field Line evidence cases. It never loads credentials or sends to Twilio: provider, media, clock, Supabase, inbound signature, and status signature are all in-memory/test values.

`createFieldLineHarness()` creates studios A and B, one project and one party per studio, and gives both parties the same recipient phone. Its deterministic clock is `2026-11-01T14:00:00.000Z`. The fake provider accepts, returns Twilio error `30007` or `21610`, or records an acceptance before throwing a transport crash. `mediaStore.interruptNextUpload()` makes the next fake storage upload fail.

The gate inventory stays complete even while later tickets own the behavior. A `skip` is intentional only until its named ticket lands. `node scripts/field-line/verify.mjs --phase N --mode fixture --strict` rejects a skipped case due in phase `N` or earlier.

| Case id | Story clause | Unblocked by |
| --- | --- | --- |
| `two-studios-one-phone` | S4 conversation/project authority | P0-03 |
| `stop-then-new-engagement` | S2 phone-global STOP suppression | P0-06 |
| `start-no-consent` | S2 START re-asks; does not grant | P0-06 |
| `duplicate-twilio-sid` | S5 durable/idempotent message handling | P0-02 (implemented) |
| `rpc-failure-mid-effect` | S3 guarded effects; S5 truthful result | P0-05 |
| `provider-failure-with-code` | S5 provider error code/result shape; S7 server gate | P0-04 |
| `stale-forwarded-link` | S1 immutable refs; S6 link expiry | P0-05 |
| `dst-quiet-hours` | S5 deferred result; S6 mint-on-dispatch; S8 canonical copy | P0-04 |
| `unknown-sender-wrong` | S4 service-only unresolved content | P0-06 |
| `old-ref-reply` | S1 original-version late reply behavior | P0-06 (phase 1 case) |
| `interrupted-media-upload` | S4 service-only media; S5 truthful result | P0-06 (phase 1 case) |

Run the fixture gate directly:

```sh
deno test --no-check -A --config supabase/functions/deno.json supabase/functions/_tests/field-line-gates.test.ts
```

Use the Node verifier for the phase gate. It also runs the listed SQL oracles only when `LOCAL_DB_URL` names a local host; otherwise it prints an explicit skip.
