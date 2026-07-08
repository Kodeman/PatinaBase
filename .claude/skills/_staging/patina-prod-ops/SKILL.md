---
name: patina-prod-ops
description: Use when investigating or operating Patina production (Strata Supabase + Cloudflare) — prod errors, cron/email/notification that did not fire, edge-function or Worker logs, Vault-backed app settings, prod SQL questions, admin access, seeded test data, service health, or "why didn't X happen in prod". Read-only diagnostics are always OK; mutations are gated.
---
# Patina Production Ops (Strata + Cloudflare)

Last verified: 2026-07-08 (main @ 593876c1, migrations head 00284). Re-verify load-bearing claims if the repo has moved.

Production = **Supabase Cloud "Strata" (ref `bkvcixdmuyejfzcijpdg`)** + **Cloudflare** (portals on Workers, services on Containers). The self-hosted Coolify box is **DEAD** — never SSH/deploy/reconfigure it.

## Use when / Don't use when
Use when: diagnosing a prod incident; a cron/email/notification/webhook "ran but nothing happened"; reading edge-function or Worker logs; a prod SQL/data question; admin access; seeded test data; service health. Read-only by default.
Don't use when: you are actually shipping code (patina-deploy), the issue is Stripe-specific (patina-stripe-payments), or it is a local-dev question (patina-local-dev).

## GATE
- **Read-only diagnostics are always allowed**: SELECTs, `get_logs`, `wrangler tail`, `wrangler deployments list`, health/version probes, advisors.
- **Mutations are gated** — any write to prod (SQL INSERT/UPDATE/DELETE, `supabase secrets set`, Vault changes, `functions deploy`, `db push`, `wrangler deploy`) requires an explicit user request in the current session. Absent it, report findings and propose the fix; do not execute. Cross-ref patina-deploy for the ship chain.
- Punch list is ACTIVE and moves week to week — verify topology live before trusting a doc/memory claim.
- Supabase MCP tools may be available in-session for Strata (`execute_sql`, `get_logs`, `get_advisors`, `list_migrations`) — prefer them for read-only SQL/log access. `execute_sql` runs against the live project, so it is a mutation once the statement writes.

## Procedure
1. **Localize the hop.** Symptom → which layer: portal (Worker) / edge function / Postgres (cron, trigger, RLS) / email (Resend) / Stripe. Don't guess across layers.
2. **Logs before data.** `wrangler tail <worker>` for Workers; Supabase `get_logs` or dashboard for edge functions — read the failing layer's logs before touching any row.
3. **"X didn't happen" → walk the truth chain** (below) to the exact failing hop; never conclude from `cron.job_run_details` alone.
4. **Settings/keys → read Vault** (below), not a GUC; confirm the value is present and current.
5. **Fix.** If it's a mutation, confirm an in-session ask exists (GATE); SELECT-first before any write; hand the ship chain to patina-deploy.

## Commands (read-only unless noted)
```bash
npx wrangler tail patina-designer-portal            # live portal logs (observability on all 4)
npx wrangler deployments list --name <worker>       # oldest-first; bottom row = newest
supabase secrets list                               # names only (setting is a GATED write)
curl https://patina-orders-worker.kody-be3.workers.dev/v1/health   # {status:"healthy"}
```
For Strata read-only SQL/logs prefer the Supabase MCP if available in-session: `execute_sql`, `get_logs`, `get_advisors`, `list_migrations`. `execute_sql` hits the live project — it becomes a gated mutation the moment the statement writes. The canonical diagnostic SQL is in the sections below (cron chain, Vault settings, access).

## Settings live in Vault, not GUCs (migration 00258)
`public.app_setting(name)` reads `vault.decrypted_secrets` where `name = 'app.settings.<name>'`, falling back to the `current_setting('app.settings.<name>', true)` GUC only for self-hosted/local. It is SECURITY DEFINER and EXECUTE is revoked from PUBLIC/anon/authenticated (it returns the service-role key).
- On Supabase Cloud you **cannot** `ALTER DATABASE/ROLE … SET app.settings.*` — it is **denied** (that is exactly why 00258 exists). Never try it to "fix" a setting.
- **Rotating a key = update the Vault secret** (dashboard Vault, or the vault SQL API), NOT a GUC. If the Vault secret is stale/absent, `invoke_edge_function` and every `notify_*` trigger **silently no-op** (RAISE WARNING, RETURN NULL) — the classic outage where cron "succeeds" but no email/notification appears.

## The cron→edge truth chain ("cron ran but nothing happened")
`invoke_edge_function(fn_name, body)` (00258) does `net.http_post(url = app_setting('supabase_url')||'/functions/v1/'||fn, headers = apikey + Bearer app_setting('service_role_key'))`. `net.http_post` is **async/enqueued** — so `cron.job_run_details.status='succeeded'` means **the request was ENQUEUED, not delivered**. Walk it in order:
```sql
-- 1. Is the job registered + on the right schedule?
SELECT jobid, jobname, schedule, active FROM cron.job WHERE jobname LIKE '%invoice%';
-- 2. Did the cron tick fire? ('succeeded' = enqueued only, NOT HTTP success)
SELECT jobid, status, return_message, start_time
FROM cron.job_run_details ORDER BY start_time DESC LIMIT 20;
-- 3. THE REAL HTTP RESULT (pg_net async response table):
SELECT id, status_code, content, created FROM net._http_response ORDER BY id DESC LIMIT 20;
-- 4. Did the edge function do its job? -> its logs (below) + the domain table:
SELECT * FROM notification_log ORDER BY created_at DESC LIMIT 20;
```
If step 3 shows 401/403 → the service-role key in Vault is wrong/stale. Non-2xx at the function → read its logs. 2xx but no domain-table row → logic/suppression (email path below).

## Email: one chokepoint
ALL outbound app email goes through `sendCompliantEmail` (`supabase/functions/_shared/send-email.ts`): (1) suppression check when `userId` given → skips + logs `suppressed` if `profiles.email_suppressed`; (2) injects RFC-8058 `List-Unsubscribe` / `List-Unsubscribe-Post` headers (JOSE-signed token) for non-transactional categories; (3) calls **Resend**; (4) writes `notification_log` with the resulting status. So **suppressed recipients get no email and it is not a delivery bug** — check `profiles.email_suppressed` + `notification_log` before blaming Resend. Sender domain is `patina.cloud` (`hello@patina.cloud`); needs `RESEND_API_KEY` (or `EMAIL_DEV_MODE`).
- **GoTrue auth emails** (magic link, confirm, recovery) are a **separate path** — SMTP configured in the Supabase dashboard, NOT `send-email.ts`. A broken magic link is an auth/SMTP + redirect-allow-list issue, not a Resend issue.

## Access
Admin portal = **super_admin only, magic-link sign-in** (`kody@kochaver.com`). Granting admin = a `user_roles` INSERT (gated write). See patina-local-dev for role seeding shape.
- **Seeded prod test data** carries a marker (memory documents `seed:kody-…-strata`, ids prefixed `5eed…`). This marker is NOT committed in the repo — confirm the exact marker/ids live (SELECT before you touch) and **never mass-delete without filtering on the confirmed marker**.
`user_roles` is `(user_id UUID, role_id UUID → roles(id))` — the role NAME lives in `roles.name`, not a text column on `user_roles` (schema from `00021`). Check with the helper `user_has_role(uuid, varchar)`:
```sql
-- who is super_admin (the RLS gate; the service-side guard is a no-op stub)
SELECT p.email, r.name FROM user_roles ur
JOIN roles r ON r.id = ur.role_id
JOIN profiles p ON p.id = ur.user_id
WHERE r.name = 'super_admin';
-- grant (GATED write — needs an in-session ask; pattern from 00023):
INSERT INTO user_roles (user_id, role_id)
VALUES ('<uuid>', (SELECT id FROM roles WHERE name = 'super_admin'))
ON CONFLICT (user_id, role_id) DO NOTHING;
```
(Verify the live `roles`/`user_roles` shape before writing — schema evolves across migrations.)

## Service endpoints & authz reality
| Unit | Worker | Health / version | Notes |
|---|---|---|---|
| orders | patina-orders-worker | `/v1/health`, `/v1/version` | global prefix `v1` |
| projects | patina-projects-worker | `/v1/health`, `/v1/healthz`, `/v1/ready`, `/v1/version` | global prefix `v1` |
| media | patina-media-svc-worker | `/health`, `/version` (**no prefix**) | mixed: controllers at `/v1/media/*`, search at bare `/search` |
| inference | patina-inference-worker | `/healthz` (open) | `/embed/text`, `/embed/image`, `/fit/taste[/backtest]` need `Authorization: Bearer INFERENCE_TOKEN` |
| media processor | patina-media-worker | (queue consumer) | `/enqueue` is an **UNAUTHENTICATED** test producer (pre-M2 debt, flagged in its README) — known-open, don't build on it |

- **`PermissionsGuard` in `@patina/auth` is a NO-OP stub** (`canActivate` returns `true`; `packages/auth/src/index.ts`). `@RequirePermissions(...)` enforces **nothing** server-side. Real authz = Supabase JWT verification + Postgres RLS. Never assume route-level permission enforcement in the NestJS services.
- Version/gitSha from any `/version` are **static defaults**, not deploy freshness (see patina-deploy).

## Public (verify_jwt=false) edge-function surface
From `supabase/config.toml`, only these skip JWT: `stripe-webhook` (Stripe-signature-authed), `resend-webhook`, `comms-mute` (signed token), `sms-inbound` (Twilio `X-Twilio-Signature`-authed). Everything else requires a Supabase JWT. Plus the media-worker `/enqueue` above. Treat these as the deliberate open surface.

## Logs & observability
- Workers observability is enabled on all 4 portals + all workers → `npx wrangler tail <worker>` for live logs; CF dashboard for retained observability.
- Edge-function logs: Supabase dashboard → Edge Functions → Logs, or the Supabase MCP `get_logs` for Strata.
- `get_advisors` surfaces security/perf lints (RLS gaps, missing indexes).

## Active punch list (state may have moved — verify live before acting)
Reported open post-cutover: designer PDF route WASM-broken on Workers; cron-trigger / DLQ semantics on the new stack still being settled; inference-worker deploy state uncertain; old-box decommission pending; Stripe **LIVE** keys owed (sandbox is live — see patina-stripe-payments); `po_payments` self-mark-paid RLS hole open; **Field/SMS program ship owed** (migrations 00281–00284 + `sms-dispatch`/`field-daily`/`sms-inbound` + pg_cron + Twilio 10DLC brand/campaign registration + Twilio secrets — runbook `docs/field/sms-10dlc-runbook.md`, per DECISIONS.md I53). These are memory/report-sourced, not all repo-verifiable — confirm each live before you rely on or "fix" it.

## Name-collision warning
"**Strata**" means THREE things — the Supabase Cloud **project** (prod), the `StrataMark` **design-system component** (`packages/patina-design-system/src/components/StrataMark/`), and an old **Coolify project** name (`infra/coolify/*`, DEAD). Read context before acting on "Strata".

## Quality bar
- Read-only unless an in-session ask authorizes the write; when gated, you report + propose, not execute.
- Every "why didn't X fire" conclusion is backed by walking the truth chain to the actual failing hop (cron → job_run_details → `net._http_response` → fn logs → domain table), not a guess.
- Endpoint probes use the verified path (media has no `v1`; inference is `/healthz`).

## Verification checklist
- [ ] For cron/notification failures: you inspected `net._http_response` (real HTTP status), not just `cron.job_run_details` ("succeeded" = enqueued only).
- [ ] For "email not received": checked `profiles.email_suppressed` + `notification_log` before concluding a delivery failure; separated GoTrue-auth email from `sendCompliantEmail`.
- [ ] For settings/key issues: confirmed the value in **Vault** (`vault.decrypted_secrets` name `app.settings.<name>`), not a GUC.
- [ ] Any data mutation had an in-session ask; SELECT-first before any DELETE; seed marker confirmed live.
- [ ] Topology claim (worker name, route, punch-list item) confirmed live, not assumed from a doc.

## Common mistakes
| Situation | Wrong move | Right move |
|---|---|---|
| Cron "succeeded", no email | Conclude the fn worked | `net._http_response` for the real HTTP status; then fn logs |
| Key looks stale | `ALTER DATABASE … SET app.settings.x` | Denied on Cloud; update the **Vault** secret (00258) |
| Client didn't get email | Blame Resend/DNS | Check `email_suppressed` + `notification_log`; suppressed = intentional skip |
| Magic link broken | Debug `send-email.ts` | GoTrue/SMTP path + redirect allow-list, separate from Resend |
| media `/v1/health` 404 | "media is down" | media has no prefix — `/health`, `/version` |
| Service route "requires admin" | Trust `@RequirePermissions` | Guard is a no-op stub; real gate is JWT + RLS |
| Clean up test data | Mass-delete by loose filter | SELECT-confirm the seed marker first; filter on it |
| "Strata is failing" | Assume the prod DB | Disambiguate: project vs StrataMark component vs dead Coolify |
| Prod fix idea, no ask | Run the UPDATE | Gated — report + propose; execute only on in-session ask |

## Report back
Lead with the diagnosis and the exact hop that failed, each backed by a query/log line (e.g. `net._http_response` row with status_code, the `notification_log` gap, the Vault-vs-GUC finding). State whether any mutation was required and whether it was authorized in-session (if not, give the proposed statement, unexecuted). List what you could NOT verify (punch-list items, seed markers, live topology) and mark them for live confirmation. Names only for any secret — never values.
