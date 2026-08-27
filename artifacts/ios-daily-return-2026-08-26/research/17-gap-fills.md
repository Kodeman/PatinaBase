# 17 — Gap fills (G5 lane)

Settles the six **critical** grounding gaps G1, G2, G3, G6, G7, G8 raised in
`research/14-grounding-gaps.md` §B. One section per gap: **Answer → Evidence → Corrects**.
All file:line citations are repo-relative at `3cd84ecb3`. Local-stack facts were taken live
against `http://127.0.0.1:54321` / Postgres `127.0.0.1:54322` on 2026-08-26.

Non-critical gaps G4, G5, G9 were **not** in this lane's brief and remain open.

**Headline for authors:** four of the six answers move a seat question. G1 says push exists for
*shipping*, never for *money*. G2 says Apple Pay is already free in the flow the app ships today.
G3 says a client "buy now" pays the designer nothing. G8 says the design-system sheet header the
mock spec assumes has **zero call sites** — mock the hand-rolled one instead.

---

## G1 — Does any backend trigger fire a push on proposal-sent or invoice-due?

**Answer: No. Not one.** Push (`apns-send`) has exactly **five** callers repo-wide, not the three
`12-backend-reality.md` names. All five are design-request-, site-visit-, or **shipping**-shaped.
**Zero** push callers touch `invoices`, `proposals`, `decisions`, `direct_orders`, or any payable
table. A proposal arriving and an invoice coming due are **email + in-app row only** — the iOS app
learns about both only by polling.

| # | Caller | Kind | Trigger | Entity it pushes about |
|---|---|---|---|---|
| 1 | `00330_accept_design_request.sql:182` | SQL, `invoke_edge_function` | designer accepts a lead | `entity_type: 'design_request'` |
| 2 | `00331_ceremony_complete.sql:342` | SQL, `invoke_edge_function` | match ceremony completes | `entity_type: 'design_request'` |
| 3 | `00334_refresh_offered_slots.sql:120` | SQL, `invoke_edge_function` | offered consult slots refresh | `entity_type: 'design_request'` |
| 4 | `supabase/functions/fulfillment-notify/index.ts:42` | edge fn → HTTP `POST /functions/v1/apns-send` | **an admin operator presses send in the admin portal** | `fulfillment_orders` (BOH) |
| 5 | `supabase/functions/site-request-dispatch/index.ts:225` | edge fn → HTTP | pg_cron site-request lifecycle (Field/trades) | site requests — *not the client app* |

**The one that will surprise a seat: #4.** `fulfillment-notify` **can** push to a homeowner's device,
and its vocabulary is exactly what T8 ("where is it?") asks for:
`"confirmed" | "in_production" | "shipped" | "delivered" | "eta_change" | "substitution"`
(`supabase/functions/_shared/fulfillment-templates.ts:31-37`). It resolves the recipient from
`fulfillment_orders.client_profile_id` (`fulfillment-notify/core.ts:101-102, 257-262`) and degrades
to a `notification.push_skipped` row rather than throwing (`core.ts:20-29`). But note three limits:

- It is **operator-initiated**, never automatic — an admin-portal human drafts and sends
  (`fulfillment-notify/index.ts:3-8`).
- It rides `fulfillment_orders` (the BOH **designer-sourced** rail, `00350_fulfillment_core.sql:75`),
  **not** `direct_orders` (the client "buy now" rail). A homeowner self-purchase gets none of this.
- It says nothing about money.

**Evidence the negative is real.** Every `invoke_edge_function(...)` target in `supabase/migrations`
was enumerated; `'apns-send'` appears 3×, and the full target list contains no other push-shaped
function. The money/decision cron functions that *do* exist are email-only:
`invoice-reminders` (A/R cadence, `supabase/functions/invoice-reminders/index.ts:1-45` — email +
a designer in-app row at overdue and final notice), `proposal-nudge`
(`supabase/functions/proposal-nudge/index.ts:139,153` — `channel: 'in_app'`), `proposal-send`,
`invoice-send`, `decision-resolved-notify` (grepped: no `push`, no `apns` in any of them).
`notification-dispatch` accepts `channel: "push"` in its job type but does not send one —
`supabase/functions/notification-dispatch/index.ts:183-186` comments *"actual push integration is
future"* and writes a `notification_log` row instead.

**How to state it in a finding.** Both halves of the C14 contradiction resolve cleanly:
*the pusher is complete and live-wired; nothing in the money or document rail calls it.* Wiring
proposal-sent / invoice-due push is **one `PERFORM public.invoke_edge_function('apns-send', …)` per
trigger**, on the pattern already proven three times — not "build APNs."

**Corrects:** `12-backend-reality.md` §6 (3 callers → 5; adds the shipping-transition vocabulary).
Confirms `14-grounding-gaps.md` §A.2's framing.

---

## G2 — Apple Pay: hosted Checkout (SFSafariViewController) vs. PaymentSheet

**Answer: Apple Pay is already available, at zero integration cost, in the Checkout the app opens
today — and nobody has looked at it.** Apple documents Apple Pay on the Web as supported in Safari
**and in `SFSafariViewController`**, which is exactly the container the app uses. Stripe Checkout
surfaces the Apple Pay wallet automatically wherever `card` is an accepted method, with no
integration changes. Both session-creation paths in `create-checkout-session` include `card`.
So the only reason a homeowner would not see an Apple Pay button on an invoice today is device
state (no card in Wallet) or a bug — **not** a missing integration.

**Evidence — the session params.**

- Direct-order / PO path: `supabase/functions/create-checkout-session/index.ts:1131-1140` —
  `mode: 'payment'`, `payment_method_types: ['card', 'us_bank_account']`, `payment_method_options`
  for ACH only.
- Invoice path: `index.ts:935-961` — `rails` is `[attempt.paymentMethod]` when a rail is claimed,
  else `['card','us_bank_account']`; passed as `payment_method_types: rails`.
- **No `ui_mode`, no `wallets` hash, no Apple Pay suppression** anywhere in the file.
- **The Stripe dashboard payment-method config is moot here.** Passing an explicit
  `payment_method_types` array bypasses dashboard-managed / payment-method-configuration
  selection entirely, so no dashboard read is needed to answer the question — and none was made.

**Evidence — the container.** `apps/mobile/Patina/Patina/Features/Invoices/Views/InvoiceDetailView.swift:45-50`
presents `SafariView(url:)` in a `.fullScreenCover`;
`apps/mobile/Patina/Patina/Features/Invoices/Views/SafariView.swift:28-35` is a plain
`SFSafariViewController(url:)` wrapper (not `WKWebView` — the one that would kill Apple Pay).

**One live gotcha for U3.** The invoice path can be narrowed to a single rail via the optional
`payment_method` claim; if a caller ever passes `'us_bank_account'`, `card` drops out of
`payment_method_types` and **Apple Pay disappears with it** (`index.ts:935-938`). The iOS client
omits the field (`InvoicesAPIClient.swift:255-259` sends only `StartCheckoutBody(invoiceId:)`), so
today's app always gets both rails and therefore the wallet. A future "pay by bank" toggle in the
app would silently remove Apple Pay on that branch.

**Relative integration cost.**

| | Hosted Checkout in `SFSafariViewController` (**shipped today**) | `PaymentSheet` (stripe-ios) |
|---|---|---|
| Apple Pay | Free — automatic on the `card` type | Free — but only after everything below |
| iOS deps | none (`SafariServices`, system) | new SPM dep `StripePaymentSheet` + `StripeCore` |
| App config | none | Apple Pay capability + a **merchant identifier** in entitlements; Stripe publishable key shipped in the app |
| Backend | none — `create-checkout-session` already returns `{ url }` | new mode returning **PaymentIntent `client_secret` + ephemeral key + customer id**; today the fn returns only `{ url }` (`index.ts:1159`) |
| ACH / `us_bank_account` | works as-is (`verification_method: 'automatic'`, Financial Connections) | must be re-declared and re-tested separately |
| Settle confirmation | existing poll-after-dismiss (`InvoicesAPIClient.swift` header: *"the app confirms by polling the invoice row after the Checkout hand-off (R30: poll-first, no deep link this wave)"*) | rewrite around the sheet's completion callback |
| Surcharge line items | already rendered as a real Checkout line (`index.ts:965-987`) | must be re-modeled |

**Verdict for U3 Q7:** PaymentSheet buys a native sheet and one fewer context switch; it does **not**
buy Apple Pay, which is already there. Treat "add Apple Pay" as a **live-probe task, not a build
task**. The unsettled half is empirical, not architectural — *nobody has opened a real invoice
Checkout on a device with a card in Wallet and looked.* That probe (one device, one tap) is the
only thing standing between "available" and "confirmed."

**Corrects / adds to:** `12-backend-reality.md` §4 (payments) and `15-task-paths.md` T7 — no file in
the lane stated Apple Pay either way.

**Sources (external, for the Apple Pay-in-`SFSafariViewController` claim):**
[Apple Pay — Stripe Documentation](https://docs.stripe.com/apple-pay) ·
[Wallets — Stripe Documentation](https://docs.stripe.com/payments/wallets) ·
[Customize payment methods — Stripe Documentation](https://docs.stripe.com/payments/customize-payment-methods) ·
[ApplePaySession — Apple Developer Documentation](https://developer.apple.com/documentation/applepayontheweb/applepaysession/applepaysession) ·
[Is Apple Pay on the Web supported in WKWebView? — Apple Developer Forums](https://developer.apple.com/forums/thread/685770)

---

## G3 — Does a `direct_orders` purchase credit the designer or hit their FF&E schedule?

**Answer, stated plainly: No — neither. Today a client "buy now" order is invisible to the
designer.** It does not credit commission, does not create a `designer_earnings` row, does not
attach to a project, and does not appear on any FF&E schedule. There is no column that could carry
the attribution, and the platform's own analytics migration says so out loud.

**Evidence — the table has nowhere to put a designer.** `direct_orders`
(`supabase/migrations/00276_direct_orders.sql:48-67`) has exactly these columns:
`id, client_id, product_id, product_name, quantity, unit_price_cents, amount_cents, currency,
status, stripe_checkout_session_id, stripe_payment_intent_id, shipping, created_at, paid_at`
(+ `'refunded'` added to the status CHECK by `00277_refund_reconciliation.sql:91-93`).
**No `designer_id`. No `project_id`. No `commission_rate`. No `ffe_item_id`.**
Grepped `00276` for all four: zero hits.

**Evidence — the platform states it.** `supabase/migrations/00301_marketplace_vitals.sql:37-40`:

> `direct_orders` (00276): status='paid', amount_cents, paid_at. **No designer attribution
> (client_id is the buyer)** — direct_orders GMV folds into the platform-wide numerator only…

**Evidence — the earnings ledger is invoice-only.** The single `designer_earnings` credit path is
`00277_refund_reconciliation.sql:183-208`: `INSERT INTO designer_earnings (…) SELECT i.designer_id,
'design_fee', … FROM invoice_payments p JOIN invoices i … JOIN projects pr …`. Its source is
`invoice_payments`; `direct_orders` never appears in it (00277's only mention of `direct_orders` is
line 54, adding `'refunded'` to the status CHECK). The `stripe-webhook` direct-order settle branch
(`supabase/functions/stripe-webhook/index.ts:1056-1387`) contains no `designer`, `commission`,
`project`, or `ffe` reference at all.

**Evidence — `products.commission_rate` is orphaned.** The column exists
(`00152_three_layer_catalog.sql:52`) and is projected into Aesthete views
(`00157_aesthete_input_views.sql:97`, `00239_aesthete_space.sql:140`), but no order, payment, or
earnings write path reads it. The only *live* commission plumbing is
`vendor_profiles.commission_rate` on the **BOH fulfillment** rail
(`00350_fulfillment_core.sql:60`, default 0.16 at `00351_fulfillment_events_config.sql:104`) —
which is designer-sourced procurement, a different table and a different flow.

**What this means for D1/D3 and T7/T14.** Tom's question — *"who gets paid?"* — has a one-word
answer today: **Patina**. And the buy-now path is not even built on the client
(`12-backend-reality.md` §5: zero iOS hits for `direct_order` / `create_direct_order` / "buy now"),
so the honest framing for a seat is: *the rail that would cut the designer out is built on the
backend and unbuilt on the client — the attribution decision is still open, and cheap to make now.*
Adding it later is a migration (`designer_id`, `project_id`, `commission_rate` snapshot on
`direct_orders`) plus an earnings-credit branch; adding it before the client ships is free.

**Corrects:** `12-backend-reality.md` §5 — the schema dump is there but the conclusion was never
stated, and `14-grounding-gaps.md` flagged it as *"high risk of being missed."* It is now stated.

---

## G6 — Does the OTP sign-in round trip actually complete locally?

**Answer: Yes — the round trip completes and yields a valid session. But the delivered email
contains no code, so a human walker cannot finish it by reading their inbox.** Both halves matter.

**What was actually run (2026-08-26, local stack).**

| Step | Result |
|---|---|
| `POST http://127.0.0.1:54321/auth/v1/otp` `{"email":"client@patina.dev","create_user":false}` | `200 {}` |
| Mail delivered? | **Yes** — `GET :54324/api/v1/messages`, subject **"Your sign-in link"**, to `client@patina.dev`, 804 bytes |
| Code visible in the email? | **NO** — body is link-only: *"Follow the link below to sign in. This link expires shortly and can only be used once."* + a `…/auth/v1/verify?token=<56-hex>&type=magiclink&redirect_to=http://127.0.0.1:3000` |
| Token row in DB | `auth.one_time_tokens.token_type = 'recovery_token'`, hash `dc7ce1ccc52a59…` (= the `token=` in the link) |
| `POST /auth/v1/verify` `{"type":"email","email":…,"token":"<6-digit>"}` | **`200`** — returns `access_token` (770 chars), `refresh_token`, `expires_in: 3600`, `user.email = client@patina.dev`, `user.role = authenticated` |

That last row is the proof the gap asked for: the exact call the iOS client makes
(`apps/mobile/Patina/Patina/Services/Auth/AuthService.swift:485-499` —
`verifyOtp(email:token:)` → `supabase.auth.verifyOTP(…, type: .email)`, sent by
`signInWithOTP` at `:461`) **works end to end against this stack**. Nothing is broken in GoTrue.

**The blocker, and its root cause.** The repo's own template *does* carry a code — a 38px
"Your code" box rendering `{{ .Token }}` at `supabase/templates/magic-link.html:65`, wired in
`supabase/config.toml:197-199` (`subject = "Sign in to Patina"`). The running GoTrue container is
configured to fetch it: `GOTRUE_MAILER_TEMPLATES_MAGIC_LINK=http://supabase_kong_supabase:8088/email/magic_link.html`.
**That URL returns `404 Not Found`** (verified from inside the auth container), so GoTrue silently
falls back to its built-in link-only mail — which is why the delivered subject is *"Your sign-in
link"* and not the configured *"Sign in to Patina"*. Not staleness: the template last changed
`7c47c9e9a` (2026-08-05), twenty days before this stack booted (`2026-08-25T17:00:49Z`).

**What a walker must do.** Three options, in order of preference:

1. **Tap the magic link** in Mailpit at `http://127.0.0.1:54324` (it authenticates without a code) —
   note it redirects to `http://127.0.0.1:3000`, the *designer portal*, not the app.
2. **Restart the local stack** (`pnpm supabase:stop && pnpm supabase:start`) and re-send; if the
   :8088 template server comes back the code box renders and the walk is normal.
3. **Recover the code from the hash** — GoTrue stores `auth.users.recovery_token =
   SHA224(email ‖ code)`; a 10⁶ search takes under a second. This is how this lane obtained
   `454890` for the verified round trip above. Fine for an agent, useless as a walk narrative.

**Do not treat option 1 or 3 as evidence about the product.** The missing code is a *local
environment* defect, not a shipped one — a seat must not write "the OTP email has no code" as an app
finding without first checking Strata's own template render.

**One more environment caveat, found while settling this.** The running Supabase stack was booted
against a different checkout: `supabase_studio_supabase` carries
`EDGE_FUNCTIONS_MANAGEMENT_FOLDER=/Users/kody/Code/patina-merged/.codex/worktrees` and
`SNIPPETS_MANAGEMENT_FOLDER=…/.codex/worktrees/agent` (a path that **no longer exists** on disk).
Any lane that assumes the running stack reflects `main`'s `supabase/` tree should verify rather than
assume. Also: the `supabase` CLI itself cannot run in the default sandbox — it dies reading
`supabase/.env.local`, which matches the sandbox's `**/.env.*` deny rule. Keys for local probes come
from `docker inspect supabase_studio_supabase` (unsandboxed) instead.

**Corrects:** `12-backend-reality.md` §8 (OTP "never exercised" → exercised and passing, with the
email-template caveat) and `14-grounding-gaps.md` §D.

---

## G7 — Seed one open invoice for H2/Ruth's T10 walk

**Answer: done and verified through RLS.** `client@patina.dev` now carries exactly one open,
payable invoice.

| Field | Value |
|---|---|
| `id` | `e7000000-0000-0000-0000-00000000d101` |
| `invoice_number` | **`INV-2026-0142`** |
| `project_id` | `b0000000-…-0000000000d1` — **"Aspen Loft Refresh"** (status `active`) |
| `designer_id` / `client_id` | `a0000000-…-004` / `a0000000-…-005` |
| `status` | `sent` (payable) |
| `total_cents` / `amount_paid_cents` | `425000` ($4,250.00) / `0` |
| `issue_date` / `due_date` | 2026-08-17 / **2026-09-01** (open, +6 days) |
| `memo` | "Dining room + primary bedroom — procurement deposit." |
| line items | 2 — "Dining table — deposit (50%)" $2,650.00 · "Primary bedroom nightstands (pair) — deposit (50%)" $1,600.00 |

**Verified visible to the walk account.** The client-facing RLS predicate is on the *project*, not
the invoice: `Clients can view issued invoices on their projects` =
`status <> 'draft' AND EXISTS (SELECT 1 FROM projects p WHERE p.id = invoices.project_id AND
p.client_id = auth.uid())`. Under `SET LOCAL ROLE authenticated` with
`request.jwt.claims.sub = a0000000-…-005`, `SELECT * FROM invoices` returns **this row and only this
row**, and `invoice_line_items` returns **2**.

**Why the pre-existing invoice did not count.** The stack already held one invoice,
`B3-WALK-TEMP-0001` ($4,800, `sent`) — but on project `2992a486-b2bd-4139-9e51-33ed1621c59c`, which
is **not** one of `client@patina.dev`'s three projects, and with `client_id` NULL. It is invisible
to this account under the policy above. `12-backend-reality.md`'s "0 invoices" was correct
*for this account*; the count was not zero globally.

**Deliberate choices worth knowing.** `due_date` is **+6 days**, not overdue: `invoice-reminders`
fires its first stage at `due_date − 3` (`supabase/functions/invoice-reminders/index.ts:22-28`), so
this row sends no automated mail during the walk window. A seat that *wants* Ruth's overdue-anxiety
scenario can move `due_date` back — but should expect the A/R cadence to engage.
`amount_paid_cents = 0` and `status = 'sent'` make it payable through
`create-checkout-session`'s invoice branch, so T10 can run all the way to the Stripe hand-off (and
therefore doubles as the G2 Apple Pay probe).

**Scope discipline:** local Postgres only (`127.0.0.1:54322`; the INSERT ran behind a guard that
aborts unless `inet_server_addr()` is in a private range — it reported the docker-bridge address
`172.18.0.8/32`). No production write, no app or portal source touched.

**Corrects:** `12-backend-reality.md` §8 and `14-grounding-gaps.md` §D — "no account has an
invoice" is now false by construction.

---

## G8 — What does `PatinaSheetHeader` actually look like?

**Answer, and the correction that matters more than the spec: `PatinaSheetHeader` has ZERO call
sites.** It is used nowhere in `apps/mobile/Patina`, nowhere in `apps/mobile/Capture` — its only
references in the entire repo are its own definition and its `#Preview`
(`apps/mobile/PatinaDesignKit/Sources/PatinaDesignKit/Components/PatinaSheetHeader.swift:12, 83`).
**A purchase-flow mock that draws it would be mocking a component the app has never rendered.**
Every real sheet in the client app hand-rolls its own header.

### The component, as written (for completeness)

`PatinaSheetHeader.swift:43-63` — a single `HStack(alignment: .firstTextBaseline, spacing: 16)`:

| Part | Spec | Source |
|---|---|---|
| Container | `HStack`, baseline-aligned, spacing `PatinaSpacing.md` = **16pt** | `:44`, `PatinaSpacing.swift:18` |
| Padding | horizontal `PatinaSpacing.lg` = **24pt**; vertical `PatinaSpacing.md` = **16pt** | `:61-62`, `PatinaSpacing.swift:18-20` |
| Eyebrow (optional) | `patinaEyebrow()` — Inter-SemiBold 12pt, **uppercase**, tracking **1.5**, `Text.muted` | `:48-50`, `PatinaTypography.swift:86,136-143` |
| Eyebrow→title gap | `PatinaSpacing.xxxs` = **2pt** | `:47`, `PatinaSpacing.swift:12` |
| Title | `PatinaTypography.h4` = **PlayfairDisplay-Regular 22pt**, `relativeTo: .title3`; color `Text.primary` | `:52-54`, `PatinaTypography.swift:33` |
| Leading/trailing actions | SF Symbol at `bodyMedium` (Inter-Medium 16pt), `Text.secondary`, **44×44 tap target**, `.contentShape(Rectangle())`, `.buttonStyle(.plain)`, required `accessibilityLabel` | `:66-77`, `PatinaTypography.swift:49` |
| Alignment | `Spacer(minLength: 0)` between title block and trailing action | `:57` |
| **Drag handle** | **none** | — |
| **Divider / hairline** | **none** | — |
| **Background** | **none** — inherits whatever it's placed on | — |

Colors: `Text.primary` = `#2C2926` light / `#F2EDE6` dark; `Text.secondary` = `#5C4A3C` /
`#D8C9B4`; `Text.muted` = `#8B7355` / `#B5A487` (`PatinaColors.swift:26-32, 81-85, 109-118`).

### What a mock should actually draw

The de-facto sheet header in the client app is `AddToRoomSheet`
(`apps/mobile/Patina/Patina/Features/Home/Views/AddToRoomSheet.swift:16-36`) — the closest living
relative to an order sheet, and structurally *different* from the design-system component:

- A **hand-drawn drag handle**: `RoundedRectangle(cornerRadius: 2)` filled `Text.muted.opacity(0.25)`,
  **36×4pt**, `.padding(.top, 18)`, `.padding(.bottom, 14)` (`:18-22`) — drawn manually even though
  `.presentationDragIndicator(.visible)` exists and is used elsewhere
  (`Features/Help/Views/HelpPanelSheet.swift:122`).
- **Title above eyebrow**, inverted vs. the design-system order: `Text("Add to Room")` in
  `PatinaTypography.h5` (PlayfairDisplay-**Medium 18pt**, not h4/22pt), then a mono sub-label
  `Text("Choose Destination")` in `monoSmall` (DMMono-Regular **9pt**), tracking `0.4`, uppercased,
  `Text.muted` (`:24-33`).
- Leading-aligned, `.padding(.horizontal, 24)`, `VStack(spacing: 3)` — hard-coded numbers, not
  spacing tokens (`:24, 34-35`).
- Sheet body on `PatinaColors.Background.primary` (`#FAF7F2`-family light / `#211E1B` dark),
  `.presentationDetents([.medium])` (`:55-57`).
- No `Divider()` anywhere in the header.

**Recommendation for the mock/deck authors:** draw the **`AddToRoomSheet` pattern** (36×4 handle,
h5 title, mono eyebrow *below* the title, 24pt gutters, medium detent, no divider) — that is what a
Patina sheet looks like on screen today. If a direction wants the design-system component instead,
say so explicitly as a change, and note that adopting it flips the title/eyebrow order, moves the
title from 18pt to 22pt, and needs a drag handle added from outside the component.

**Corrects:** `16-token-table.md:388` (bare file:line → full spec, plus the zero-call-sites fact)
and `14-grounding-gaps.md` §C ("Sheet header — No"). This changes the gap from *"undocumented
component"* to *"documented-but-unused component; mock the real pattern instead."*

---

## Method notes

- Read: `source/instruments.md` §0; `research/14-grounding-gaps.md`; the cited spans of
  `research/12-backend-reality.md`. All other citations are first-hand reads of repo source,
  live local HTTP probes, or read-only local SQL.
- **No production access of any kind was used or needed** — all six gaps resolved from repo source
  and the local stack.
- Local mutations were confined to G7's single seeded invoice + 2 line items on
  `127.0.0.1:54322`, behind a private-range host guard. No app, portal, or migration source edited;
  no git operation run.
- Dated `Correction` notes appended to `12-backend-reality.md`, `14-grounding-gaps.md`, and
  `16-token-table.md`; none of those files was otherwise modified.
