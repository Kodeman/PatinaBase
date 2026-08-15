---
name: patina-db-migrations
description: Use when creating or editing files in supabase/migrations/, changing Postgres schema, RLS policies, RPCs/functions, enums, triggers, crons, grants, or seeds in Patina — or when a migration fails to apply, migration numbers collide across branches, a DB function seems to have lost an earlier fix, generated types drift after a schema change, or rows silently vanish (RLS/trigger). Not for edge-function code or Prisma service schemas.
---
# Patina DB migrations (Supabase Postgres)

Last verified: 2026-07-09 (main @ c4de810d, migrations head 00284). Re-verify load-bearing claims if the repo has moved.

## Use when / Don't use when
- USE when: adding/editing `supabase/migrations/NNNNN_*.sql`; changing tables, RLS, RPCs, enums, triggers, cron jobs, grants, or seed files; a migration won't apply; numbers collide at merge; an RPC "lost" an earlier fix; `database.types.ts` is out of sync.
- DON'T use for: edge-function code or their config (see patina-edge-functions); NestJS service schemas — `svc_orders`/`svc_media`/`svc_projects` evolve via Prisma `db push`, not these migrations; the full Vault/cron-diagnosis/prod-probe playbook (see patina-prod-ops); starting/stopping the local stack (see patina-local-dev).
- Boundary: this skill covers authoring + applying migrations. Verifying behavior end-to-end after apply → patina-verification. Cross-branch number collisions during parallel work → patina-parallel-work.

## Procedure
1. **Mint the next number.** `ls supabase/migrations/*.sql | sort | tail`. Head today is `00284` (trust the `ls`, not this doc); next would be `00285_slug.sql` — 5-digit zero-padded, hand-numbered, `snake_case` slug. Every migration is `NNNNN_slug.sql` (zero timestamp-named files exist). NEVER `supabase migration new` — it emits timestamp names that break the convention and sort order. Numbers minted on a branch are PROVISIONAL (see step 8).
2. **If you are redefining ANY function, find its current body first.** Monolithic RPCs evolve by whole-body `CREATE OR REPLACE`; redefining from a stale copy silently reverts later fixes (migration 00199 silently reverted 00185's dual-pricing repair; 00279 re-applied it — see the 00274 and 00279 headers). Run:
   ```
   grep -rln "CREATE OR REPLACE FUNCTION[^(]*<name>" supabase/migrations/*.sql | sort | tail -1
   ```
   Open THAT file, copy the function body verbatim, then graft your delta on top. Confirm no later file redefines it. High-churn monoliths: `activate_proposal_as_project` (head 00279, redefined ~19×), `clone_proposal` (head 00269), `apply_invoice_payment_effects` (head 00277). Do NOT trust doc claims of the "latest body" — supabase/AGENTS.md still names 00262 for `activate_proposal_as_project`; grep says 00279. Grep wins.
3. **Write the migration to the conventions in Quality bar** (banner header, idempotency, guarded crons, pinned search_path, explicit grants).
4. **Apply locally** with `pnpm supabase:reset` (full replay + seeds) or `supabase migration up` (incremental, when the stack is already correct). Reset also loads the 15 seed files in `config.toml [db.seed] sql_paths` (the top-level `supabase/seed.sql` is NOT in that list — it is orphaned and never runs). The FIRST seed, `seed/00-legacy-grants.sql`, is GENERATED — it replays every migration GRANT/REVOKE to reconstruct ACLs after Supabase's 2026-05-30 grant-default flip. If your migration adds any GRANT/REVOKE, regenerate it: `python3 scripts/generate-legacy-grants.py`. Never hand-edit it.
5. **Regenerate types if you touched the public schema.** `pnpm db:generate` writes `packages/supabase/src/database.types.ts`. That file is generated — never hand-edit. Proof of sync: `git diff --exit-code packages/supabase/src/database.types.ts` after regen (nonzero = you forgot to regen, or a schema change is uncommitted).
6. **Run the relevant SQL tests** (see Commands) — they are plain `psql` scripts with asserts, `ON_ERROR_STOP=1`.
7. **Verify by probing the object, not the ledger.** SELECT the new column / call the RPC / check the constraint via `information_schema` or behavior. The migrations ledger can lie (rows can be inserted when a migration was applied via raw psql).
8. **At merge/integration, re-check the target branch tip and renumber the UNDEPLOYED side.** If your `00281` collides with a number already on the target, bump YOUR file (rename the file AND update the internal banner number/lineage) — never renumber something already applied to prod. Same principle for content: editing a migration in place is standard remediation ONLY while it is unapplied on prod (its push failed transactionally, or it never shipped); once applied anywhere that matters, fix forward with a new migration. Established remediation, done repeatedly — 6+ renumber commits (`git log --oneline --grep=renumber -i`), e.g. `00160→00165` (aca99cbf), `00258→00265` (8f7b072e), and the Stripe rail twice (d34ce107, then 79a6195a).
9. **Prod apply is gated.** Only when the user asked to ship this change this session. Then `supabase db push` against the linked Strata project (ref `bkvcixdmuyejfzcijpdg`) is authorized as part of the chain — see Commands. The old self-hosted Coolify box is DEAD; never target it, never run `scripts/remote-db.sh` or `infra/deploy.sh`. [retired-deploy-reference-allow]

## Commands
```bash
# Next number
ls supabase/migrations/*.sql | sort | tail          # head today: 00284_field_dispatch_wiring.sql

# Find the latest real definition of a function (catches bare AND public.-qualified;
# anchored on CREATE OR REPLACE so REVOKE/GRANT/COMMENT lines don't false-positive)
grep -rln "CREATE OR REPLACE FUNCTION[^(]*activate_proposal_as_project" supabase/migrations/*.sql | sort | tail -1

# Apply locally (full replay + 15 seed files) / incremental
# (adds GRANT/REVOKE? regenerate the ACL seed first: python3 scripts/generate-legacy-grants.py)
pnpm supabase:reset            # = cd supabase && supabase db reset
supabase migration up          # incremental, stack already up

# Regenerate + prove types are in sync (public-schema changes only)
pnpm db:generate               # supabase gen types typescript --db-url "$SUPABASE_DB_URL" > packages/supabase/src/database.types.ts
git diff --exit-code packages/supabase/src/database.types.ts   # expect: no output (in sync)

# SQL tests (LOCAL_DB_URL / SUPABASE_DB_URL = local default postgresql://postgres:postgres@127.0.0.1:54322/postgres)
psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f supabase/tests/procurement/state_chain_test.sql
# also: procurement/dual_pricing_test.sql, procurement/crons_test.sql, rls/products_three_layer_test.sql,
#       and the aesthete/*.sql suite under supabase/tests/aesthete/

# Prod apply — GATED (only after an explicit ship request this session)
supabase db push               # linked to Strata (supabase/.temp/project-ref = bkvcixdmuyejfzcijpdg)
```
`SUPABASE_DB_URL` is not committed (env files are gitignored); the local Supabase default is `postgresql://postgres:postgres@127.0.0.1:54322/postgres` (port 54322 confirmed in `config.toml [db]`). Export it before `db:generate`/`db:push`, which both pass `--db-url "$SUPABASE_DB_URL"`.

## Quality bar
A good Patina migration has:
- **Banner header** — a `-- NNNNN — Title` block narrating intent, lineage (for redefined functions, list every prior body: `00140 → … → 00279`), and any hazard it reconciles. Every recent migration (00189, 00258, 00274, 00279) leads with one.
- **Idempotency** — `CREATE OR REPLACE`, `... IF NOT EXISTS`, `ADD COLUMN IF NOT EXISTS`, `ADD VALUE IF NOT EXISTS`. Reruns must be safe.
- **RLS in the same migration** — a new table gets `ENABLE ROW LEVEL SECURITY` + its policies in the SAME file, never a follow-up.
- **Explicit grants, both directions** — Supabase flipped platform defaults on 2026-05-30: fresh stacks no longer auto-grant `anon`/`authenticated` at object creation, and replayed `REVOKE`s become creation-order no-ops. So: (a) post-flip migrations must GRANT what callers need EXPLICITLY — never rely on creation defaults (`supabase/AGENTS.md` convention); (b) keep the lockdown hygiene anyway — for SECURITY DEFINER / service-only RPCs write `REVOKE EXECUTE ON FUNCTION public.f(args) FROM PUBLIC, anon, authenticated;` then `GRANT ... TO service_role;` (pattern in 00277; hardening commits 49da368c, bd964038, 50bc645f) — Strata prod predates the flip, so legacy-granted objects still exist there; verify, don't assume either default; (c) local ACLs are reconstructed by the generated seed `seed/00-legacy-grants.sql` — regenerate via `python3 scripts/generate-legacy-grants.py` after adding any GRANT/REVOKE. Known debt: 00255's feedback RPCs grant to `authenticated` but never revoke from PUBLIC/anon — don't copy that shape.
- **SECURITY DEFINER pins search_path** — `SECURITY DEFINER` + `SET search_path TO 'public'` (or `'public','extensions'` when using `net`/`vault`). See 00258, 00279.
- **Schema-qualify extension functions** — write `extensions.uuid_generate_v5(...)` etc., never the bare name: the prod `db push` session's `search_path` lacks `extensions`, so bare calls that pass locally fail on Strata with 42883 (00282 incident, fixed ced1a2fe).
- **Guarded crons** — before every `cron.schedule(...)`, unschedule the old job: `IF EXISTS (SELECT 1 FROM cron.job WHERE jobname='x') THEN PERFORM cron.unschedule('x'); END IF;`. Cron job bodies must schema-qualify EVERY relation (pg_cron runs under the scheduling role's search_path, not the migration's). Wrap `COMMENT ON EXTENSION pg_cron ...` in `EXCEPTION WHEN insufficient_privilege THEN NULL;` (00189).
- **Enums added in isolation** — `ALTER TYPE t ADD VALUE IF NOT EXISTS 'x'` CANNOT be used in the same transaction that USES the value. Put the ADD VALUE in its own migration (or autocommit step) and do any backfill/usage in a LATER migration (00174, 00228).
- **Product inserts set the layer** — a trigger from 00152 defaults `products.layer` to `'catalog'`; a personal-library insert MUST set `layer='personal', owner_user_id=<uid>` (constraint requires owner_user_id when layer='personal'), or the row silently vanishes from "My Library".
- **Money is integer cents** — `*_cents` columns. Invoice/total readers fall back `total_amount_cents ?? budget_cents ?? 0` (use-project-v2.ts). Never store dollars/floats.
- **Vault for edge settings** — `public.app_setting(name)` reads `vault.decrypted_secrets` with a GUC fallback (00258); `public.invoke_edge_function(fn, body)` is the cron→edge bridge. NEVER `ALTER DATABASE ... SET app.settings.*` on Cloud (fails 42501). Full treatment in patina-prod-ops.

Skeleton (compose from the rules above — illustrative, NOT a verbatim repo block):
```sql
-- ═══════════════════════════════════════════════════════════════════════════
-- 00281 — <one-line intent>
-- Lineage (only if redefining a fn): 00140 → … → <grep|sort|tail-1 winner>
-- Reconciles: <stale-body revert this avoids, or "none">
-- ═══════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.widget (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  amount_cents  integer NOT NULL DEFAULT 0,           -- money is integer cents
  created_at    timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.widget ENABLE ROW LEVEL SECURITY;  -- same migration as the table
CREATE POLICY widget_owner_rw ON public.widget
  USING (owner_user_id = auth.uid())
  WITH CHECK (owner_user_id = auth.uid());             -- upserts MUST send owner_user_id

CREATE OR REPLACE FUNCTION public.do_widget_thing(p_id uuid)
RETURNS void LANGUAGE plpgsql
SECURITY DEFINER SET search_path TO 'public'           -- pin search_path
AS $$ BEGIN /* … */ END $$;
REVOKE EXECUTE ON FUNCTION public.do_widget_thing(uuid) FROM PUBLIC, anon;  -- not PUBLIC alone
GRANT  EXECUTE ON FUNCTION public.do_widget_thing(uuid) TO authenticated;
```

## Verification checklist
- [ ] File is `NNNNN_slug.sql`, number > current head, unique on the target branch.
- [ ] If a function was redefined: the body came from the `grep | sort | tail -1` winner, verbatim, delta grafted; banner lineage updated.
- [ ] `pnpm supabase:reset` (or `migration up`) applies clean, no errors.
- [ ] New table → RLS enabled + policies present in the same file.
- [ ] Sensitive definer function → `REVOKE ... FROM PUBLIC, anon` present; `search_path` pinned.
- [ ] Callers' access GRANTed explicitly (post-flip rule); if the migration adds GRANT/REVOKE, `generate-legacy-grants.py` re-run and the regenerated seed included.
- [ ] `pnpm db:generate` run and `git diff --exit-code database.types.ts` is clean (public-schema changes).
- [ ] Relevant `supabase/tests/**` script passes under `ON_ERROR_STOP=1`.
- [ ] Behavior probed directly (SELECT/call/constraint), not inferred from the ledger.

## Common mistakes
| Situation | Wrong move | Right move |
|---|---|---|
| Need a new migration file | `supabase migration new x` (timestamp name) | Hand-number `NNNNN_slug.sql`, next after `sort \| tail` |
| Redefining an RPC | Paste an older/remembered body | `grep -rln "CREATE OR REPLACE FUNCTION[^(]*<name>" ... \| sort \| tail -1`, copy that body verbatim |
| Finding a function's latest body | `grep "FUNCTION public.<name>"` | Anchor on `CREATE OR REPLACE FUNCTION[^(]*<name>` — bare-schema fns like `clone_proposal` lack `public.`, and REVOKE/COMMENT lines false-positive |
| Trusting supabase/AGENTS.md for "latest body" | Believe it (says 00262) | grep the migrations (00279); docs drift |
| Locking down a definer RPC | `REVOKE ... FROM PUBLIC` only | Also `REVOKE ... FROM anon` (default privs grant anon at creation) |
| Adding an enum value and using it | Same migration/transaction | ADD VALUE in its own migration; use/backfill in a later one |
| Inserting a personal-library product | Omit `layer` | Set `layer='personal', owner_user_id=<uid>` or the 00152 trigger files it as catalog and it vanishes |
| Optimistic-UI upsert under RLS | Omit an "unchanged" FK column | Include EVERY column a WITH CHECK policy joins through (a missing `board_id` silently failed a whole batch) |
| Number collides at merge | Renumber the already-deployed file | Bump the UNDEPLOYED side — filename + internal banner |
| Confirming a prod migration landed | Read the migrations ledger | Probe the object (information_schema / behavior) — ledger can lie |
| Edge settings on Cloud | `ALTER DATABASE ... SET app.settings.*` | Store in Vault; read via `app_setting()` (00258) |
| Fresh local stack 42501s on long-existing objects | Hand-patch grants one by one | Regenerate `seed/00-legacy-grants.sql` (`python3 scripts/generate-legacy-grants.py`) and reset |
| Migration passes locally, fails on Strata with 42883 | Debug the function logic | Schema-qualify the extension fn (`extensions.<fn>`) — prod push search_path lacks `extensions` |

## Report back
State: which migration number(s) you added/edited and the one-line intent; whether you redefined a function and which body-file you grafted from; that `supabase:reset` applied clean and which `supabase/tests/**` passed; whether `db:generate` was run and the `database.types.ts` diff was clean. Explicitly call out what you did NOT do: not applied to prod (unless the user asked to ship, in which case report the `db push` result and the object-level probe), types not regenerated if only non-public schema changed, and any assumption you couldn't verify locally. If you renumbered at merge, say which side moved and why.
