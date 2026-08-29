# prod-write-probe.mjs
Reproduces the extension's exact RLS write path (anon key + a signed-in
designer's JWT) and exercises every write it performs, using the same
payload shapes as `src/lib/payloads.ts`, `src/state/effects.ts`, and
`src/lib/spec-book-placement.ts`. Cleans up what RLS allows; reports the rest.

## Run against Strata (Kody)
```bash
cd apps/extension
SUPABASE_URL=https://bkvcixdmuyejfzcijpdg.supabase.co \
SUPABASE_ANON_KEY=<prod anon key> \
PROBE_EMAIL=<designer email> PROBE_PASSWORD=<their password> \
PROBE_PROJECT_ID=<project.id they own> \
node scripts/prod-write-probe.mjs
```
`--dry-run` prints the plan, no network calls. `PROBE_PROJECT_ID` (skips
step 5, required by step 7 too) and `PROBE_PROPOSAL_ID` are optional. Step 7
(`create_client_decision`) is OPT-IN, OFF by default — needs
`PROBE_CLIENT_ID` (a `designer_clients.id`) **and** `PROBE_ALLOW_DECISION=1`,
since it creates a real PENDING decision that may notify the client.

## Cleanup caveats
Deletes are verified by reading back `.select()` — RLS silently filters
deletes to zero rows with no error. **vendors** always `skipped` (admin-only
delete, 00058). Step 7 uses its OWN product, so step 2's always cleans up;
the decision's product prints `left (referenced by pending decision <id>)`
— `client_decisions` is only deletable while `status = 'draft'` (00399).
`project_ffe_items` is never attempted — `authenticated` has no DELETE
grant on it, only the RPCs.

## Residue on prod
Always: one `vendors` row (`PROBE-VENDOR-<ts>`), one `project_ffe_items` row
(step 5). With `PROBE_ALLOW_DECISION=1`, also: one `products` row + one
PENDING `client_decisions` row — **may trigger a client notification**.
Admin cleanup (service_role):
```sql
delete from client_decision_options where product_id in
  (select id from products where name like 'PROBE-%');
delete from client_decisions where title like 'PROBE-%';
delete from project_ffe_items where product_id in
  (select id from products where name like 'PROBE-%');
delete from products where name like 'PROBE-%';
delete from vendors where name like 'PROBE-VENDOR-%';
```
