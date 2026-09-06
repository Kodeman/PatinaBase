# The Invoice, Standing Alone — deploy report, Part 1

**Date:** 2026-09-06 · **Authority:** Kody, rulings K8/K9 (`delivery/RULINGS-K4-K11.md`)
**Scope:** merge → migration 00574 → client portal → designer portal → K11 proof invoice. **STOPPED before the six edge functions** (K8 pause: Kody must set the live `STRIPE_SECRET_KEY` first).
**Deployed from:** `/Users/kody/Code/patina-merged` (the MAIN checkout, not a worktree).

---

## 1. Merge

| | |
|---|---|
| Pre-merge main | `19f64a0a1e7ee42c9a05237351b852b20f9c01ed` (== `origin/main`, 0 ahead / 0 behind) |
| Merged branch | `origin/invoice-standalone/integration` @ `e5772423e1399c6466bc4f30121116959f68aa2d` |
| **MAIN_SHA** | **`b915072bbc4403269cce08b041e883a29b901b77`** |
| **CLIENT_PORTAL_SHA** | **`b915072bbc4403269cce08b041e883a29b901b77`** (== MAIN_SHA; W3b's later client deploy ships from a *later* commit — this is its rollback anchor) |
| Pushed | `19f64a0a1..b915072bb  main -> main` → `origin/main` = `b915072bb` (confirmed by `ls-remote`) |

Subject: `chore(invoices): merge invoice-standalone/integration — the invoice, standing alone` (no `merge(...)` subject — husky-safe). Body carries the gate summary (SQL 160/160, Deno 1294 pass / 1 known red, client 1944 + e2e 7/7, designer 6194, admin build).

74 files changed, 12561 insertions, 687 deletions. The main checkout's pre-existing dirt (`CLAUDE.md`, `.claude/settings.json`, a pbxproj, six help-walkthrough PNGs, `artifacts/…/README.md`, untracked artifact dirs) was verified to have **zero overlap** with the branch's file list and was left untouched — all 10 modified paths survived the merge, no stash residue.

## 2. Migration 00574 → Strata

Pre-check: `migration list --linked` showed everything through `00573` applied and **exactly one** pending, `00574`. (`00570` exists on neither side — not a gap.)

`supabase db push --linked` → `Applying migration 00574_invoice_links.sql` → `{"upToDate":false,"migrations":["00574_invoice_links.sql"]}`.

### Object-level verification (probed, not read from the ledger)

| Probe | Result |
|---|---|
| `to_regclass('public.invoice_links')` | `invoice_links` ✅ |
| `count(*) invoice_links` | **22** |
| payable invoices (`sent`/`partially_paid`/`paid`) | **22** — backfill matches exactly ✅ |
| `invoice_checkout_attempts.payer_id` nullable | `YES` ✅ (the widening) |
| `chk_invoice_attempt_actor` + `chk_invoice_attempt_nonce` | **2** constraints present ✅ |
| Functions | All **14** present, **one overload each** (no stale signatures left behind): `claim_invoice_checkout_attempt`, `claim_invoice_link_checkout_attempt`, `ensure_invoice_link`, `expire_stale_invoice_checkout_attempts`, `finalize_invoice_checkout_attempt`, `get_invoice_link`, `mint_invoice_link_on_issue`, `recover_invoice_checkout_session_evidence`, `regenerate_invoice_link`, `resolve_invoice_link`, `resolve_invoice_link_for_checkout`, `resolve_invoice_return_nonce`, `set_invoice_link_payer_email`, `set_invoice_link_stripe_customer` (+ `_void_invoice_authorized_legacy_00397`) |
| Trigger | `invoice_link_mint_on_issue` on `public.invoices`, `tgenabled = 'O'` ✅ |
| Cron | `invoice-checkout-attempts-expire` — `17 * * * *`, `active = true` ✅ (siblings `invoice-reminders-daily` `0 15 * * *`, `milestone-date-invoices-daily` `0 13 * * *` unchanged) |

### `anon` EXECUTE — all seven false ✅

```
resolve_invoice_link(text,boolean)                        false
resolve_invoice_link_for_checkout(text)                   false
claim_invoice_link_checkout_attempt(uuid,uuid,text,text)  false
ensure_invoice_link(uuid)                                 false
get_invoice_link(uuid)                                    false
regenerate_invoice_link(uuid)                             false
resolve_invoice_return_nonce(text)                        false
```

Positive control (the grants that *should* exist): `authenticated` holds `get_invoice_link` + `regenerate_invoice_link` (the folio), `service_role` holds `resolve_invoice_link` + `resolve_invoice_link_for_checkout` (the server rail), and `authenticated` does **not** hold `resolve_invoice_link`. Correct shape.

> Note: the brief's signature `claim_invoice_link_checkout_attempt(text,text,text,text)` does not exist; the real one is `(uuid,uuid,text,text)`. Verified against `pg_proc` and re-probed.

### J22 — checkout-attempt snapshot

**Before the push** (and unchanged immediately after):

| state | count |
|---|---|
| `session_created` | 13 |
| `superseded` | 6 |

All 13 `session_created` rows carry `invoice_payments.status = 'pending'`; **none** is `succeeded`. Twelve are far older than 24 h (2026-07-08 → 2026-08-12); the newest is 2026-09-04. Invoices by status before the push: 7 draft, 8 sent, 14 paid, 1 void.

**The hourly sweep had not yet ticked** at the time of this report (last check 18:42 UTC; the job runs at `:17`, so the first tick is 19:17 UTC). `public.job_runs` for `invoice-checkout-attempts-expire` is still empty. The J22 safety guard already reads clean:

```
select count(*) from invoice_payments
 where status='failed' and note like '%Expired: Checkout was abandoned%'
   and stripe_payment_intent_id is not null
   and updated_at > now() - interval '2 hours';   -->  0
```

**Owed at the next tick** (runbook §12(g), after 19:17 UTC): confirm `job_runs` → `succeeded`, `detail.expired` ≈ 12–13, and that the guard query above is still `0`.

### Migration rollback (not used)

Additive — leave it. If minting must ever be frozen:
`DROP TRIGGER IF EXISTS invoice_link_mint_on_issue ON public.invoices;` + `SELECT cron.unschedule('invoice-checkout-attempts-expire');`

## 3. Client portal

`pnpm --filter @patina/client-portal type-check` → clean.
*(First run failed on a stale `@patina/utils` dist in the main checkout — `invoiceLinkPath` / `isLikelyInvoiceLinkToken` missing. Resolved by `pnpm turbo build --filter=@patina/client-portal^...`, which is exactly what the deploy script's Phase 1 does. Not a code defect.)*

`./infra/deploy-portal.sh client` (foreground) → `==> Done: client portal deployed to production.`

| | |
|---|---|
| **New version** | **`58976a1c-4f6f-4af2-9d5e-38980ef2b39f`** (2026-09-06T18:34:44Z, bottom row) |
| **ROLLBACK** | **`78ce6497-324e-4c29-976d-305b993180bc`** (2026-09-06T07:20:33Z) |

Bindings confirmed at deploy: **`env.PAY_LINK_RATELIMIT (30 requests/60s)` — Rate Limit** ✅, plus `SVC_PROJECTS`/`SVC_ORDERS`/`SVC_MEDIA`, `ASSETS`, and the prod `NEXT_PUBLIC_*` vars. New route chunks uploaded: `app/pay/[token]/page`, `.../checkout/route`, `.../state/route`, `app/pay/return/[nonce]/route`, `app/pay/dead/page`.

### Probes (real-browser UA)

| Probe | Result |
|---|---|
| `GET /pay/dead` | **200**, `cache-control: private, no-store, max-age=0`, `x-robots-tag: noindex, nofollow`, **no `location`** ✅ |
| `GET /pay/<random 64-hex>` | **200**, same two headers, **not** a 307 to `/auth/signin` ✅ (this was the pre-deploy failure mode) |
| dead-sheet body copy | `"no longer good"` present ✅ |
| placeholder-incident grep | `bkvcixdmuyejfzcijpdg` inlined ✅ · `localhost` **0** ✅ · `undefined` → only Next.js RSC `"$undefined"` flight sentinels, not a broken env value |
| `GET /pay/return/<random 64-hex>` | **303** → `location: https://client.patina.cloud/pay/dead` ✅ |
| `GET /api/version` | 200 |
| **Rate limiter** — 40 rapid requests to one token | **all 200**, dead sheet still rendered on the last one, **no 429, no 5xx** ✅ (the limiter renders dead, it does not error) |
| `wrangler tail` during the burst | 50 lines captured, tail confirmed connected; **`PAY_LINK_RATELIMIT` / "missing binding" hits: 0** ✅; zero exceptions; all logged requests `Ok`. |

**Bonus finding:** the tail renders pay URLs as `GET https://client.patina.cloud/pay/REDACTED` — the token is redacted in Worker logs, independently confirming the "token is never logged" posture at the observability layer.

*(A first tail attempt produced no evidence because macOS has no `timeout` binary; re-run without it and the tail captured the burst properly.)*

## 4. Designer portal

`pnpm --filter @patina/designer-portal type-check` → clean.

**First deploy attempt FAILED — and the guard is what caught it.** `deploy-portal.sh`'s Phase 0 preflight refused:

```
ERROR: refusing to build designer portal — resolved NEXT_PUBLIC_SUPABASE_URL
       points at a local host (http://127.0.0.1:54321).
```

`apps/designer-portal/.env.local` is local-pointed — a known outstanding item in project memory ("repoint designer-portal .env.local"). Resolved by the **documented** remedy for exactly this case (memory: FF&E GA, 2026-08-13 — *"export the portal's full `wrangler.jsonc` NEXT_PUBLIC_* vars set inline with the script call (exported env wins; never edit `.env.local`)"*). All **11** `NEXT_PUBLIC_*` vars were read from the committed prod literals in `apps/designer-portal/wrangler.jsonc` and exported for the deploy. **`.env.local` was not modified.**

`./infra/deploy-portal.sh designer` → `==> Done: designer portal deployed to production.`

| | |
|---|---|
| **New version** | **`b03f50e1-73e6-42f8-94bd-5de8de5f45c8`** (2026-09-06T18:39:43Z, bottom row) |
| **ROLLBACK** | **`090b5c5e-82bb-4141-b6a5-4a32126d4221`** (2026-09-06T07:23:16Z) |

### Probes

| Probe | Result |
|---|---|
| `GET https://app.patina.cloud/` | 200 |
| `GET /api/version` | 200 |
| **Served folio chunk** `/_next/static/chunks/2435-3d13e05d75802c42.js` (200, 192 KB) | contains `Regenerate link` ✅, `The old link stops working` (the regenerate confirmation literal) ✅, `Copy link` ✅, and a `/pay/` reference ✅ — the new folio code is genuinely in the shipped bundle |
| **Env-inlining check** (the risk the preflight flagged) | served chunks `5517-b508067a0d8b3d76.js` (2 hits) and `3660-2ca10058598883bb.js` (1 hit) carry `bkvcixdmuyejfzcijpdg`; **`127.0.0.1:54321` hits across served chunks: 0** ✅ — the build is prod-pointed, no white-screen risk |

## 5. K11 proof invoice — seeded, data only (no email sent)

**⚠ One deviation from the brief, flagged for Kody.** The brief named *Middle West Studio* (`7ba72774-fcdb-48cd-9135-b02a5d432628`) as the org. Kody's designer profile `74056c2a-866d-42b0-9e2a-d473c2484316` (kody@kochaver.com) is **not a member of that org** — Middle West Studio is Leah's real studio (`leah@`, `kody@middlewest.studio`, `ashley@middlewest.studio`). Kody is the active **owner** of **"Middle Studio"** (`bb1d4d5a-67bb-4446-8e75-709e34dc0a4c`), which already carries the only other houseless studio invoice on Strata. I seeded into **Middle Studio** rather than writing a new `organization_members` row into Leah's production studio.

This does **not** affect the payment rail: `studio_billing_settings` holds only `card_surcharge_bps` and `check_remit_to` — there is no per-studio Stripe account, so K8's single live `STRIPE_SECRET_KEY` charges identically whichever studio the invoice belongs to.

Seeded through the **real ceremony path**, as Kody, in one transaction (`set_config('request.jwt.claims', …, true)` + `set_config('role','authenticated',true)` — the claim shape from `supabase/tests/billing/studio_invoice_test.sql`), via `create_draft_studio_invoice(p_client_id, p_studio_id, p_title, p_tax_rate, p_payment_terms_days, p_memo, p_lines)` then `issue_invoice(v_id, NULL)`. **`invoice-send` was NOT called — no email was sent.** The `designer_clients` roster row for (Kody → Test Walker) already existed and is `active`; none was created.

| | |
|---|---|
| Invoice id | **`e87c87d1-1cd9-44cb-bd6d-d15006fa4f40`** |
| Number | `INV-0023` · status `sent` · `total_cents` 100 · `project_id` **NULL** (houseless) |
| Studio | Middle Studio `bb1d4d5a-67bb-4446-8e75-709e34dc0a4c` |
| Household | Test Walker `95b80df2-16b9-4dc3-a2ac-b8c878903e91` (`kody.kochaver+testwalker@gmail.com`) |
| Title / line | "Live proof — the invoice, standing alone" / one line "Live proof", qty 1, $1.00, tax 0, terms 30 days |

**The link was minted by the trigger, not `ensure_invoice_link`** — `invoice_links` went 22 → 23 on issue, closing W1 deviation 5's gap (the ceremony path the SQL suite does not cover). Token `status = active`, `revoked_at` NULL, length 64.

### 🔗 The pay URL (treat like a check)

```
https://client.patina.cloud/pay/71a7dc8814c6e4cb61ec860b74a38ba223e21ac7988be912dd947a3d86a3445e
```

Fetched signed-out with a real-browser UA → **200**, `private, no-store`, `noindex, nofollow`, **not** the dead sheet. Rendered content:

```
Middle Studio · Prairie du Sac, WI · https://middlewest.studio
Awaiting payment · due 6 October
Invoice No. INV-0023
Live proof — the invoice, standing alone
from the studio · for Test Walker
TOTAL $1.00 · BALANCE DUE $1.00
due 6 October 2026 · issued 6 September 2026

HOW WOULD YOU LIKE TO PAY?   Each row shows what you would pay in full.
  ( ) Bank transfer  $1.01   + $0.01 · Bank transfer costs the least to process.
  ( ) Card           $1.03   + $0.03 · This covers what card processing costs.
  ( ) Mail a check   $1.00   No fee.

Subtotal $1.00 · Balance $1.00 · Bank transfer fee $0.01
Total to pay $1.01   [ Pay $1.01 ]
WHAT'S INCLUDED: Live proof  1  $1.00
PAYMENTS: No payments recorded yet.
```

**Card row = $1.03, balance = $1.00** — exactly as K11 expects. All three rails offered; bank transfer is the default selection.

Screenshots (headless Chromium, deviceScaleFactor 2, full page):
- `proof-invoice-phone.png` (390×844)
- `proof-invoice-desktop.png` (1280×900)

## 6. STOPPED HERE — no edge function was deployed

`supabase functions deploy` was **not run for any function**. The six functions still serve their pre-merge versions, so the letters currently still emit `/invoices/<id>`; the `/pay` route stands ahead of them, which is the intended ordering (the route must exist before any function emits it).

---

## Next steps

### K8 — Kody (blocking)
1. Supabase dashboard → Edge Functions → Secrets: set the **live** `STRIPE_SECRET_KEY` (Middle West Studio `acct_1T6KiLJmCVe1Jxdu`, **live mode** — same account and mode as the live webhook endpoint). Agents never see the value.
2. Confirm `STRIPE_WEBHOOK_SECRET` is the **dashboard endpoint's** `whsec_`, not a `stripe listen` one.
3. Confirm `CLIENT_PORTAL_URL` = `https://client.patina.cloud`.

### Then — Part 2, six function deploys (in this order)
```
supabase --workdir /Users/kody/Code/patina-merged functions deploy invoice-link-checkout --no-verify-jwt
supabase --workdir /Users/kody/Code/patina-merged functions deploy create-checkout-session
supabase --workdir /Users/kody/Code/patina-merged functions deploy stripe-webhook
supabase --workdir /Users/kody/Code/patina-merged functions deploy invoice-send
supabase --workdir /Users/kody/Code/patina-merged functions deploy invoice-reminders
supabase --workdir /Users/kody/Code/patina-merged functions deploy invoice-check-intent
```
Prior versions for rollback (per the release judgment): `create-checkout-session` v45, `invoice-reminders` v44, `invoice-send` v45, `stripe-webhook` v49, `invoice-check-intent` v20; `invoice-link-checkout` is a first deploy (rollback = delete the function). Re-run the D3 importer grep first, and confirm `deno.lock` is absent afterwards.

Then the function probes (403 with a foreign `Origin`, 404 `invoice_not_found` with none, 405 on GET), the §12 smoke, the 19:17 sweep check, and the K11 live $1.03 card payment + refund pauses.

### Also owed
- **The 19:17 UTC sweep tick** — first `job_runs` row for `invoice-checkout-attempts-expire` (expect `succeeded`, `detail.expired` ≈ 12–13, guard query still 0).
- **Repoint `apps/designer-portal/.env.local`** to prod, or the export workaround is required on every designer deploy.
- Cloudflare dashboard: confirm no zone Cache Rule matches `/pay/*`.
- In a real browser on a `/pay/<token>`: confirm `caches.keys()` holds nothing matching `/pay/` (S1).
- Signed-in designer walk: a sent invoice's folio shows **Copy link** / **Regenerate link**; Copy yields the `/pay/<64hex>` URL; it opens signed out.
