# T4 · Synthesis rulings — Fable, 2026-09-06

Inputs: `design/01-directions.md` (T1), `architecture/02-system-design.md` (T2 v1), `review/03-adversarial.md` (T3, 49 findings). Kody's rulings K1–K3 stand. Everything below is binding on the architecture v2 (T2b), the mockup (T5) and the deck (T6).

## The direction

**B · The Statement**, as recommended, with two borrowings: from C, the three arrived-at totals shown on the chooser rows (every route's real total visible at once, the selected one promoted); from A, the studio-first letterhead and a print-only colophon line. No "same document as the folio" claim (G6) — the folio's colour cleanup is logged as a follow-up, not folded in.

## Rulings on the 49 findings

Every finding is **accepted as written** unless listed here with a different ruling.

| Finding | Ruling |
|---|---|
| M1, M2, M4, M6 | Accepted. `invoice_link_id` becomes a **first-class identity term everywhere `payer_id` is one**: `InvoiceCheckoutAttempt` type, the two driver guards ("exactly one of payer_id / invoice_link_id"), Stripe metadata on Session **and** PaymentIntent (`payable_type, invoice_id, checkout_attempt_id, invoice_link_id, payment_method`; `payer_id` omitted, never `"null"`), `assertInvoiceSessionIdentity`, `stripe-webhook/invoice-checkout-integrity.ts` (+ the `:207` select), and `finalize_invoice_checkout_attempt` / `recover_invoice_checkout_session_evidence` gain `p_invoice_link_id`. The CHECK is a real discriminated union. |
| M3 | Accepted. Actor change is a supersede reason (`'actor_changed'`), checked **below** the supersede branch in both claim RPCs; the caller expires the old Stripe session. Plus a pg_cron sweep (`invoice-checkout-attempts-expire`, hourly, via SQL RPC, history in `job_runs`) flipping `claimed`/`session_created` attempts older than 24h to `expired`. Three cases pinned in the SQL suite. |
| M5 | Accepted, the stronger form: persist the email Checkout collects (`session.customer_details.email` at `checkout.session.completed`) onto `invoice_links.payer_email`, and address receipts / failure letters there when no profile email resolves; `resolveRecipient` also falls back to `designer_clients` keyed on `designer_id` + project. Confirm Stripe's own receipt emails are ON in live mode as belt-and-braces. Folio copy tells the designer the truth: "the receipt goes to the address they give at checkout." W1/W3, not a follow-up. |
| M7, M8, M12 | Accepted. |
| M9 + M10 | Reconciled as one rule. `invoice_links.status` gains a third value **`closed`**, set by `void_invoice` in the same block that closes the local attempt (defence in depth: the row records death). The resolver treats `closed` as dead **unless** the invoice carries a `pending` or `requires_refund` payment, in which case it returns a minimal **settling sheet** (letterhead, invoice number, "a payment on this invoice is being sorted out by {studio}", studio contact; no amounts to pay, no chooser). `void_invoice` refuses while an attempt is `processing` (money in flight, ACH) with `invoice_checkout_in_progress`; `claimed`/`session_created` do not block a void. The settling sheet is a mockup state. |
| M11 | `regenerate_invoice_link` refuses while an attempt is `claimed` / `session_created` / `processing` — error `invoice_checkout_in_progress`; the folio says "A payment is in progress on this invoice. Try again later." (the M3 sweep clears abandoned sessions within 24h). No grace window for revoked tokens. |
| S1 | Accepted. `NetworkOnly` runtimeCaching for `^https?://[^/]+/(pay|plans|share|rfq|evidence|field)/` **before** the catch-all; Playwright asserts `caches` holds nothing for `/pay/`. |
| S2, S4, S5, S6, S7, S8, S9, S11, S12, S13 | Accepted. S8: widen the no-store/noindex block to **all** bearer prefixes in the same wave. S4: fail open in dev, fail **loud** in production (error log + PostHog event when the binding is missing), smoke step proves 31 rapid requests → dead link. |
| S3 | Accepted, the strict form: `invoice-link-checkout` drops wildcard CORS. It accepts only requests whose `Origin` is absent (the Worker's server-side call) or equals `CLIENT_PORTAL_URL`; anything else is 403. iOS opens the page, not the function. The deck names 256-bit entropy as the control and the limiter as friction. |
| S10 | **Ruled for the nonce.** The token is a permanent credential (K2), so it does not go into Stripe's retained logs. `invoice_checkout_attempts.return_nonce` (32 random bytes, hex, unique); success/cancel URLs become `{CLIENT_PORTAL_URL}/pay/return/<nonce>?checkout=success&session_id={CHECKOUT_SESSION_ID}` (resp. `cancelled`); a new route `app/pay/return/[nonce]/route.ts` looks the attempt up (service client, no-store, rate-limited) and 303s to `/pay/<token>?checkout=…` carrying the same query. The nonce is single-purpose and stays valid for the attempt's life. Applies to **both** rails (the signed-in `create-checkout-session` invoice path too), so Stripe never sees a token. |
| I1, I2, I3 | Accepted. I1's comment at `stripe-webhook/index.ts:414-420` is rewritten in the same commit; the reversal is recorded in R137. |
| D1 | Accepted. The client-portal work splits: **W2 ships `/pay/[token]` additively** (letterbox and print sheet untouched, both surfaces live); **the retirement of settle-in-place and `/invoices/[id]/print` is its own later deploy** (W3b) after the functions have soaked. Every step rolls back alone. |
| D2, D3, D4 | Accepted. |
| G1 | Accepted. `moneyInWords` is banned from this page. Every figure is `formatCurrency`. No spelled-out money anywhere, including accessible names. |
| G2 | Accepted. Fixture: Invoice No. 4 **total $16,730.00**, received **$7,605.00**, balance **$9,125.00** due 15 August 2026; lines = sconces $2,340, drapery $2,890, runner $1,660, walnut credenza $8,400 (deposit or in full — T5 decides and labels honestly), paintwork $1,440. The deck caveats that composing the named amounts onto Invoice No. 4 is the mockup's own arrangement. |
| G3, G4 | Accepted. Drop "lowest fee of the three". Fee explanations: card → "This covers what card processing costs."; bank transfer → "Bank transfer costs the least to process."; check → "No fee." No "rail", no "doesn't add to it". |
| G5 | Accepted. `card_surcharge_bps` is always the coalesced integer (300 default). The "—"/held state is deleted everywhere. `check_remit_to` NULL → the tested `CHECK_REMIT_FALLBACK` ("Contact your designer for mailing details"). |
| G6 | Drop the "same document" claim; folio colour cleanup → follow-up list. |
| G7 | The link-payer path **is built** (K2). `pay.has_payer` is removed from the payload; the payload carries `pay.rails` (always all three today) and `pay.processing`. The check-only "no payer" state is deleted from the mockup. |
| G8, G9, G10, G11, G12 | Accepted. Paper: page ground `--color-off-white #FAF7F2`, the sheet `--doc-paper #FCFAF6`, hairline `--doc-ink-border`. |
| V1 | **Ruled: `client.patina.cloud/pay/<token>` stands**, as a decision. One Worker, one AASA, no new DNS/route/env split; the host is invisible behind a mail button. Recorded in the deck. |
| V3 | `view_count` stays for support diagnostics and is **not surfaced** in v1. |
| V2, V4, M13 | Verified clean; no action. |

## The design lead's six questions — ruled

1. Card rate: always 300 when unconfigured; no held state (G5).
2. The token prints: accepted; one print-only colophon line — "This sheet carries a payment link. Treat it like a check."
3. Surcharge on paper: an unpaid sheet prints no fee and no Total to pay; a paid sheet prints the charged figure on the payment row.
4. Void: dead (K2), with the **settling sheet** for void-with-pending/requires_refund (M9+M10). "Withdrawn by {studio}" stays an owed ruling with something to look at.
5. The check: payee is the **studio** (`studio.name` over the remit-to address, "Write Invoice No. 4 on the memo line"); the notify act names the **designer** ("Let Nora know a check is coming").
6. ACH first and pre-selected stays; the claims beside it are fixed (G3/G4); three real totals visible so the reader can overrule the nudge in one click.

## The architect's seven open rulings — ruled

1. Payer-less invoices → link-payer path, built as a first-class identity term (M1–M4). 2. Void → dead + settling sheet. 3. Print sheet → retired, in the later separately-revertible deploy (D1). 4. Host → `client.patina.cloud` (V1). 5. Link lifetime → no expiry (K2). 6. `view_count` → not surfaced (V3). 7. Rate-limit namespace id → **owed Kody** (account-scoped; pick one no other Patina Worker uses).

## Waves (revised for D1)

W1 the link + guest rail (DB, `_shared` lift, `invoice-link-checkout`, nonce return, sweep cron, SQL/Deno gates) · W2 the page, additive (`/pay/[token]`, `/pay/return/[nonce]`, PWA NetworkOnly, limiter on all three routes, analytics redaction, e2e) · W3 producers + folio (letters, return URLs, Copy/Regenerate, hooks, utils) — deploy chain: migration → client portal → designer portal → six functions · **W3b** retire settle-in-place + print sheet (separate deploy, after soak) · W4 iOS Pay-via-link + R137 + follow-ups (folio colour, `pay.patina.cloud` never).

## Owed Kody (surfaced in the deck)

Rate-limit namespace id · "withdrawn by {studio}" vs dead · whether Stripe receipt emails are on in live mode · the standing `STRIPE_SECRET_KEY` account mismatch (docs/ops/stripe-rail-verification.md) must be fixed before any guest payment is real.
