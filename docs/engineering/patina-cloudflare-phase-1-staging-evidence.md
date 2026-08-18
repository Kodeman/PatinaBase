# Patina Cloudflare — Phase 1 Staging Deployment Evidence

**Pass:** `phase1-close` final staging pass (agent w5c)
**Date:** 2026-08-18 (UTC)
**Verdict:** ⛔ **NOT PROMOTED to Phase-1 target (hyperdrive/100).** A hard blocker at the
shadow rung prevents the required legacy = fresh = cached evidence from being produced.
Staging rests at the safe, known-good **rung 1 (legacy)** state.

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
| Config on disk | `infra/edge-api-worker/wrangler.jsonc`, staging block (net unchanged: legacy → shadow → legacy) |

## 2. Staging database

| Field | Value |
| --- | --- |
| Supabase branch project ID | `vuesoyhfrjabfxbrzekd` (staging; **never** prod `bkvcixdmuyejfzcijpdg`) |
| Migration set | `00481`–`00486` applied |
| MCP versioning note | MCP `list_migrations` reports these under **timestamp** versions, not the `NNNNN` slugs: `20260818072756`=00481_edge_catalog_roles · `20260818072900`=00482 · `20260818074342`=00483 · `20260818075013`=00484 · `20260818075051`=00485 · `20260818075143`=00486_public_acl_residual_closure |
| Seed | 14 published catalog products present in `public.edge_catalog_products` (read-only `SELECT` verified) |

## 3. Hyperdrive configuration

| Binding | Config ID | Name | Cache mode |
| --- | --- | --- | --- |
| `DB_FRESH` | `5cda0d8adbd346febf2f8d528cfaea4e` | `strata-staging-fresh` | **caching disabled** (uncached) |
| `DB_PUBLIC_CACHE` | `114f7421d13e487eb023e144b90e58d5` | `strata-staging-public-cache` | **caching enabled** |

Source: `wrangler hyperdrive get <id>` (connection details deliberately omitted from this record).

## 4. Worker deployment timeline (this pass)

`wrangler deployments list --name patina-edge-api-staging` (oldest-first; newest = bottom row).

| Version ID | Created (UTC) | Source | Rung / action |
| --- | --- | --- | --- |
| `54b39fca-196e-46cb-a178-f314380f35ba` | 2026-08-18T09:47:39Z | deployment | **Rung 1 (legacy)** — pre-existing (w5b); baseline probed here |
| `557a407b-38d0-4bf4-b11b-6a4ed5580a8f` | 2026-08-18T10:15:05Z | Secret Change | Health token **rotation** — `HEALTH_SERVICE_TOKEN_ID` |
| `85094dbd-e7fd-4802-bda1-55c5384bf9e5` | 2026-08-18T10:15:07Z | Secret Change | Health token **rotation** — `HEALTH_SERVICE_TOKEN_SECRET` |
| `8961e9c9-78ea-4357-8b17-cc8e5bd2e9c4` | 2026-08-18T10:15:49Z | deployment | **Rung 2 (shadow)** — `CATALOG_SOURCE=shadow`, percent 0 |
| `0fbe766b-cb42-42d5-95d7-402f5f605497` | 2026-08-18T10:24:50Z | deployment | **Rollback → legacy** — final resting state (bottom row) |

> **Health-token rotation:** w5b set `HEALTH_SERVICE_TOKEN_ID`/`_SECRET`; those values were not
> available to this pass. Per the pass instructions, a fresh id+secret pair was generated and set via
> `wrangler secret put ... --env staging` (versions `557a407b`, `85094dbd`), then used for all health
> probes below. The rotated values are held only in the session scratchpad — not in this record.
> `wrangler secret list --env staging` shows `HEALTH_SERVICE_TOKEN_ID`, `HEALTH_SERVICE_TOKEN_SECRET`,
> `SUPABASE_ANON_KEY` present.

## 5. Rung 1 → legacy baseline (reference for later comparison)

`GET /v1/catalog/products?ids=cf130000-…-0001,cf130000-…-0005,a0000000-…-0001` → HTTP 200, three
products in **ascending id order** (`a0000000-…-0001`, `cf130000-…-0001`, `cf130000-…-0005`),
`content-type: application/json`. This is the legacy result every later rung is compared against.

---

## 6. ⛔ BLOCKER — Rung 2 shadow cannot produce the legacy = fresh = cached record

This is the single most important check in the pass, and it **fails closed**.

### What was observed

Rung 2 (shadow) was deployed (`8961e9c9`) and 19 catalog requests (14 singles + 5 batches, all HTTP
200 served from legacy) were generated while `wrangler tail --format json` captured worker output.
The shadow comparison runs in `ctx.waitUntil`. Across the served requests the tail showed:

| Event | Count |
| --- | --- |
| `edge_api_catalog_shadow_match` (the required positive record) | **0** |
| `edge_api_catalog_shadow_mismatch` (a real legacy-vs-Hyperdrive divergence) | **0** |
| `edge_api_catalog_hyperdrive_failure`, `binding: "DB_FRESH"` | **18 / 18** |

Representative event (trace IDs are random UUIDs, safe to record):

```json
{"event":"edge_api_catalog_hyperdrive_failure","severity":"error",
 "traceId":"107af150-a4de-4d89-ba69-79a07dcd47d8","routeClass":"catalog.products",
 "fallback":"legacy","binding":"DB_FRESH"}
```

So there is **no legacy-vs-Hyperdrive divergence** (zero mismatch), but the **`DB_FRESH` leg of the
three-way comparison is rejected on every request**, so the positive `shadow_match` record with
`legacyDigest == freshDigest == hyperdriveDigest` **can never be emitted as deployed**. The
`DB_PUBLIC_CACHE` leg succeeds (the failure is reported as `DB_FRESH`, not `both`/`DB_PUBLIC_CACHE`).

### Root cause (proven at the grant level)

`src/catalog.ts` `queryCatalogViaFresh → queryCatalogViaBinding` runs a plain
`SELECT … FROM public.edge_catalog_products …` over `DB_FRESH` with **no `SET ROLE`**. `DB_FRESH`
(`strata-staging-fresh`) connects as login role `edge_rls_login`. Read-only `SELECT` probes on
`vuesoyhfrjabfxbrzekd` show:

- `edge_catalog_login` → member of `edge_catalog_reader` with **INHERIT true** → `has_table_privilege('edge_catalog_reader','public.edge_catalog_products','SELECT') = true`. This is `DB_PUBLIC_CACHE`'s role — its catalog `SELECT` works.
- `edge_rls_login` → member of `edge_rls_user` with **INHERIT false, SET true** (SET-ROLE-only). `has_table_privilege('edge_rls_user','public.edge_catalog_products','SELECT') = false`. Migration `00481` deliberately `REVOKE ALL … FROM … edge_rls_user` on the view. A direct `SELECT` (no `SET ROLE`) as `edge_rls_login` is therefore **denied** → `queryFresh` rejects.
- Confirmed by elimination: only `edge_catalog_login` and `edge_rls_login` are provisioned edge login roles; `edge_catalog_login` cannot `SET ROLE authenticated` (not a member), so if `DB_FRESH` were `edge_catalog_login` the (currently-uncalled) authenticated path would break and the fresh read would succeed — the opposite of what is observed. Hence `DB_FRESH = edge_rls_login`.

### Why this is a genuine design conflict, not a one-line provisioning typo

`env.DB_FRESH` is **overloaded** for two mutually incompatible role requirements:

1. `queryCatalogViaFresh` (shadow) needs a **direct catalog reader** — i.e. `edge_catalog_reader`, uncached (matching the Hyperdrive name "fresh").
2. `withAuthenticatedTransaction` (`src/auth.ts`/`database.ts`) needs `edge_rls_login`, which can `SET ROLE authenticated` for RLS + JWT claims.

No single role satisfies both. Note (2) is **not reachable in the deployed worker** — `index.ts`
routes only catalog, health, and the compat proxy; `withAuthenticatedTransaction` /
`withVerifiedSupabaseTransaction` have **no caller** (verified by grep). So today `DB_FRESH`'s only
live consumer is the shadow fresh read, which its provisioned role cannot serve.

### Required decision before promotion (owning thread, not this pass)

Pick one and re-run rung 2:

- **(A) Provisioning:** point `strata-staging-fresh` (`DB_FRESH`) at `edge_catalog_login` (uncached catalog reader) and give the future authenticated path its own separate binding (e.g. `DB_RLS = edge_rls_login`); **or**
- **(B) Worker code:** have the shadow fresh read `SET LOCAL ROLE authenticated` + set claims (heavier; changes what "fresh" reads and needs a claims source); **or**
- **(C) Grants:** grant the fresh path `SELECT` on `edge_catalog_products` (contradicts `00481`'s deliberate SET-ROLE-only posture for `edge_rls_user` — least preferred).

Per this pass's RAILS (no `apply_migration`; this is a verification pass, not a code/infra change),
no fix was applied. **Promotion to rung 3 (hyperdrive/100) was NOT performed** — doing so would wave
through the missing shadow evidence.

---

## 7. Verification matrix

Run against the deployed staging worker. Shadow mode serves the legacy body, so the catalog / proxy /
health / logging rows are valid regardless of rung; the Sources row is the blocker above.

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
| **Sources — legacy = fresh = cached** | ⛔ **FAIL (blocker)** | 0 `shadow_match`, 0 `shadow_mismatch`, 18/18 `DB_FRESH` `hyperdrive_failure` — see §6. **DB_PUBLIC_CACHE (cached) leg succeeds; FRESH leg denied.** |
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

Config-flip rollback exercised **shadow → legacy** (`0fbe766b`). (A hyperdrive → legacy drill was not
applicable because rung 3 was never promoted — see §6.)

| Field | Value |
| --- | --- |
| Method | edit `wrangler.jsonc` `CATALOG_SOURCE=legacy` → `validate-config.mjs` pass → `wrangler deploy --env staging` |
| **Wall-clock duration** | **5 seconds** (10:24:47Z → 10:24:52Z), well within the 5-minute target |
| Probe 1 — legacy result restored | ✅ 3 products, ascending order, matches §5 baseline |
| Probe 2 — no personal/studio/draft data | ✅ `cf13…0003/0004/0002` → 0 products |
| Probe 3 — health | ✅ 404 without token, 200 with token, both bindings `ok` |
| Probe 4 — deployments bottom row = rollback | ✅ newest row `0fbe766b-…` @ 2026-08-18T10:24:50Z |

**Resting state:** staging rests at **legacy** (`0fbe766b`). The instructed restore to hyperdrive/100
was intentionally **not** performed — the rung-3 promotion is gated by the §6 blocker. Committed
`wrangler.jsonc` matches this deployed state (legacy).

## 9. What a prod go authorizes — and what it does NOT

**Prod is NOT done.** Even once the §6 blocker is resolved and staging is genuinely promoted, a
Phase-1 prod go would authorize only the staging-equivalent chain. It explicitly does **not** cover,
and each remains outstanding:

- **Prod public ACL apply** — migrations `00481`–`00486` and the effective-PUBLIC-ACL preflight have run only on staging (`vuesoyhfrjabfxbrzekd`), never on prod Strata (`bkvcixdmuyejfzcijpdg`).
- **Prod login roles / Hyperdrive** — prod `edge_catalog_login` / `edge_rls_login` and prod `strata-prod-fresh` / `strata-prod-public-cache` Hyperdrive configs are unprovisioned; prod `wrangler.jsonc` still `hyperdrive: []`, `CATALOG_SOURCE: legacy`.
- **Prod logins / authenticated path** — no authenticated sign-in/refresh/claims verification has run against prod; the worker's authenticated transaction path is still uncalled.
- **The `api.patina.cloud` route** — no route is attached in any env (`validate-config.mjs` forbids a committed `routes` key; `workers_dev: true`). Attaching the prod hostname is a separate, explicit step.
- **The §6 shadow blocker itself** must be fixed and rung 2 re-verified (shadow_match with three equal digests, zero mismatch) before any promotion, on staging first and then prod.

---

### Appendix — probe identities used

- Real published catalog UUIDs: `cf130000-0000-4000-8000-000000000001`, `…0005`, `a0000000-0000-0000-0000-000000000001/0003/0010/0011/0012/0013/0020/0022`, `ae440000-0000-4000-8000-00000000d001/d002`, `bff00000-0000-0000-0000-0000000000f1/f2` (14 total).
- Negative controls: `cf130000-…-0003` (personal), `cf130000-…-0004` (studio), `cf130000-…-0002` (draft) — all correctly absent from catalog output.
