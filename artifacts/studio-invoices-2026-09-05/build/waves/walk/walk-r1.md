# Studio invoices — local walk, round 1

**Walker:** local walk agent (round 1) · **Date:** 2026-09-05
**Worktree:** `/Users/kody/Code/patina-merged/.codex/worktrees/agent-si-integration`
**Branch:** `studio-invoices/integration` · **HEAD walked:** `c6e7c81cae369238f5a5318fd0448018e71b4728`
**Screenshots:** `artifacts/studio-invoices-2026-09-05/build/waves/walk/shots-r1/`

**Verdict: ship** — no blocker, no major *against the shipped behaviour*; one major
defect found in new composer code (W-1, studio default order) that is a one-line fix,
plus four minor/nit notes and two environment gaps that block nothing.

---

## Stack under walk

| Layer | State |
|---|---|
| Supabase | already up (reset by the integration steward — **not** reset by me). `supabase_migrations.schema_migrations` head = `00571`. `invoices.project_id` nullable, `invoices.title` present. |
| designer-portal `:3000` | `next dev --webpack -p 3000`, env inline from `apps/designer-portal/playwright.config.ts` `webServer.env` + `NEXT_PUBLIC_FLAG_OVERRIDES='procurement-workspace-pilot:true,the-document-pilot:true,studio-invoice:true'` + `NEXT_PUBLIC_DESIGNER_PORTAL_DATA_MODE=live` |
| client-portal `:3002` | `next dev --webpack -p 3002`, `NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321`, `NEXT_PUBLIC_CLIENT_PORTAL_DATA_MODE=live` |
| edge functions | `supabase --workdir <wt> functions serve --no-verify-jwt --env-file /Users/kody/Code/patina-merged/supabase/functions/.env` → `Serving functions on http://127.0.0.1:54321/functions/v1/<function-name>` |
| browsers | Playwright chromium (`playwright-core@1.58.2`), one persistent profile per actor (designer / household-solo / household-duo) so the shared-localhost `sb-*` cookie never crossed actors |

## Seed (written by me, local only)

Two GoTrue admin-API users, then SQL against `postgresql://postgres:postgres@127.0.0.1:54322/postgres`:

- **Marguerite Vane** `walk-solo@patina.test` `1e79c0b4-…b8d1` — household, **no project**, on `designer@patina.dev`'s `designer_clients` roster.
- **Corbin Hale** `walk-duo@patina.test` `538b3b47-…96c3` — household with **two** projects: `1f000000-…b001` *Hale Orchard House* and `9f000000-…b002` *Hale Ridge Cabin* (lexicographic low id = Orchard).
- Designer: seeded `designer@patina.dev` / `password123`, already an active owner of **two** design studios — `Local Dev Studio` `b0000000-…0001` and `Leah Hartwell` `74a4c247-…95c4`.

---

## The nine steps

### 1 · Desk → composer, and the flag ✔

`/desk` → ⌘K → "draw an invoice" → the `Draw an invoice` verb → the composer sheet.
The `For` select reads, in order:

```
Pick a document… | the studio · no house | Hale Orchard House | Hale Ridge Cabin | …
```

"the studio · no house" is the **first** option after the placeholder.
The Accounts ledger head's own `DRAW AN INVOICE` opens the same composer with the same
first option (`11b-composer-from-ledger-head.png`).

**Flag off** — restarted `:3000` with `studio-invoice:false`, same walk:

```
SELECTS [["Pick a document…","Hale Orchard House","Hale Ridge Cabin", … ]]
FLASH SAMPLES WITH STUDIO OPTION (ms offsets): []
final body has phrase: false
```

40 samples at 100 ms over the 4 s after the sheet opens: the option never appears, not
even for one frame. Shots `01b`, `01c`, `01d`.

### 2 · Compose and draft ✔

Studio `Local Dev Studio` · household `Marguerite Vane` · regarding
`Design consultation · September` · two ad-hoc lines (2 × $175, 1 × $100) · tax 5.5 ·
terms 15 · memo. Running totals: `SUBTOTAL $450.00 · TAX $24.75 · TOTAL $474.75 · 2 LINES`.
`Draft the invoice` → the folio opens (`02c`, `02d`):

```
Draft invoice                                             [DRAFT]
MARGUERITE VANE · DESIGN CONSULTATION · SEPTEMBER · DRAFT
ISSUED —   DUE — (net 15)   TOTAL $474.75   PAID $0.00   BALANCE $474.75
… ISSUE & SEND   VOID
```

Household · title · draft stamp, and **no `document ↗` doorway**. The row in the DB:

```
id            | 9700b1f2-1489-4fd2-883a-2304494406a1
invoice_number|            status | draft
project_id    |            client_id | 1e79c0b4-…b8d1
studio_id     | b0000000-…0001      designer_id | a0000000-…0004
title         | Design consultation · September
subtotal_cents| 45000   tax_cents | 2475   total_cents | 47475
tax_rate      | 0.0550  payment_terms_days | 15
```

`project_id` NULL, integer cents throughout.

### 3 · Issue & send ✔

Confirm copy: *"Issuing assigns the number, locks the totals, and emails the invoice — to
walk-solo@patina.test."* Confirmed →

```
POST /rest/v1/rpc/issue_invoice -> 200
POST /functions/v1/invoice-send -> 200
Invoice INV-0001 · MARGUERITE VANE · DESIGN CONSULTATION · SEPTEMBER · SENT
INVOICE INV-0001 ISSUED · EMAILED WALK-SOLO@PATINA.TEST
```

Number `INV-0001` minted off `studio_invoice_counters` for `Local Dev Studio`.

**The letter.** The local mail rail runs `EMAIL_DEV_MODE=dry_run`, so nothing reaches
Mailpit — `invoice-send` logged instead:

```
[send-email:dry_run] {"to":"walk-solo@patina.test",
 "subject":"Local Dev Studio sent you invoice INV-0001 — Design consultation · September",
 "category":"operational","templateId":"invoice-sent"}
```

Title in the subject ✔. I rendered the same letter by calling
`buildInvoiceSentEmail` (the exact builder and arguments `invoice-send/index.ts:279-292`
passes) — `03d-email-invoice-sent.png`:

> Sent on behalf of **Local Dev Studio** · Hi Marguerite Vane, Leah Hartwell has sent you
> an invoice **for Design consultation · September**. … View invoice → `http://localhost:3002/invoices/9700b1f2-…`

One action link, to `/invoices/<id>` ✔. Footer link label is **"Your page"** (W5-7) ✔.
No "for your studio" anywhere (W5-6) ✔.

`notification_log` in-app row carries `"project_id": null` and the title in the body.

**Ledger** (`03a`, and behind the folio in `08f`):

```
Draft invoice FOLIO →   DESIGN CONSULTATION · SEPTEMBER  [studio]  · $475 · —  DRAFT
Invoice INV-2026-0301 FOLIO →  CEDAR LANE STUDY · $4,060 · DUE SEP 12  SENT  document ↗
```

Studio row carries the clay-ink `studio` stamp (`rgb(124, 94, 48)` = `--color-clay-ink`)
and no `document ↗`; project rows keep theirs.

### 4 · The household with no house ⚠ (Stripe leg blocked by the local env)

`/invoices/<id>` signed out → `/auth/signin?callbackUrl=%2Finvoices%2F…`. Signed in as
`walk-solo@patina.test` → the **letterbox-only front door** (`04b`):

```
PREPARED FOR WALK-SOLO@PATINA.TEST
Local Dev Studio
September 2026
One letter is waiting for you.
THE LETTERBOX
  From the studio · not for a house      ← terracotta ink
  Design consultation · September
  INV-0001 · $475 total · $0 paid. Balance $475, due September 20.
  OPEN THE LETTERBOX   PRINT
```

`Open the letterbox` → settle in place (`04c`):

```
INV-0001                       A TOLL ON THE LINE · DUE SEPTEMBER 20
TOTAL $475   PAID $0   BALANCE $475
HOW WOULD YOU LIKE TO PAY?
  ● Bank transfer (ACH)  Preferred · lowest fee     + $3.80 processing fee
  ○ Card                                            + $14.24 processing fee
  ○ Mail a check                                    No fee
You will be charged $478.55 — the balance and a $3.80 processing fee.
SETTLE THE BALANCE
```

All three rails present, ACH preferred, money in DM Mono, no badge/chip/red/shadow.

**Card → Checkout could not run locally** (environment, not code):

```
POST /functions/v1/create-checkout-session -> 502
{"error":"stripe_error","detail":"Invalid API Key provided: sk_test_********************alls"}
```

`/Users/kody/Code/patina-merged/supabase/functions/.env` carries a placeholder Stripe key,
so no test-mode Checkout (4242…) is possible on this stack. Two things I proved instead:

1. **The return address is right.** `invoiceCheckoutReturnAddress` with `project_id = null`:
   ```
   studio success: http://localhost:3002/?invoice=9700b1f2-…&checkout=success&session_id={CHECKOUT_SESSION_ID}#letterbox
   studio cancel : http://localhost:3002/?invoice=9700b1f2-…&checkout=cancelled#letterbox
   house  success: http://localhost:3002/projects/1f000000-…?invoice=…&checkout=success&…#letterbox
   ```
2. **The return leg is actually consumed on the houseless front door** (plan risk 6).
   Visited `/?invoice=<id>&checkout=cancelled#letterbox` as the household → the page states
   **"Nothing changed."** above the letter and cleans the URL to `/#letterbox` (`04f`).
   The `Letterbox` really is mounted where `ProjectsEmptyState` used to stand.

Payment was covered through Record payment instead (step 5), as the brief allows.

### 5 · Record payment, and the earnings row ✔

Folio → `Record payment` → Check · `CHK-8841` · $474.75 → `POST /rest/v1/rpc/record_invoice_payment -> 200`:

```
Invoice INV-0001 · … · PAID    TOTAL $474.75  PAID $474.75  BALANCE $0.00
PAYMENTS  Sep 5, 2026  Check CHK-8841  SUCCEEDED  $474.75
```

```sql
select * from designer_earnings where invoice_id='9700b1f2-1489-4fd2-883a-2304494406a1';
 source_type | design_fee
 gross_amount| 47475      net_amount | 47475
 description | Invoice INV-0001 — Design consultation · September
 status      | paid
 project_id  | (null)
```

`project_id` NULL and the title in the description — plan risk 3 closed. Invoice rollup:
`status=paid, amount_paid_cents=47475` (00178/00277 trigger owns it; nothing wrote status
by hand).

### 6 · The two-house household ✔

Second studio invoice `INV-0002` · *Site visit · Ridge and Orchard* · $600 · Corbin Hale.
Signed in as `walk-duo@patina.test`, `/` landed on **Hale Orchard House** — the lowest project
id — and the letter stands there (`06b`):

```
Hale Orchard House
Owed on the open invoice from the studio, not for this house · $600 · due 5 October
THE LETTERBOX  From the studio · not for a house  Site visit · Ridge and Orchard
```

The other house `/projects/9f000000-…b002` (`06c`):

```
CONTAINS INV-0002: false | CONTAINS "not for a house": false
```

The named-letter deep link `/?invoice=45375ef6-…` resolved to Hale Orchard House and
`#letterbox` (`06d`) — plan risk 5 closed.

### 7 · Two studios ✔

The composer shows the `STUDIO` line for this designer (two active `design_studio`
memberships). Drawing from **Leah Hartwell**:

```
 invoice_number |      studio      |               title
 INV-0001       | Local Dev Studio | Design consultation · September
 INV-0002       | Local Dev Studio | Site visit · Ridge and Orchard
 INV-0001       | Leah Hartwell    | Paid design review · second studio

 studio_invoice_counters:  Local Dev Studio → 2 ·  Leah Hartwell → 1
```

The number came off the **chosen** studio's counter, and the letter took that studio's
letterhead (plan risk 4 closed):

```
[send-email:dry_run] {"subject":"Leah Hartwell sent you invoice INV-0001 — Paid design review · second studio"}
```

The household's front door then reads `Leah Hartwell` as its plate — the studio whose
letter is in the slot (`07c`), with the settled one filed under `Earlier invoices`.

**Not verified:** the other half of S8 — that the studio line is *silent* for a designer
in exactly one studio. I could not produce a one-studio designer without mutating
`organization_members` on a stack shared with another session (`guard_org_membership_changes`
raised `last_owner_protected` on the attempt, and I stopped there rather than push).

### 8 · Receivables, chase, void ✔ (one ink note)

`due_date` on `INV-0002` backdated to `current_date - 9` by SQL. Receivables (`08a`):

```
$9,160 OWED    $8,560 CURRENT    $600 1–30 DAYS
Invoice INV-0002 $600 FOLIO →
  SITE VISIT · RIDGE AND ORCHARD [studio] · DUE AUG 27 · 9D OVERDUE      SEND REMINDER
Invoice INV-2026-0142 $4,250 …  WITHIN TERMS        IN MOTION   document ↗
```

Past due, aged into the 1–30 bucket, chase act present, no `document ↗`. **Never red**:
the meta line is `rgb(139, 115, 85)` (aged oak) — see W-4 below on the terracotta half.

`Send reminder` → `POST /functions/v1/invoice-send -> 200`, `POST /rest/v1/rpc/chase_invoice -> 200`,
row becomes `REMINDED WALK-DUO@PATINA.TEST · CHASE AGAIN`, and:

```
[send-email:dry_run] {"to":"walk-duo@patina.test",
 "subject":"Still open: invoice INV-0002 — Site visit · Ridge and Orchard",
 "templateId":"invoice-reminder-manual"}
```

Title in the subject, and the homeowner never reads "overdue" — "Still open" (`08d`).

Void of a fresh studio draft (`Retainer · drawn in error`, $900). Confirm copy is
studio-aware:

> *"Voiding keeps the number and marks the invoice void. Nothing else is released; a studio
> invoice holds no milestones or time. This cannot be undone."*

Reason required → `VOID` stamp, `Voided Sep 5, 2026 — Drawn in error — duplicate`, and
`invoices.status='void'` in the DB (`08e`, `08f`).

### 9 · Print ✔

`/invoices/9700b1f2-…/print` as the household (`09a`):

```
Local Dev Studio · INTERIOR DESIGN · VIA PATINA
INVOICE INV-0001                                   Paid
BILLED TO  Marguerite Vane · walk-solo@patina.test
REGARDING  Design consultation · September
…  Total $474.75 · Paid −$474.75 · Balance due $0.00
PAYMENTS RECEIVED  Sep 5, 2026 · Check · CHK-8841 — $474.75
```

The title stands where the project name would.

---

## Extra probes

**RLS** (PostgREST with each actor's own token, `select … from invoices where title not null`):

| actor | sees |
|---|---|
| `walk-solo@patina.test` | its 3 studio invoices (paid, sent, void) |
| `walk-duo@patina.test` | its 1 studio invoice |
| `client@patina.dev` (stranger) | `[]` |

**Desk** with an overdue studio invoice standing: the Desk never mentions it, renders no
phantom folder, and throws no page error (S9 as ruled) — `11a`.

**Shadows:** 0 elements with a non-`none` `box-shadow` inside the Accounts ledger sheet.

---

## Findings

| id | sev | what |
|---|---|---|
| W-1 | **major** | The composer's default studio is physical row order, not a stable choice. `useOrganizations` (`packages/supabase/src/hooks/use-organizations.ts:159-169`) issues its select with **no `.order()`**; `activeDesignStudios` preserves that order and `invoice-composer.tsx:181` takes `studios[0]` as the studio a studio invoice is drawn from until the designer touches the select. Observed **both** orders in this one walk — `["Leah Hartwell","Local Dev Studio"]` early, `["Local Dev Studio","Leah Hartwell"]` after an unrelated `organization_members` write. A two-studio designer repeating last month's motion can silently bill from the other studio: wrong letterhead on the letter, wrong `studio_invoice_counters` sequence. Fix: sort `studios` by name (or by membership `joined_at`) in `activeDesignStudios`, and cover it in `lib/document/__tests__/invoice-composer.test.ts`. Shot `02a-studio-chosen.png` vs `07a-two-studio-line.png`. |
| W-2 | minor | Local Stripe cannot run: `/Users/kody/Code/patina-merged/supabase/functions/.env` carries a placeholder `sk_test_…alls`, so `create-checkout-session` 502s and **no leg of hosted Checkout was walked in a browser** — neither card nor ACH, neither the success return nor the webhook settle of a null-project invoice. The return address and the return-leg *consumption* were proven separately (step 4). This is an environment gap, not a code defect; it does mean the Checkout→webhook→earnings path for a studio invoice is proved only by the SQL suite and `stripe-rail.test.ts`, never by a live rail. Shot `04e-after-settle-card.png`. |
| W-3 | minor | A studio draft voided **before it was ever issued** is readable by the household over the API — `invoices_household_select` is `client_id = auth.uid() AND status <> 'draft'`, and a void draft is not a draft. `walk-solo@patina.test` reads `{"invoice_number":null,"status":"void","title":"Retainer · drawn in error"}`. The client UI does not render it (front door and Earlier invoices both exclude it, verified), so nothing leaks visually. Note this exactly mirrors the pre-existing project policy (`Clients can view issued invoices on their projects`, same `status <> 'draft'` clause), so it is the standing rule rather than a new class — but a studio draft is paper the household was never sent, which the project case does not have. |
| W-4 | nit | The brief expected past due "in terracotta". The Receivables row renders `9d overdue` inside the row's meta line at `text-[var(--color-aged-oak)]` → `rgb(139, 115, 85)`. It is emphatically **not red** (the binding half), and it is the same renderer project invoices use, so this is the standing treatment rather than a studio-invoice regression — flagging only because the walk brief named terracotta. `accounts-receivables-page.tsx:171-188`, shots `08a`, `08b`. |
| W-5 | nit | After voiding a **studio** invoice the folio states `INVOICE VOIDED · LINKED MILESTONES AND TIME RELEASED` (`invoice-folio.tsx:313`) — contradicting the confirm copy two seconds earlier, which correctly says "a studio invoice holds no milestones or time". Designer-read only. Shot `08f-voided.png`. |

### Advisories (not this program's, blocking nothing)

- The settle failure band prints the raw Stripe message to the homeowner —
  `Unable to start payment. (Invalid API Key provided: sk_test_********************alls)`.
  `settlement.tsx:146` is untouched by this program (`git diff 36b4b539e..HEAD` on that file
  is empty), so it is pre-existing; it would be worth teaching `refusalSentence` to swallow
  provider detail before a real key is ever mis-set in prod.
- The household picker lists `Client User · client@patina.dev` twice — pre-existing roster
  duplication in the local seed, unrelated to studio invoices.
- Client-page money renders whole dollars (`$475` for `$474.75`) via `moneyInWords`
  (`standing-sentence.ts:150-157`, `maximumFractionDigits: 0`) — a deliberate, untouched
  client-page convention; the exact figure appears in the charge sentence and on print.

## What I did not verify

- Any hosted Stripe Checkout leg, the `stripe-webhook` settle of a null-project invoice, and
  the surcharge actually charged (W-2).
- The single-studio "silent studio line" half of S8 (step 7, above).
- Firefox/WebKit — chromium only.
- The People room's household invoice list, the iOS app, and anything on Strata. Nothing was
  run against production.
- I ran no gate suites; the wave reports own those.
