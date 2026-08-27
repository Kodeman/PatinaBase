# 05 — Re-walk after the stack restart (S0, ruling Q12)

Simulator `973D1724-90BF-4A0A-B02D-481D561547B3` (iPhone 17 Pro, iOS 26.5), `cloud.patina.app`
relaunched with `-DeploymentTarget local`, signed in as `client@patina.dev`. 2026-08-27 ~12:05–12:10 UTC.
Local target re-proven from the Kong access log (`Patina/1 CFNetwork` UA, profile
`a0000000-0000-0000-0000-000000000005`). Shots `r-00` … `r-09` in `shots/`.

This re-walks only what the review could never see, because the review ran against a 503 edge
runtime and an account with no invoice. **Two whole surfaces turned out to exist and work.**
One new app-side defect was found. Stripe Checkout itself is still unreachable locally.

---

## 1. Now sim-verified — surfaces the review never rendered

### 1a. The invoice rail is real, end to end up to the Stripe hand-off ✅

`INV-2026-0142` flows through every screen correctly. Nothing here is broken.

- **Profile → Studio** (`r-00b`): the Studio hub surfaces `Invoice, $4,250.00 remaining, Due Sep 1`
  as one of three "Awaiting you" rows (alongside `Decisions, 2 project choices are ready,
  Overdue · Aug 22` and `Proposal, Aspen Loft — Living Room Refresh, Review by Sep 8`).
  Summary line: "Studio summary: 4 things need your eye".
- **Invoices list** (`r-04`): `AWAITING PAYMENT (1)` / `INV-2026-0142` / `Aspen Loft Refresh` /
  `$4,250.00` / `Due Sep 1, 2026`.
- **Invoice detail** (`r-01`): title `Awaiting payment`, `INV-2026-0142`,
  `Aspen Loft Refresh · from Leah Hartwell`, a TOTAL/PAID/BALANCE triad
  (`$4,250.00` / `$0.00` / `$4,250.00`), `WHAT'S INCLUDED` with both seeded line items
  (`Dining table — deposit (50%)` $2,650.00 · `Primary bedroom nightstands (pair) — deposit (50%)`
  $1,600.00), `A NOTE FROM YOUR DESIGNER` rendering the memo verbatim, `PAYMENTS` → "No payments
  recorded yet.", and the CTA `invoiceDetail.pay` = **"Pay $4,250.00"** with the caption
  "Pay securely by card or bank transfer."
- **Budget** (`r-06`): `ACROSS YOUR PROJECTS` — `$4,250 BILLED / $0 PAID / $4,250 OUTSTANDING`,
  then `Aspen Loft Refresh` with `PAID $0.00 / OUTSTANDING $4,250.00` and the invoice row.
  The review saw this screen empty (`c-15-budget`); it is not empty, it was starved of data.

**`invoiceList`, `invoiceDetail` and `budget` should be re-read as verified-with-data.**

### 1b. The Companion panel is a working, screen-aware navigator ✅

The review recorded Companion as dead (503 storm, empty state). It is not. With the edge runtime
up, `companion.bubble` (AXValue "4 things need your eye") opens a panel with an italic headline and
five action rows, and **the headline and the rows change per screen**:

| screen | headline (verbatim) | rows (verbatim) | shot |
|---|---|---|---|
| Invoices list | **"Settling up?"** / "4 things need your eye." | Your budget · Message your designer · Proposals · Home · Your profile | `r-05` |
| Budget | *(same subtitle)* | **Invoices** · Proposals · **Your projects** · Home · Your profile | `r-07` |
| Daily Room | **"Where to begin?"** / "4 things need your eye." | Add your first space · Retake the quiz · Your recommendations · Your studio · Your profile | `r-08` |

Rows carry stable ids (`companion.action.chart.pie`, `companion.action.creditcard`,
`companion.action.viewfinder`, …). Tapping the top row on the Invoices screen ("Your budget")
navigated correctly to Budget (`r-06`). Panel chrome: `companion.help`, `companion.close`.

### 1c. OTP sign-in now has a usable code (environment, not app)

The magic-link email now renders `Your code 677011` — see `04-stack-restart.md` §3(c). The in-app
"Enter code instead" path is completable from the local stack for the first time. **A seat must not
carry forward "the local OTP email has no code" as a finding.** (Not exercised through the app UI in
this pass — the account was already signed in and the brief said to leave it that way.)

---

## 2. Still failing — and the one that is the app's fault

### 2a. Stripe Checkout is unreachable locally — environment ⚠

Tapping **"Pay $4,250.00"** does *not* open `SFSafariViewController`. It never gets that far:

```
kong:          "POST /functions/v1/create-checkout-session HTTP/1.1" 502 92 "-" "Patina/1 CFNetwork/…"
edge runtime:  [Error] create-checkout-session: customer creation failed
               Invalid API Key provided: sk_test_********************alls
```

Root cause is the placeholder `STRIPE_SECRET_KEY` on the local edge runtime (length 32; see
`04-stack-restart.md` §5.1). Consequences for the deck:

- **No Checkout page was captured** — `r-02` is the invoice screen 5 s after the tap, not a Checkout
  page. There is no `r-02` Checkout render to show, and no scroll-of-Checkout `r-03`.
- **The Apple Pay question (G2) remains unprobed on this simulator.** No Apple Pay button was or
  could be seen: no Stripe page loaded at all. Independently, Simulator Safari generally cannot
  present Apple Pay (no Wallet card), so even with a working key this stack is the wrong instrument
  for that question — G2 stays a code-and-docs answer, not a sim-verified one.
- **No Stripe test-mode banner was visible**, for the same reason.
- The invoice was **not** paid and is unchanged: `r-04` still reads `AWAITING PAYMENT (1)` /
  `$4,250.00`, and `PAYMENTS` still reads "No payments recorded yet."

### 2b. NEW app defect — the pay failure is silent, then leaks a raw Stripe key error 🔴

Two problems, both app-side, both independent of the placeholder key:

**(i) No visible feedback on tap.** After the tap the error is written into the view but lands at
logical y≈763 — **below the fold and behind the Companion dock**. `r-03` is the screen as the user
sees it: the Pay button is still there, nothing has changed, no spinner, no alert, no toast. A
homeowner would conclude the tap did not register and tap again. The error is only discoverable by
scrolling (`r-03b`).

**(ii) The error text is the raw Stripe API string.** Verbatim on screen, in red, directly beneath
the Pay button:

> **Invalid API Key provided: sk_test_********************alls**

That is a vendor-internal message naming a secret-key type, shown to a homeowner on a $4,250 payment
screen. Whatever the upstream failure, this string must never reach the client — the failure needs
app-authored copy ("We couldn't start the payment. Try again, or contact your designer."), presented
where the user is looking. Both halves would reproduce on prod against any `create-checkout-session`
error, since the app renders whatever error the function returns.

**(iii) Minor, same screen.** Scrolling the invoice detail pushes the `INVOICE` eyebrow and
"Awaiting payment" title up under the status bar and the floating back chevron, so "9:41" overlaps
the title and the chevron overlaps `INV-2026-0142` (`r-03b`). Header is not pinned or safe-area
clipped.

### 2c. `companion-context` returns almost nothing — the panel's intelligence is local 🟡

The panel looks context-aware, but the server is not the reason. Probed directly with a real
`client@patina.dev` access token:

```
POST /functions/v1/companion-context  {"screen":"invoiceDetail"}
{
  "quick_actions": [ { "id":"browse", "icon":"magnifyingglass", "label":"Browse furniture",
                       "action_type":"navigate", "payload":{"destination":"discover"},
                       "priority":50 } ],
  "proactive_message": null,
  "timestamp": "2026-08-27T12:08:36.371Z"
}
```

One generic action, and `proactive_message: null` — for an account that has an **overdue decision
(Aug 22)**, an **open $4,250 invoice due Sep 1**, and a **proposal awaiting review**. The 230-byte
response size in the Kong log matches this payload exactly, so this is what the app receives. And
"Browse furniture" does **not** appear in any of the three panels observed. So: the rows and the
"Settling up?" / "Where to begin?" headlines are **client-side heuristics**, and the server's one
contribution is either dropped or outranked. The Companion is a good local navigator wearing the
costume of a backend-driven assistant.

### 2d. The `companion-context` retry storm survives success 🟡

`02-steward-boot.md` §8.1 attributed the ~10-calls-in-15 s burst to 503 retries. It is not retry
behaviour: with the function returning **200**, the app still fired `companion-context` **4 times in
2 seconds** at launch (12:05:42–12:05:43) and twice more at 12:06:21. Four identical 200s for one
screen is an app-side duplicate-request defect, not a symptom of the outage.

### 2e. No conversation composer exists

Checked on all three panels: the Companion has no text field, no send affordance — only navigation
rows and `companion.help` / `companion.close`. The "Message your designer" row appears only on the
Invoices screen's panel and was not followed (it routes at `threadList`, which the review already
recorded as unreachable with 0 `comms_threads`). **No message was sent; there is nothing to send it
with.** `companion-message` boots (401 to an anon token) but has no UI reaching it.

---

## 3. What this does to the review's findings

| review claim | status after restart |
|---|---|
| "Companion is dead / empty" (503) | **environment-caused. Companion works.** Re-read every Companion finding. |
| "the local OTP email has no code" | **environment-caused. Fixed by the restart.** |
| Budget screen empty | **data-caused. Renders correctly with an invoice.** |
| `invoiceList` / `invoiceDetail` unverified-with-data | **now verified.** |
| Apple Pay on the invoice (G2) | **still unprobed** — cannot be answered on this stack. |
| Stripe Checkout hand-off | **still unreachable** — placeholder local key. |
| pay-failure UX (`c-13b`/`c-14`) | **confirmed and worse than recorded** — silent below the fold, then a raw Stripe key error. |

## 4. State left behind

Simulator **booted**, `cloud.patina.app` **running** under `-DeploymentTarget local`, signed in as
`client@patina.dev`, Companion panel closed, on the **Daily Room** (`r-09`: `THURSDAY · AUG 27` /
`Today`, Next Move "Review a project decision — 2 decisions need your eye.", Maker Spotlight
"The Grain Whisperer of Maine"). Status bar override 9:41 / charged / wifi 3 / cellular 4, light
appearance — all intact. Local Supabase stack up with data preserved; nothing was paid, nothing
seeded, no source file touched.
