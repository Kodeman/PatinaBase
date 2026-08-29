# prod-write-probe.mjs
Reproduces the extension's exact RLS write path (anon key + a signed-in
designer's JWT) and exercises every write it performs — products,
product_styles, vendors, `place_product_in_project_v2`,
`commit_proposal_capture`, `create_client_decision` — using the same payload
shapes as `src/lib/payloads.ts`, `src/state/effects.ts`, and
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
`--dry-run` prints the plan, no network calls. URL/key/email/password are
always required; `PROBE_PROJECT_ID` (skips steps 5+7 if absent),
`PROBE_PROPOSAL_ID` (nullable RPC arg), `PROBE_CLIENT_ID` (a
`designer_clients.id`, skips step 7) are optional.

## Cleanup caveats
Deletes are verified by reading back `.select()`, since RLS silently filters
deletes to zero rows with no error. Two print `skipped`, un-cleanable by this
role: **vendors** (admin-only delete, 00058 — row left for an admin) and
**client_decisions** (deletable only while `status = 'draft'`, 00399 —
`saveAsDecision` always creates `pending`, which also blocks deleting the
referenced product). `project_ffe_items` always `error`s 42501 —
`authenticated` has no DELETE grant on it, only the RPCs.
