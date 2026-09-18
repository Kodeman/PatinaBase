# Field Line synthetic gates

This directory is an offline fixture harness for the Field Line evidence cases. It never loads credentials or sends to Twilio: provider, media, clock, Supabase, inbound signature, and status signature are all in-memory/test values.

`createFieldLineHarness()` creates studios A and B, one project and one party per studio, and gives both parties the same recipient phone. Its deterministic clock is `2026-11-01T14:00:00.000Z`. The fake provider accepts, returns Twilio error `30007` or `21610`, or records an acceptance before throwing a transport crash. `mediaStore.interruptNextUpload()` makes the next fake storage upload fail.

The gate inventory stays complete even while later tickets own the behavior. A `skip` is intentional only until its named ticket lands. `node scripts/field-line/verify.mjs --phase N --mode fixture --strict` rejects a skipped case due in phase `N` or earlier.

| Case id | Story clause | Unblocked by |
| --- | --- | --- |
| `two-studios-one-phone` | S4 addressed opt-in/project authority (pipeline only) | P0-06a (implemented; SQL/RLS evidence is separate) |
| `stop-then-new-engagement` | S2 phone-global STOP suppression | P0-06a (implemented) |
| `start-no-consent` | S2 START re-asks pending records; does not grant pending | P0-06a (implemented) |
| `duplicate-twilio-sid` | S5 durable/idempotent message handling | P0-02 (implemented) |
| `rpc-failure-mid-effect` | S3 guarded effects; S5 truthful result | P0-06a (implemented) |
| `provider-failure-with-code` | S5 provider error code/result shape; S7 server gate | P0-04 |
| `stale-forwarded-link` | S1 immutable refs; S6 link expiry | P0-05 |
| `dst-quiet-hours` | S5 deferred result; S6 mint-on-dispatch; S8 canonical copy | P0-04 |
| `unknown-sender-wrong` | S4 service-only unresolved content | P0-06a (implemented) |
| `old-ref-reply` | S1 original-version late reply behavior | P0-06a (implemented, phase 0) |
| `interrupted-media-upload` | S4 service-only media; S5 truthful result | P0-06 (phase 1 case) |

Run the fixture gate directly:

```sh
deno test --no-check -A --config supabase/functions/deno.json supabase/functions/_tests/field-line-gates.test.ts
```

Use the Node verifier for the phase gate. It also runs the listed SQL oracles only when `LOCAL_DB_URL` names a local host; otherwise it prints an explicit skip.

The six inbound cases share `inbound-fixture.ts`, which adds deterministic prompt, suppression and effect RPC tables through the existing harness injection seam. It also reads the actual 00641 template literals. `inbound-protocol.test.ts` is imported by `sms-inbound.test.ts` so the pinned inbound command runs the protocol and quiet-hours receipt assertions. These in-memory assertions do not establish SQL authority or RLS isolation.

`inbound-atomic.test.ts` and `inbound-selection.test.ts` are imported by the gate. The first covers immutable proposal retention, receipt-first recovery and honest notification persistence; its serialized fake RPC is not evidence of database locking. The second uses real UUIDs and the actual shared sender/recovery validator, including filtering, queued/deferred delivery, metadata recovery and terminal/authorization refusals.

The separate local-only oracle is `node supabase/tests/field/sms_prompt_concurrency_test.mjs`. It creates an identity-marked disposable database from a schema-only snapshot (zero copied rows), installs candidate authority, runs SQL rollback and actual two-session lock-barrier assertions, and verifies cleanup. Never point it at production or treat an unchanged shared schema as the candidate. `SQ51_EVIDENCE_DIR` selects its evidence directory; omit `--write-types` for verification.

`stale-forwarded-link` and `interrupted-media-upload` remain the two future-case placeholders. The consumer repair neither implements their future slice nor claims a strict phase gate.

The per-origin repair adds `inbound-completion.test.ts` (the independent older-chooser replay sequence, unchanged apart from imports) and `inbound-completion-boundaries.test.ts`. Completion precedes rebind/media/parser/CAS, even after a failed metadata stamp or a newer chooser; same digit SIDs resume only their saved original pointer. Pointer persistence failure is retryable but may require operator recovery: an unstamped digit never guesses a newer origin. Both SQL completion and prompt receipts include legitimate note `applied:false`; historical unbound results suppress quietly, never disclose.

`inbound-context-cas.test.ts` binds both chooser consumption and recovery metadata updates to the exact JSONB context read, including the outbound manifest pointer and original inbound ID, not merely the state. A stale CAS leaves the newer question and unrelated context untouched; existing quiet/retry paths and durable completion authority remain unchanged. Its two SQ-72 overlap assertions hold without advancing the clock.

The disposable controller overlays both candidate 00639 and 00641, retains fourteen prompt/issuance barriers, and adds eight raw/raw, raw/atomic, atomic/raw and note commit/rollback barriers using `pg_blocking_pids`. A concurrent NULL read is completion-unknown, not rollback proof. Assertions cover one RFI, exact saved result, unchanged original row, transactional actor binding, replacement ignored, no misleading atomic receipt, rollback and non-SMS/no-ID controls. No production/activation or carrier proof is claimed.
