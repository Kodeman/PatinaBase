# Strata staging environment

Strata staging is a persistent, data-less Supabase branch of the production
Strata project. It is not a separate Supabase project and must never be pointed
at the retired Patina Staging project.

## Fixed identities

- Parent project: Strata (`bkvcixdmuyejfzcijpdg`)
- Branch name: `staging`
- Branch ref: `vuesoyhfrjabfxbrzekd`
- Branch mode: persistent, `with_data=false`, `us-east-1`, micro compute
- Cloudflare account: `be3aaeed18a81b5d90ee2263b62219ea`

The staging branch receives the repository migration history and the
staging-safe seed list in `supabase/config.toml`. It does not copy production
rows.

## Safety contract

- Work against staging from an isolated git worktree.
- Link the Supabase CLI only inside that worktree and verify the ref before any
  database command.
- Never copy production Resend or Twilio credentials into staging.
- Staging email and SMS remain in `dry_run` mode.
- Stripe and EasyPost must use test credentials only.
- OAuth and PostHog are disabled in staging portal environments.
- `NEXT_PUBLIC_*` values are compiled into portal bundles. The portal deploy
  script rejects a staging build unless it resolves the exact staging branch
  URL.

## Public endpoints

| Surface             | URL                                                               |
| ------------------- | ----------------------------------------------------------------- |
| Designer portal     | `https://patina-designer-portal-staging.kody-be3.workers.dev`     |
| Client portal       | `https://patina-client-portal-staging.kody-be3.workers.dev`       |
| Admin portal        | `https://patina-admin-portal-staging.kody-be3.workers.dev`        |
| Manufacturer portal | `https://patina-manufacturer-portal-staging.kody-be3.workers.dev` |
| Orders service      | `https://patina-orders-worker-staging.kody-be3.workers.dev`       |
| Projects service    | `https://patina-projects-worker-staging.kody-be3.workers.dev`     |
| Media service       | `https://patina-media-svc-worker-staging.kody-be3.workers.dev`    |
| Media processor     | `https://patina-media-worker-staging.kody-be3.workers.dev`        |
| Aesthete inference  | `https://patina-inference-worker-staging.kody-be3.workers.dev`    |

Staging media uses `patina-raw-staging`, `patina-processed-staging`,
`media-jobs-staging`, and `media-jobs-staging-dlq`.

## Database and Edge Functions

From an isolated worktree:

```bash
supabase link --project-ref vuesoyhfrjabfxbrzekd
supabase db push --dry-run
supabase db push
supabase functions deploy <function-name> --project-ref vuesoyhfrjabfxbrzekd
```

Use `supabase secrets set --project-ref vuesoyhfrjabfxbrzekd` for Edge Function
secrets. Before a database push, confirm the linked ref printed by the CLI and
confirm the dry run contains only the intended migrations.

## Cloudflare deployment

Portals must use the repository deploy script. Export the branch URL and anon
key into the build environment first; the script fails closed if the resolved
URL is not the staging branch.

```bash
./infra/deploy-portal.sh designer staging
./infra/deploy-portal.sh client staging
./infra/deploy-portal.sh admin staging
./infra/deploy-portal.sh manufacturer staging
```

Services use their existing Worker directories with the staging environment:

```bash
cd infra/orders-worker && npx wrangler deploy --env staging
cd infra/projects-worker && npx wrangler deploy --env staging
cd infra/media-svc-worker && npx wrangler deploy --env staging
cd infra/media-worker && npx wrangler deploy --env staging
cd infra/inference-worker && npx wrangler deploy --env staging
```

Set server-only Worker secrets with `wrangler secret bulk --env staging` or
`wrangler secret put --env staging`. Never place secrets in `wrangler.jsonc`.

## Verification

At minimum, verify:

1. Supabase Auth health returns 200 with the branch anon key.
2. The migration ledger matches the repository and staging seed counts are
   plausible.
3. Orders `/v1/health`, Projects `/v1/health`, Media `/health`, and inference
   `/healthz` return 200.
4. Each portal sign-in or landing page returns 200.
5. Deployed portal HTML and scripts contain no production project ref.
6. `wrangler deployments list --env staging` shows the new deployment as the
   bottom/newest entry.

Production deployment remains a separate, explicitly authorized operation.

## Migration ledger discipline (2026-08-19)

> ⚠ **PENDING KODY'S CONFIRMATION.** This section **supersedes the earlier
> scoped-MCP ruling** that allowed `apply_migration` against staging. Until
> Kody confirms, treat the rule below as in force and the older ruling as
> withdrawn.

### The rule

Staging database changes are **file-based only**:

```bash
# from a staging-linked worktree (verify supabase/.temp/project-ref first)
supabase db push --dry-run
supabase db push
```

- **NEVER `mcp__*__apply_migration` against staging.** The MCP tool stamps a
  **timestamp** version (`20260818072756`) instead of the repository's
  hand-numbered `NNNNN`. The CLI then cannot match the row to its file, so the
  file reads as unapplied forever and the two ledgers silently diverge.
- **NEVER a bare `supabase db push` from a prod-linked checkout.** The
  repository root checkout is linked to **prod** (`bkvcixdmuyejfzcijpdg`). Every
  staging command carries an explicit target — a staging-linked worktree, or
  `--project-ref vuesoyhfrjabfxbrzekd` / `--db-url`.
- Out-of-order catch-up (a repaired gap below the remote head) needs
  `supabase db push --include-all`; a plain push fails with
  `LegacyDbPushMissingRemoteError`.

### The incident

Two programs applied migrations to staging over 2026-08-18/19 via MCP
`apply_migration`. That wrote **12 timestamp-versioned rows** into
`supabase_migrations.schema_migrations` above a `00480` floor, none of which the
CLI could reconcile against a repository file. Reconciled 2026-08-19 by mapping
each row to its `NNNNN`, content-verifying the objects on staging, then
`supabase migration repair --status applied <NNNNN…>` +
`--status reverted <timestamp…>`.

### Reconciliation record (2026-08-19)

| Timestamp on staging | Maps to                                           | Text vs repo file | Verdict                           |
| -------------------- | ------------------------------------------------- | ----------------- | --------------------------------- |
| `20260818072756`     | `00481_edge_catalog_roles`                        | exact             | applied                           |
| `20260818072900`     | `00482_retained_service_authorization_contract`   | **variant**       | applied                           |
| `20260818074342`     | `00483_public_acl_allowlist`                      | exact             | applied                           |
| `20260818075013`     | `00484_public_rpc_authorization_contract`         | exact             | applied                           |
| `20260818075051`     | `00485_moodboard_storage_caller_binding`          | **stale body**    | **NOT repaired — left unapplied** |
| `20260818075143`     | `00486_public_acl_residual_closure`               | exact             | applied                           |
| `20260818184355`     | `00489_media_registry_kernel`                     | exact             | applied                           |
| `20260818184517`     | `00490_scan_worker_roles`                         | exact             | applied                           |
| `20260818184547`     | `00491_dispatch_scan_modal_cron`                  | exact             | applied                           |
| `20260818212329`     | `00492_room_file_version_monotonicity`            | exact             | applied                           |
| `20260819095918`     | `00498_media_upload_intent_and_scan_version_lock` | comments only     | applied                           |
| `20260819104323`     | `00499_upload_interface_hardening`                | comments only     | applied                           |

Notes on the three non-exact rows:

- **00482 — the snake-case variant.** Staging received the pre-`2d6e9063` body
  that names `svc_media.media_assets` / `created_at` directly. `main`'s file is
  the catalog-resolving rewrite that exists because **prod**'s `svc_*` schemas
  are Prisma-shaped (`svc_media."MediaAsset"` / `"createdAt"`). Staging is
  snake-shaped throughout, so the two are **equivalent in effect there**.
  Verified by object, not by text: `svc_orders.orders.organization_id`,
  `svc_orders.stripe_webhook_receipts`, `svc_projects.projects.public_project_id`,
  `svc_media.media_assets.project_id`, `svc_media.asset_kind` value `DOCUMENT`,
  and all 8 `public.permissions` rows.
- **00498 / 00499 — abridged headers.** The applied text replaced the long file
  headers with a pointer back to the file. Comment-stripped, whitespace-normalized
  hashes of every function body (`scan_worker_update_room_file`,
  `create_media_upload_intent`, `confirm_media_upload`, `register_media_object`)
  **match the repository byte for byte**; `is_originals_bucket` matches
  unmodified. Executable content is identical.
- **00485 — a real content gap, deliberately left unapplied.** Staging holds the
  body from before `6e9b109a` ("reference-scope 00485 client leg to the active
  issued board"): the client leg is still whole-prefix and the helper
  `public.can_client_read_issued_board_media` is **absent**. Prod **has** the
  tightened version, so staging — not `main` — is the laggard. Marking 00485
  applied would have stranded the tightening on staging permanently, so its
  ledger row was reverted and no applied-mark written; `db push` therefore
  carries it.

**Non-ledger repair, content-verified:** `00373`'s `public.room_files.drawings`
column was re-applied to staging via `execute_sql` without a ledger row. The
column exists (`jsonb`); 00373 is inside the reconciled `00480` floor and needs
no repair entry.

### Post-repair state

`supabase db push --dry-run --include-all` plans exactly:

```
 • 00485_moodboard_storage_caller_binding.sql
 • 00493_svc_shape_resolving_function_bodies.sql
 • 00510_post_00483_grant_and_scope_repairs.sql
```

`00487`, `00488`, `00494`–`00497`, and `00500`–`00509` have no files on `main`
and are correctly absent.

### Catch-up applied (2026-08-19)

All three files were already live on **prod**, so the push brought staging to
prod's existing posture rather than shipping anything new. Applied with
`supabase db push --include-all` from the staging-linked worktree:

```
Applying migration 00485_moodboard_storage_caller_binding.sql...
Applying migration 00493_svc_shape_resolving_function_bodies.sql...
Applying migration 00510_post_00483_grant_and_scope_repairs.sql...
```

A plain `supabase db push --dry-run` afterwards reports
`{"upToDate":true,"migrations":[]}` — once nothing sorts below the remote head,
the `--include-all` requirement disappears. **Staging's ledger now matches the
repository exactly.**

Post-apply probes:

| Probe                                                                                | Result                                                                                                 |
| ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------ |
| 00485 `can_client_read_issued_board_media`                                           | present                                                                                                |
| 00485 mood-board policy                                                              | `roles={authenticated}`, calls the helper                                                              |
| 00493 `record_project_ffe_receipt_batch` / `get_outbox_events` / `get_outbox_counts` | all present, all `to_regclass`-resolving                                                               |
| 00510 S1 `Project members can read documents`                                        | `roles={authenticated}`                                                                                |
| 00510 S4 anon ACLs                                                                   | `anon=rm` on organizations, project_ffe_items, project_phases, purchase_orders — **identical to prod** |
| 00510 S2/S3 `engage_trade_scope` / `apply_scope_change`                              | bodies updated                                                                                         |

00510's own embedded verify blocks (which `RAISE EXCEPTION` on a wrong policy
predicate, wrong roles, or a surviving PUBLIC policy) all passed as a condition
of the migration applying.

### ⚠ Known residual: `anon` EXECUTE on 00485's helper

Staging grants `anon` EXECUTE on
`public.can_client_read_issued_board_media(text)`; **prod does not**.

Cause: `pg_default_acl` for functions owned by `postgres` auto-grants
`anon=X`. 00485's file says only `REVOKE ALL … FROM PUBLIC`, which does **not**
remove an explicit per-role `anon` grant. Prod escaped this because its 00485
went in as a standalone hotfix paired with an explicit anon-execute revoke.
**Any environment that applies 00485 from the file alone inherits the anon
grant** — this is a latent defect in the file, not staging-specific drift.

Not exploitable: the helper opens with `auth.uid() IS NOT NULL`, so it returns
`false` for anon (verified by direct call), and the mood-board policy is
`TO authenticated`, so anon never reaches it. Left **unfixed on purpose** — an
ad-hoc `execute_sql` revoke would recreate exactly the out-of-band-DDL problem
this section exists to prevent. Closing it properly means adding an explicit
`REVOKE … FROM anon` to a numbered migration.
