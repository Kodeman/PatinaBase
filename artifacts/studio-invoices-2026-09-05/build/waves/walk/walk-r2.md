# Studio invoices — local walk, round 2

**Walker:** local walk agent (round 2) · **Date:** 2026-09-05
**Worktree:** `/Users/kody/Code/patina-merged/.codex/worktrees/agent-si-integration`
(`git rev-parse --show-toplevel` printed exactly that path)
**Branch:** `studio-invoices/integration` · **HEAD walked:** `7f8586ce568abcdd17ffef87379dc023cb3d2cf8`
**Screenshots:** `artifacts/studio-invoices-2026-09-05/build/waves/walk/shots-r2/` (51 shots)

**Verdict: ship** — no blocker, no major. R1's one major (W-1) is **fixed and re-proved**;
the four remaining r1 notes stand unchanged as minor/nit; one new nit found on the
multi-letter houseless front door. Every one of the nine walk steps was walked in a real
browser, plus the two things r1 could not close (the S8 *silent* half, and a same-run
flag-off flash sample).

---

## Stack under walk

| Layer | State |
|---|---|
| Supabase | already up — **not** reset by me. `supabase_migrations.schema_migrations` head = `00571`. `invoices.project_id` nullable, `invoices.title` present, `studio_invoice_counters` live. |
| designer-portal `:3000` | `next dev --webpack -p 3000`, env inline from `apps/designer-portal/playwright.config.ts` `webServer.env` + `NEXT_PUBLIC_FLAG_OVERRIDES='procurement-workspace-pilot:true,the-document-pilot:true,studio-invoice:true'` + `NEXT_PUBLIC_DESIGNER_PORTAL_DATA_MODE=live`. Restarted once near the end with `studio-invoice:false` for the flag-off half of step 1. |
| client-portal `:3002` | `next dev --webpack -p 3002`, `NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321`, `NEXT_PUBLIC_CLIENT_PORTAL_DATA_MODE=live` |
| edge functions | `supabase --workdir <wt> functions serve --no-verify-jwt --env-file /Users/kody/Code/patina-merged/supabase/functions/.env` → `Serving functions on http://127.0.0.1:54321/functions/v1/<function-name>` |
| browsers | Playwright chromium `@playwright/test@1.58.2`, one persistent profile per actor (`designer` / `single` / `solo` / `duo`) so the shared-localhost `sb-*` cookie never crossed actors |

## Seed (written by me, local only)

Four GoTrue admin-API users, then SQL against `postgresql://postgres:postgres@127.0.0.1:54322/postgres`:

- **Odile Marchand** `r2-solo@patina.test` `cd8c5f0b-…0e64` — household, **no project**, on
  `designer@patina.dev`'s and `r2-single@patina.test`'s `designer_clients` rosters.
- **Rufus Blackwood** `r2-duo@patina.test` `599c7a0a-…95b5` — household with **two** projects:
  `2a000000-…c001 Blackwood Fern Cottage` (lexicographic low) and `bb000000-…c002 Blackwood Stone Barn`.
- **Bramwell Fox** `r2-single@patina.test` `e6a8e981-…9d1c` — a designer in **exactly one**
  active design studio (`Bramwell Fox`, minted by the profile trigger). Needed the
  `studio_owner` role row (`user_roles`) to clear the designer-portal middleware; without
  it the portal answers `/unauthorized`, which is that middleware's role gate, not a
  studio-invoice behaviour.
- Designer: `designer@patina.dev` / `password123`, active owner of **two** design studios —
  `Leah Hartwell` `74a4c247-…95c4` and `Local Dev Studio` `b0000000-…0001`.

Two drafts created by a harness selector mistake (tax typed into a Quantity field) were
deleted before the walk proper; nothing else was removed.

---

## The nine steps

### 1 · Desk → composer, and the flag ✔

`/desk` → ⌘K → "draw an invoice" → Enter → the composer sheet. The `For` select reads:

```
["Pick a document…","the studio · no house","Blackwood Stone Barn","Blackwood Fern Cottage",
 "Hale Orchard House","Hale Ridge Cabin","Olsen Lake House","Chen Residence",
 "Marrow & Vale Residence","Birch Hollow","Aspen Loft Refresh","Cedar Lane Study"]
```

"the studio · no house" is the **first** option after the placeholder (`01c`). The Accounts
ledger head's own `Draw an invoice` opens the same composer with the same first option
(`11b`) — identical option list, checked verbatim.

**Flag off** — killed `:3000` (`lsof -ti :3000 | xargs kill`, port confirmed free), relaunched
with `studio-invoice:false`, same walk (`01d`, `01e`):

```
FOR/PROJECT select label present: 0 / Project label: 1
OPTIONS (flag off): ["Pick a document…","Blackwood Stone Barn","Blackwood Fern Cottage", … ]
FLASH SAMPLES WITH STUDIO OPTION (ms): []          ← 50 samples at 100ms over the 5s after Enter
final body has phrase: false
SHEET LABELS: ["Draw an invoice","STUDIO EYES ONLY", …, "THE DOCUMENT","Pick a document…", …]
```

Not one frame carries the option; the section label reverts to `the document` and the
select's aria-label to `Project`. The Accounts ledger still renders the existing studio rows
with the flag off, no error (`01e`) — S10 as ruled.

### 2 · Compose and draft ✔

Studio `Local Dev Studio` · household `Odile Marchand` · regarding
`Design consultation · September` · two ad-hoc lines (2 × $175, 1 × $100) · tax 5.5 ·
terms 15 · memo. Running totals in the sheet:

```
SUBTOTAL $450.00 · TAX $24.75 · TOTAL $474.75 · 2 LINES
```

`Draft the invoice` → `POST /rest/v1/rpc/create_draft_studio_invoice -> 200`, the folio opens (`02c`, `02d`):

```
Draft invoice                                             [DRAFT]
ODILE MARCHAND · DESIGN CONSULTATION · SEPTEMBER · DRAFT
ISSUED —   DUE — (net 15)   TOTAL $474.75   PAID $0.00   BALANCE $474.75
… ISSUE & SEND   VOID
```

Household · title · draft stamp, and **no `document ↗` doorway** (the project rows two
inches below in the same ledger do carry one — see `03b`). The row:

```
id                 | 183e8a6f-6830-40c7-b93f-cdbceeabd62c
invoice_number     | (null)            status  | draft
project_id         | (null)            client_id | cd8c5f0b-…0e64
studio_id          | b0000000-…0001    designer_id | a0000000-…0004
title              | Design consultation · September
subtotal_cents 45000 · tax_cents 2475 · total_cents 47475 · tax_rate 0.0550 · payment_terms_days 15
```

`project_id` NULL, integer cents throughout.

### 3 · Issue & send ✔

Confirm copy: *"Issuing assigns the number, locks the totals, and emails the invoice — to
r2-solo@patina.test."* (`03b`). Confirmed →

```
Invoice INV-0003 · ODILE MARCHAND · DESIGN CONSULTATION · SEPTEMBER · SENT
ISSUED Sep 6, 2026   DUE Sep 21, 2026
RECORD PAYMENT   RESEND   VOID   PRINT
INVOICE INV-0003 ISSUED · EMAILED R2-SOLO@PATINA.TEST
```

`INV-0003` minted off `studio_invoice_counters` for `Local Dev Studio` (which stood at 2 after
round 1) — the sequence continued, it did not restart.

**The letter.** The local mail rail runs `EMAIL_DEV_MODE=dry_run` and `_shared/send-email.ts`
has only Resend / dry_run / redirect — **no SMTP path**, so app mail never reaches Mailpit.
Mailpit `:54324` holds four messages, all GoTrue `Sign in to Patina`. `invoice-send` logged:

```
[send-email:dry_run] {"to":"r2-solo@patina.test",
 "subject":"Local Dev Studio sent you invoice INV-0003 — Design consultation · September",
 "category":"operational","userId":"cd8c5f0b-…0e64","templateId":"invoice-sent"}
```

Title in the subject ✔. I rendered the same letter through `buildInvoiceSentEmail` with the
exact arguments `invoice-send/index.ts:279-292` passes:

```
SUBJECT: Leah Hartwell sent you invoice INV-0003 — Design consultation · September
TEXT: … Sent on behalf of Local Dev Studio Hi Odile Marchand, Leah Hartwell has sent you
      an invoice for Design consultation · September . Invoice: INV-0003 Amount due: $474.75 …
LINKS: [fonts.googleapis.com ×2, http://localhost:3002/invoices/183e8a6f-…, client.patina.cloud, …/preferences]
HAS 'for your studio': false      HAS 'Your page': true      HAS 'Your project': false
```

One action link, to `/invoices/<id>` ✔. Footer label **"Your page"** (W5-7) ✔; no "for your
studio" (W5-6) ✔.

**Ledger** (`03a`): the studio row reads
`Draft invoice FOLIO → DESIGN CONSULTATION · SEPTEMBER  [studio] · $475 · — DRAFT`
with the clay-ink `studio` stamp and no `document ↗`; project rows keep theirs.

### 4 · The household with no house ⚠ (Stripe leg blocked by the local env)

`/invoices/<id>` signed out → `/auth/signin?callbackUrl=%2Finvoices%2F183e8a6f-…` (`04a`).
Signed in as `r2-solo@patina.test` → the **letterbox-only front door** (`04b`):

```
PREPARED FOR ODILE MARCHAND
Local Dev Studio
September 2026
One letter is waiting for you.
THE LETTERBOX
  From the studio · not for a house
  Design consultation · September
  INV-0003 · $475 total · $0 paid. Balance $475, due September 21.
  CLOSE THE LETTERBOX   PRINT
INV-0003                      A TOLL ON THE LINE · DUE SEPTEMBER 21
TOTAL $475   PAID $0   BALANCE $475
HOW WOULD YOU LIKE TO PAY?
  Bank transfer (ACH)  Preferred · lowest fee   + $3.80 processing fee
  Card                                          + $14.24 processing fee
  Mail a check                                  No fee
You will be charged $478.55 — the balance and a $3.80 processing fee.
SETTLE THE BALANCE
```

All three rails present, ACH preferred, money in DM Mono, and a full DOM scan of that page
returned `{redish:[], greenish:[], shadows:0, emoji:[], checkmarks:[], forbiddenWords:[]}`
(no red, no green, no shadow, no emoji, no ✓ as status, and none of dashboard/overdue/AI/gate/task).

**Card → Checkout could not run locally** (environment, not code) — `04c`, `04d`:

```
POST /functions/v1/create-checkout-session -> 502
{"error":"stripe_error","detail":"Invalid API Key provided: sk_test_********************alls"}
```

`/Users/kody/Code/patina-merged/supabase/functions/.env` carries
`STRIPE_SECRET_KEY=sk_test_fake_local_no_real_calls`. Three things proved instead:

1. **The return address is right** (`invoiceCheckoutReturnAddress`, evaluated in Deno):
   ```
   studio success: http://localhost:3002/?invoice=183e8a6f-…&checkout=success&session_id={CHECKOUT_SESSION_ID}#letterbox
   studio cancel : http://localhost:3002/?invoice=183e8a6f-…&checkout=cancelled#letterbox
   house  success: http://localhost:3002/projects/2a000000-…c001?invoice=…&checkout=success&…#letterbox
   ```
2. **The return leg is consumed on the houseless door** (plan risk 6) — `/?invoice=<id>&checkout=cancelled#letterbox`
   rendered **"Nothing changed."** above the letter and cleaned the URL to `/#letterbox` (`04e`).
3. **The success leg does not lie.** Returning `checkout=success` for an *unsettled* invoice
   states **"Confirming payment… This usually takes a few seconds."** and never claims paid
   (`04f`); returning it for a row that really is paid states
   **"INV-0003 · Payment confirmed — thank you. Your invoice has been updated."** (`10e`).

Payment was covered through Record payment instead (step 5), as the brief allows.

### 5 · Record payment, and the earnings row ✔

Folio → `Record payment` → $474.75 · Check · `CHK-9902` → `POST /rest/v1/rpc/record_invoice_payment -> 200` (`05a`, `05b`):

```
Invoice INV-0003 · … · PAID    TOTAL $474.75   PAID $474.75   BALANCE $0.00
PAYMENTS  Sep 5, 2026  Check CHK-9902  SUCCEEDED  $474.75
```

```sql
select * from designer_earnings where invoice_id='183e8a6f-6830-40c7-b93f-cdbceeabd62c';
 source_type | design_fee
 gross_amount| 47475      net_amount | 47475
 description | Invoice INV-0003 — Design consultation · September
 status      | paid
 project_id  | (null)
```

Plan risk 3 closed. Invoice rollup `status=paid, amount_paid_cents=47475, paid_at=…` — written
by the 00178/00277 trigger; the only write the app made was `record_invoice_payment`, and
`invoice_payments` holds exactly one `check / succeeded / 47475 / CHK-9902` row.

### 6 · The two-house household ✔

Second studio invoice `INV-0004` · *Site visit · Fern and Barn* · $600 · Rufus Blackwood,
issued and sent (`06a-*`). Signed in as `r2-duo@patina.test`, `/` landed on **Blackwood Fern
Cottage** — the lexicographically lowest project id — and the letter stands there (`06b`):

```
An invoice is ready  …  THE PAPERS  INV-0004   YOUR OTHER HOUSES  Blackwood Stone Barn
```

The other house `/projects/bb000000-…c002` (`06c`):

```
HIGH HOUSE contains INV-0004: false | contains "not for a house": false
Blackwood Stone Barn … Nothing waits for your name. THE LETTERBOX Nothing in the letterbox.
```

The adopted house `/projects/2a000000-…c001` (`06d`): `contains INV-0004: true | "not for a house": true`.

The named-letter deep link `/?invoice=8834e488-…` resolved to **Blackwood Fern Cottage** and
`#letterbox` (`06e`) — plan risk 5 closed:

```
LOCAL DEV STUDIO | PREPARED FOR RUFUS BLACKWOOD | Blackwood Fern Cottage | September 2026 |
… Owed on the open invoice from the studio, not for this house | $600 · due 6 October |
THE LETTERBOX | From the studio · not for a house | Site visit · Fern and Barn | INV-0004 · $600 total …
```

### 7 · Two studios — both halves of S8 ✔

**More than one studio → the line appears, and the number comes off the chosen studio.**
Drawing from **Leah Hartwell** (`07a-*`) minted `INV-0002` off *her* counter while Local Dev
Studio's stayed at 4, and the letterhead followed:

```
 invoice_number |      studio      |               title                | status
 INV-0001       | Leah Hartwell    | Paid design review · second studio | sent   (round 1)
 INV-0002       | Leah Hartwell    | Paid design review · second studio | sent   (this walk)
 INV-0003       | Local Dev Studio | Design consultation · September    | paid
 INV-0004       | Local Dev Studio | Site visit · Fern and Barn         | sent
 INV-0001       | Bramwell Fox     | Retainer · single-studio designer  | sent

 studio_invoice_counters: Bramwell Fox → 1 · Leah Hartwell → 2 · Local Dev Studio → 4
```

```
[send-email:dry_run] {"subject":"Leah Hartwell sent you invoice INV-0002 — Paid design review · second studio"}
```

Plan risk 4 closed.

**Exactly one studio → the line is silent** (the half r1 could not produce). As
`r2-single@patina.test`, one active `design_studio` membership (`07b`):

```
FOR options: ["Pick a document…","the studio · no house"]
STUDIO select count: 0
SHEET LABELS: ["Draw an invoice","STUDIO EYES ONLY", …, "FOR","Pick a document…",
               "the studio · no house","HOUSEHOLD","Search or add a household…","REGARDING", …]
contains "studio" label line: false
```

And the silent studio is really used: drawing from that composer (`07c-*`) produced
`INV-0001 · Bramwell Fox · Retainer · single-studio designer`, i.e. off the single studio's
own counter, with `designer_id = e6a8e981-…9d1c`.

### 8 · Receivables, chase, void ✔ (one ink note, one word note)

`due_date` on `INV-0004` backdated to `current_date - 9` by SQL. Receivables (`08a`):

```
Invoice INV-0004 $600 FOLIO →
  SITE VISIT · FERN AND BARN [studio] · DUE AUG 28 · 9D OVERDUE      SEND REMINDER
Invoice INV-2026-0142 $4,250 FOLIO →
  ASPEN LOFT REFRESH · DUE SEP 10 · WITHIN TERMS   IN MOTION   document ↗
```

Past due, chase act present, `studio` stamp, no `document ↗`. **Never red** — computed style
of both past-due meta lines:

```
{"text":"Site visit · Fern and Barnstudio · due Aug 28 · 9d overdue","color":"rgb(139, 115, 85)","font":"DM Mono"}
{"text":"Site visit · Ridge and Orchardstudio · due Aug 27 · 10d overdue","color":"rgb(139, 115, 85)","font":"DM Mono"}
--color-terracotta-ink #9C5340 · --color-aged-oak #8B7355 · --color-clay-ink #7C5E30
```

i.e. aged oak, not terracotta and nowhere near red (W-4, unchanged).

`Send reminder` → `POST /functions/v1/invoice-send -> 200`, `POST /rest/v1/rpc/chase_invoice -> 200`,
row becomes `REMINDED R2-DUO@PATINA.TEST · CHASE AGAIN` (`08b`), and:

```
[send-email:dry_run] {"to":"r2-duo@patina.test",
 "subject":"Still open: invoice INV-0004 — Site visit · Fern and Barn",
 "templateId":"invoice-reminder-manual"}
```

Title in the subject; the homeowner reads "Still open", never "overdue". Bookkeeping:
`ar_last_chased_at = 2026-09-06 00:34:39+00`, `reminder_count` stays 0 — the manual nudge
deliberately does not touch the automated cadence counter (`invoice-send/index.ts:262-265`).

Void of a fresh studio draft (`Deposit hold · drawn in error`, $900). Confirm copy is
studio-aware (`08c`):

> *"Voiding keeps the number and marks the invoice void. Nothing else is released; a studio
> invoice holds no milestones or time. This cannot be undone."*

Reason required → `Voided Sep 5, 2026 — Drawn in error — duplicate`, `POST /rest/v1/rpc/void_invoice -> 200`,
DB `status=void, void_reason='Drawn in error — duplicate', invoice_number=null` (`08d`).

### 9 · Print ✔

`/invoices/183e8a6f-…/print` as the household (`09a`):

```
Local Dev Studio · INTERIOR DESIGN · VIA PATINA
INVOICE INV-0003                                   Paid
BILLED TO  Odile Marchand · r2-solo@patina.test
REGARDING  Design consultation · September
…  Total $474.75 · Paid −$474.75 · Balance due $0.00
PAYMENTS RECEIVED  Sep 5, 2026 · Check · CHK-9902 — $474.75
NET 15 · USD · PREPARED WITH PATINA
```

The title stands where the project name would.

---

## Extra probes

**W-1, re-proved.** The composer was opened five times from a cold `/desk` load; every time
the studio select defaulted the same way, and to the *name*-sorted first entry, not the
Postgres row order:

```
open 1..5: {"selected":"Leah Hartwell","order":["Leah Hartwell","Local Dev Studio"]}
raw PostgREST (the shape useOrganizations issues), 5/5: ['Local Dev Studio', 'Leah Hartwell']
```

The raw membership query still returns Local Dev Studio first — the `.sort()` added in
`7f8586ce5` is what makes the default deliberate. Fixed.

**RLS** (PostgREST with each actor's own token, `select … from invoices where title not null`):

| actor | sees |
|---|---|
| `r2-solo@patina.test` | its 4 studio invoices — INV-0003 paid, INV-0002 sent, INV-0001 sent, and the never-numbered `void` draft |
| `r2-duo@patina.test`  | its 1 studio invoice (INV-0004) |
| `client@patina.dev` (stranger) | `[]` |

The void-before-issue row is API-readable but never rendered: the front door and
`Earlier invoices` both report `contains "Deposit hold": false | contains "void": false`
(`10a`, `10b`). That is W-3, unchanged.

**Earlier invoices** (`10b`) files the settled and the second-studio letters correctly, and
the front-door plate names the studio whose letter is in the slot (`Bramwell Fox`), not the
designer's primary.

**Named letter on the houseless door** (`10c-*`): `/invoices/<id>` for INV-0002 and for
INV-0003 each brought that exact letter into the slot.

**Desk** (`11a`) with a past-due studio invoice standing: the Desk never mentions a studio
invoice title or number, renders no phantom folder, throws no page error — S9 as ruled.

**Shadows:** 0 elements with a non-`none` `box-shadow` inside the composer overlay; 0 on the
client front door.

**Console:** every driven page reported `ERRS []` (no `pageerror`, no console error).

---

## Findings

| id | sev | conf | what |
|---|---|---|---|
| W2-1 | minor | 1.00 | (was W-2) No leg of hosted Stripe Checkout can be walked locally — placeholder key. Environment, not code. |
| W2-2 | minor | 0.90 | (was W-3) A studio draft voided before it was ever issued stays API-readable by the household. Never rendered; same rule project invoices already carry. |
| W2-3 | nit | 1.00 | (was W-4) Past due renders in aged oak, not terracotta. Emphatically not red. |
| W2-4 | nit | 1.00 | (was W-5) The post-void folio note still says "linked milestones and time released", contradicting the confirm copy two seconds earlier. |
| W2-5 | nit | 0.85 | NEW — on a houseless front door holding several letters, the *pending* and *cancelled* Checkout-return lines do not name the invoice they are about, so they sit above a different letter. The *confirmed* line does name it. |
| W2-6 | nit | 1.00 | NEW — designer-facing Receivables copy says "9d overdue"; the program's own vocabulary is "past due". Shared renderer with project invoices. |
| — | fixed | — | (was W-1) The composer's default studio is now name-sorted and deterministic. |

Details, with the exact evidence, are in the structured findings returned with this walk.

---

## What was NOT verified

- **Hosted Stripe Checkout, the webhook settle, and the ACH leg.** The local
  `supabase/functions/.env` carries `sk_test_fake_local_no_real_calls`, so no session can be
  created. I deliberately did **not** hand-insert a pending `invoice_payments` row to fire a
  synthetic signed webhook — that would have written payable state outside the rail. The
  null-project settle is covered by `supabase/tests/billing/studio_invoice_test.sql` in the
  W1 lane; the live rail is owed to the prod walk.
- **Mailpit rendering of the app letter.** There is no SMTP path in `_shared/send-email.ts`;
  local app mail is `dry_run` only. The letter was proved through the dry-run log line plus a
  direct render of `buildInvoiceSentEmail`, not through an inbox.
- **Firefox / WebKit.** Chromium only.
- **iOS.** Not touched this round (S11 is null-safety only).
- **No gate command was run** (no type-check, jest, or SQL suite) — this brief is a browser
  walk; the lane gates were run by the implementers and the integration steward.
