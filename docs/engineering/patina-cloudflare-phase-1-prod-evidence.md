# Patina Cloudflare — Phase 1 Production Deployment Evidence

**Pass:** `phase1-close` production go (gates G2 → G6, executed in one session)
**Date:** 2026-08-18 (UTC)
**Verdict:** ✅ **PROMOTED to the Phase-1 target (hyperdrive/100) on production.** Migrations
`00481`–`00486` are applied to Strata, the three prod Hyperdrive bindings are provisioned against
the direct endpoint, `patina-edge-api` is live on the `api.patina.cloud` route, the shadow rung
produced 51/51 clean triple-digest matches, the rollback drill restored legacy in **5 seconds**, and
the resting deployment serves the public catalog from Hyperdrive with legacy verification on every
request. **Production rests at hyperdrive/100** (`b40c903a`, 2026-08-18T23:13:27Z).

This record follows the Evidence-record fields in
`docs/engineering/patina-cloudflare-phase-1-runbook.md` (§ Evidence record) and mirrors the section
structure of `docs/engineering/patina-cloudflare-phase-1-staging-evidence.md`. No secrets,
connection strings, JWTs, cookies, passwords, SQL parameters, signed URLs, or PII are stored here.

**Verification convention.** Facts re-verified read-only while writing this record (git log,
`wrangler deployments list` / `hyperdrive list` / `secret list`, live unauthenticated HTTP probes,
read-only `SELECT`s against Strata) are marked ✔ **re-verified**. Facts that are transcripts of the
pass itself and are not observable read-only after the fact are marked **[unverified-transcribed]** —
they are recorded, not re-proven.

---

## 1. Reviewed source

| Field | Value |
| --- | --- |
| Branch | `main` |
| Migration-fix commit | `2d6e9063` — `fix(db): resolve svc_* identifier casing in 00482 against the live shapes` ✔ re-verified |
| Prod wiring commit | `3784314b` — `chore(edge-api): wire production Hyperdrive bindings and webhook-safe proxy timeout` ✔ re-verified |
| Rung-2 commit | `bd826f64` — `chore(edge-api): promote prod catalog source to shadow (rung 2)` ✔ re-verified |
| Rung-3 (resting) commit | `c51b5360` — `chore(edge-api): promote prod catalog to hyperdrive/100 (rung 3)` ✔ re-verified |
| Push worktree pin | pinned at `dfaa61c7` (merge of PR #29, `feat/edge-api-auth-path`) + cherry-picked fix `68396343` (same patch as `2d6e9063` on main) ✔ both SHAs re-verified |
| Worker | `patina-edge-api` · account `be3aaeed18a81b5d90ee2263b62219ea` · env `production` |
| Public origin | `https://api.patina.cloud` (Worker route) — **no** `*.workers.dev` origin (§5) |
| Config on disk | `infra/edge-api-worker/wrangler.jsonc`, `env.production`: `CATALOG_SOURCE=hyperdrive`, `CATALOG_HYPERDRIVE_PERCENT=100`, three Hyperdrive bindings, `workers_dev: false` — matches the resting deploy ✔ re-verified |

## 2. Production database — migrations (gate G2)

Target: prod Strata `bkvcixdmuyejfzcijpdg`. **Never** the staging project `vuesoyhfrjabfxbrzekd`.

### 2.1 Ledger state going in, and the repair

Prod's ledger stood at `00480` plus **two out-of-band timestamp rows** left by the mood-board RLS
hotfix applied earlier the same day (~17:52 UTC). Those rows were placeholders for DDL already
present in the database, and would have made a normal `db push` unrepresentable.

```
supabase migration repair --status reverted 20260818175241 20260818175514
```

This is a **metadata-only** operation — it removes ledger rows, it does not revert DDL. ✔
**re-verified:** MCP `list_migrations` against `bkvcixdmuyejfzcijpdg` now returns only `NNNNN`
slug versions; neither timestamp row is present. **[unverified-transcribed]** — the repair command
invocation itself.

### 2.2 First push attempt failed at `00482`, and what that exposed

The first `supabase db push` from the pinned worktree **failed at `00482` statement 12** with
SQLSTATE `42703` (`column "created_at" does not exist`): the statement was
`CREATE INDEX … ON svc_orders.orders (organization_id, created_at DESC)`, and prod spells that
column `"createdAt"`. The failing migration rolled back atomically; the ledger stopped at `00481`.
**[unverified-transcribed]** — the push transcript. ✔ **re-verified:** the ledger's contiguity and
the eventual index shape (§2.3) are consistent with exactly this sequence.

> ### 🔴 Root-cause discovery — production's `svc_*` schemas are Prisma-default-shaped
>
> The failure was not one column. **Prod's retained-service schemas were provisioned by
> `prisma db push` from a schema revision predating the `@map`/`@@map` annotations now in
> `services/*/prisma/schema.prisma`.** They therefore carry Prisma's *default* identifiers:
> `svc_media."MediaAsset"`, `"AssetKind"`, `"productId"`, `"createdAt"`, and **no**
> `svc_orders.set_updated_at()`.
>
> `supabase/migrations/00052`–`00054` declare those schemas in **snake_case**, and local, CI, and
> staging stacks are all built by replaying migrations — so all three carry snake_case.
> **Prod's ledger records `00052`–`00054` as applied, but they never shaped those objects.**
>
> **Consequence, and the standing rule this pass establishes: STAGING IS NOT A VALID REHEARSAL
> SURFACE FOR `svc_*` DDL.** A migration touching `svc_orders` / `svc_media` / `svc_projects` that
> passes on staging proves nothing about prod. Every future `svc_*` migration must either use
> catalog-resolving dynamic DDL or run a prod-catalog preflight before push.
>
> ✔ **re-verified read-only against prod:** `svc_media` holds `MediaAsset`, `AssetRendition`,
> `LicenseRecord`, `ProcessJob`, `ThreeDAsset`, `UploadSession` (PascalCase) alongside
> `outbox_events`; `pg_get_indexdef` for the new orders index reads
> `… USING btree (organization_id, "createdAt" DESC) WHERE (organization_id IS NOT NULL)`.

### 2.3 The fix, and the resumed push

Fix commit `2d6e9063` (on `main`; cherry-picked into the push worktree as `68396343`) rewrites
`00482`'s three `svc_*` blocks as **catalog-resolving dynamic DDL** — each block resolves the live
identifier before emitting SQL, so it applies correctly on either shape. ✔ **re-verified:** `00482`
now resolves `to_regclass('svc_media."MediaAsset"')` vs `to_regclass('svc_media.media_assets')`,
and selects `attname IN ('createdAt','created_at')` / `('productId','product_id')` with an explicit
Prisma-first `ORDER BY`, driving six `format()`-built statements.

The rewrite was **proven against a prod-shaped local fixture with rollback** before the resumed
push. **[unverified-transcribed]** — the fixture run.

The resumed push applied **`00482` → `00486` clean**. ✔ **re-verified:** prod ledger head is
`00486_public_acl_residual_closure`, with `00481_edge_catalog_roles`,
`00482_retained_service_authorization_contract`, `00483_public_acl_allowlist`,
`00484_public_rpc_authorization_contract`, `00485_moodboard_storage_caller_binding` all present.

### 2.4 Post-push object verification (against prod's real shapes)

All rows below ✔ **re-verified** by read-only `SELECT` against `bkvcixdmuyejfzcijpdg`.

| Object | Expected | Observed on prod |
| --- | --- | --- |
| `svc_orders` index | `idx_orders_organization_created` | present — `btree (organization_id, "createdAt" DESC) WHERE organization_id IS NOT NULL` (Prisma casing resolved) |
| `svc_orders.stripe_webhook_receipts` | table + updated-at trigger | table present; trigger `set_stripe_webhook_receipts_updated_at` present |
| `svc_orders.set_updated_at()` | created by `00482` (absent on prod before) | present |
| `svc_media."MediaAsset".project_id` | column added | present |
| `media_assets_single_owner` | CHECK constraint | present |
| `svc_media` owner index | added alongside the CHECK | present |
| `edge_catalog_reader` | NOLOGIN, NOBYPASSRLS | `login=false bypassrls=false` |
| `edge_rls_user` | NOLOGIN, NOBYPASSRLS | `login=false bypassrls=false` |

### 2.5 Public-ACL conformance gate — GREEN

The gate is `supabase/tests/edge_api/catalog_roles_remote_conformance_test.sql`, which `\ir`s
`public_acl_exception_registry.sql` and asserts **15 counters are all zero**. ✔ **re-verified**
against the files on `main`: the counters are exactly `missing_roles`, `missing_surfaces`,
`role_shape`, `database_acl`, `schema_acl`, `relation_acl`, `column_acl`, `surface_shape`,
`sequence_acl`, `routine_acl`, `membership_acl`, `default_acl`, `capability_acl`, `writable_acl`,
`policy_acl`, and the gate raises a division-by-zero (a portable nonzero exit that exposes no
catalog identifier and mutates nothing) if any is nonzero.

**Run as an "adapted gate."** Prod has no psql meta-command transport through the CLI path used, so
the gate ran via `supabase db query --linked --file` with the registry **inlined verbatim** in place
of the `\ir`, and the `\gset`-driven verdict block adapted. **`BEGIN READ ONLY` was preserved** and
no assertion line was modified. **Result: GREEN — all 15 counters zero.**
**[unverified-transcribed]** — the run itself and the pass's count of **1,828 unmodified assertion
lines**; ✔ for scale, the two files measure 1,431 (registry) + 410 (test) = 1,841 lines on `main`,
consistent with that count after the meta-command lines are dropped.

**Registry exceptions.** The registry carries **Kody's two signed `graphql` exception rows**
(EVENT 4, `accepted_by = kody`, `2026-08-18`): `graphql.get_schema_version()` and
`graphql.increment_schema_version()` — `supabase_admin`-owned, SECURITY DEFINER, prod-only platform-
image divergence (absent on staging), `postgres` is not the grantor and cannot revoke them. Worst
case is pg_graphql schema-version counter churn with no data path. ✔ **re-verified** — both rows are
present in `public_acl_exception_registry.sql` with that rationale and attribution. The revoke ask
rides on Kody's Supabase support ticket alongside `net.*`.

**Transport note.** One request returned a transport **502 with no verdict** and was retried; the
retry returned the green verdict. A 502 is not a gate result. **[unverified-transcribed]**

**Negative control.** The paired negative-control test
(`catalog_roles_remote_conformance_negative_test.sql` — the proof that the gate can fail) was **not
re-run on prod**; its proof stands from the local and staging runs. Deliberate: the negative control
perturbs ACLs.

## 3. Provisioning — roles, Hyperdrive, secrets, config (gate G3)

### 3.1 Out-of-band login roles

Created via `supabase db query` (not a migration — login roles with passwords must never be
committed):

| Role | Shape | Membership |
| --- | --- | --- |
| `edge_catalog_login` | `LOGIN INHERIT NOBYPASSRLS` | member of `edge_catalog_reader`, `INHERIT TRUE` / `SET FALSE` |
| `edge_rls_login` | `LOGIN NOINHERIT NOBYPASSRLS` | member of `edge_rls_user`, `INHERIT FALSE` / `SET TRUE` |

✔ **re-verified:** both roles exist on prod with `rolcanlogin = true`, `rolbypassrls = false`. The
membership `INHERIT`/`SET` flags are **[unverified-transcribed]** (the observable consequence — the
catalog read works and `/v1/_authcheck` fail-closes — is covered in §6/§7).

Passwords were agent-generated and are **not recorded anywhere in this repo**. **Rotating both is
Kody's standing item** (§9).

### 3.2 Hyperdrive configurations

All three point at Strata's **direct endpoint** (`db.<ref>.supabase.co:5432`) — **never the pooler**.
✔ **re-verified** via `wrangler hyperdrive list`.

| Binding | Config ID | Name | Origin role | Cache mode |
| --- | --- | --- | --- | --- |
| `DB_FRESH` | `f19990d0765043ff842bd95e52875edd` | `strata-prod-fresh` | `edge_rls_login` | **caching disabled** |
| `DB_CATALOG_FRESH` | `3832e8f8857549c1bfb76a8f2f42f2ec` | `strata-prod-catalog-fresh` | `edge_catalog_login` | **caching disabled** |
| `DB_PUBLIC_CACHE` | `b55e02bfab174b08ada96892acae2618` | `strata-prod-public-cache` | `edge_catalog_login` | **max_age 60 / swr 15** |

> #### Investigated finding — the `max_age: undefined` listing artifact is **not** a misconfiguration
>
> `wrangler hyperdrive list` renders `strata-prod-public-cache` as
> `max_age: undefined, stale_while_revalidate: undefined`, which reads like the cache settings never
> landed. They did. **60 / 15 *is* the Hyperdrive platform default, and both wrangler and the raw
> Cloudflare API elide values equal to the default** — so a correctly-configured 60/15 config is
> indistinguishable in a listing from one that was never set.
>
> Proven by writing non-default probe values (which then *do* display) and by a direct API `PATCH`.
> **[unverified-transcribed]** — the probe sequence. ✔ **re-verified corroboration:** the *staging*
> config `strata-staging-public-cache`, which the staging evidence records as 60/15 and which has
> served a full ladder, shows the **identical** `undefined` artifact in the same listing. Both
> uncached configs correctly show `disabled`, so the renderer distinguishes "off" from "default".

### 3.3 Secrets

Set on `--env production`; **names only**, no values anywhere in this record. ✔ **re-verified** via
`wrangler secret list --env production`:

- `SUPABASE_ANON_KEY`
- `HEALTH_SERVICE_TOKEN_ID`
- `HEALTH_SERVICE_TOKEN_SECRET`

> **Worker-shell note.** `wrangler secret put` **auto-created the `patina-edge-api` Worker shell**
> before any code was deployed. ✔ **re-verified:** the oldest row in
> `wrangler deployments list --env production` is a `Secret Change` at **2026-08-18T20:12:12Z** —
> i.e. the Worker's first-ever version predates its first code deployment. The shell was verified
> unreachable while it existed: `workers_dev: false` and zero routes. **[unverified-transcribed]** —
> the zero-routes check at that moment; ✔ the `workers_dev` half is re-verified live in §5.

### 3.4 Config commit

`3784314b` wires `env.production`: the three Hyperdrive bindings, plus
**`COMPATIBILITY_FETCH_TIMEOUT_MS` 10000 → 30000**. ✔ **re-verified** in the committed
`wrangler.jsonc`, carrying its rationale comment inline:

> review finding **W-1** — a 10 s proxy abort in front of `stripe-webhook` (synchronous DB writes +
> email sends) risks **silent event loss** inside Stripe's ~30 s delivery window.

### 3.5 Interruption and idempotent resume

Provisioning was interrupted once by a session restart. It resumed **idempotently**: roles, the
Hyperdrive configs, and the anon key had landed pre-restart; the cache fix, the health-token pair,
and the `wrangler.jsonc` wiring were completed post-restart. **[unverified-transcribed]** — the
sequencing. ✔ the end state is re-verified throughout §3.

## 4. Worker deployment timeline

`wrangler deployments list --env production` (oldest-first; newest = bottom row). ✔ **every row
below re-verified** against the live listing.

| Version ID | Created (UTC) | Source | Rung / action |
| --- | --- | --- | --- |
| `b86f0ec3-914f-4e44-876b-fb64124296ed` | 2026-08-18T20:12:12Z | Secret Change | **Worker shell auto-created** by the first `secret put` (§3.3) |
| `35672600-4665-4e26-beb0-21bb9d724a79` | 2026-08-18T20:34:48Z | Secret Change | health service token — id |
| `e91fb004-5d83-4588-8b80-9068a2955607` | 2026-08-18T20:34:49Z | Secret Change | health service token — secret |
| `af26ab6c-51f3-40f2-a2ea-8510c592ffcb` | 2026-08-18T21:08:47Z | deployment | **Code deployed, no route attached** — the pre-attach control point (§5) |
| `e4e2ce45-41e4-4853-8790-bfe66a2d5500` | 2026-08-18T21:10:18Z | deployment | **Route attach** — `api.patina.cloud` (§5) |
| `3e879473-e07e-4274-8b5f-1a3552952109` | 2026-08-18T21:41:21Z | deployment | **Rung 2 (shadow)** — `CATALOG_SOURCE=shadow`, percent 0 (§6) |
| `fd1175b1-2cd2-4be4-9b25-f9c19c7d5845` | 2026-08-18T22:47:01Z | deployment | **Rollback drill → legacy** (§8) |
| `e9b40970-402d-4b00-88a1-98721c890c7c` | 2026-08-18T22:48:29Z | deployment | Restore → shadow (post-drill) |
| `34e27858-7501-4bab-820d-c36ac8e2f0c1` | 2026-08-18T22:50:41Z | deployment | **Rung 3 Level 1** — hyperdrive @ 10% (§8) |
| `b40c903a-88e6-4495-b8ab-44105e07bddd` | 2026-08-18T23:13:26Z | deployment | **Rung 3 hyperdrive/100 — final resting state (bottom row)** |

## 5. Route attach — `api.patina.cloud` (gate G4)

### 5.1 Pre-attach discovery — the planned byte-compare baseline was void

The runbook's route-attach gate assumes a live "before" to byte-compare against. There was none.

> **`api.patina.cloud` had been serving a Cloudflare 403 / `error 1014` (CNAME Cross-User Banned) on
> ALL paths.** It was a grey-cloud CNAME pointed at `supabase.co`, which Cloudflare refuses to
> resolve cross-account. **Nothing has ever been served behind that hostname for its entire
> existence.**

Two corroborating observations, both consistent and both important:

- The Worker's first-ever deployment is 2026-08-18T20:12Z (✔ re-verified, §4) — nothing of ours
  could have been answering there earlier.
- Vault `app.settings.supabase_url` holds the **direct** Strata URL, so pg_cron / edge-function
  callers were never routed through the dead hostname and were never affected.

**[unverified-transcribed]** — the pre-attach 403/1014 observation and the Vault read (both describe
state that the attach itself replaced).

**Substituted control.** With no valid "before", the pass compared **worker-proxied vs
direct-to-Strata, side by side**, on five upstream classes:

| Path | Result — proxied vs direct |
| --- | --- |
| `/auth/v1/health` | **byte-identical** 401 |
| `/rest/v1/` | **byte-identical** 401 |
| `/functions/v1/stripe-webhook` (garbage signature) | **byte-identical** 400 `invalid_signature` — *from the function*, not the proxy |
| `/functions/v1/sms-inbound` (bogus signature) | **byte-identical** 403 — from the function |
| `/storage/v1/…` (`NoSuchBucket`) | **byte-identical** 400 |

✔ **re-verified live while writing this record:** `GET https://api.patina.cloud/auth/v1/health` and
`GET https://bkvcixdmuyejfzcijpdg.supabase.co/auth/v1/health` both return **401** with response
bodies whose SHA-256 digests are **identical**
(`65836ea867f252ca97d809516c54b6a21cb0c1757dca5ba3887edd0f9d84c261`). The other four rows are
**[unverified-transcribed]**.

### 5.2 The attach

| Field | Value |
| --- | --- |
| Pre-attach deploy | `af26ab6c` — code live, **no route** ✔ re-verified in the timeline |
| Attach | 2026-08-18T21:10:23Z → version `e4e2ce45` ✔ version re-verified (listing records created 21:10:18.822Z / deployed 21:10:19.634Z); the 21:10:23Z API-call timestamp is **[unverified-transcribed]** |
| Route id | `26b4f3a17ceb4c5c9680ea54139bd40d` **[unverified-transcribed]** |
| Zone id | `4a5cbb5d1caedd53735532807b75575c` **[unverified-transcribed]** |
| Propagation | ~45 s to first interception **[unverified-transcribed]** |

The route is attached **out of band, not committed** — `validate-config.mjs` forbids a committed
`routes` key, so a rollback is a route delete and never a config revert. ✔ re-verified: no `routes`
key exists in `wrangler.jsonc`.

### 5.3 Interception proof

`GET /_internal/health` with the service token returned **200** on the legacy contract:
`fresh: ok`, `publicCache: ok`, `catalogFresh: not_applicable` (the catalog-fresh leg is only read
in shadow). **[unverified-transcribed]** — requires the health token.

✔ **Re-verified interception, unauthenticated, live:**

- `GET https://api.patina.cloud/nonsense/path` → **404** `{"error":"not_found"}` — the **Worker's
  own** non-enumerating 404, not an upstream body and not a Cloudflare error page.
- `GET https://api.patina.cloud/v1/catalog/products?ids=<valid-nonexistent-uuid>` → **200** `[]` —
  a route that exists **only** in the Worker. Strata has no such path.
- `GET https://api.patina.cloud/_internal/health` (no token) → **404** — fail-closed, non-enumerating.
- `GET https://api.patina.cloud/v1/_authcheck` (no bearer) → **404** — fail-closed.

### 5.4 Prod-go blocker #1 — the second unprotected origin — closed in reality

`workers_dev: false` is committed for `env.production`, but committed intent is not proof. ✔
**Re-verified live:** `https://patina-edge-api.kody-be3.workers.dev/nonsense/path` returns
**HTTP 404 with body `error code: 1042`** — Cloudflare's "no Worker is registered at this
workers.dev hostname". There is exactly **one** origin fronting prod Supabase, and it is the
`api.patina.cloud` route inside the `patina.cloud` zone.

### 5.5 Redaction posture — closed, with one signed residual

- **Persisted logs: closed.** `observability.logs.invocation_logs: false` is committed for every
  env, suppressing the Cloudflare platform channel that would otherwise persist full request URLs
  (`/auth/v1/verify?token=<OTP>`, `/rest/v1/…?email=…`) into Workers Logs. ✔ re-verified in
  `wrangler.jsonc`. This closes the third prod-go blocker (observability logging OTPs + PII).
- **Header secrets: redacted.** The Cloudflare tail envelope redacts header secrets.
  **[unverified-transcribed]**
- 🟡 **RESIDUAL (accepted, platform behavior).** A **live** `wrangler tail` session still shows
  **full URLs including query strings**, and `cf-access-client-id` displays **unredacted**, to any
  holder of the `workers_tail` permission. This is Cloudflare platform behavior and **cannot be
  configured away**. It is a live-session-only exposure — nothing is persisted. Mitigation is
  operational: keep secrets out of query strings, and treat `workers_tail` as a privileged grant.
  **[unverified-transcribed]**

### 5.6 Rollback pre-stage and watch

A route-delete one-liner was pre-staged before the attach and **exercised as a no-op**; it was never
needed. The route was then watched for **~11.5 minutes**, during which exactly **1 organic request**
arrived — an internet scanner, answered with the Worker's 404. **[unverified-transcribed]** — both.

This near-zero organic traffic is the reason §6's evidence is explicitly synthetic-only.

---

## 6. Rung 2 — shadow: `legacy == fresh == cached` on production (gate G5)

This is the single most important check in the pass. Deployed as `3e879473` ✔ (§4),
`CATALOG_SOURCE=shadow`, percent 0 — every request is **served from legacy** while the fresh and
cached Hyperdrive legs are compared in `ctx.waitUntil`.

Health at this rung was all-ok — `catalogFresh` flipped from `not_applicable` to **`ok`**, which is
itself the proof that the shadow fresh leg (`DB_CATALOG_FRESH`) is actually being read.
**[unverified-transcribed]**

**Probe set — 51 served requests over the full ID space**, plus 2 malformed controls:

- the 1 real catalog row on prod (`a7fa2107-…`)
- 11 non-catalog products (rows that exist in `products` but are excluded by the catalog view)
- valid-but-nonexistent UUIDs
- a 50-id batch (the upper bound)
- duplicate ids
- 2 malformed requests → **400**, and correctly **no shadow event** (rejected before any DB call)

| Event | Count |
| --- | --- |
| `edge_api_catalog_shadow_match` | **51** |
| `edge_api_catalog_shadow_mismatch` | **0** |
| `edge_api_catalog_hyperdrive_failure` | **0** |

**Digests were triple-equal on every event** — `legacyDigest == freshDigest == hyperdriveDigest`,
verified programmatically across all 51. Two distinct digest classes appeared, exactly as the probe
design predicts:

| Digest | Events | Counts (legacy/fresh/cached) | Meaning |
| --- | --- | --- | --- |
| `fdeac5c9` | 16 | 1 / 1 / 1 | the single real catalog row |
| `741638a5` | 35 | 0 / 0 / 0 | empty result — nonexistent and non-catalog ids |

**The non-catalog leg is the load-bearing negative.** All 11 non-catalog product ids returned `[]`
on **all three** legs. The Hyperdrive view's filter behaves identically to legacy's RLS behavior —
promoting the catalog source cannot leak a row the legacy path would have withheld.

**`/v1/_authcheck` — partial.** The negative probes are proven: no-auth, garbage bearer, and wrong
method all return **404** ✔ (the no-auth leg re-verified live in §5.3). The **positive 200 leg is
NOT proven on prod** — it needs a real prod JWT, and the only prod account is `super_admin` on
magic-link-only sign-in. The role chain (`edge_rls_login` → `edge_rls_user` → `authenticated`) was
verified structurally instead. **This is OWED, not deferred** (§9).

**Evidence class.** All 51 requests are **synthetic** — the route carries ~zero organic traffic
(§5.6). This is a real limitation of the prod evidence and is stated rather than papered over: the
comparison logic is proven exhaustively over the full ID space, but not against organic client
traffic shapes.

**[unverified-transcribed]** — all counts, digests, and the probe transcript in this section; ✔ the
deployment version and the config that produced it are re-verified.

Rung-2 commit: `bd826f64` ✔.

## 7. Verification matrix

Run against the deployed production worker on the `api.patina.cloud` route.

| Area | Result | Evidence |
| --- | --- | --- |
| **Auth — sign-in / refresh / OAuth / expired / issuer / audience** | ◻️ **DEFERRED** (Kody's ruling) | Requires driving real auth flows against live prod. Ruled out: the knowledge value does not exceed the cost of exercising prod auth. The compat path is proven **byte-identical** to direct upstream on `/auth/v1/*` (§5.1, ✔ re-verified live for `/auth/v1/health`), which is what the proxy is responsible for. |
| **Claims — pooled `SET LOCAL ROLE` isolation** | ◻️ **DEFERRED** (Kody's ruling) | A two-user RLS data-isolation probe needs two real prod sessions. Deferred on prod. Code-level: `BEGIN` + `SET LOCAL ROLE` + `set_config(…, true)` are transaction-local by construction; `/v1/_authcheck` fail-closes to 404 on any failure (✔ re-verified live, no-auth leg). |
| **Catalog — full ID space** | ✅ **PASS** | 51 served requests: 1 real row, 11 non-catalog, nonexistent uuids, 50-id batch, duplicates → all correct; 2 malformed → 400 with no shadow event (§6). ✔ re-verified live: a valid-nonexistent uuid returns 200 `[]` on the route. |
| **Sources — legacy = fresh = cached** | ✅ **PASS** | **51/51** `shadow_match`, **0** mismatch, **0** `hyperdrive_failure`, digests **triple-equal on every event** (`fdeac5c9`×16 at counts 1/1/1; `741638a5`×35 at counts 0/0/0). Non-catalog ids `[]` on all three legs (§6). |
| **REST passthrough** | ✅ **PASS** | Worker `/rest/v1/` 401 **byte-identical** to direct-to-Strata 401 (§5.1). |
| **Functions passthrough** | ✅ **PASS** | `stripe-webhook` garbage-sig → 400 `invalid_signature` **from the function**; `sms-inbound` bogus-sig → 403 from the function — both byte-identical to direct (§5.1). Strengthened by §10: a **real Stripe-scheme HMAC signature survives the hop** and yields 200 through the proxy. |
| **Storage passthrough** | ✅ **PASS** | `NoSuchBucket` → 400, byte-identical to direct (§5.1). |
| **Realtime** | ✅ PASS (partial) | Upgrade handshake forwarded; upstream 401 without apikey. Full 101 subscribe/event/reconnect not exercised on prod (needs a live credentialed client). |
| **Proxy — interception & route-loop prevention** | ✅ **PASS** | ✔ re-verified live: unknown path → the **Worker's own** 404 `{"error":"not_found"}` (not proxied); `/v1/catalog/products` — a Worker-only route — answers 200 on the hostname. The proxy also guards upstream-origin == incoming-origin with 508. |
| **Health — token allow / anon deny** | ✅ **PASS** | ✔ re-verified live: no token → **404** (fail-closed, non-enumerating). With the service token → **200** on the legacy contract `{fresh: ok, publicCache: ok, catalogFresh: not_applicable}` **[unverified-transcribed]**; at shadow, `catalogFresh` → `ok` (§6). |
| **Failure — DB unavailable / legacy timeout / pool exhaustion** | ◻️ **DEFERRED** (Kody's ruling) | Inducing DB failures against live prod exceeds the knowledge value. Not performed (RAILS). Standing mitigation: `hyperdrive` source still reads legacy on every request and compares, so a Hyperdrive fault degrades to the legacy answer rather than a wrong answer. |
| **Logging — redaction** | ✅ PASS, with a signed residual | Persisted platform channel **closed** (`invocation_logs: false`, ✔ re-verified in config); tail envelope redacts header secrets. 🟡 Residual: a **live** `wrangler tail` shows full URLs incl. query strings and an unredacted `cf-access-client-id` to `workers_tail` holders — platform behavior, not configurable (§5.5). |

**On the deferrals.** Three rows are DEFERRED by Kody's explicit ruling — auth sign-in/refresh/OAuth,
two-user RLS isolation, and induced DB failure. The rationale is uniform: **inducing auth or DB
failures against live production exceeds the knowledge value**, and the compat path is already
proven byte-identical to the direct upstream. These are deliberate scope decisions, not gaps that
were missed.

**The `/v1/_authcheck` positive 200 leg is OWED, not deferred** — it is to be obtained via a
magic-link session at Kody's convenience.

## 8. Rollback drill, then the promotion ladder (gate G6)

### 8.1 Rollback drill — from shadow

Exercised **before** promoting, so the escape hatch was proven before it could be needed.

| Field | Value |
| --- | --- |
| Method | edit `wrangler.jsonc` → `CATALOG_SOURCE=legacy`, `PERCENT=0` → `config:check` → `wrangler deploy --env production` |
| **Wall-clock, decision → restored** | **5 seconds** (objective: 5 minutes; staging: 8 s) |
| Probe 1 — legacy body restored | ✅ **byte-identical**, body SHA-256 `96a5eaa8…` |
| Probe 2 — published-only contract | ✅ the 9-key published contract, no extra keys, nothing unpublished |
| Probe 3 — health | ✅ 200 on the legacy contract |
| Probe 4 — deployments bottom row | ✅ `fd1175b1` ✔ version re-verified in the timeline (§4) |

**[unverified-transcribed]** — the 5 s measurement and the probe bodies; ✔ the drill deployment
`fd1175b1` @ 22:47:01Z and the restore `e9b40970` @ 22:48:29Z are both re-verified in the live
deployment listing, 88 seconds apart, exactly bracketing a drill.

The worker was then **restored to shadow** (`e9b40970`) before the ladder began.

### 8.2 The ladder — compressed holds (Kody-ruled ~10 min)

**Level 1 — hyperdrive @ 10%** (`34e27858` ✔): 60 invocations, clean.

> #### Finding — the rollout cohort key is `colo : client-IP`, and it is **sticky**
>
> A percentage rollout does not resample per request. A single vantage point hashes to one bucket
> and **stays there**. This vantage hashed to bucket **80**, i.e. above the 10% cut — so Level 1
> exercised **config boot + the legacy fallback path**, not the Hyperdrive serving path.
>
> This is worth recording because it silently invalidates the naive reading of a canary ("10% ran
> clean, therefore Hyperdrive serving is proven"). It did not prove that.
>
> **Benign here, for a structural reason:** rung 3 reads legacy on **every** request and compares it
> against the Hyperdrive answer regardless of bucket. The comparison coverage is 100% at any
> percentage, so the sticky cohort delays exposure but cannot hide a mismatch. **[unverified-transcribed]**

**Level 2 — hyperdrive @ 100%** (`b40c903a` ✔, the resting version):

| Measure | Value |
| --- | --- |
| Invocations | 130 |
| Catalog 200s | 107 |
| `edge_api_catalog_shadow_match` (`legacy_vs_cached`) | **exactly 107** |
| Every failure event type (`shadow_mismatch`, `hyperdrive_failure`, `legacy_failure`, `unverified_response`) | **0** |
| Bodies byte-verified against legacy | 90 |

The 107 catalog 200s produce **exactly 107** matches — one comparison per served catalog request,
none dropped, none unverified. **[unverified-transcribed]** — the counts.

### 8.3 Two further findings from the ladder

- **Cloudflare does not edge-cache the Worker's response bodies here.** The `cache-control` the
  Worker emits binds *downstream* consumers only; it does not cause CF to serve a cached body back.
  The actual cache layer in this design is **Hyperdrive's 60/15**, not the CDN. This matters for
  reasoning about staleness: the freshness bound is Hyperdrive's, not the edge's.
- **Version propagation is rolling, ~40 s.** A deploy is not instantaneously global; the gate sweeps
  must wait for convergence or they will sample a mix of versions. **[unverified-transcribed]** — both.

### 8.4 Resting state

✔ **Re-verified:** committed `wrangler.jsonc` `env.production` reads `CATALOG_SOURCE=hyperdrive`,
`CATALOG_HYPERDRIVE_PERCENT=100`, three Hyperdrive bindings, `workers_dev: false` — committed as
`c51b5360`, matching the bottom-row deployment **`b40c903a` @ 2026-08-18T23:13:27Z**. The route
answers live (§5.3).

---

## 9. What this prod-go closed — and what it did NOT

### ✅ Closed

- **Blocker 1 (public-ACL gate)** — GREEN on prod, all 15 counters zero, with Kody's two `graphql`
  residuals signed into the registry (§2.5).
- **Blocker 2** — closed prior to this pass.
- **Migrations `00481`–`00486`** applied to Strata ✔, with the `svc_*` shape divergence found,
  root-caused, and fixed by catalog-resolving DDL (§2).
- **The Worker is live on `api.patina.cloud`** at hyperdrive/100 ✔, serving the public catalog from
  Hyperdrive with legacy verification on every request.
- **All three prod-go blockers verified in reality, not on paper:** the `workers_dev` second origin
  is **absent** (✔ error 1042, §5.4); client-IP handling and persisted-log redaction are closed via
  `invocation_logs: false` ✔ (§5.5).
- **Rollback proven at 5 seconds** against a 5-minute objective, drilled before promotion (§8.1).

### ❌ Not closed — the honest remainder

- **Portals and iOS still point at the direct Supabase URL.** Nothing was repointed. **Moving them
  through `api.patina.cloud` is a FUTURE program decision and is NOT authorized by this pass.** The
  route today carries synthetic traffic and one internet scanner.
- **Phase 2 (R2 media) — not started.** ⚠ It **inherits the `svc_*` shape-divergence constraint**:
  `svc_media` on prod is `"MediaAsset"`/`"AssetKind"`/`"productId"`/`"createdAt"`. Catalog-resolving
  DDL or a prod-catalog preflight is **mandatory** for every Phase-2 migration. Staging cannot
  rehearse it.
- **Phase 3 (capture enrichment) — not started.**
- **SD-hardening follow-on** — `docs/follow-ups/sd-hardening-w7-followon.md`, on branch
  `followon/sd-hardening-v2` (`79a0d1b5`) ✔; not on `main`.
- **FF&E receipt-batch fix-forward** — in flight this session, tracked separately.
- **`/v1/_authcheck` positive 200 probe on prod** — OWED via a magic-link session (§6, §7).
- **The client-portal canary is unexercised under real load** — no organic traffic has crossed the
  route.
- **Kody's items:**
  - Supabase support ticket — `net.*` revoke ask **and** the two `graphql` schema-version routines.
  - **Credential rotation** — the 2 DB login roles (`edge_catalog_login`, `edge_rls_login`) and the
    health service-token pair. Agent-generated values are still in force.
  - **Stripe Dashboard delivery-log review, 2026-07-20 → present** — resend / reconcile toward
    `invoice_payments` and `po_payments` (§10).
  - Disposition of the 2 synthetic rows left in `stripe_webhook_events` (§10).
- **Live-tail URL residual** — accepted, platform behavior, not configurable (§5.5).
- ⚠ **Staging `00482` shape drift** — staging applied the **snake_case** variants of `00482`'s
  `svc_*` blocks, so its `svc_*` posture now diverges from the file on `main`. **Reconcile staging at
  the next staging sync.**

---

## 10. Webhook forensics — side discovery (separate from Phase 1)

Investigated because the dead-hostname discovery (§5.1) raised the question of whether anything had
been silently failing against `api.patina.cloud`. **It had not** — but the investigation found a
real, unrelated, live bug.

### 10.1 The hostname was never in the webhook path

Both Stripe and Twilio POST to the **direct** `supabase.co` URL. Function logs show genuine
`Stripe/1.0` and `TwilioProxy/1.1` user-agents **on that host**. The dead hostname never affected
webhooks, and Twilio was healthy throughout. **[unverified-transcribed]**

### 10.2 🔴 The real bug — `stripe-webhook` was rejecting genuine deliveries

**`stripe-webhook` rejected 6 genuine Stripe deliveries on 2026-08-12 with 400
`signature-verification-failed`** — the configured `STRIPE_WEBHOOK_SECRET` did not match the
endpoint's signing secret. **[unverified-transcribed]** — the 6 rejections.

✔ **Re-verified read-only:** the most recent **genuine** processed event in
`public.stripe_webhook_events` is dated **2026-07-20**, with only 6 genuine rows total — i.e. **zero
successfully processed events since 2026-07-20**, exactly as the investigation reported.

### 10.3 Fixed the same session

Kody supplied the endpoint signing secret. `STRIPE_WEBHOOK_SECRET` was updated (digest change
verified), and the function redeployed. Cryptographic verification:

| Probe | Result |
| --- | --- |
| Garbage signature | still **400** — rejection still works; the fix did not weaken verification |
| Synthetic event, HMAC-signed with the **real** secret, **direct URL** | **200** `{"received":true}` |
| Same synthetic event, **through `api.patina.cloud`** | **200** `{"received":true}` |

The last row is **the strongest webhook-integrity proof in this record**: a real Stripe-scheme
signature survives the proxy hop intact. Any header mutation, body re-encoding, or truncation by the
Worker would break the HMAC and produce a 400. It produced a 200.

**[unverified-transcribed]** — the probe sequence. ✔ **Re-verified:** both synthetic rows
(`evt_claude_secret_verify_20260818` and `…_proxy`, type `account.updated`) are present in
`public.stripe_webhook_events` and marked processed.

### 10.4 Owed

**Kody:** review the Stripe Dashboard delivery log for **2026-07-20 → present** and resend or
reconcile toward `invoice_payments` / `po_payments`. Per the standing rule, the internal payable-state
tables are the source of truth — reconcile Stripe toward them, never the reverse. The 2 synthetic
rows above are left in place for his disposition.

---

### Appendix — how the claims in this record were re-verified

Read-only only; nothing in this list mutates prod.

- `git log -1 --format=… <sha>` for every cited commit.
- `wrangler deployments list --env production` — the full §4 timeline, oldest-first.
- `wrangler hyperdrive list` — config ids, names, origin roles, hosts (direct endpoint, port 5432),
  cache modes, and the `undefined` display artifact on both prod and staging.
- `wrangler secret list --env production` — secret **names** only.
- Unauthenticated HTTPS probes against `api.patina.cloud` (Worker 404 shape, Worker-only catalog
  route, fail-closed health and authcheck) and against
  `patina-edge-api.kody-be3.workers.dev` (error 1042).
- A live proxied-vs-direct `/auth/v1/health` SHA-256 body comparison.
- MCP read-only `SELECT`s against `bkvcixdmuyejfzcijpdg`: migration ledger, `pg_indexes` /
  `pg_get_indexdef`, `pg_trigger`, `pg_proc`, `information_schema.tables` / `.columns`,
  `pg_constraint`, `pg_roles`, and `public.stripe_webhook_events`.
- Reads of `infra/edge-api-worker/wrangler.jsonc`,
  `supabase/migrations/00482_retained_service_authorization_contract.sql`, and
  `supabase/tests/edge_api/catalog_roles_remote_conformance_test.sql` +
  `public_acl_exception_registry.sql`.
