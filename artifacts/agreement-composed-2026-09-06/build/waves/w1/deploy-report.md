# The Agreement, Composed — Wave 1 deploy report

**Date:** 2026-09-07
**Steward:** Wave 1 merge + deploy
**Authorization:** Kody's in-session request, "Deliver the Agreement system to production" — the full chain (merge → migration → portals → verify).
**Outcome:** Shipped. The parts live in production, and production behaves exactly as it did yesterday, because the flag that opens them does not exist yet.

---

## 1. Merge

`origin/main` and local `main` both stood at `3a9472f92d6fd3348e7257c95a8042c1c007447c`; `git merge-base --is-ancestor origin/main agreement/w1-integration` returned true, so the integration branch already carried the main tip and nothing had to be merged forward.

The integration branch head was `9c38f6442`, one commit past the walk-verified `c6abd572d`. That commit — `docs(agreements): Wave 1 web walk — round 2` — is artifacts only (140 files, all under `artifacts/agreement-composed-2026-09-06/build/waves/w1/`: the round-2 walk report, its screenshots, and its scripts). No shipped file moved after the walk-verified head.

Scope confirmed before merging:

| Check | Result |
|---|---|
| `git diff --name-only origin/main..agreement/w1-integration -- supabase/functions/` | empty — **no edge-function changes**, so no importer fan-out |
| Migrations carried | exactly one: `supabase/migrations/00575_agreement_parts.sql` |
| Highest migration on `origin/main` | `00574_invoice_links.sql` — below 00575, no collision |
| Non-artifact paths touched | `apps/designer-portal`, `apps/client-portal`, `packages/supabase`, `packages/types`, `supabase/migrations`, `supabase/seed`, `supabase/tests` |

The main checkout's pre-existing dirty files (`.claude/settings.json`, `CLAUDE.md`, `apps/mobile/Patina/Patina.xcodeproj/project.pbxproj`, `artifacts/invoice-standalone-2026-09-06/README.md`, six help-walkthrough PNGs) were left untouched; none of them intersects the merged path set.

**Merge commit:** `61a68919d2d3812417f3a2ce2cc0d0f42f20b3d2`

```
61a68919d chore(agreements): merge w1-integration into main — the agreement, composed, wave 1
9c38f6442 docs(agreements): Wave 1 web walk — round 2, the five fixes hold at the keyboard
c6abd572d docs(agreements): W1 walk fixes — B1, M2, M3, M4, M6 closed, every gate green
```

**Push:** `3a9472f92..61a68919d  main -> main`

One correction to the brief: the rulings are not at `build/rulings-2026-09-06.md`, which does not exist. R17–R29 live in `artifacts/agreement-composed-2026-09-06/review/00-orchestrator-rulings.md`, and the merge body cites that real path.

---

## 2. Migration → Strata

**Before.** `supabase migration list --linked` returned every row with `local` equal to `remote` except the last:

```
{"local":"00572","remote":"00572"}
{"local":"00573","remote":"00573"}
{"local":"00574","remote":"00574"}
{"local":"00575","remote":"","time":"00575"}
```

`00575` was the only pending row. Nothing else — not 00555, not 00557, not anything — showed as local-only, so no selective-application ruling was needed.

**Push.**

```
$ supabase db push --workdir /Users/kody/Code/patina-merged
Applying migration 00575_agreement_parts.sql...
{"upToDate":false,"dryRun":false,"migrations":["00575_agreement_parts.sql"],
 "seeds":[],"roles":[],"message":"Finished supabase db push."}
```

**After.** `{"local":"00575","remote":"00575","time":"00575"}`.

### Object probes (the objects, not the ledger)

The ledger can lie, so each object was asked directly on the linked project:

| Probe | Expected | Got |
|---|---|---|
| `count(*) from information_schema.tables where table_name='proposal_agreement_parts'` | 1 | **1** |
| `proname from pg_proc where proname in (…)` | all 5 | **`_agreement_fee_unnamed`, `discard_agreement_parts`, `guard_agreement_projection_write`, `materialize_standard_parts`, `upsert_agreement_parts`** |
| `is_nullable` for `proposal_service_terms.billing_ceiling_cents` | `YES` | **`YES`** (F-2: an uncapped ceiling is NULL, never $0) |
| `count(*) from proposal_agreement_parts` | 0 | **0** — nothing is composed in production yet |

---

## 3. Portals

Both were built and deployed from the **main checkout**, through `./infra/deploy-portal.sh` — never a raw OpenNext build, so Phase 1 rebuilt the workspace dists and no stale dist could be bundled.

### The designer portal's env, and what was done about it

`apps/designer-portal/.env.local` pointed at the **local stack** (`http://127.0.0.1:54321`). The script's Phase 0 preflight refuses a local-pointed production build outright, and rightly so: `NEXT_PUBLIC_*` is inlined at build time, so that URL would have been baked into the shipped bundle.

Following the standing precedent, the production literals from `apps/designer-portal/wrangler.jsonc`'s `vars` block were **exported inline for that one invocation**. `.env.local` was not edited — an exported value wins in both the preflight and in `next build`, which never overrides what is already in `process.env`. Exported: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `NEXT_PUBLIC_SUPABASE_STORAGE_KEY`, `SUPABASE_URL`, `NEXT_PUBLIC_APP_URL`, `NEXT_PUBLIC_CLIENT_PORTAL_URL`, `NEXT_PUBLIC_ENV`, `NEXT_PUBLIC_POSTHOG_KEY`, `NEXT_PUBLIC_POSTHOG_HOST`, `NEXT_PUBLIC_CAPTURE_EXTENSION_INSTALL_MODE`, `NEXT_PUBLIC_ENABLED_OAUTH_PROVIDERS`, `NEXT_PUBLIC_EDGE_API_URL`, `SUPABASE_ORIGIN_RUNTIME`.

`NEXT_PUBLIC_EDGE_API_URL` is exported deliberately: `wrangler.jsonc` states in its own comment that this var is invisible to `next build`, and that omitting it from the deploy invocation leaves the in-portal scan read path dark. `SUPABASE_ORIGIN_RUNTIME` keeps the sanctioned D-B4 repoint (`https://api.patina.cloud`) intact — the preflight's carve-out covers exactly this portal and env.

`apps/client-portal/.env.local` already pointed at production (`https://bkvcixdmuyejfzcijpdg.supabase.co`) with `NEXT_PUBLIC_SUPABASE_STORAGE_KEY` set, so the client portal deployed with no intervention.

### Versions

| Portal | Worker | New version | Rollback (prior) |
|---|---|---|---|
| designer | `patina-designer-portal` | **`97bca77d-2b27-4e7c-ada3-78f8ba87ce32`** (2026-09-07T13:55:20Z) | `b03f50e1-73e6-42f8-94bd-5de8de5f45c8` (2026-09-06T18:39:46Z) |
| client | `patina-client-portal` | **`48624f39-4013-4110-9262-171942bf8c26`** (2026-09-07T13:56:39Z) | `58976a1c-4f6f-4af2-9d5e-38980ef2b39f` (2026-09-06T18:34:44Z) |

Both read from the **bottom** row of `npx wrangler deployments list` (the list is oldest-first). The wrangler config for a portal lives in its app directory, not under `infra/` — there is no `infra/designer-worker` or `infra/client-worker`.

---

## 4. Verification

### Served-chunk evidence

Rather than trust a version string, the exact asset built in this run was fetched from the live host and grepped. Each chunk was located locally in `.open-next/assets/_next/static/chunks/`, then requested by that same filename from production:

| Host | Asset | Token | Result |
|---|---|---|---|
| app.patina.cloud | `2795-a075d7b959904739.js` | `Return to the seven facets` (R24) | 200, 37,755 bytes — **present** |
| app.patina.cloud | `2795-a075d7b959904739.js` | `composed from parts` (R17b) | **present** |
| app.patina.cloud | `8541-d6d129eabd9491e0.js` | `agreement-parts` (the flag key) | 200, 512,844 bytes — **present** |
| client.patina.cloud | `common-486db235eaee18b0.js` | `No ceiling — professional time…` | 200, 998,567 bytes — **present** |
| client.patina.cloud | `common-486db235eaee18b0.js` | `Recorded with your agreement` | **present** |

### The designer env did not leak

The concern raised by the local-pointed `.env.local` was checked head-on:

- `127.0.0.1` / `localhost:54321` in the served designer home HTML: **0**
- `127.0.0.1` / `localhost:54321` in the served designer sign-in HTML: **0**
- `localhost:54321` in the served designer chunk `8541-…`: **0**
- production Supabase ref `bkvcixdmuyejfzcijpdg` in that same served chunk: **2**
- runtime origin in the served HTML: `__PATINA_SUPABASE_ORIGIN = "https://api.patina.cloud"` — the D-B4 repoint survived intact

### Behavior probes (unauthenticated)

| Probe | Result |
|---|---|
| `GET https://app.patina.cloud/` | 200 |
| `GET https://client.patina.cloud/` | 307 → `/auth/signin?callbackUrl=%2F` → 200 |
| `GET https://app.patina.cloud/projects` | 308 → `/auth/signin?callbackUrl=%2Fdesk` → 200, sign-in page, **no error markers** |
| `GET https://app.patina.cloud/api/version` | 200 (liveness only — the version string is a static default and proves nothing) |
| `GET https://client.patina.cloud/api/version` | 200 (same caveat) |

Neither sign-in page carried `Application error`, `Internal Server Error`, or "couldn't load".

### The feature is dark

`POST https://us.i.posthog.com/flags/?v=2` with the production project key and a real-browser User-Agent returned 200 and **16 flags**:

```
arrival-arc, call-sheet, design-request-pool, direct-orders, field-companion-voice,
house-first, house-widget, onboarding-teammate-persona, procurement-workspace-pilot,
room-file, schedule-spine, single-pane, studio-invoice, studio-workspaces,
tester-notes, the-document-pilot
```

`agreement-parts` is **not** among them. The gate is fail-closed, so with the flag absent every parts surface stays shut and production behaves byte-identically to yesterday. `proposal_agreement_parts` holding zero rows is the same fact seen from the database side.

---

## 5. What was NOT verified

- **No signed-in walk in production.** Every probe above is unauthenticated. The composed agreement, the Contract Room, the seven-facet return, and the homeowner's page have not been exercised against Strata by a real session. The walk evidence backing this ship is the local round-2 walk (`walk-web-r2.md`), not a production one.
- **The feature cannot be walked yet.** `agreement-parts` does not exist in PostHog. Creating it is Kody's — and per the standing rule it must be verified against `/flags` with a real-browser UA **before** being enabled, because a flag has matched everyone before (`threshold`, 2026-09-04).
- **The PostHog MCP could not be used** to confirm the flag's absence — `feature-flag-get-definition-by-key` returned `INVALID_API_KEY`. The `/flags` endpoint probe above is the evidence instead; it shows what the browser would actually receive, which is the stronger signal anyway.
- **The designer portal's `.env.local` is still local-pointed.** This deploy worked around it for one invocation; it was not fixed. The next person to deploy the designer portal must do the same or repoint the file first. (This is already an outstanding item from the client-approval program.)
- **Client-portal env parity was not reconciled.** `apps/client-portal/.env.local` defines no `NEXT_PUBLIC_POSTHOG_KEY`, `NEXT_PUBLIC_POSTHOG_HOST`, or `NEXT_PUBLIC_EDGE_API_URL`, though `wrangler.jsonc` sets all three. Those inline to empty at build time. This was **left exactly as the previous client deploy had it** — changing it would have altered client-portal behavior beyond this wave's scope. Worth a separate ruling.
- **No `wrangler tail` watch.** Neither worker was observed under live traffic for an error spike after the deploy.
- **Custom-domain routing was not re-verified.** No `routes` block exists in either `wrangler.jsonc`; the `patina.cloud` hostnames are dashboard-managed out of band. They answered correctly in the probes above, which is evidence they work, not evidence of how they are wired.
- **No services, edge functions, or secrets were touched.** The wave carried none, and the empty `supabase/functions/` diff proves it.

---

## 6. Rollback

- **Designer portal** → redeploy version `b03f50e1-73e6-42f8-94bd-5de8de5f45c8`
- **Client portal** → redeploy version `58976a1c-4f6f-4af2-9d5e-38980ef2b39f`
- **Migration 00575** → migrations are append-only; roll forward with a new one. In practice no rollback is needed: with `agreement-parts` absent, the new table, functions, and the relaxed `billing_ceiling_cents` nullability are inert. The fastest kill switch is simply never creating the flag — and if it is created and misbehaves, disabling it.
