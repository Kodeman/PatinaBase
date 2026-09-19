# Field Line synthetic gates

This directory is an offline fixture harness for the Field Line evidence cases. It never loads credentials or sends to Twilio: provider, media, clock, Supabase, inbound signature, and status signature are all in-memory/test values.

`createFieldLineHarness()` creates studios A and B, one project and one party per studio, and gives both parties the same recipient phone. Its deterministic clock is `2026-11-01T14:00:00.000Z`. The fake provider accepts, returns Twilio error `30007` or `21610`, or records an acceptance before throwing a transport crash. `mediaStore.interruptNextUpload()` makes the next fake storage upload fail.

The gate inventory stays complete even while later tickets own the behavior. A `skip` is intentional only until its named ticket lands. `node scripts/field-line/verify.mjs --phase N --mode fixture --strict` rejects a skipped case due in phase `N` or earlier.

| Case id | Story clause | Unblocked by |
| --- | --- | --- |
| `two-studios-one-phone` | S4 addressed opt-in/project authority (pipeline only) | P0-06a/b (implemented; SQL/RLS evidence is separate) |
| `stop-then-new-engagement` | S2 phone-global STOP suppression | P0-06a (implemented) |
| `start-no-consent` | S2 START re-asks pending records; does not grant pending | P0-06a (implemented) |
| `duplicate-twilio-sid` | S5 durable/idempotent message handling | P0-02 (implemented) |
| `rpc-failure-mid-effect` | S3 guarded effects; S5 truthful result | P0-06a (implemented) |
| `provider-failure-with-code` | S5 provider error code/result shape; S7 server gate | P0-04 (implemented) |
| `stale-forwarded-link` | S1 immutable refs; S6 link expiry | P0-05 (implemented, phase 0) |
| `dst-quiet-hours` | S5 deferred result; S6 mint-on-dispatch; S8 canonical copy | P0-04 (implemented) |
| `unknown-sender-wrong` | S4 service-only unresolved content | P0-06a (implemented) |
| `old-ref-reply` | S1 original-version late reply behavior | P0-06a (implemented, phase 0) |
| `interrupted-media-upload` | S4 service-only media; S5 truthful result | P0-06b (implemented, phase 0) |
| `reply-to-renew` | S6 mint-on-dispatch for a lapsed link; P11 refusals | P1-02 (implemented, phase 1) |
| `budget-fold-to-digest` | S5 folded-not-dropped result; S7 server-side cadence | P1-02 (implemented, phase 1) |
| `dead-end-handoff` | S4 one owned handoff for two unanswered prompts | P1-02 (implemented, phase 1) |
| `site-card-day-of` | S1 immutable per-visit refs; S3 field reports only | P1-02 (implemented, phase 1) |

Run the fixture gate directly:

```sh
deno test --no-check -A --config supabase/functions/deno.json supabase/functions/_tests/field-line-gates.test.ts
```

Use the Node verifier for the phase gate. It also runs the listed SQL oracles only when `LOCAL_DB_URL` names a local host; otherwise it prints an explicit skip.

The inbound cases share `inbound-fixture.ts`, which adds deterministic prompt, suppression and effect RPC tables through the existing harness injection seam. It also reads the actual 00641 template literals. `inbound-protocol.test.ts` is imported by `sms-inbound.test.ts` so the pinned inbound command runs the protocol and quiet-hours receipt assertions. These in-memory assertions do not establish SQL authority or RLS isolation.

`inbound-atomic.test.ts` and `inbound-selection.test.ts` are imported by the gate. The first covers immutable proposal retention, receipt-first recovery and honest notification persistence; its serialized fake RPC is not evidence of database locking. The second uses real UUIDs and the actual shared sender/recovery validator, including filtering, queued/deferred delivery, metadata recovery and terminal/authorization refusals.

The separate local-only oracle is `node supabase/tests/field/sms_prompt_concurrency_test.mjs`. It creates an identity-marked disposable database from a schema-only snapshot (zero copied rows), installs candidate authority, runs SQL rollback and actual two-session lock-barrier assertions, and verifies cleanup. Never point it at production or treat an unchanged shared schema as the candidate. `SQ51_EVIDENCE_DIR` selects its evidence directory; omit `--write-types` for verification.

`stale-forwarded-link` runs at phase zero: actual shared sends mint fresh links and redact stored previews; old links remain usable across repeated opens until their own immutable expiry, or explicit regeneration revokes them. The service-role fixture mirrors 00640:104–162 and 00283:201–223 (identity DTO only), not PostgreSQL permissions/locking or portal rendering. A reply using the Ref from the forwarded/stale text consumes only the original version and party/project; a closed Ref files nothing. There is no first-open invalidation rule. `interrupted-media-upload` now runs at phase zero: an initially empty media store retains the successful subset, retries only the missing attachment under the same inbound SID, and rehomes both only after the durable project choice. This consumer repair does not claim a strict all-phase gate.

The per-origin repair adds `inbound-completion.test.ts` (the independent older-chooser replay sequence, unchanged apart from imports) and `inbound-completion-boundaries.test.ts`. Completion precedes rebind/media/parser/CAS, even after a failed metadata stamp or a newer chooser; same digit SIDs resume only their saved original pointer. Pointer persistence failure is retryable but may require operator recovery: an unstamped digit never guesses a newer origin. Both SQL completion and prompt receipts include legitimate note `applied:false`; historical unbound results suppress quietly, never disclose.

`inbound-context-cas.test.ts` binds both chooser consumption and recovery metadata updates to the exact JSONB context read, including the outbound manifest pointer and original inbound ID, not merely the state. A stale CAS leaves the newer question and unrelated context untouched; existing quiet/retry paths and durable completion authority remain unchanged. Its two SQ-72 overlap assertions hold without advancing the clock.

The disposable controller overlays both candidate 00639 and 00641, retains fourteen prompt/issuance barriers, and adds eight raw/raw, raw/atomic, atomic/raw and note commit/rollback barriers using `pg_blocking_pids`. A concurrent NULL read is completion-unknown, not rollback proof. Assertions cover one RFI, exact saved result, unchanged original row, transactional actor binding, replacement ignored, no misleading atomic receipt, rollback and non-SMS/no-ID controls. No production/activation or carrier proof is claimed.

## Project-context consumer contract (P0-06b)

The transport conversation holds no live menu, chooser, pin or confirmation authority. Project rows in `sms_conversation_context` own menus, pins, delivery dedupe and confirmation pointers; a service-only NULL-project row holds unresolved chooser metadata. Writes use full-context CAS and `backfilled_at: null`. A future project pause records an owned silent review, with no parse/effect/reply; another project on the phone still works through its Ref.

Stamped legacy holding JSON is never applied as an effect or copied into a project. Completed target/origin checks happen first. A re-ask uses the current inbound as the fresh immutable chooser source, with `held_origin_id` flattened to the original root. Root completion is checked by retry, dispatch, binder and digit consumption before media/CAS/parser/effect. Only the root receives the effect receipt. Failure to persist the pointer sends nothing and preserves the holding snapshot. `inbound-project-context.test.ts` exercises these boundaries; `inbound-context-cas.test.ts` remains a separately runnable inherited stale-writer regression.

Daily digest refs are minted by transactional `sms_create_prompt`, never by a separate allocator. Only budget-visible items get refs. The 42-septet menu includes three-digit refs; the real sender fixture asserts exactly 306 GSM-7 septets with maximum names/link and extension characters. Same-day retries reuse the recorded menu even if tasks change, and the fake models 00640 live-send INSERT uniqueness. Concurrent fixture allocation is not SQL-locking proof. Suppression/pause prevent allocation, and existing daily/delivery automation stays phase zero.

PO delivery and condition refs now use atomic `sms_apply_prompt` with immutable SID/result receipts (00643). The validator binds purchase_orders.project_id to the prompt and actor's project. PO confirmation/arrival writes only field_delivery_reports.arrived_at; condition writes condition_ok/note/at and assigns damage review. It never writes purchase_orders, receiving_inspections, delivery_events (a read-only aggregate view), or time entries. The receiving page's report projection is a later portal task. The condition-report and po-delivery phase-zero fixture cases now run; real SQL rollback and eight added lock barriers separately prove tenant refusal, receipt replay and exactly-one consumption/issuance.

## The trade rail (00645, phase 1)

Four cases run only at phase 1 and are skipped below it, because the behavior they describe is gated on `FIELD_LINE_PHASE`. `reply-to-renew` gives a party whose engagement links have all simply expired one fresh scoped link on any reply, and refuses it for a revoked newest token, a suppressed pair and STOP; it moves the second studio's seat to its own handset, because a shared number is asked which project first and that ambiguity is `two-studios-one-phone`'s subject, not this one's. `budget-fold-to-digest` spends the per-party daily event budget (three) and shows the fourth text becoming a stored `deferred` row reading `budget` that the flush re-asks the budget for, so it leaves on the first flush of the zone's next local day. `dead-end-handoff` shows two unanswered prompts producing exactly one owned handoff and a pause that refuses the third ask, with an answer reopening the rail. `site-card-day-of` runs the daily twice — 6pm the evening before and 8am on the visit day — and asserts one site card then one morning ask, each bound to that visit's own task and `YYYYMMDD`, both GSM-7 inside two segments and ending in the canonical closing line, `ON MY WAY` / `LATE 20` / `PROBLEM …` / `DONE` filing arrival, delay, a not-ok condition and departure and **never** a delivery receipt, and "crew on the way" written as one system post on the project thread with no homeowner text.

These four model 00645's two new RPCs (`sms_claim_party_budget`, `sms_party_prompt_gate`) through the harness's RPC seam: they are evidence about the rail that is written against those contracts, not about PostgreSQL locking. The atomic budget claim under two sessions, the FIELD_TZ day boundary across a DST transition and the reply-verb/effect matrix are asserted in SQL by `supabase/tests/field/sms_trade_prompts_test.sql`. Both new gates in `sendPartySms` fail **open**: an unreadable or absent budget/dead-end answer sends the text, because a cadence is politeness and only consent and suppression are permission.

### Future consumers / evidence limits

- Court-assignment budget is **not exercised** here: no producer exists in the owned inbound/daily modules. `supabase/functions/_shared/sms.ts` and the `sms_court_assignment` template in `supabase/migrations/00641_field_line_effects_templates.sql` own that shared sender/template surface. No court-assignment fixture is marked passing by this work.
- Fake RPCs/CAS/media assertions do not establish PostgreSQL locking or RLS. Existing local `sms_authority_review_probes_test.sql` separately covers real backfill rerun/convergence, live unstamped holding survival and cross-studio visibility. Neither fixture class is production, provider or activation evidence.

Recovery binders acquire the exact context snapshot before reading durable root completion, then CAS that snapshot. Chooser source ordering (sms_messages.created_at, inbound ID tiebreak) permits only the same or a newer source to replace a recorded source; the separate flattened root remains the completion/effect authority. Daily digest context CAS claims and freezes the day/items before any mint, with a two-minute JSON run_id/claimed_at/lease_until lease. Live-owner losers send nothing; expired unrendered claims re-read open refs and mint only missing items, while handled failures release only their own snapshot. Ownership is checked immediately before each mint and before rendering is saved; a lost owner sends nothing and never closes the minted prompt, which remains open for recovery to adopt. The stalled-create residual is closed by 00643's in-RPC daily identity lock and existing-row return in sms_create_prompt, keyed by party/project/kind/subject/frozen YYYYMMDD version. Both commit orderings after an expired lease's stale reuse read converge to one id/code. The TypeScript lease still owns rendering and sends; it is no longer issuance authority.

SQ-85 condition length boundary: the deterministic parser keeps the complete trimmed reply in `condition.note`; the 200-character `note` is preview-only. The real-parser inbound tests exercise 2001-character refusal (owned review, truthful failure, open prompt) and 2000-character full persistence. `sms_po_condition_test.sql` independently asserts real SQL insert/update whole-row rollback, no partial report or receipt on refusal, and full boundary persistence. Task command payload JSON remains byte-identical to main.
