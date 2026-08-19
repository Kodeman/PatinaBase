# Stripe webhook reconciliation — August 2026 signing-secret mismatch

**Header note: for Kody — read-only evidence gathered 2026-08-18.**

## What happened

The `stripe-webhook` edge function's signing secret did not match what Stripe
was signing deliveries with. Every delivery attempt failed the signature
check and Stripe received a `400`. This window ran from **2026-07-20** (the
last successfully processed real event before the mismatch) through
**2026-08-18 22:33 UTC**, when the secret was fixed. Deliveries during that
window were dropped at the edge — the function rejected them before any
handler logic ran, so nothing about them reached our tables except the fact
of the 400.

## Evidence gathered (read-only)

### 1. `public.stripe_webhook_events` — full table, ordered by `processed_at`

```
evt_1TqtT1JomPTxIV9mmyHwqCva   checkout.session.completed   2026-07-08 11:24:10.244978+00
evt_3TqtSzJomPTxIV9m0mH3ho7Y   payment_intent.succeeded     2026-07-08 11:24:50.659201+00
evt_3TqtSzJomPTxIV9m0VoCW7DS   charge.refunded              2026-07-08 11:29:01.503234+00
evt_3TsrIGJmCVe1Jxdu1cvGW6Zf   payment_intent.succeeded     2026-07-13 21:21:42.293830+00
evt_3TsrIGJmCVe1Jxdu1Xwpknve   charge.succeeded             2026-07-13 21:21:42.332869+00
evt_1Tv5yVJmCVe1JxduDCyjt5IY   balance.available            2026-07-20 01:26:33.753075+00   <- last real event before the gap
evt_claude_secret_verify_20260818          account.updated  2026-08-18 22:33:20.131367+00   <- synthetic
evt_claude_secret_verify_20260818_proxy    account.updated  2026-08-18 22:33:36.027271+00   <- synthetic
```

This is exactly the shape the mismatch predicts: nothing landed between
2026-07-20 01:26 and the two synthetic secret-verification rows at 08-18
22:33. `stripe_webhook_events` only records events whose signature check
*passed* — a 400 never reaches the insert, so this table is silent about the
rejected deliveries and only tells us where the gap starts and ends.

### 2. Edge function logs — `function_edge_logs`, `event_message like '%stripe-webhook%'`, 2026-08-12 20:00–23:00 UTC

Six rejected deliveries, all `POST | 400 | .../functions/v1/stripe-webhook`:

```
2026-08-12T20:58:14.434Z
2026-08-12T20:58:14.600Z
2026-08-12T20:58:28.814Z
2026-08-12T20:58:28.986Z
2026-08-12T21:57:52.507Z
2026-08-12T21:59:28.682Z
```

This matches the known incident exactly: two near-simultaneous pairs at
~20:58 (166ms and 172ms apart — Stripe's own send + immediate retry) and two
further singles at 21:57:52 and 21:59:28 (~96s apart — a second delivery
attempt and its retry). Six requests, six 400s, no exceptions.

### 3. Payable-state snapshot — the internal tables that are source of truth

Queried `information_schema.tables` for payment-shaped tables in `public`,
then read each around the incident window:

- `public.invoice_payments`
- `public.po_payments`
- `public.project_payment_milestones`
- `public.proposal_payment_milestones`

**Match found** — `public.invoice_payments`, invoice `a031a1a6-e597-40c7-8120-7d00111f6b8e`:

| id | created_at | updated_at | status | stripe_checkout_session_id |
|---|---|---|---|---|
| `8de8f243-…` | 2026-08-08 15:31:54 | 2026-08-12 20:57:31 | `failed` | `cs_test_b1G2ox…` |
| `ac13b135-…` | 2026-08-12 20:57:31 | 2026-08-12 20:57:43 | `failed` | `cs_test_b1zJuh…` |
| `dbc4ca83-…` | 2026-08-12 20:57:43 | 2026-08-12 20:57:43 | **`pending`** | `cs_test_b1cLxQ…` |

The third row (`dbc4ca83…`, $35,000.00, method `stripe`) was created at
20:57:43 — one minute before the first pair of rejected webhook deliveries at
20:58:14/20:58:28 — and has sat at `status = pending` ever since, with no
`stripe_payment_intent_id` or `stripe_event_id` ever populated. This is very
likely the `checkout.session.completed` / `payment_intent.succeeded` pair
Stripe tried and failed to deliver for this session: the checkout succeeded
on Stripe's side, but the webhook that would have flipped this row to
`succeeded` never landed because of the signature mismatch.

**No match found** for the second window (21:57:52–21:59:28 UTC) in any of
the four payable-state tables — no row in `invoice_payments`,
`project_payment_milestones`, or `po_payments` (which has no rows at all in
the surrounding window; `proposal_payment_milestones` has no Stripe columns
to check). This second pair may correspond to a checkout session that was
never associated with one of our local rows (e.g. an abandoned or
out-of-band Stripe test event), or to a session recorded under a table shape
this query didn't check. It needs to be identified from the Stripe Dashboard
delivery log directly (see below) rather than inferred from our tables.

## What likely dropped

- **Confirmed**: one Stripe Checkout completion for invoice
  `a031a1a6-e597-40c7-8120-7d00111f6b8e` ($35,000.00), checkout session
  `cs_test_b1cLxQNfQndV1JTzGHzNekH3JdW7Q1gINeUx91AIFFqVcnRGKUAWXQqaf8`,
  attempted ~20:58 UTC on 2026-08-12. The local row is stuck at `pending`.
- **Unconfirmed, needs Dashboard lookup**: whatever event(s) Stripe tried to
  deliver at 21:57:52 and 21:59:28 UTC on 2026-08-12 — likely another
  `checkout.session.completed`/`payment_intent.succeeded` pair for a
  different session, since the failure pattern (two singles ~96s apart) looks
  like Stripe's own retry cadence, not two unrelated events.
- **General**: any other genuine Stripe event in the full 2026-07-20 →
  2026-08-18 22:33 UTC window would have failed identically and left no
  trace in `stripe_webhook_events`. The two confirmed windows above
  (2026-08-12) are the only ones with edge-function log evidence within the
  6-hour-ish retention we could query in one call; older 400s in the gap, if
  any, were not re-queried here and should be checked in the Stripe
  Dashboard delivery log directly (see below), which is authoritative for
  the full window.

## What Kody should do

1. **Stripe Dashboard → Developers → Webhooks → [the endpoint] → recent
   deliveries.** Filter to the `2026-07-20`–`2026-08-18` window and look at
   every `400` (signature-verification failed) delivery. For each failed
   delivery, Stripe offers a **Resend** action — use it. Since the signing
   secret is now fixed (as of 2026-08-18 22:33 UTC), a resend will pass
   signature verification and run the normal handler, which will write the
   real row.
2. **For the confirmed invoice `a031a1a6…` session** — resending will flip
   `invoice_payments` row `dbc4ca83-…` to `succeeded` (or whatever the actual
   Stripe-side outcome was) automatically via the normal handler path. No
   manual SQL needed if the Resend succeeds.
3. **Where the Dashboard no longer offers Resend** (Stripe does not retain
   the resend option indefinitely for very old failed deliveries) —
   reconcile manually **toward the internal tables**, which are the source
   of truth per the Agent OS rules: pull the event/session/payment-intent
   details from the Stripe Dashboard or API directly, and update the
   matching `invoice_payments` / `po_payments` / `project_payment_milestones`
   row to reflect what actually happened on Stripe's side. Do not treat
   Stripe as more authoritative than these tables — reconcile Stripe's
   record toward ours, not the reverse.
4. **The second, unmatched 08-12 21:57–21:59 window** — identify the
   session/event from the Dashboard delivery log before deciding whether it
   needs any local write at all; it may turn out to be a customer who
   abandoned checkout, in which case there is nothing to reconcile.
5. **Two synthetic rows in `stripe_webhook_events`** —
   `evt_claude_secret_verify_20260818` and
   `evt_claude_secret_verify_20260818_proxy` (both `account.updated`,
   2026-08-18 22:33:20 / 22:33:36 UTC) were inserted while verifying the
   fixed signing secret. They carry no real payment data. Deleting them is
   optional and entirely Kody's call — flagging here rather than removing
   them, since this task is read-only.

## What was NOT done here (by design — read-only task)

- No Stripe Dashboard access, no resends, no writes to any Supabase table.
- No secrets or PII included above — only event ids, types, timestamps, and
  internal row ids/amounts/status already visible to anyone with prod DB
  access.
