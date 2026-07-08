# Task 6 report — Refund reconciliation v1

Status: **DONE**

Scope: partially lift the "refund state machine is v2" deferral. FULL refunds flip
payable state and reverse accounting; PARTIAL refunds only log + notify. No portal/
hook/UI changes.

Files:
- `supabase/migrations/00268_refund_reconciliation.sql` (new)
- `supabase/functions/stripe-webhook/index.ts` (charge.refunded handler)
- `supabase/functions/_shared/invoice-emails.ts` (`buildPaymentRefundedEmail`)
- `supabase/functions/tests/stripe-rail.test.ts` (+5 harness steps)
- `supabase/functions/tests/refund_reconciliation.assert.sql` (new; SQL-level BEGIN/ROLLBACK)

---

## 1. Latest `apply_invoice_payment_effects` lineage

`grep -rln apply_invoice_payment_effects supabase/migrations` returns **only
00178_invoices_v1.sql** — no migration after 00178 CREATE-OR-REPLACEs it. So the
00178 body IS the latest lineage; 00268 works from it.

What the 00178 body ALREADY does correctly for a `succeeded → refunded` transition
(the trigger fires on `AFTER INSERT OR UPDATE OF status`):
- `amount_paid_cents` is recomputed as `SUM(amount_cents) WHERE status='succeeded'` —
  a refunded row already stops counting.
- Status re-derivation already: `void` stays `void` (never resurrected); `paid` if
  `paid >= total`; `partially_paid` if `paid > 0`; else if it was `partially_paid`/
  `paid` it falls back to **`sent`**. (There is no `overdue` status in this schema —
  A/R aging is a separate `ar_flagged_at` timestamp, so "back to sent" is the exact
  existing behavior; I followed it verbatim.)
- `paid_at` is cleared whenever the new status isn't `paid`.

The pre-migration run of the psql assertion confirmed this: **R1–R4 passed before
00268** (amount/status/paid_at derivation was already right). The two gaps 00268
fills, both proven by the pre-migration red:
- **R5 FAIL** — the milestone stayed `paid` after a refund (no reverse flip existed).
- **ERROR at R6** — no earnings reversal (and no `reverses_invoice_payment_id` column).

So 00268 preserves the forward derivation byte-for-byte and adds exactly two reverse
effects.

## 2. `designer_earnings` shape + reversal choice → NEGATIVE CONTRA ROW (not DELETE)

`designer_earnings` (00014) is **not a plain ledger** — it carries settlement/payout
state: `status` (`pending|confirmed|paid|cancelled`), `payout_id` (payout-batch ref),
and `paid_at`. 00178's forward insert marks stripe money `confirmed` and manual money
`paid`.

Per the brief's decision rule ("if there is any settlement/payout tracking, INSERT an
idempotent negative reversal row"), a hard DELETE is wrong: the refunded payment's
earnings row could already be netted into a designer payout batch, and deleting it
would silently corrupt payout history and unbalance the books. So the reversal is a
**negative contra row**:
- mirrors the original's `source_type`, `status`, `invoice_id`, `project_id` (so it
  nets inside the SAME status bucket the credit landed in — any `SUM(net_amount)`
  grouped by designer and status nets the refund out while both rows stay auditable),
- negates `gross_amount`/`platform_fee`/`net_amount`,
- `paid_at = NULL` (a clawback recognized now, not yet payout-settled),
- `invoice_payment_id = NULL` — **critical**: the original credit already holds that
  value under 00178's `uniq_designer_earnings_invoice_payment` partial-unique index, so
  the contra row cannot reuse it.

**Idempotency key:** a new column `designer_earnings.reverses_invoice_payment_id` with
its own partial-unique index `uniq_designer_earnings_reversal`, and the insert uses
`ON CONFLICT (reverses_invoice_payment_id) … DO NOTHING`. One reversal per payment,
ever — replay-safe against webhook retries, distinct-event refund replays, and trigger
re-fires. (`designer_earnings` has zero CHECK constraints, so negative amounts are
allowed.)

## 3. Milestone reversal decision → SAFE, reverted `paid → outstanding`

`project_payment_milestones.status` is a bare CHECK (`pending|outstanding|paid`) with
**no state-machine trigger** (`grep` for any trigger defined `ON
project_payment_milestones` → zero). The 00178 forward flip sets linked milestone lines
to `paid` only on the invoice's transition **into** `paid`. The reverse is therefore
safe and symmetric: when a refund drops the invoice **below** paid
(`v_was_paid AND v_new_status <> 'paid'`), the milestone lines this invoice paid through
return to **`outstanding`** (their issue-time state — the invoice is still live and
still billing them) with `paid_at` cleared. Idempotent via the `m.status = 'paid'`
guard (a replay finds them already outstanding). I did **not** invent any new state.

## 4. Full/partial detection condition

On the pinned API version (`2025-02-24.acacia`) the `charge.refunded` event's object is
a `Stripe.Charge`. Condition used (robust, belt-and-suspenders):

```
captured = charge.amount_captured ?? charge.amount ?? 0
refunded = charge.amount_refunded ?? 0
full     = charge.refunded === true || (captured > 0 && refunded >= captured)
```

`charge.refunded` is Stripe's own "fully refunded" boolean; the amount comparison
covers partial-capture edges and is the primary safety net. `amount_captured` (not
`amount`) is the denominator because it's the actually-charged amount.

Resolution order for the PaymentIntent: `invoice_payments.stripe_payment_intent_id` →
`po_payments.stripe_payment_intent_id` → `direct_orders.stripe_payment_intent_id`.
Unmatched PI → log + 200 (no error-loop). Per-type FULL behavior:
- **invoice**: flip `status='refunded'` guarded `.eq('status','succeeded')`; the 00268
  trigger does all accounting. Designer email (`buildPaymentRefundedEmail` via
  `sendCompliantEmail`, category `operational`) + designer `notification_log` in_app row
  (mirrors the failure path).
- **po_payment**: `state='refunded'` guarded `.eq('state','paid')`, `paid_date` kept;
  `procurement_notifications` row `kind='payment_refunded'` (new enum value).
- **direct_order**: `status='refunded'` guarded `.eq('status','paid')`; ops email via
  `OPS_NOTIFY_EMAIL`, all interpolated values escaped (fixes the unescaped-ops-email
  minor noted in Task 5a — a local `escapeHtmlSafe` wraps every value).

PARTIAL: no state flip anywhere; log with amounts + the same notification marked
partial (invoice: `notification_log.metadata.partial=true` + designer email; po:
`payment_refunded` — `procurement_notifications` has no free-form detail column, so the
partial marker/amounts live in the structured console log; direct_order: ops email
marked partial). Idempotency: the event-id claim protects same-event replays; the state
guards protect distinct-event full-refund replays (a real partial refund is one Stripe
event, so there is no distinct-event partial replay to guard against).

**Enum/CHECK surface (00268):** `po_payment_state += 'refunded'`,
`procurement_notification_kind += 'payment_refunded'` (both `ADD VALUE IF NOT EXISTS` at
the TOP of the file, never USED below — dodges the add-value-in-same-txn pitfall; the
CHECK re-add uses the bare TEXT literal `'refunded'`, not the enum), and
`direct_orders_status_check` widened to include `'refunded'` (idempotent drop + re-add).
`invoice_payments.status` CHECK already allowed `'refunded'` (00178) — untouched.

## 5. Transcripts (trimmed)

**SQL assertion — pre-migration (RED):**
```
R1 PASS … R4 PASS
R5 FAIL: milestone status=paid …          ← 00178 doesn't un-pay milestones
ERROR:  column "reverses_invoice_payment_id" does not exist   ← no earnings reversal
```

**Migration apply:** `ALTER TYPE ×2, COMMENT, ALTER TABLE ×3, CREATE INDEX, CREATE
FUNCTION, REVOKE, GRANT, COMMENT` — clean. Re-apply is idempotent (`… already exists,
skipping`, no error).

**SQL assertion — post-migration (GREEN), 13/13 PASS:**
```
R1  settle → invoice paid, amount_paid=8000
R2  settle → milestone paid
R3  settle → 1 earnings credit net=8000
R4  full refund → invoice sent, amount_paid=0, paid_at cleared
R5  full refund → milestone back to outstanding, paid_at cleared
R6  full refund → 1 contra row net=-8000, invoice earnings net to 0
R7  two 4000 payments → invoice paid
R8  refund 1 of 2 → partially_paid, amount_paid=4000
R9  refund 1 of 2 (below paid) → milestone outstanding
R10 refund 1 of 2 → earnings net=4000, only refunded payment reversed
R11 void invoice stays void on settle
R12 void invoice stays void on refund (not resurrected)
R13 replay ×2 → no double reversal (contra_cnt=1, net=0, invoice sent, milestone outstanding)
```

**Deno harness (`run.sh`) — 1 passed (22 steps), 0 failed.** The 5 new steps:
```
invoice PARTIAL refund → no state change + partial notification            ok
invoice FULL refund → refunded + invoice reverted + earnings reversed      ok
invoice FULL refund distinct-event replay → no double reversal             ok
po_payment FULL refund → state refunded + notification                     ok
direct_order FULL refund → status refunded                                 ok
```
All 17 pre-existing steps still pass (invoice back-compat + po_payment + direct_order).

`deno check --config supabase/functions/deno.json` on the webhook and email files:
clean (the only `deno check` errors without the config are `Cannot find name 'Deno'`,
which affect the pre-existing file identically — environmental, not code).

## 6. Self-review

- **Forward logic preserved:** the 00178 derivation (amount recompute, status
  derivation incl. never-resurrect-void, paid_at, forward earnings upsert, forward
  milestone flip) is copied verbatim; only two reverse effects were added. Verified by
  R1–R3/R7/R11 still green and all 17 prior harness steps unaffected.
- **Idempotency proven at both layers:** SQL R13 (trigger re-fire ×2) and harness (e)
  (distinct-event refund replay) both show exactly one contra row and no double
  side-effect. The `ON CONFLICT (reverses_invoice_payment_id)` and the
  `.eq('status','succeeded')` / `.eq('state','paid')` / `.eq('status','paid')` guards
  are the two independent latches.
- **No error-loop on unmatched refunds:** unresolved PI → warn + 200; all side effects
  (emails, notifications) are wrapped and never throw, so a dead email can't fail-and-
  retry the webhook. The error → claim-deleted → Stripe-retry contract is untouched.
- **Ops-email escaping:** the new direct-order refund ops email escapes every
  interpolated value (`escapeHtmlSafe`), correcting the Task-5a unescaped-ops minor for
  the refund path.

### Concerns / notes for the integrator (non-blocking)
1. **Migration number collision** (same as prior tasks): local dev DB carries colliding
   numbers; 00268 was applied directly. Integrator renumbers at merge. The file is fully
   idempotent (IF NOT EXISTS / DROP-then-ADD / CREATE OR REPLACE).
2. **`add-value` ordering is load-bearing:** the two `ALTER TYPE … ADD VALUE` sit at the
   top and are never referenced elsewhere in the file. If a merge reorders statements or
   inlines a use of the new enum values, it will fail under Supabase's per-file txn. Keep
   them at the top.
3. **PARTIAL po/direct-order refunds carry no structured amount** in their notification
   row (procurement_notifications / ops email is the surface; the amounts are in the
   console log). Full partial-refund accounting remains a deliberate v2 item.
4. **Contra-row `status` mirrors the original** so buckets net. If/when a real payout
   engine lands (`payout_id` is currently a "Future" column, unused), confirm this
   netting matches its reconciliation query; a negative `paid`-status row with
   `payout_id=NULL` represents an unsettled clawback by design.
