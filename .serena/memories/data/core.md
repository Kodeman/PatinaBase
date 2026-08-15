# data/core — Supabase data layer (migrations, edge functions, seed, public schema)

The single source of truth for schema, DB logic, and public-schema data access.
Root `CLAUDE.md` overview text is stale on counts (says ~35 hooks, migrations
~00191–00220) — verify against tree. Authoritative sub-doc: `supabase/CLAUDE.md`.

## Migrations — `supabase/migrations/*.sql`
- **Append-only. NEVER modify or delete an existing migration** — always add a new
  numbered file. Naming: `NNNNN_snake_name.sql`, zero-padded, sequential.
- **Current head: `00254`** (`00254_record_offline_signature.sql`, R92). Not the
  ~00191 the root CLAUDE.md implies. ~252 files.
- Numbering is NOT perfectly contiguous: `00010` and `00012` never existed
  (historical gaps). No duplicate numbers in the applied set.
- **`migrations/_pending/`** = migrations parked OUT of the apply sequence — NOT
  run by `db reset`/`db:push`. Currently `00106_drop_client_messages.sql`. (An
  applied `00106` also exists; the _pending file is a separate deferred change —
  number reuse across dir vs _pending is intentional, not a mistake.)
- Postgres `major_version = 15`; pgvector for the 768-d Aesthete space.
- Conventions: prices in **cents (integers)**; **RLS on every table**;
  `created_at`/`updated_at` on rows.
- Apply locally: `supabase db reset` (runs all migrations then seeds). Push:
  `pnpm db:push`. Regenerate types: `pnpm db:generate` →
  `packages/supabase/src/database.types.ts`.
- Some migrations wire **pg_cron → `net.http_post` → an edge function** (e.g.
  00193, 00206, 00241–00250 aesthete). Cron jobs live in migrations, not config.
- Heavy RPC bridge: **`activate_proposal_as_project`** (proposal→project; latest
  body in 00180, vendor_id fix in 00199). Its full copy/side-effect contract +
  the `projects` money-column semantics (`total_amount_cents` vs `budget_cents` vs
  `design_fee_cents` vs committed/actual) are documented in `supabase/CLAUDE.md` —
  read it before touching activation or project financials.
- SQL tests: `supabase/tests/{aesthete,procurement,rls}/*.sql` (pgTAP-style).

## Edge functions — `supabase/functions/`
- **Deno** runtime. 75 deployable function directories plus `_shared/`,
  `_tests/`, and `deno.json`.
- **Invoked and deployed by name.** Supabase Cloud dispatches each function
  directly; there is no repository-owned aggregate runtime dispatcher.
- **`verify_jwt` defaults true.** Only exception: `stripe-webhook`
  (`[functions.stripe-webhook] verify_jwt = false` in `config.toml`) — Stripe
  can't carry a Supabase JWT; authenticity enforced via Stripe signature inside
  the fn. Add per-function overrides in `config.toml`, not in code.
- **`_shared/`** = cross-function TS with colocated unit tests: `send-email`,
  `render-template`, `po-pdf`, `po-emails`, `invoice-emails`, `decision-notify`,
  `comms-token`, `aesthete*`. Import these, don't duplicate.
- `deno.json` is the shared Deno config (no lockfile, no import map by default);
  a function may add its own `functions/<name>/deno.json` import map.
- **Deploy separately from migrations, and prod lags** — deploying migrations
  does NOT deploy edge fns. Order for a release: migrations first, then edge fns,
  then app. Many functions are cron-driven (nightly/reminders/expire-*/digest).

## Seed — `supabase/seed/*.sql`
- `config.toml [db.seed]` has an **ORDERED `sql_paths` list** run after migrations
  on `db reset`. Order matters: dev-accounts → organizations → vendors → products
  → designer-clients → proposals → proposal-captures → decisions →
  project_documents_tasks → paint_colors → procurement_* → aesthete_demo.
- **Not every file in `seed/` is auto-loaded** — files absent from `sql_paths`
  (e.g. `leads_room_scans.sql`, `messages.sql`) and root `seed.sql` are manual.
  Track/feature demo data lives in `scripts/the-document-*.sql` (run by hand).

## Public schema access — `@patina/supabase` (`packages/supabase/src/`)
- THE data-access layer for the `public` schema. `client.ts`/`server.ts` expose
  `createBrowserClient` / `createServerClient` / `createMiddlewareClient`;
  `hooks/` (~80 files — not 35), `mutations/`, generated `database.types.ts`,
  `lib/`, `test-utils`.
- NestJS services (orders/media/projects) do NOT use this — they own Prisma
  schemas `svc_orders`/`svc_media`/`svc_projects`. Everything else = `public`,
  reached only through this package (never raw SQL from portals).
