# prod-write-probe.mjs

Reproduces the extension's exact RLS write path (anon key + a signed-in
designer's JWT) with the same payload shapes as `payloads.ts`/`effects.ts`/
`spec-book-placement.ts`. Cleans up what RLS allows; reports the rest.

## Run against Strata (Kody)

```bash
cd apps/extension
SUPABASE_URL=https://bkvcixdmuyejfzcijpdg.supabase.co \
SUPABASE_ANON_KEY=<prod anon key> \
PROBE_EMAIL=<designer email> PROBE_PASSWORD=<their password> \
PROBE_PROJECT_ID=<THROWAWAY project.id they own> \
node scripts/prod-write-probe.mjs
```

`--dry-run` prints the plan. `PROBE_PROJECT_ID` (skips step 6, required by
step 9 too) and `PROBE_PROPOSAL_ID` are optional. Step 9 is OPT-IN, OFF by
default — needs `PROBE_CLIENT_ID` (a registered `designer_clients.id`, not a
user id) **and** `PROBE_ALLOW_DECISION=1` (creates a real PENDING decision).

## Cleanup caveats

RLS silently filters deletes to zero rows with no error, so deletes are
verified via `.select()`. **vendors** and step 5's **vendor_certifications**
(admin-only, 00058) always `skipped`. Step 9 mints its OWN product, so step
2's always cleans up; the decision's product prints `left (...)` —
`client_decision_options.product_id` IS `ON DELETE SET NULL` (00172:35), but
that SET NULL is an UPDATE, blocked by `guard_client_decision_option_authority`
(00399) outside the canonical workflow while `pending` (verified). `project_ffe_items` is never attempted — only the RPCs delete it.

## Residue on prod

Always: one `vendors` row. Step 6 writes `project_ffe_items` +
`_specs`/`_selection_threads`/`_command_idempotency` into the **project** —
NOT hard-deletable by SQL (item↔thread FKs are `RESTRICT`, checked
immediately despite `DEFERRABLE`; a guard trigger reprovisions a thread when
nulled) — **use a throwaway project**. Step 7 enqueues one
`capture_enrichment_runs`+`_outbox` row (undrained). Every products insert
fires 3 `aesthete_jobs` (real inference spend if `aesthete-embed`, 1-min
cron, claims one first). The FIRST personal-layer product this account ever
captures writes one permanent `engagement_events` `first_capture` row
(idempotent per user). `PROBE_ALLOW_DECISION=1` also leaves a product + a
PENDING `client_decisions` row, notified via `decision_notifications` and
emailed by `notification-digest-daily` (15:00 UTC). Admin cleanup
(service_role; `<uid>` = probe designer's uid):

```sql
select archive_project_selection('<step-6 selection id>', 'probe cleanup'); -- soft-delete
delete from project_ffe_command_idempotency where actor_id='<uid>' and idempotency_key like 'chrome:%';
delete from capture_enrichment_runs where target_type='proposal_capture' and target_id in ('<step-7 capture id>');
delete from client_decisions where title like 'PROBE-%' and designer_id='<uid>'; -- cascades options+notifications
delete from products where name like 'PROBE-%' and owner_user_id='<uid>';
delete from vendor_certifications where certification_type='PROBE-CERT';
delete from vendors where name like 'PROBE-VENDOR-%';
delete from engagement_events where user_id='<uid>' and event_name='first_capture'; -- only if first-ever
```

Does not prove: non-empty `p_style_ids`; `fill_slot`/`create_line`/room-scoped placement; `duplicateMode` `create`/`hold`.
