# The Invoice, Standing Alone — deploy report, Part 2

**Date:** 2026-09-06 · **Authority:** Kody, K8 satisfied + K9 standing production authority
**Scope:** the six edge functions, their probes, secrets alignment, and the J22 first-tick result.
**Deployed from:** `/Users/kody/Code/patina-merged`, code tree `b915072bb` (HEAD `743004e22` is Part 1's docs commit on top — no code delta).
**Stopped after:** probes. No money has moved. The first checkout attempt on the proof invoice will be Kody's click.

---

## 1. K8 precondition — verified, not taken on trust

`supabase secrets list --project-ref bkvcixdmuyejfzcijpdg` — all five required names present, SHA-256 digests (64 hex), **prefixes only, no values**:

| Secret | Digest prefix |
|---|---|
| `STRIPE_SECRET_KEY` | `f77793acc6b7…` |
| `STRIPE_WEBHOOK_SECRET` | `7815437ad81e…` |
| `CLIENT_PORTAL_URL` | `4df56e9bfc14…` |
| `RESEND_API_KEY` | `35157899d0f9…` |
| `SUPABASE_SERVICE_ROLE_KEY` | `7110f3b82f50…` |

> **Honest limitation:** Part 1 never captured a baseline digest, so these prove the secrets **exist**, not that `STRIPE_SECRET_KEY` was *changed* to the live value. That it is live-mode is Kody's assertion plus the `cs_live_…` session id his payment will produce — recorded as the real proof in §5. Likewise `CLIENT_PORTAL_URL`'s *value* is unread by design; §4's `Access-Control-Allow-Origin` echo gives indirect confirmation.

## 2. Redeploy set — re-grepped before deploying (D3)

Importers of the three new `_shared` modules — **exactly six**, matching the release judgment:

```
create-checkout-session  invoice-check-intent  invoice-link-checkout
invoice-reminders        invoice-send          stripe-webhook
```

`_shared` modules the branch touched (non-test) — six, and nothing else:
`invoice-check-intent-core.ts`, `invoice-checkout-core.ts`, `invoice-checkout-driver.ts`, `invoice-checkout-stripe.ts`, `invoice-emails.ts`, `invoice-links.ts`. (`client-portal-links.ts` untouched, as expected.)

`supabase/config.toml:356-357` carries `[functions.invoice-link-checkout] / verify_jwt = false`.

## 3. The six deploys

Deployed one at a time by name, `invoice-link-checkout` first with `--no-verify-jwt`. Every one returned `"message":"Deployed Functions."`.

| Function | Prior (rollback) | New | `verify_jwt` | Status |
|---|---|---|---|---|
| `invoice-link-checkout` | — *(first deploy)* | **v1** | **false** ✅ | ACTIVE |
| `create-checkout-session` | v45 | **v46** | true | ACTIVE |
| `stripe-webhook` | v49 | **v50** | false *(Stripe-signature authed)* | ACTIVE |
| `invoice-send` | v45 | **v46** | true | ACTIVE |
| `invoice-reminders` | v44 | **v45** | true | ACTIVE |
| `invoice-check-intent` | v20 | **v21** | true | ACTIVE |

Each moved exactly one version — no double deploys, nothing else on the project touched (81 functions total, 75 untouched). **`deno.lock` absent at the repo root** afterwards ✅.

**Rollback:** redeploy the prior version from the dashboard's version history (or `git show 19f64a0a1:supabase/functions/<fn>/index.ts` into a worktree and redeploy). `invoice-link-checkout` rollback = `supabase functions delete invoice-link-checkout`. Any `/pay` link already in the wild keeps working, because the client-portal route (Part 1) stands independently.

## 4. Probes — all seven as specified, no money moved

Endpoint `https://bkvcixdmuyejfzcijpdg.supabase.co/functions/v1/invoice-link-checkout`.

| # | Probe | Result |
|---|---|---|
| 1 | random 64-hex token, `method:"card"`, with `apikey` | **404** `{"error":"invoice_not_found"}` ✅ |
| 2 | **no `apikey` header at all** | **404** `invoice_not_found` — **not 401** ✅ → `verify_jwt=false` confirmed live at the gateway |
| 3 | `Origin: https://evil.example` | **403** `{"error":"forbidden_origin"}` ✅ |
| 4 | **real** proof token + `method:"bitcoin"` | **400** `{"error":"bad_payment_method"}` ✅ |
| 5 | `GET` | **405** `{"error":"method_not_allowed"}` ✅ |
| 6 | malformed token `"not-a-token"` | **404** `invoice_not_found` — **byte-identical to #1** ✅ → the endpoint never confirms what a token is |
| 7 | `Origin: https://client.patina.cloud` | **404**, not 403 ✅ → the allowlist admits the real portal |

**Probe 4 was safe by construction, verified before firing.** `invoice-link-checkout/index.ts:142-145` returns `bad_payment_method` *before* the `admin` client is constructed and before any `resolve_invoice_link_for_checkout` round trip — no claim, no Stripe call. Confirmed after the fact:

```
attempts on invoice e87c87d1…  ->  []          (empty — no claim was created)
invoice e87c87d1…              ->  sent, total 100, amount_paid 0   (untouched)
invoice_links (proof)          ->  active, revoked_at NULL,
                                   payer_email NULL, stripe_customer_id NULL
```

The proof invoice is pristine. **The first `invoice_checkout_attempts` row on it will be Kody's click**, exactly as intended.

## 5. What Kody's payment must show (not yet observable)

Deliberately not probed — a `cs_live_…` session id only exists once he opens Checkout:

```sql
select stripe_checkout_session_id, state, payment_method, invoice_link_id, payer_id
  from invoice_checkout_attempts
 where invoice_id = 'e87c87d1-1cd9-44cb-bd6d-d15006fa4f40';
-- expect: cs_live_…, session_created, card, invoice_link_id SET, payer_id NULL
```

`payer_id NULL` is the F5 ruling made visible: the guest rail pays as the **link**, never as the household profile.

## 6. J22 — the sweep's first tick, now observed ✅

Both ticks landed while Part 2 was running:

| Tick (UTC) | Status | `detail` |
|---|---|---|
| **19:17** (first) | `succeeded` | `{"expired": 13, "payments_failed": 13, "pointers_cleared": 0}` |
| 20:17 (second) | `succeeded` | `{"expired": 0, "payments_failed": 0, "pointers_cleared": 0}` — idempotent no-op |

Exactly the 13 stale `session_created` rows from Part 1's snapshot. Attempts now: **13 `expired`, 6 `superseded`, 0 `session_created`**.

**Nothing real was harmed** — the J22 fear, checked four ways:

| Check | Result |
|---|---|
| Of the 13 expired attempts: how many carried a Stripe payment intent? | **0** |
| …how many had a `succeeded` payment? | **0** |
| `invoice_payments` flipped to `failed` with a real PI in the last 3 h | **0** |
| Invoices by status | 7 draft / **9** sent / **14** paid / 1 void — `paid` unchanged; `sent` 8 → 9 is only the new proof invoice |

## 7. Not done

- **The proof invoice's letter was NOT sent.** `invoice-send` requires a caller JWT (`verify_jwt = true`) and there is no documented service-role path to invoke it as Kody's designer. Kody pays from the page link in Part 1's report; the receipt letter (a `stripe-webhook` consequence, not `invoice-send`) will still arrive and is part of the settlement check.
- No refund, no settlement verification — those follow Kody's two pauses.

---

## Next: Kody pays

Open, signed out, ideally on a phone:

```
https://client.patina.cloud/pay/71a7dc8814c6e4cb61ec860b74a38ba223e21ac7988be912dd947a3d86a3445e
```

Choose **Bank transfer** first (back out without paying) to prove `us_bank_account` is offered on the live account — the ACH session fails loudly if ACH is not enabled. Then choose **Card** and pay **$1.03**.

Then resume this session for the settlement verification: `stripe_webhook_events` row, `invoice_payments` `succeeded` / `amount_cents` 100 / `surcharge_cents` **3** / `stripe_payment_method_type` `card`, attempt `succeeded`, `invoice_links.payer_email` set, invoice `paid` with `amount_paid_cents` 100, the `designer_earnings` row, the receipt letter in `notification_log`, the page's **Paid in full** state with the "+ $0.03 processing fee ($1.03 charged)" row, and the folio's payment row. Then the refund reconciliation after his second pause.
