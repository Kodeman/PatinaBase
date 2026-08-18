# Patina Cloudflare — Phase 1 Staging Deployment Evidence

**Pass:** `phase1-close` final staging pass (agent w5c, completed by w5c2)
**Date:** 2026-08-18 (UTC)
**Verdict:** ✅ **PROMOTED to the Phase-1 target (hyperdrive/100).** The `DB_FRESH` shadow
blocker (§6) was resolved by repointing the fresh Hyperdrive config to the catalog reader
role; rung 2 (shadow) then produced clean `legacy == fresh == cached` evidence, rung 3
(hyperdrive/100) serves the public catalog from Hyperdrive with legacy parity, and the
config-flip rollback drill met its SLO. **Staging rests at hyperdrive/100.**

> **Prior state (superseded):** w5c's pass halted at ⛔ NOT PROMOTED because `DB_FRESH`
> connected as `edge_rls_login`, which has no `SELECT` on `public.edge_catalog_products`
> (§6). w5c2 was authorized (by Kody) to repoint `DB_FRESH` to the catalog reader as the
> interim design and finish the ladder. This record reflects the resolved state throughout;
> §6 documents the fix.

This record follows the Evidence-record fields in
`docs/engineering/patina-cloudflare-phase-1-runbook.md` (§ Evidence record). No secrets,
connection strings, JWTs, cookies, SQL parameters, signed URLs, or PII are stored here.
Every claim cites a command that was actually run.

---

## 1. Reviewed source

| Field | Value |
| --- | --- |
| Branch | `phase1-close/staging-ready` |
| Reviewed commit SHA | `7ab7007822fdadf58f7d657e572bc648aaa6fad9` (`chore(edge-api): wire staging Hyperdrive bindings`) |
| Worker | `patina-edge-api-staging` · account `be3aaeed18a81b5d90ee2263b62219ea` · env `staging` |
| Worker URL | `https://patina-edge-api-staging.kody-be3.workers.dev` |
| Config on disk | `infra/edge-api-worker/wrangler.jsonc`, staging block ends at `CATALOG_SOURCE=hyperdrive`, `CATALOG_HYPERDRIVE_PERCENT=100` (matches the resting deploy) |

## 2. Staging database

| Field | Value |
| --- | --- |
| Supabase branch project ID | `vuesoyhfrjabfxbrzekd` (staging; **never** prod `bkvcixdmuyejfzcijpdg`) |
| Migration set | `00481`–`00486` applied |
| MCP versioning note | MCP `list_migrations` reports these under **timestamp** versions, not the `NNNNN` slugs: `20260818072756`=00481_edge_catalog_roles · `20260818072900`=00482 · `20260818074342`=00483 · `20260818075013`=00484 · `20260818075051`=00485 · `20260818075143`=00486_public_acl_residual_closure |
| Seed | 14 published catalog products present in `public.edge_catalog_products` (read-only `SELECT` verified) |

## 3. Hyperdrive configuration

| Binding | Config ID | Name | Origin role | Cache mode |
| --- | --- | --- | --- | --- |
| `DB_FRESH` | `5cda0d8adbd346febf2f8d528cfaea4e` | `strata-staging-fresh` | `edge_catalog_login` (**repointed** — was `edge_rls_login`) | **caching disabled** (uncached) |
| `DB_PUBLIC_CACHE` | `114f7421d13e487eb023e144b90e58d5` | `strata-staging-public-cache` | `edge_catalog_login` | **caching enabled** (max-age 60 / swr 15) |

Source: `wrangler hyperdrive get <id>` (connection details deliberately omitted from this record).
Config IDs are unchanged — the repoint used `wrangler hyperdrive update <id> --connection-string=…`
(see §6). Both configs now authenticate as `edge_catalog_login`; its password was rotated during the
repoint so both configs carry the current credential (secret value not recorded here).

## 4. Worker deployment timeline (this pass)

`wrangler deployments list --name patina-edge-api-staging` (oldest-first; newest = bottom row).

| Version ID | Created (UTC) | Source | Rung / action |
| --- | --- | --- | --- |
| `54b39fca-196e-46cb-a178-f314380f35ba` | 2026-08-18T09:47:39Z | deployment | **Rung 1 (legacy)** — pre-existing (w5b); baseline probed here |
| `557a407b-38d0-4bf4-b11b-6a4ed5580a8f` | 2026-08-18T10:15:05Z | Secret Change | Health token **rotation** — `HEALTH_SERVICE_TOKEN_ID` |
| `85094dbd-e7fd-4802-bda1-55c5384bf9e5` | 2026-08-18T10:15:07Z | Secret Change | Health token **rotation** — `HEALTH_SERVICE_TOKEN_SECRET` |
| `8961e9c9-78ea-4357-8b17-cc8e5bd2e9c4` | 2026-08-18T10:15:49Z | deployment | **Rung 2 (shadow)** — w5c first attempt (blocked; see §6) |
| `0fbe766b-cb42-42d5-95d7-402f5f605497` | 2026-08-18T10:24:50Z | deployment | Rollback → legacy — w5c's safe resting handoff |
| — (Hyperdrive config change) | 2026-08-18T10:39:07Z | `hyperdrive update` | **`DB_FRESH` repointed** to `edge_catalog_login` uncached; `DB_PUBLIC_CACHE` credential refreshed (60/15 cache) |
| `0a421b34-5d1f-4e75-9c70-62f4a4e8ff31` | 2026-08-18T10:39Z | deployment | **Rung 2 (shadow) — re-run (w5c2)**, `CATALOG_SOURCE=shadow`, percent 0 — PASS (§6) |
| `79ed9d97-cb30-44a3-8787-823b22860000` | 2026-08-18T10:47:48Z | deployment | **Rung 3 (hyperdrive/100)** — `CATALOG_SOURCE=hyperdrive`, percent 100 |
| (Secret Change ×2) | 2026-08-18T10:47Z | Secret Change | Health token **re-rotation** (w5c2) — `HEALTH_SERVICE_TOKEN_ID` / `_SECRET` |
| `0fb5c0d9-e754-40e1-8558-3ce8ccd63808` | 2026-08-18T10:48:26Z | deployment | **Rollback drill → legacy** (§8) |
| `8f0f1211-f6bc-49da-9798-3e1496995db6` | 2026-08-18T10:56:19Z | deployment | **Restore → hyperdrive/100 — final resting state (bottom row)** |

> **Health-token rotation:** w5b set `HEALTH_SERVICE_TOKEN_ID`/`_SECRET`; the value was not carried
> forward to w5c or w5c2. w5c2 generated a fresh id+secret pair and set it via
> `wrangler secret put ... --env staging` (the two "Secret Change" entries above), then used it for all
> health probes below. The rotated values are held only in the session scratchpad — not in this record.
> `wrangler secret list --env staging` shows `HEALTH_SERVICE_TOKEN_ID`, `HEALTH_SERVICE_TOKEN_SECRET`,
> `SUPABASE_ANON_KEY` present.

## 5. Rung 1 → legacy baseline (reference for later comparison)

`GET /v1/catalog/products?ids=cf130000-…-0001,cf130000-…-0005,a0000000-…-0001` → HTTP 200, three
products in **ascending id order** (`a0000000-…-0001`, `cf130000-…-0001`, `cf130000-…-0005`),
`content-type: application/json`. This is the legacy result every later rung is compared against.

---

## 6. ✅ RESOLVED — `DB_FRESH` repointed; Rung 2 shadow produces legacy = fresh = cached

This is the single most important check in the pass. w5c halted here (blocker preserved below);
w5c2 applied the authorized interim fix (option **A**) and rung 2 now passes clean.

### The original blocker (w5c)

Rung 2 (shadow) deployed as `8961e9c9`, but every request logged
`edge_api_catalog_hyperdrive_failure` with `binding: "DB_FRESH"` (fallback `legacy`), and **zero**
`shadow_match`. Root cause, proven at the grant level:

- `DB_FRESH` (`strata-staging-fresh`) connected as login role `edge_rls_login`.
- `src/catalog.ts` `queryCatalogViaFresh → queryCatalogViaBinding` runs a plain
  `SELECT … FROM public.edge_catalog_products …` with **no `SET ROLE`**.
- `edge_rls_login` is a member of `edge_rls_user` (SET-ROLE-only), and `00481` deliberately
  `REVOKE ALL … FROM edge_rls_user` on the view →
  `has_table_privilege('edge_rls_login','public.edge_catalog_products','SELECT') = false`
  (re-confirmed this pass). So the direct fresh read was denied on every request.

`env.DB_FRESH` was **overloaded**: the shadow fresh read needs a direct catalog reader, whereas the
future `withAuthenticatedTransaction` path needs `edge_rls_login` (which can `SET ROLE authenticated`
for RLS). No single role serves both, and the authenticated path is **not reachable in the deployed
worker** (`index.ts` routes only catalog, health, and the compat proxy; `withAuthenticatedTransaction`
has no caller — verified by grep).

### The fix (w5c2, authorized) — option A: repoint the fresh config

Kody authorized repointing `DB_FRESH` to the catalog reader as the interim design, deferring the
RLS/authenticated path (currently dead code) until it is actually wired. Applied via the `update`
path (config IDs unchanged, so no `wrangler.jsonc` binding-id edit):

```
wrangler hyperdrive update 5cda0d8adbd346febf2f8d528cfaea4e \
  --connection-string="postgres://edge_catalog_login:<rotated>@db.<ref>.supabase.co:5432/postgres" \
  --caching-disabled
wrangler hyperdrive update 114f7421d13e487eb023e144b90e58d5 \
  --connection-string="postgres://edge_catalog_login:<rotated>@db.<ref>.supabase.co:5432/postgres" \
  --max-age 60 --swr 15
```

`edge_catalog_login`'s password was rotated first (`ALTER ROLE edge_catalog_login WITH PASSWORD …`
via MCP against `vuesoyhfrjabfxbrzekd`); both configs were updated to the new credential so the cached
`DB_PUBLIC_CACHE` config keeps working. `edge_catalog_login` → `edge_catalog_reader` (INHERIT true) →
`has_table_privilege(...,'SELECT') = true` (verified). `edge_rls_login` is left provisioned but now
**unbound** — reserved for the future authenticated path. `DB_FRESH` stays uncached; `DB_PUBLIC_CACHE`
keeps its 60/15 cache.

> **Interim-design note:** `DB_FRESH` no longer means "fresh authenticated/RLS read"; it is now a
> second **uncached catalog reader** identical in role to `DB_PUBLIC_CACHE` but with caching disabled.
> This is intentional: the shadow/promotion ladder only ever asks it for the public catalog view. When
> the authenticated path is wired, it must get its **own** binding (`edge_rls_login`) rather than
> reclaiming `DB_FRESH`.

### What was observed after the fix (rung 2 re-run — PASS)

Rung 2 re-deployed as `0a421b34` (`CATALOG_SOURCE=shadow`, percent 0). 23 catalog requests
(singles + batches, up to the full 8-id set, all HTTP 200 served from legacy) were generated while
`wrangler tail --format json` captured worker output; the shadow comparison runs in `ctx.waitUntil`.

| Event | Count |
| --- | --- |
| `edge_api_catalog_shadow_match` (comparison `legacy_vs_fresh_vs_cached`) | **23** |
| `edge_api_catalog_shadow_mismatch` | **0** |
| `edge_api_catalog_hyperdrive_failure` | **0** |

Every match event has `legacyDigest == freshDigest == hyperdriveDigest` (verified programmatically
across all 23). Representative full events (trace IDs are random UUIDs, safe to record):

```json
{"event":"edge_api_catalog_shadow_match","severity":"info",
 "traceId":"aff05326-cd94-4bb0-b22a-67b84420114c","routeClass":"catalog.products",
 "comparison":"legacy_vs_fresh_vs_cached","legacyCount":1,"freshCount":1,"hyperdriveCount":1,
 "legacyDigest":"f7a564e8","freshDigest":"f7a564e8","hyperdriveDigest":"f7a564e8"}
```

```json
{"event":"edge_api_catalog_shadow_match","severity":"info",
 "traceId":"a7f8f0da-7fb5-464a-8816-72c2139ae61e","routeClass":"catalog.products",
 "comparison":"legacy_vs_fresh_vs_cached","legacyCount":8,"freshCount":8,"hyperdriveCount":8,
 "legacyDigest":"eaa52628","freshDigest":"eaa52628","hyperdriveDigest":"eaa52628"}
```

The `DB_FRESH` denial is gone (zero `hyperdrive_failure`), and the required positive record — all
three sources byte-identical — is present on every served request.

### Rung 3 (hyperdrive/100) — PROMOTED

Deployed as `79ed9d97` (`CATALOG_SOURCE=hyperdrive`, `CATALOG_HYPERDRIVE_PERCENT=100`). The catalog
now serves from Hyperdrive (`DB_PUBLIC_CACHE`) with legacy verification on every request. Tail over
the promoted rung showed **8 `edge_api_catalog_shadow_match`** events with `comparison`
`legacy_vs_cached`, **0** `shadow_mismatch`, **0** `hyperdrive_failure`, **0**
`unverified_response`; every event `legacyDigest == hyperdriveDigest` (8-id batch digest `eaa52628`,
matching the shadow rung). The served body for the full 8-id set was **byte-identical** to the
legacy-mode body for the same ids (8 products, ascending id order, all `status=published`) — see §8.

---

## 7. Verification matrix

Run against the deployed staging worker. The catalog / proxy / health / logging rows are valid
regardless of rung (legacy and hyperdrive/100 serve byte-identical bodies); the Sources row is now
PASS (§6). Rows below marked from w5c's pass were re-confirmed to still hold at hyperdrive/100.

| Area | Result | Evidence |
| --- | --- | --- |
| **Catalog — 1 id** | ✅ PASS | HTTP 200, 1 product |
| **Catalog — 50 ids** | ✅ PASS | 14 real + 36 valid-nonexistent → HTTP 200, 14 products, ascending id order, all `status=published` |
| **Catalog — 51 ids** | ✅ PASS | HTTP 400 `{"error":"invalid_request","message":"ids must contain 1 to 50 unique UUIDs"}` |
| **Catalog — duplicate** | ✅ PASS | 3× same id → HTTP 200, collapses to 1 product |
| **Catalog — malformed** | ✅ PASS | `ids=not-a-uuid` → HTTP 400 `ids must be UUIDs` |
| **Catalog — empty / missing** | ✅ PASS | `ids=` and no `ids` → HTTP 400 |
| **Catalog — injection-shaped** | ✅ PASS | `' OR 1=1--` and `1;DROP TABLE products;--` → HTTP 400 `ids must be UUIDs` (UUID-regex rejects before any DB call) |
| **Catalog — deterministic order** | ✅ PASS | 50-id response ids equal their own sorted order |
| **Catalog — personal/studio/draft absent** | ✅ PASS | personal `cf13…0003`, studio `cf13…0004`, draft `cf13…0002` each → HTTP 200, **0** products; mixed `0001,0003,0004` → only published `…0001` returned |
| **Sources — legacy = fresh = cached** | ✅ **PASS** | Rung 2 shadow: **23** `shadow_match` (`legacy_vs_fresh_vs_cached`), **0** `shadow_mismatch`, **0** `hyperdrive_failure`; every event `legacyDigest == freshDigest == hyperdriveDigest` (e.g. 8-id batch all `eaa52628`). Rung 3: 8 `legacy_vs_cached` matches, `legacyDigest == hyperdriveDigest`, served body byte-identical to legacy. See §6/§8. **DB_FRESH repointed to `edge_catalog_login` (uncached) — the `edge_rls_login` denial is resolved.** |
| **Proxy — Auth passthrough** | ✅ PASS | worker `GET /auth/v1/health` → 401 `No API key found`, byte-identical to direct upstream 401; `/auth/v1/settings` → 401 |
| **Proxy — REST passthrough** | ✅ PASS | worker `/rest/v1/` no-apikey → 401, matches direct-upstream 401 |
| **Proxy — Functions / Storage / GraphQL** | ✅ PASS | `/functions/v1/` → 404 (upstream router), `/storage/v1/bucket` → 400 upstream body preserved, `/graphql/v1` → 401 |
| **Proxy — CORS preservation** | ✅ PASS | OPTIONS `/auth/v1/token` (Origin `app.patina.cloud`) → 200 with `access-control-allow-origin/headers/methods/max-age` from upstream + `x-patina-trace-id` |
| **Proxy — route-loop prevention** | ✅ PASS | unknown path `/nonsense/path` → worker's own 404 `{"error":"not_found"}` (not proxied); proxy also guards upstream-origin == incoming-origin with 508 |
| **Proxy — sign-in reaches GoTrue** | ✅ PASS | POST `/auth/v1/token?grant_type=password` with bogus key → 401 `Invalid API key` from GoTrue (body/headers forwarded) |
| **Realtime — WS upgrade** | ✅ PASS (partial) | Upgrade handshake to `/realtime/v1/websocket` forwarded; upstream 401 without apikey, `private,no-store` + trace id set. Full 101 subscribe/event/reconnect **DEFERRED** (needs a valid apikey; no creds this pass) |
| **Health — token allow / anon deny** | ✅ PASS | no token → **404**; with rotated token → **200** `{"status":"ok","checks":{"fresh":"ok","publicCache":"ok"}}` |
| **Claims — pooled `SET LOCAL ROLE`** | ◻️ N/A / DEFERRED | No reachable route exercises `withAuthenticatedTransaction` in the deployed worker (uncalled). Code-level: `BEGIN` + `SET LOCAL ROLE` + `set_config(...,true)` + `COMMIT/ROLLBACK` are transaction-local. Live two-user probe not possible (no creds; no live surface). |
| **Auth — sign-in/refresh/OAuth/expired/issuer/audience** | ◻️ DEFERRED | Requires a seeded dev account JWT; no credential handling in this pass. Passthrough + CORS + unauthorized paths verified above. |
| **Failure — fail-closed input** | ✅ PASS | 400 over-limit and 400 malformed both carry `cache-control: private, no-store`; unsatisfiable set (personal id) → 200 empty array (`etag` = SHA-256 of `[]`) |
| **Failure — DB unavailable / legacy-timeout / pool exhaustion** | ◻️ DEFERRED | Cannot be induced without damaging the live staging binding/DB; not performed (RAILS). Recovery re-probes (Catalog + Health) after every perturbation in this pass returned to healthy. |
| **Logging — worker `structuredLog`** | ✅ PASS | A bait request carrying `authorization: Bearer …`, `cookie: sb-access-token=…`, `apikey: …`, and `?secretparam=…` produced **zero** occurrences of any token/cookie/apikey **value** anywhere in the tail; the worker's own `structuredLog` lines contain only `event, severity, traceId, routeClass, fallback, binding` (and, on a match, counts/digests) — no URL, no ids, no PII |
| **Logging — platform channel (a12)** | ⚠️ NOTE (not a fail) | With `observability.enabled: true`, the **platform** tail metadata `event.request.url` **does** capture the full invocation URL incl. query string (planted `?secretparam=…`, and the catalog `ids=` UUID list appeared there). Request **headers** are not captured. Per the pass rubric the pass/fail is on the worker's own `structuredLog` (PASS). Recommend for prod: keep secrets out of query strings and/or scope `observability` URL capture. |

## 8. Rollback drill

Config-flip rollback exercised **hyperdrive/100 → legacy** (`0fb5c0d9`), the real Phase-1 rollback path.

| Field | Value |
| --- | --- |
| Method | edit `wrangler.jsonc` `CATALOG_SOURCE=legacy`, `PERCENT=0` → `validate-config.mjs` pass → `wrangler deploy --env staging` |
| **Wall-clock duration** | **8 seconds** (10:48:23Z → 10:48:31Z), well within the 5-minute target |
| Probe 1 — legacy result restored | ✅ 8 products, ascending id order; body **byte-identical** to the hyperdrive/100 served body for the same 8 ids |
| Probe 2 — no personal/studio/draft data | ✅ every row `status=published`, only the allowed public fields present (no extra keys) |
| Probe 3 — health | ✅ 404 without token; 200 with rotated token → `{"status":"ok","checks":{"fresh":"ok","publicCache":"ok"}}` |
| Probe 4 — deployments bottom row = rollback | ✅ newest row `0fb5c0d9-…` @ 2026-08-18T10:48:26Z |

**Restore to resting state:** after the drill, staging was restored to the Phase-1 target
**hyperdrive/100** (`8f0f1211`, deployed 2026-08-18T10:56:19Z — the deployments bottom row). The
restored hyperdrive body was byte-identical to the pre-rollback hyperdrive body. **Committed
`wrangler.jsonc` matches this resting deploy** (`CATALOG_SOURCE=hyperdrive`, `PERCENT=100`).

## 9. What a prod go authorizes — and what it does NOT

**Prod is NOT done.** Staging is now genuinely promoted (hyperdrive/100), but a Phase-1 prod go would
authorize only the staging-equivalent chain. It explicitly does **not** cover, and each remains
outstanding:

- **Prod public ACL apply** — migrations `00481`–`00486` and the effective-PUBLIC-ACL preflight have run only on staging (`vuesoyhfrjabfxbrzekd`), never on prod Strata (`bkvcixdmuyejfzcijpdg`).
- **Prod login roles / Hyperdrive** — prod `edge_catalog_login` / `edge_rls_login` and prod `strata-prod-fresh` / `strata-prod-public-cache` Hyperdrive configs are unprovisioned; prod `wrangler.jsonc` still `hyperdrive: []`, `CATALOG_SOURCE: legacy`.
- **Prod logins / authenticated path** — no authenticated sign-in/refresh/claims verification has run against prod; the worker's authenticated transaction path is still uncalled.
- **The `api.patina.cloud` route** — no route is attached in any env (`validate-config.mjs` forbids a committed `routes` key; `workers_dev: true`). Attaching the prod hostname is a separate, explicit step.
- **The `DB_FRESH` interim design** (§6) — on staging, `DB_FRESH` is repointed to the catalog reader (`edge_catalog_login`, uncached) and `edge_rls_login` is left unbound because the authenticated/RLS worker path is **dead code** (no caller). Prod must make the same explicit choice: either replicate the interim repoint, or, if/when the authenticated path is wired, give it a **separate** binding (`edge_rls_login`) rather than overloading `DB_FRESH`. This is a deferred design decision, not a completed prod step.
- **Authenticated/RLS live verification** — because that path is uncalled, no `SET LOCAL ROLE authenticated` / claims / two-user RLS probe was run live (staging or prod). It remains owed once the path has a caller.

---

### Appendix — probe identities used

- Real published catalog UUIDs: `cf130000-0000-4000-8000-000000000001`, `…0005`, `a0000000-0000-0000-0000-000000000001/0003/0010/0011/0012/0013/0020/0022`, `ae440000-0000-4000-8000-00000000d001/d002`, `bff00000-0000-0000-0000-0000000000f1/f2` (14 total).
- Negative controls: `cf130000-…-0003` (personal), `cf130000-…-0004` (studio), `cf130000-…-0002` (draft) — all correctly absent from catalog output.
