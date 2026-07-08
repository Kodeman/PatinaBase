---
name: patina-edge-functions
description: Use when creating, editing, testing, or deploying Supabase edge functions under supabase/functions/ (Deno) in Patina — including _shared/ utilities, config.toml [functions] entries, verify_jwt decisions, webhook endpoints (Stripe/Resend), cron-invoked functions, or CORS handling — or when an edge function 401s, is stale after deploy, a shared-module change didn't take effect, or an untracked deno.lock appears at the repo root. Not for Postgres migrations or portal API routes.
---
# Patina Supabase edge functions (Deno)

Last verified: 2026-07-08 (main @ 593876c1, migrations head 00284). Re-verify load-bearing claims if the repo has moved.

## Use when / Don't use when
- USE when: adding/editing `supabase/functions/<name>/index.ts` or `_shared/*`; changing `config.toml [functions.*]`; deciding `verify_jwt`; a webhook or cron-invoked function 401s / runs stale / doesn't fire; email isn't sending; a stray `deno.lock` appears at repo root.
- DON'T use for: SQL/RPC/RLS/cron-schedule changes (see patina-db-migrations); the cron→edge failure-diagnosis chain and Vault settings (see patina-prod-ops); Stripe object/state semantics beyond the webhook shell (see patina-stripe-payments); Next.js API routes in `apps/*/app/api` (portal proxy layer, not edge functions).
- Boundary: this skill covers function code + config + deploy. Proving a deployed function actually works end-to-end → patina-verification. Local stack lifecycle → patina-local-dev.

## Procedure
1. **Locate / scaffold.** Each function is `supabase/functions/<name>/index.ts` exporting one HTTP handler. Most use `Deno.serve(async (req) => …)`; ~15 older ones use `import { serve } from "…std/http…"` + `serve(handler)` — match the neighbor you're editing. `main/` is the self-hosted edge-runtime dispatcher (infra, not business logic — Cloud dispatches per-function, so leave it alone). `_shared/` and `_tests/` are not functions.
2. **Reuse `_shared`, don't fork it.** Import relatively: `import { x } from "../_shared/send-email.ts"`. There is NO import map; each function BUNDLES its own copy of `_shared` at deploy time (`config.toml`/`deno.json` carry no map; `deno.json` is `{"lock": false, …}`). Consequence: **editing a `_shared` file requires redeploying EVERY function that imports it.** Enumerate before you touch it:
   ```
   grep -rl "_shared/send-email" supabase/functions --include=index.ts
   ```
3. **All outbound email goes through `_shared/send-email.ts` → `sendCompliantEmail`** (suppression check → unsubscribe headers by category → Resend → optional `notification_log` write). Do NOT call Resend directly; route through it (7 functions do). Party SMS has the same chokepoint: `_shared/sms.ts` → `sendPartySms` (consent gate, quiet hours, `SMS_DEV_MODE` dry-run/redirect) — never call Twilio directly.
4. **Decide `verify_jwt` deliberately.** It defaults to `true` (the platform default; `config.toml` documents it as a commented `# verify_jwt = true`). Only FOUR functions opt out, each with a compensating in-code auth check: `stripe-webhook` (Stripe signature IS the auth), `resend-webhook` (provider webhook), `comms-mute` (HS256 signed token via `_shared/comms-token.ts`), `sms-inbound` (Twilio `X-Twilio-Signature` — HMAC-SHA1 over `SMS_INBOUND_PUBLIC_URL`+params, keyed by `TWILIO_AUTH_TOKEN`). Rule: set `verify_jwt = false` ONLY when the function verifies a signature/token itself. Server-to-server webhooks skip CORS; any browser-called function must define `corsHeaders` inline and answer `OPTIONS` (≈30 functions do — copy the shape from `create-checkout-session`).
5. **For webhooks, follow the `stripe-webhook/index.ts` anatomy** (see Quality bar). For cron/trigger-invoked functions, the caller is `public.invoke_edge_function(fn, body)` which POSTs with `apikey` + `Authorization: Bearer <service-role>` (from Vault, migration 00258) — so those functions keep `verify_jwt = true`.
6. **Test locally** (Commands): unit tests via `deno test`, or run the stack + `supabase functions serve` + curl / the `_tests` harness.
7. **Deploy is gated.** Only when the user asked to ship this function this session. Then `supabase functions deploy <name>` to the linked Strata project is authorized as part of the chain. NEVER use `scripts/deploy-edge-functions.sh` for a real deploy — it hardcodes only 13 of the ~45 functions (12 email/engagement + `resend-webhook`) and will silently skip everything else.
8. **Verify with a live probe**, not an assumption: curl the function, or trigger its cron/webhook and check the side effect (a DB row, a `notification_log` entry, a Stripe object). Read-only probing is always allowed. The old self-hosted Coolify box is DEAD — never deploy or curl against it.

## Commands
```bash
# Enumerate importers before editing a shared module
grep -rl "_shared/render-template" supabase/functions --include=index.ts

# Unit tests (must load functions/deno.json so lock:false applies — else a deno.lock is written)
deno test --allow-all --config supabase/functions/deno.json supabase/functions/aesthete-ask/
# ~22 test files exist (fn dirs + _shared/*.test.ts + _tests/stripe-rail.test.ts)

# Serve locally (stack must be up: see patina-local-dev)
supabase functions serve stripe-webhook --no-verify-jwt --env-file supabase/functions/_tests/test.env
curl -i -X POST http://127.0.0.1:54321/functions/v1/<name> \
  -H "Authorization: Bearer $SUPABASE_ANON_KEY" -H "Content-Type: application/json" -d '{}'

# Stripe webhook local: sign a synthetic event and POST it (no Stripe CLI / real keys)
node scripts/dev/sign-stripe-event.mjs --secret "$STRIPE_WEBHOOK_SECRET" \
  --url http://127.0.0.1:54321/functions/v1/stripe-webhook payload.json
# add --corrupt to test bad-signature rejection

# Payable-type harness (requires `supabase functions serve … --no-verify-jwt` already running)
bash supabase/functions/_tests/run.sh

# Deploy — GATED (only after an explicit ship request this session)
supabase functions deploy <name>                 # linked to Strata (bkvcixdmuyejfzcijpdg)
supabase secrets set KEY=value                    # GATED; prod secret. Names only — never paste values
```
If a bare `deno …` is run from the repo root it writes an **untracked `./deno.lock`** (the `lock:false` in `functions/deno.json` only applies when that config is loaded — there is one sitting untracked at root right now). Always pass `--config supabase/functions/deno.json`, or `cd supabase/functions` first. If `deno.lock` reappears at root, delete it; do not commit it.

## Quality bar
Webhook / handler anatomy, from `stripe-webhook/index.ts` (the reference; ~1722 lines):
- **Read the RAW body before parsing** — `const raw = await req.text();` then verify. Never `req.json()` a signed webhook (re-serialization breaks the signature).
- **Verify signature with the async + WebCrypto path** — `const cryptoProvider = Stripe.createSubtleCryptoProvider();` then `await stripe.webhooks.constructEventAsync(raw, sig, secret, undefined, cryptoProvider);`. Return `400` only on signature failure.
- **Create the service-role client only AFTER auth succeeds** — `createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)`.
- **Idempotency** — upsert a claim row (`stripe_webhook_events`, `{ onConflict:'id', ignoreDuplicates:true }`); if already claimed, early-return `json({ received:true, duplicate:true })`. On handler error, `DELETE` the claim so the provider retries.
- **Guard state flips** — mutate with a predicate: `.update(…).eq('status','pending')` so a re-delivery can't double-apply.
- **Consistent error shape** — a small `json(body, status=200)` helper.
Env & config:
- Read env with `Deno.env.get('X')`. `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` are auto-injected by the platform. Other secrets: `--env-file` locally, `supabase secrets set` in prod (gated). Reference secret NAMES only in code review and reports.
- `verify_jwt = false` must live in `config.toml [functions.<name>]` (the declarative source of truth). The deploy also passes `--no-verify-jwt` for such functions (belt-and-braces, as `scripts/deploy-edge-functions.sh` does for `resend-webhook`); for a new public function, set BOTH.
Inventory (verify names by `ls supabase/functions/`; group labels only):
- payments/procurement: `stripe-webhook`, `create-checkout-session`, `invoice-send`, `invoice-reminders`, `po-send`, `expire-po-session`, `quote-request-send`, `qbo-export`
- notifications/email/SMS: `notification-dispatch`, `notification-digest`, `digest-dispatcher`, `comms-mute`, `comms-notification-dispatch`, `sms-dispatch`, `sms-inbound`, `field-daily`, `resend-webhook`, `waitlist-notify`, `client-invite`
- decisions/proposals: `decision-reminders`, `decision-resolved-notify`, `expire-decisions`, `proposal-send`, `proposal-nudge`, `proposal-sign-confirmation`, `spec-pdf`, `review-requests`
- aesthete: `aesthete-ask/-dna-draft/-drift-audit/-embed-worker/-nightly`, `emergence-recommend`
- companion/capture: `companion-context/-history/-message`, `capture-from-url`, `confirm-scan-bundle`
- campaigns/automation: `campaign-dispatch/-scheduler`, `automation-processor`, `ab-winner-evaluator`, `back-in-stock-check`, `price-drop-check`, `lead-expiration-check`

Skeleton (browser-facing; a webhook omits CORS and verifies a signature instead — illustrative):
```ts
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    // verify_jwt=true → the platform already checked the caller's JWT.
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    /* … work … */
    return json({ ok: true });          // json(body, status=200) helper, cors headers merged in
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
```

## Verification checklist
- [ ] Handler style matches its neighbors (`Deno.serve` vs `serve()`); browser-facing → `corsHeaders` + `OPTIONS`.
- [ ] `_shared` import is relative; if you edited a `_shared` file, you enumerated importers with `grep -rl` and (on ship) redeployed ALL of them.
- [ ] Outbound email goes through `sendCompliantEmail`, not a direct Resend call.
- [ ] `verify_jwt` correct: `true` unless the function self-verifies a signature/token; any `false` is in `config.toml` AND matched by an in-code check.
- [ ] Webhook follows the anatomy (raw body, async verify, service client after auth, idempotency claim, guarded updates).
- [ ] Tests run with `--config supabase/functions/deno.json`; no `deno.lock` left at repo root.
- [ ] After deploy (if shipped): a live curl/trigger probe confirmed behavior; you did NOT rely on `scripts/deploy-edge-functions.sh`.

## Common mistakes
| Situation | Wrong move | Right move |
|---|---|---|
| Deploy the whole function set | Run `scripts/deploy-edge-functions.sh` | Deploy each changed fn: `supabase functions deploy <name>` (script covers only 13 of ~45) |
| Edited a `_shared/*` file | Redeploy just one function | `grep -rl "_shared/<file>" … --include=index.ts` and redeploy every importer |
| Function keeps 401ing | Add `verify_jwt=false` to dodge it | Send `Authorization: Bearer <service-role>` (that's what `invoke_edge_function` does), or add a real in-code auth check before disabling |
| Parsing a signed webhook | `await req.json()` then verify | `const raw = await req.text()`; verify `raw`; parse after |
| Verifying Stripe signature | Sync `constructEvent` | `constructEventAsync` + `createSubtleCryptoProvider()` (Deno has no sync crypto) |
| Sending email from a function | Call Resend directly | `sendCompliantEmail` from `_shared/send-email.ts` |
| Running `deno` from repo root | Bare `deno test …` | Add `--config supabase/functions/deno.json` (or `cd supabase/functions`) so no root `deno.lock` |
| Confirming a deploy worked | Assume success | Live probe: curl the fn / trigger it / check the DB or `notification_log` side effect |
| A secret in code/report | Paste the value | Reference the NAME; set via `supabase secrets set` (gated) |

## Report back
State: which function(s) you created/edited and their one-line purpose; whether you touched `_shared` and the full list of importers that therefore need redeploy; the `verify_jwt` decision and its compensating auth; test results (`deno test …` output, or the curl/harness probe). Explicitly call out what you did NOT do: not deployed (unless the user asked to ship — then report `supabase functions deploy` output and the live probe result), `_shared` importers not yet redeployed, and any secret referenced by name only. If a `deno.lock` appeared at root, say you removed it. Cron/webhook not-firing diagnosis beyond the function itself → hand off to patina-prod-ops.
