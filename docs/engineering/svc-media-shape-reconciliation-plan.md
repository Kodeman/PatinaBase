# svc_media shape reconciliation plan (Phase 2 / B-W3b)

**Migration:** `supabase/migrations/00521_svc_media_shape_reconciliation.sql`
**Reverse (pre-staged rollback):** `docs/engineering/svc-media-shape-reconciliation.reverse.sql`
**Fixture proof:** `supabase/tests/svc_media/shape_reconciliation_fixture_proof.sql`
**Ruling:** Kody — **OPTION A** (catalog-resolving rename of prod's Prisma-shaped
`svc_media` to the snake_case SQL shape).
**Status:** AUTHORED + fixture-proven locally. **NOT applied anywhere.** Prod apply
is a separate coordinated migrate-then-deploy window with its own Kody GO.

All prod facts below were gathered **read-only** (Supabase MCP SELECT-only) against
Strata (`bkvcixdmuyejfzcijpdg`) on 2026-08-24. Zero mutations were made on prod or
staging.

---

## 1. The problem

Prod's `svc_media` is **Prisma-DEFAULT-shaped**: PascalCase tables (`"MediaAsset"`,
`"AssetRendition"`, `"ThreeDAsset"`, `"ProcessJob"`, `"UploadSession"`,
`"LicenseRecord"`), camelCase columns (`"rawKey"`, `"createdAt"`, `"scanStatus"`, …),
and PascalCase enum **types** (`"AssetKind"`, `"ScanStatus"`, …) — as if the
`@map`/`@@map` directives had never been applied when the schema was first pushed.

`services/media/prisma/schema.prisma` today declares snake_case targets on every field
(`raw_key`, `created_at`, `scan_status`, …) and table (`@@map("media_assets")` …) and
enum (`@@map("asset_kind")` …). `services/media/Dockerfile.cf` runs
`npx prisma generate` from that **source** schema at build time (line 77), so **every
built media image queries snake_case names** and would `42P01`/`42703` against prod's
current PascalCase/camelCase shape. Hence the standing freeze: **the media service
cannot be deployed to prod until `svc_media` matches the snake_case source shape.**

`00053_svc_media_schema.sql` is byte-identical to the Prisma migrate baseline
`services/media/prisma/migrations/20260803180000_existing_schema_baseline/migration.sql`
and defines the snake_case shape that **local / CI / staging already carry**. Prod is
the sole divergent environment. Option A renames prod → that shape.

### Does the media deploy need svc_orders / svc_projects touched too?

**No.** `svc_orders.outbox_events` and `svc_projects.outbox_events` carry the same
camelCase columns (`createdAt`, `publishedAt`, `retryCount`, `lastError`), but the
media Prisma client is scoped to `svc_media` only (via `?schema=svc_media` in
`DATABASE_URL`; no multiSchema). The media service never queries the orders/projects
schemas. **Renaming `svc_media` alone unblocks the media deploy.** The
orders/projects outbox camelCase is a parallel, out-of-scope debt that will gate
*those* services' future deploys — flagged, not fixed here.

---

## 2. Read-only prod catalog audit (exact spellings)

Seven relations exist in prod `svc_media`; **all seven are empty (0 rows)**. No
sequences (UUID/text PKs, no serial), no views, **no triggers**, and **no
`_prisma_migrations` table** in any `svc_*` schema (so the container does **not** run
Prisma migrate on boot — see §6). Relation ACLs are all `NULL` (owner-only; nothing to
preserve — and `ALTER … RENAME` preserves ACLs regardless).

### Tables (7)
`"MediaAsset"`, `"AssetRendition"`, `"ThreeDAsset"`, `"ProcessJob"`,
`"UploadSession"`, `"LicenseRecord"` (all PascalCase) + `outbox_events` (already snake).

### Enum types (9) — labels already correct
`"AssetKind"` `{IMAGE,MODEL3D,DOCUMENT}`, `"AssetRole"`
`{HERO,ANGLE,LIFESTYLE,DETAIL,AR_PREVIEW,TEXTURE,OTHER}`, `"AssetStatus"`
`{PENDING,PROCESSING,READY,FAILED,BLOCKED,QUARANTINED}`, `"ScanStatus"`
`{PENDING,SCANNING,CLEAN,INFECTED,ERROR}`, `"RenditionFormat"` `{JPEG,PNG,WEBP,AVIF}`,
`"RenditionPurpose"` `{THUMB,WEB,RETINA,PREVIEW,ORIGINAL}`, `"JobType"` (11 labels),
`"JobState"` `{QUEUED,RUNNING,SUCCEEDED,FAILED,RETRY,CANCELED}`, `"UploadStatus"`
`{PENDING,UPLOADED,FAILED,EXPIRED}`. **Only the type NAMES are Prisma-shaped; every
enum LABEL already matches the source schema, so labels are left untouched.**

### Columns
73 camelCase columns to rename (full table→column map is enumerated in the migration's
Section B). **Already-correct columns are left alone**, notably:
`MediaAsset.project_id` (a later Patina addition — `uuid`, snake_case, ordinal-last)
and its FK `MediaAsset_project_id_fkey` → `projects(id)`, the check constraint
`media_assets_single_owner`, and the index `idx_media_assets_project_created` — all
already snake_case on prod and on local; **untouched.**

### Indexes / constraints — prod's actual names are Prisma-auto-generated
Prod's index and constraint names are Prisma-generated (`MediaAsset_productId_idx`,
`MediaAsset_pkey`, `AssetRendition_assetId_fkey`, `MediaAsset_rawKey_key`), **not** a
mechanical camelCase transform of the `00053` hand-names (`idx_media_product`,
`media_assets_pkey`, `asset_renditions_asset_id_fkey`, `media_assets_raw_key_key`).
The migration therefore maps prod's exact captured names → the `00053`/local names
(so reconciled prod == local structurally on names). The 5 `@unique` keys are **bare
unique INDEXES** on prod (not `UNIQUE` constraints) — see §4.

---

## 3. Rename map — object counts

| category | renamed | left as-is (already correct on prod) |
| --- | ---: | --- |
| enum types | 9 | 0 (all 9 labels already match) |
| tables | 6 | `outbox_events` |
| columns | 73 | `project_id` + all already-snake columns |
| plain indexes | 19 | `idx_media_assets_project_created`, `outbox_events_pkey` |
| PK / FK constraints | 9 (6 PK + 3 FK) | `MediaAsset_project_id_fkey`, `media_assets_single_owner` |
| unique keys | 5 | — |
| **total rename operations** | **121** | — |

Cross-checked against `services/media/prisma/schema.prisma` `@map`/`@@map` values and
against `00053`: every target name is exactly what the regenerated Prisma Client
queries (table + column + enum-type names) or what `00053`/local carries (index +
constraint names).

---

## 4. The migration's resolving logic

`00521` is a pair of guarded PL/pgSQL `DO` blocks (the `00493` / fixed-`00482`
catalog-resolving pattern). **Every rename fires only when the Prisma-shaped object
exists AND the snake_case target does not.** Consequences:

- **Prod** (Prisma shape) → the rename fires.
- **Local / CI / staging** (already snake_case) → every guard is false → **pure
  no-op** (proven: `pnpm supabase:reset` replays `00521` clean, exit 0).
- **Re-run** on prod (already snake_case after first apply) → **no-op** (idempotent).

Sections, in order (order is not load-bearing — each step is independently guarded and
resolves its target dynamically):

1. **Enum types** — `ALTER TYPE … RENAME`, guarded by `to_regtype(old) IS NOT NULL AND
   to_regtype(new) IS NULL`. Column defaults (`'PENDING'::"AssetStatus"`) track the
   type by OID and re-render under the new name automatically.
2. **Columns** — the table is resolved by
   `COALESCE(to_regclass('svc_media."MediaAsset"'), to_regclass('svc_media.media_assets'))`,
   then each column is renamed only if the camelCase name is present and the snake
   target absent (checked via `pg_attribute`, ignoring dropped columns).
3. **Plain indexes** — `ALTER INDEX … RENAME`, guarded on `to_regclass` old-present /
   new-absent.
4. **PK / FK constraints** — `ALTER TABLE … RENAME CONSTRAINT`, owning table resolved
   from `pg_constraint.conrelid::regclass` so the current table name is irrelevant.
5. **Unique keys (constraint-OR-index bearer)** — on prod these are **bare unique
   indexes** (rename via `ALTER INDEX`); on a local-derived fixture they are **unique
   constraints** (rename via `RENAME CONSTRAINT`, which carries the backing index name
   along). The section handles whichever object currently bears the Prisma name, so the
   same migration is correct on both.
6. **Tables** — `ALTER TABLE … RENAME`, guarded old-present / new-absent.

A trailing **verify block** asserts (and `RAISE EXCEPTION` on failure): all 7
snake_case tables and 9 snake_case enum types exist, **no** PascalCase table or enum
remnant survives, and `media_assets` carries `raw_key`/`scan_status`/`created_at`. This
runs on every environment and fails loud on any half-applied state.

### Cross-dependency — the one public reader survives the rename

Only two DB functions reference `svc_media` by name (verified via `pg_get_functiondef`
scan on prod):

- `public.record_project_ffe_receipt_batch` — **already fully catalog-resolving**: it
  resolves the asset table via
  `COALESCE(to_regclass('svc_media."MediaAsset"'), to_regclass('svc_media.media_assets'))`
  and resolves columns by normalizing `lower(replace(attname,'_',''))` (so `scanStatus`
  and `scan_status` both map to `scanstatus`), and it even **aborts** if both spellings
  coexist. It resolves cleanly to the snake_case names after the rename. **No change
  needed.** (This is the `00447` FFE-hardening pattern.)
- `svc_media.set_updated_at()` — a dormant trigger function already written against
  `NEW.updated_at` (snake). No trigger currently uses it on prod. **Untouched.**

No views, materialized views, or other name-bound dependencies on `svc_media` exist.

---

## 5. Fixture proof + reverse proof (local, ROLLBACK — zero residue)

`supabase/tests/svc_media/shape_reconciliation_fixture_proof.sql` runs entirely inside
one transaction that `ROLLBACK`s. Result: **all steps PASSED, zero residue** (verified
post-run: 0 probe rows, 0 PascalCase relations, 7 snake tables intact).

- **STEP 1** — the **reverse** migration reshapes local snake_case `svc_media` into
  prod's exact Prisma casing (PascalCase tables/enum-types, camelCase columns, prod's
  Prisma index/constraint names); the 5 unique keys are then converted from constraints
  to **bare unique indexes** so the fixture matches prod's real structure and exercises
  `00521`'s index-rename branch. → asserted now in Prisma shape. **(proves the reverse
  migration works, and that reverse doubles as the reshaping tool.)**
- **STEP 2** — **forward `00521`** renames everything back; asserted **zero upper-case
  objects** remain (tables, types, columns, constraints) AND the reconciled object
  inventory is **identical to the pre-reshape baseline** (reverse → forward = identity
  on names). **(proves the forward migration produces the exact snake_case shape.)**
- **STEP 3** — a **second** forward `00521` run completes clean. **(proves
  idempotence.)**
- **STEP 4** — representative snake_case query shapes the regenerated Prisma Client
  emits (findMany projection incl. `project_id`; renditions→assets join on the renamed
  `asset_id` FK; 3D/jobs/uploads/licenses column projections; outbox
  `published_at`/`retry_count`/`last_error`; an INSERT resolving snake columns + enum
  values) all **resolve**. **(proves the client's queries bind after reconciliation.)**

**Gate results (local):**

- `pnpm supabase:reset` → **exit 0**; `00521` applied as a no-op, verify block passed.
- fixture proof via `scripts/run-sql-tests.sh -f svc_media` → **PASS**, and the
  transaction rolled back leaving zero residue.
- full `scripts/run-sql-tests.sh` → **exit 0**, `unexpected-fail: 0`, `expected-fail:
  22` (unchanged from the documented baseline), `green: 95` (baseline 94 + this new
  passing test). **Baseline preserved — `00521` introduces no new failures** (expected,
  as it is a no-op on local's public + snake_case `svc_media`).

---

## 6. Deploy-window runbook (for the eventual coordinated GO — NOT this task)

The prod apply is a coordinated **migrate-then-deploy** window with its own Kody GO.
Target: **< 5 min**, rollback pre-staged.

### Pre-staged before the window
1. **Build the snake_case media image first** (so it is ready to deploy the instant the
   rename lands): `services/media` image from the pinned tree at this branch's SHA —
   `Dockerfile.cf` regenerates the Prisma Client from the snake_case source at build.
2. Pin the tree at the commit carrying `00521`; have both the forward migration and
   `docs/engineering/svc-media-shape-reconciliation.reverse.sql` on disk.
3. Note the **currently-deployed** media image tag (rollback target).

### The window
1. **Apply `00521` to prod** — `supabase db push` (linked Strata). Catalog-only DDL on
   **7 empty tables** → sub-second; ACCESS EXCLUSIVE locks held for microseconds. The
   migration's verify block confirms the snake_case shape or aborts.
2. **Immediately deploy the pre-built snake_case image** to the media Container
   (`cd infra/media-worker && npx wrangler deploy`, or the established media-svc-worker
   deploy path).
3. **Smoke:** `GET /health` → 200; then an authenticated data route that hits the DB
   (e.g. `/v1/media/stats/overview`) → expect a real 200/empty result, **not** a 500
   with `42P01`/`42703`. (The container does **not** migrate on boot —
   `infra/nestjs-entrypoint.sh` only runs `CREATE SCHEMA IF NOT EXISTS` then
   `node dist/main.js` — so the deploy is a plain image swap.)

### Rollback (pre-staged, drilled target < 5 min)
1. `psql "$STRATA_DIRECT_URL" -v ON_ERROR_STOP=1 -f docs/engineering/svc-media-shape-reconciliation.reverse.sql`
   (renames snake_case → Prisma-default; catalog-only on empty tables → sub-second).
2. Redeploy the previous media image tag.
3. Re-smoke `/health` + one data route.

### Follow-on (separate, after the shape lands — NOT part of the window)
Once `svc_media` is snake_case, `services/media/scripts/migrate-deploy.sh` becomes
runnable: its baseline preflight already checks `to_regclass('svc_media.media_assets')`,
`…asset_kind`, etc. (all snake), then `prisma migrate resolve --applied
20260803180000_existing_schema_baseline` + `prisma migrate deploy` to add the
`background_removal_requests` ledger (absent on prod today). That is a distinct change
with its own review — it is **not** what `00521` does.

### Exposure quantification

- **All 7 prod `svc_media` tables are empty (0 rows).** The media service has never
  persisted an asset to prod; R2 is effectively unused (census: `patina-raw` 0 objects,
  `patina-processed` 1×10-byte smoke artifact). So the rename rewrites no data and the
  data-plane blast radius is **effectively nil**.
- **Does the running prod container break the instant the rename lands?** If it is
  serving a Prisma-**default**-shaped client, yes — every DB-bearing route would
  `42P01`/`42703` from the rename until the snake_case image is deployed. If it is
  already serving a snake_case client (the committed/generated client in the repo is
  snake_case — see the discrepancy note below), it is *already* unable to query prod's
  PascalCase tables today, and `00521` + redeploy **fixes** it. Either way the fix is
  the same swap.
- **Net exposure:** the migrate→deploy gap only. With **0 rows and no real media
  traffic**, even a multi-minute gap has no data-plane impact; the < 5 min target is
  comfortable. The only user-visible surface that could touch `svc_media` mid-gap is a
  media data route returning 5xx — and none carry live data today.

---

## 7. Known residuals (out of scope for this casing rename — documented, not fixed)

These are pre-existing, **non-casing** divergences between prod and local that `00521`
deliberately does **not** touch (it renames names only). The regenerated Prisma Client
tolerates all of them at runtime; none block the deploy:

1. **`id` column type:** prod `id` is `text`; local/`00053` `id` is `uuid`. Prisma
   models `id` as `String` (→ text), so prod actually matches the *client*; local's
   `uuid` is the outlier. Prisma's client-generated uuid strings insert into either.
   Not a casing issue; not changed.
2. **Timestamp type:** prod columns are `timestamp(3) without time zone`; local/`00053`
   are `timestamptz`. Runtime-tolerated. Not changed.
3. **Unique-key object kind:** prod's 5 `@unique` keys are **bare unique indexes**;
   local's are **unique constraints**. `00521` renames names on both but does not
   convert kind (a rename cannot). Uniqueness is enforced identically. Not changed.
4. **`updated_at` triggers:** local/`00053` attach `set_updated_at` BEFORE-UPDATE
   triggers on 4 tables; **prod has none** (Prisma sets `updatedAt` in app code). Not a
   casing issue; not added (adding triggers to prod would change write behavior).
5. **`background_removal_requests` / its 2 enums:** present in the source schema and in
   `services/media/prisma/migrations`, **absent on prod**. Added by the follow-on
   `migrate-deploy.sh`, not by `00521`.
6. **Discrepancy vs the brief:** the brief states the committed generated client is
   "Prisma-default-shaped and matches PROD". In this tree the generated client
   (`services/media/src/generated/prisma-client/schema.prisma`, untracked, regenerated
   from source) is **snake_case**. This does not change the migration (any built image
   is snake_case regardless), but it means the currently-deployed container may already
   be unable to query prod — strengthening, not weakening, the case for reconciliation.

---

## 8. What was NOT done (per task scope)

- **Not applied anywhere.** No `supabase db push`; no prod/staging mutation. All prod
  interaction was read-only SELECT.
- **Reverse** is pre-staged as a file outside `supabase/migrations/` so `db reset`
  never auto-applies it.
- Column **types**, unique-key **kind**, and missing **triggers** were intentionally
  left (see §7) — this is a casing reconciliation, not a full prod↔local structural
  equalization.
- The follow-on Prisma `migrate-deploy.sh` (background-removal ledger) is **not** run
  here.

This plan and its migrations go to **adversarial review** before any prod window.
