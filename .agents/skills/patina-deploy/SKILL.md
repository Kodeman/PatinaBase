---
name: patina-deploy
description: Use when shipping anything to Patina production — portals to Cloudflare Workers, NestJS services or the media/inference workers to Cloudflare Containers, Supabase migrations or edge functions to Strata, or secrets. Also when asked to deploy, ship, release, push to prod, cut over, or to verify whether a deploy actually landed, or when a shipped change is not visible in prod.
---
# Patina Production Deploy (Cloudflare + Strata)

Last verified: 2026-07-09 (main @ c4de810d, migrations head 00284). Re-verify load-bearing claims if the repo has moved.

Production is **Supabase Cloud project "Strata" (ref `bkvcixdmuyejfzcijpdg`)** + **Cloudflare** (Workers for the 4 portals, Containers for the 3 NestJS services + media processor + inference). The old self-hosted Coolify box is **DEAD**.

## Use when / Don't use when
Use when: deploying/shipping/releasing to prod; verifying a deploy landed; a prod change is not visible. Covers portals, services, migrations, edge functions, secrets.
Don't use when: local dev (patina-local-dev), writing migrations (patina-db-migrations), authoring edge-function logic (patina-edge-functions), or diagnosing live prod without deploying (patina-prod-ops). For Stripe specifics see patina-stripe-payments.

## GATE (read first — this is the whole game)
- **Prod mutations** — `supabase db push`, `supabase functions deploy`, `supabase secrets set`, `wrangler deploy`, prod SQL writes — require an **explicit user request in the current session**. If the user said "ship/deploy X", the full chain (migrate → services/functions → portals → verify) is authorized; do NOT re-ask per step. Absent that ask: build + verify locally, then ask.
- Read-only prod (SELECTs, logs, `wrangler deployments list`, health/version probes) is **always allowed**.
- **NEVER run these DEAD legacy artifacts** (they target the retired box): `infra/deploy.sh`, `infra/build-and-push.sh`, `scripts/remote-db.sh`, `scripts/deploy-edge-functions.sh`, `infra/coolify/*`, `infra/docker-compose.{supabase,services,frontend,deploy}.yml`, `infra/cloudflare-tunnel-config.yml`. Never SSH/deploy to `coolify.patina.cloud` or its box even if a doc says so. [retired-deploy-reference-allow]
- The cutover punch list is ACTIVE and shifts week to week. Before acting on a doc/memory claim about prod topology, verify live (`wrangler`, `supabase` CLI, dashboard) or ask.
- `wrangler deploy` / container builds need **wrangler auth on this machine**; if unauthed, stop and ask.

## The Cloudflare units (don't confuse them)
| Dir | Worker name | What it is |
|---|---|---|
| `apps/{client,designer,admin,manufacturer}-portal` | `patina-<x>-portal` | Next.js portal (OpenNext → Worker). Deploy via `deploy-portal.sh` ONLY. |
| `infra/orders-worker` | `patina-orders-worker` | Container fronting `services/orders` (Stripe/EasyPost; svc_orders) |
| `infra/projects-worker` | `patina-projects-worker` | Container fronting `services/projects` (svc_projects) |
| `infra/media-svc-worker` | `patina-media-svc-worker` | Container fronting `services/media` — HTTP/API side only |
| `infra/media-worker` | `patina-media-worker` | **Separate**: CF Queues consumer + Sharp container, direct R2 bindings (`patina-raw`/`patina-processed`, `MEDIA_JOBS` queue). Not the NestJS media service. |
| `infra/inference-worker` | `patina-inference-worker` | Container fronting `services/aesthete-inference` (embeddings; needs host model export + `INFERENCE_TOKEN`) |

`manufacturer-portal`'s `wrangler.jsonc` is minimal (~15 lines, one var, no service bindings) — confirm it actually carries what a deploy needs before shipping it.

## Portal env vars are LITERALS in wrangler.jsonc (not sourced from .env)
Each `apps/*/wrangler.jsonc` has a `vars` block with the prod values hard-committed (Supabase URL, anon key, service URLs, feature flags). They are NOT read from `.env` at deploy time. So **changing a prod `NEXT_PUBLIC_*` = editing that portal's `wrangler.jsonc`** (a tracked, public-visible file — put no real secrets there; the anon key is the only "key" that legitimately belongs client-side). After editing, redeploy via `deploy-portal.sh` for it to take effect.

## Procedure
Deploy order is fixed (House law, `docs/prds/AE/aesthete-engine-runbook.md` §"order of operations"; that runbook predates the cutover so its Coolify/GUC mechanics are superseded — the ORDER still holds): **① migrations → ② edge functions → ③ services/workers → ④ portals → ⑤ smoke.** A portal/edge fn that reaches for a table/RPC not yet migrated fails closed.

1. **Migrations → Strata.** CLI is linked (`supabase/.temp/project-ref` = `bkvcixdmuyejfzcijpdg`). Before pushing, confirm no numbering collision (concurrent programs consume numbers): compare `supabase/migrations/` head against `supabase_migrations.schema_migrations` on Strata. Then `supabase db push` (gated). See patina-db-migrations.
2. **Edge functions → Strata.** `supabase functions deploy <name>` (gated). A `_shared/*` edit fans out — **redeploy every importer**, not just the one you touched (see patina-edge-functions). Secrets: `supabase secrets set KEY=value` (names only in reports).
3. **Services / workers → CF Containers** (only if changed). Per unit, from its `infra/` dir: `npx wrangler deploy` (gated). Each `wrangler.jsonc` `containers[].image` points at a `Dockerfile.cf` with `image_build_context: "../../"` (repo root) — `Dockerfile.cf` exists because wrangler **cannot pass `--build-arg`** through `containers[].image` (stated in the Dockerfile).
4. **Portals → CF Workers via OpenNext.** THE ONLY correct command is `./infra/deploy-portal.sh <client|designer|admin|manufacturer>`. Never run `opennextjs-cloudflare build` or `wrangler deploy` from an app dir — that bypasses Turborepo's `^build` graph and can bundle a **stale `@patina/utils` dist** (shipped prod `TypeError: proposalTierVisibility is not a function`; `@patina/utils` resolves to its compiled `dist/`). The script's 3 phases: (1) `pnpm turbo build --filter=<pkg>^...` rebuilds workspace-package dists FIRST (the stale-dist guard); (2) `OPEN_NEXT=true NODE_ENV=production npx opennextjs-cloudflare build`; (3) `npx wrangler deploy` with a hardcoded `CLOUDFLARE_ACCOUNT_ID`. **The script has NO post-deploy verification — you do step ⑤.**
5. **Pre-portal-deploy gate.** admin-portal build is **strict** (only ESLint ignored). designer-portal + client-portal set `typescript.ignoreBuildErrors: true` → a broken type sails through the build — **run their `type-check` before shipping** (see patina-verification).
6. **Smoke (⑤ — always).** Version stamping is broken on the live path (below) — verify by behavior + object probes, not `/version`.

## Commands
```bash
# --- portals (the ONLY correct path) ---
./infra/deploy-portal.sh designer        # ends: "==> Done: designer portal deployed."
# gate designer/client first (TS is ignored in their build):
pnpm --filter @patina/designer-portal type-check   # expect: no errors

# --- services / workers (each from its own dir; wrangler deploy builds the container) ---
cd infra/orders-worker      && npx wrangler deploy   # patina-orders-worker
cd infra/projects-worker    && npx wrangler deploy   # patina-projects-worker
cd infra/media-svc-worker   && npx wrangler deploy   # patina-media-svc-worker (HTTP/API side)
cd infra/media-worker       && npx wrangler deploy   # patina-media-worker (Queues consumer + Sharp container)
cd infra/inference-worker   && npx wrangler deploy   # patina-inference-worker (aesthete)

# --- migrations + edge functions + secrets (Strata; GATED) ---
supabase db push
supabase functions deploy stripe-webhook
supabase secrets set SOME_KEY=...        # names only in reports; never echo values

# --- VERIFY (read-only, always OK). List is OLDEST-FIRST → read the BOTTOM row. ---
npx wrangler deployments list --name patina-designer-portal
npx wrangler tail patina-designer-portal      # live logs (observability enabled on all 4 portals)
```
Service health/version probes (verified from controllers — orders/projects use global prefix `v1`, **media has none**):
```bash
curl https://patina-orders-worker.kody-be3.workers.dev/v1/health      # {status:"healthy",...}
curl https://patina-orders-worker.kody-be3.workers.dev/v1/version     # defaults (see below)
curl https://patina-projects-worker.kody-be3.workers.dev/v1/health    # + /v1/healthz, /v1/ready, /v1/version
curl https://patina-media-svc-worker.kody-be3.workers.dev/health      # NO /v1 prefix; also /version
curl https://patina-inference-worker.kody-be3.workers.dev/healthz     # {status:"ok",...,warmed:true}
curl https://patina-<designer|client|admin>-portal.kody-be3.workers.dev/api/version
```

### Container-build gotchas (verified in READMEs)
- **macOS Docker Desktop `credsStore` can hang** any container `wrangler deploy` (DeadlineExceeded / "could not launch Docker CLI"). Workaround = a minimal `DOCKER_CONFIG` that drops `credsStore`/plugins but symlinks `cli-plugins` + `contexts` (full recipe: `infra/media-worker/README.md` → "Deploy gotchas").
- **inference-worker** needs models exported **on the host first**: `cd services/aesthete-inference && python scripts/export_models.py --out models` (ONNX is platform-independent; avoids amd64 emulation), then set the `INFERENCE_TOKEN` secret (`wrangler secret put INFERENCE_TOKEN --name patina-inference-worker`). See `infra/inference-worker/README.md`.
- **media-worker** one-time queues: `wrangler queues create media-jobs && wrangler queues create media-jobs-dlq`. Its R2 bindings are `RAW`→`patina-raw`, `PROCESSED`→`patina-processed`.
- **R2 name-collision**: `wrangler r2 object` CLI and the Worker R2 **binding** resolve the same bucket name to **different physical buckets**. Seed/inspect via the binding or the S3 API — never the `wrangler r2 object` CLI (`infra/media-worker/README.md`).

## Quality bar
- Nothing shipped without the authorizing ask in-session; the full chain runs in the fixed order; migrations precede apps.
- Portals go out ONLY via `deploy-portal.sh`. designer/client type-check passed pre-ship.
- Every changed unit is verified by **behavior/object probe** (below), not by `/version`. Evidence captured (deployment-list bottom row, curl output, DB object, or a Worker log line).
- `_shared` edits triggered redeploy of all importers.

## Verification checklist
- [ ] `wrangler deployments list --name <worker>` — **bottom** entry (list is oldest-first) is newer than your deploy start.
- [ ] Behavior probe: curl the changed endpoint / load the changed page and observe the new behavior. For migrations, probe the DB object (table/column/RPC exists, or SELECT the new row) — see patina-prod-ops.
- [ ] Portal deploy: hit `/api/version` returns 200 (liveness) AND the changed route renders the change. `wrangler tail` shows no new error spikes.
- [ ] Version numbers are NOT proof of freshness — do not accept them as such.
- [ ] For a stale-dist suspicion: confirm you deployed via `deploy-portal.sh` (Phase 1 ran), not a raw app-dir build.

## Version-stamping reality (why `/version` lies)
Because wrangler passes no build args, containers fall back to `Dockerfile.cf` ARG defaults → services report **version `1.0.0`, gitSha `unknown`**; portals get no build env on Workers → **version `0.0.0`, gitSha `unknown`, buildTime `null`**. Both are static defaults, NOT deploy freshness. `/version` and `/v1/version` confirm **liveness only**. (Their code cites `infra/build-and-push.sh` stamping — that is the DEAD path.) [retired-deploy-reference-allow]

## Rollback
Evidenced path = **redeploy from the last-good commit**: check that commit out in a worktree (see patina-parallel-work) and re-run the same deploy command (`deploy-portal.sh` for a portal, `wrangler deploy` for a worker; container images are content-addressed so redeploying the prior tag is atomic — `aesthete-engine-runbook.md` §9). Edge fn: redeploy the prior function version. Migrations are append-only — roll forward with a new migration; only drop top-down if a migration is truly reversible. `wrangler rollback` is **not documented in-repo** — prefer redeploy-prior-good unless you confirm rollback support live.

## Common mistakes
| Situation | Wrong move | Right move |
|---|---|---|
| Ship a portal | `cd apps/x && opennextjs-cloudflare build` / `wrangler deploy` | `./infra/deploy-portal.sh x` (Phase 1 rebuilds dists) |
| "Is it deployed?" | Trust `/version` version/gitSha | `wrangler deployments list` **bottom** row + behavior probe |
| Reading deployments list | Read the top (newest?) entry | List is **oldest-first**; read the **bottom** |
| designer/client TS error | Assume build caught it | It didn't (`ignoreBuildErrors`); run `type-check` pre-ship |
| Prod is broken, doc says Coolify | SSH/deploy to the old box | Box is DEAD; deploy CF/Strata only | [retired-deploy-reference-allow]
| media probe 404 at `/v1/health` | Conclude media is down | media has **no** global prefix — use `/health`, `/version` |
| Container build hangs on macOS | Kill/retry blindly | Apply the `DOCKER_CONFIG` credsStore workaround |
| Edited `_shared/*` in an edge fn | Deploy only the fn you were in | Redeploy **every** importer |
| CI (docker-publish.yml) is red | Block the deploy on it | It targets the DEAD GHCR/Coolify path; it gates nothing — ignore for CF ships | [retired-deploy-reference-allow]
| Multi-part ship | Deploy portals first | Order: migrations → edge fns → services → portals → smoke |

## Report back
State per unit: what was deployed (portal/service/migration/fn/secret-name), the exact command run, and whether the authorizing ask existed in-session. Give evidence: `wrangler deployments list` bottom-row timestamp, the behavior/object probe result, and any `wrangler tail` anomalies. Explicitly flag what you did NOT verify (e.g. custom-domain routing — no `routes` exist in any wrangler.jsonc, so `patina.cloud` hostnames are dashboard-managed out-of-band; canonical URLs are `patina-*.kody-be3.workers.dev`). Note anything gated that you stopped and asked about.
