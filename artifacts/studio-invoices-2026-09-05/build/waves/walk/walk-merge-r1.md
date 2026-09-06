# Studio invoices — re-walk after the main merge (round 1)

**Walker:** re-walk agent (merge r1) · **Date:** 2026-09-05
**Worktree:** `/Users/kody/Code/patina-merged/.codex/worktrees/agent-si-integration`
(`git -C … rev-parse --show-toplevel` printed exactly that path)
**Branch:** `studio-invoices/integration` · **HEAD walked:** `e6ef1b8215adfe8687e2dce233e0fa610ca7ab0e`
**Screenshots:** `artifacts/studio-invoices-2026-09-05/build/waves/walk/shots-merge-r1/` (39 shots)

**Verdict: ship** — no blocker, no major. All eight brief steps walked in real browsers on the
post-merge tree. The approvals program's Wave 2 is intact on the same client page; the studio
rail is intact beside it. Two of r2's nits survive unchanged (they were never fixed); r2's
W2-4 (post-void copy) **is fixed and re-proved**; r2's W-1 (composer studio default) still
holds. One new advisory, seed-shaped, not code.

---

## Stack under walk

| Layer | State |
|---|---|
| Supabase | **already up, reset by the merge steward — I did not reset it.** `max(version)` in `supabase_migrations.schema_migrations` = `00571`; applied tail = `00571, 00569, 00568, 00567, 00566, 00565, 00564, 00563, 00562, 00561, 00560, 00559` — i.e. the approvals W2 migration `00569_approval_why_viewer_role_and_receipt.sql` and the studio-invoice migration `00571_studio_invoices.sql` are both on the stack. |
| designer-portal `:3000` | `npx next dev --webpack -p 3000` from `<wt>/apps/designer-portal`, env inlined from `apps/designer-portal/playwright.config.ts` `webServer.env` + `NEXT_PUBLIC_FLAG_OVERRIDES='procurement-workspace-pilot:true,the-document-pilot:true,studio-invoice:true'` + `NEXT_PUBLIC_DESIGNER_PORTAL_DATA_MODE=live`. Restarted once at the end with `studio-invoice:false` for the flag-off half of step 1. |
| client-portal `:3002` | `npx next dev --webpack -p 3002`, `NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321` + the local demo anon key from `apps/client-portal/playwright.config.ts`, `NEXT_PUBLIC_CLIENT_PORTAL_DATA_MODE=live` |
| edge functions | `supabase --workdir /Users/kody/Code/patina-merged/.codex/worktrees/agent-si-integration functions serve --no-verify-jwt --env-file /Users/kody/Code/patina-merged/supabase/functions/.env` → `Using supabase-edge-runtime-1.74.3 (compatible with Deno v2.1.4)`, 75+ functions served |
| browsers | Playwright chromium `@playwright/test@1.58.2`, one persistent profile per actor (`designer` / `solo` / `duo` / `client`) so the shared-localhost `sb-*` cookie never crossed actors |

**Harness note (new this round).** Both dev servers first booted into a wall of
`Watchpack Error (watcher): Error: EMFILE: too many open files, watch` and answered **404 on
every route**. `ulimit -n 65536` in the launching shell cleared it (`grep -c EMFILE` → `0` on
both relaunches, `/desk` → `307`). Chromium and the `--env-file` read both need
`dangerouslyDisableSandbox` on this machine (`bootstrap_check_in … Permission denied (1100)`,
and `functions/.env: not found`).

## Seed (written by me, local only — three GoTrue admin users + SQL)

- **Odile Marchand** `m1-solo@patina.test` `372a85fb-…da25f` — household, **no project**, on
  `designer@patina.dev`'s and Bramwell Fox's `designer_clients` rosters.
- **Rufus Blackwood** `m1-duo@patina.test` `b41522a1-…7569a` — household with **two** projects,
  both with `studio_id = Local Dev Studio`:
  `2a000000-0000-4000-8000-0000000000c1 Blackwood Fern Cottage` (lexicographic low) and
  `bb000000-0000-4000-8000-0000000000c2 Blackwood Stone Barn`.
- **Bramwell Fox** `m1-single@patina.test` `1e659592-…d57ba` — designer, one active studio
  (`organizations` row `e1000000-…0001`), plus the `studio_owner` role row the designer-portal
  middleware wants.
- Designer: `designer@patina.dev` / `password123`, active **owner of two** design studios —
  `Leah Hartwell` `26fd626b-…bca55` and `Local Dev Studio` `b0000000-…0001`.

Studio counters started empty (`select count(*) from studio_invoice_counters` → `0`), so every
number below is minted from a cold counter.

---

## The eight steps

### 1 · Composer: the studio option, flag on and flag off ✔

⌘K → "draw an invoice" → Enter. Palette rows: `["Draw an invoice","MILESTONES · TIME · FF&E · AD-HOC","Ask about “draw an invoice”","ASK & PLACE"]` (`01a`).
The composer's `For` select, **flag on** (`01b`):

```
label: "For"
["Pick a document…","the studio · no house","Blackwood Fern Cottage","Blackwood Stone Barn",
 "Chen Residence","Olsen Lake House","Birch Hollow","Marrow & Vale Residence",
 "Aspen Loft Refresh","Cedar Lane Study"]
```

"the studio · no house" is the **first** option after the placeholder.

**Flag off** — killed `:3000` (`lsof -ti :3000 | xargs kill -9`, port confirmed free),
relaunched with `studio-invoice:false`, same walk (`01c`):

```
SELECTS (flag off): label "Project"
["Pick a document…","Blackwood Fern Cottage","Blackwood Stone Barn","Chen Residence",
 "Olsen Lake House","Birch Hollow","Marrow & Vale Residence","Aspen Loft Refresh","Cedar Lane Study"]
FLASH SAMPLES WITH STUDIO OPTION (ms): []      ← 50 samples at 100 ms over the 5 s after Enter
final body has phrase: false
```

Not one frame carries the option, and the select's aria-label reverts from `For` to `Project`.
The Accounts ledger **still renders the existing studio rows with the flag off**, with their
clay-ink `studio` stamps and no page error (`01d`) — S10 as ruled:

```
Invoice INV-0001 FOLIO → SITE VISIT · FERN AND BARN STUDIO · $600 · DUE OCT 6   paid Sep 5  PAID
Invoice INV-0001 FOLIO → DESIGN CONSULTATION · SEPTEMBER STUDIO · $475 · DUE SEP 21  $475 owed  SENT
Draft invoice  FOLIO → DESIGN CONSULTATION · SEPTEMBER STUDIO · $475   void  VOID
Invoice INV-2026-0301 FOLIO → CEDAR LANE STUDY · $4,060 · DUE SEP 13  …  document ↗
ERRS []
```

### 2 · Draw a studio invoice for a no-house household → folio ✔

Selecting "the studio · no house" reveals the STUDIO line and the household picker (`02a`):

```
SELECTS AFTER: [{"label":"For", … ,"value":"the studio · no house"},
                {"label":"Studio","options":["Leah Hartwell","Local Dev Studio"],"value":"Leah Hartwell"}]
```

The default studio is **name-sorted** (`Leah Hartwell` before `Local Dev Studio`, though the raw
membership order is the reverse) — r2's W-1 fix from `7f8586ce5` survives the merge.

Composed: studio `Local Dev Studio` · household `Odile Marchand` (picker matched
`Odile Marchand / m1-solo@patina.test`, `02b`) · regarding `Design consultation · September` ·
two ad-hoc lines (2 × $175, 1 × $100) · tax 5.5 · terms 15 · memo. Running totals (`02c`):

```
SUBTOTAL $450.00 | TAX $24.75 | TOTAL $474.75 | 2 LINES | DRAFT THE INVOICE
```

`Draft the invoice` → `POST /rest/v1/rpc/create_draft_studio_invoice -> 200`, folio opens
(`02d`, `03b`):

```
Draft invoice
ODILE MARCHAND · DESIGN CONSULTATION · SEPTEMBER · DRAFT
DRAFT   ISSUED —   DUE — (net 15)   TOTAL $474.75   PAID $0.00   BALANCE $474.75
LINE ITEMS  Design consultation, two sessions 2 $175.00 $350.00 · Sourcing hours 1 $100.00 $100.00
SUBTOTAL $450.00  TAX (5.5%) $24.75  TOTAL $474.75
ISSUE & SEND   VOID
has "document ↗": false
```

Household · title · draft stamp, **no `document ↗` doorway** (the project rows in the same
ledger do carry one — `01d`, `11c`). The row:

```
id             | 2d27f39a-6328-44e1-beef-c4b430f3004d
invoice_number | (null)                     status | draft
project_id     | (null)                  client_id | 372a85fb-…da25f
studio_id      | b0000000-…0001        designer_id | a0000000-…0004
title          | Design consultation · September
subtotal_cents 45000 · tax_cents 2475 · total_cents 47475 · tax_rate 0.0550 · payment_terms_days 15
```

`project_id` NULL, integer cents throughout.

### 3 · Issue & send → the number ✔

Confirm copy (`03c`): *"Issuing assigns the number, locks the totals, and emails the invoice — to
m1-solo@patina.test."* Confirmed (`03d`):

```
Invoice INV-0001 · ODILE MARCHAND · DESIGN CONSULTATION · SEPTEMBER · SENT
ISSUED Sep 6, 2026   DUE Sep 21, 2026   TOTAL $474.75   PAID $0.00   BALANCE $474.75
RECORD PAYMENT   RESEND   VOID   PRINT
INVOICE INV-0001 ISSUED · EMAILED M1-SOLO@PATINA.TEST
NET: POST /rest/v1/rpc/issue_invoice -> 200 · POST /functions/v1/invoice-send -> 200
```

`INV-0001` minted off `studio_invoice_counters` for Local Dev Studio (which started at zero
rows). The letter (local mail is `EMAIL_DEV_MODE=dry_run`, no SMTP path — same as r2):

```
[send-email:dry_run] {"to":"m1-solo@patina.test",
 "subject":"Local Dev Studio sent you invoice INV-0001 — Design consultation · September",
 "category":"operational","userId":"372a85fb-…da25f","templateId":"invoice-sent"}
```

Title in the subject ✔, letterhead names the studio that drew it ✔.

### 4 · The household with no house ✔ (card leg blocked by the placeholder key)

`/invoices/2d27f39a-…` signed out → `/auth/signin?callbackUrl=%2Finvoices%2F2d27f39a-…` (`04a`).
Signed in as `m1-solo@patina.test` → the **letterbox-only front door** (`04b`):

```
PREPARED FOR ODILE MARCHAND
Local Dev Studio
September 2026
One letter is waiting for you.
THE LETTERBOX
  From the studio · not for a house
  Design consultation · September
  INV-0001 · $475 total · $0 paid. Balance $475, due September 21.
  OPEN THE LETTERBOX   PRINT
```

Letterbox open, with the Settle chooser (`04c`):

```
INV-0001                      A TOLL ON THE LINE · DUE SEPTEMBER 21
TOTAL $475   PAID $0   BALANCE $475
HOW WOULD YOU LIKE TO PAY?
  Bank transfer (ACH)  Preferred · lowest fee   + $3.80 processing fee
  Card                                          + $14.24 processing fee
  Mail a check                                  No fee
You will be charged $478.55 — the balance and a $3.80 processing fee.
SETTLE THE BALANCE
```

Three rails, ACH preferred, money in DM Mono. A full DOM scan of that page returned

```
{"redish":[],"greenish":[],"shadows":0,"emoji":[],"checkmarks":[],"forbiddenWords":[]}
```

— no red, no green, zero non-`none` `box-shadow`, no emoji, no ✓ as status, and none of
dashboard / overdue / AI / gate / task / badge.

**Card → Checkout could not run locally** (environment, not code) — `04d`. Picking Card recomputes
to *"You will be charged $488.99 — the balance and a $14.24 processing fee"*, then:

```
POST /functions/v1/create-checkout-session -> 502
UI: "Unable to start payment. (Invalid API Key provided: sk_test_********************alls)"
fn log: [Error] create-checkout-session: customer creation failed Invalid API Key provided: sk_test_…alls
```

`supabase/functions/.env` carries `STRIPE_SECRET_KEY=sk_test_fake_local_no_real_calls`.
Recorded, not chased, per the brief.

### 5 · Two houses, a letter from the SECOND studio — the carry fix ✔

Drew a second studio invoice from **Leah Hartwell** (not the houses' studio) for Rufus
Blackwood: *Site visit · Fern and Barn* · $600 · net 30 (`05a`), issued and sent (`05b`).
Per-studio counters stay independent:

```
 invoice_number |      studio      |              title              | status
 INV-0001       | Local Dev Studio | Design consultation · September | sent
 INV-0001       | Leah Hartwell    | Site visit · Fern and Barn      | sent

 studio_invoice_counters:  Leah Hartwell → 1 · Local Dev Studio → 1
[send-email:dry_run] {"to":"m1-duo@patina.test",
 "subject":"Leah Hartwell sent you invoice INV-0001 — Site visit · Fern and Barn"}
```

Signed in as `m1-duo@patina.test`, `/` landed on **Blackwood Fern Cottage** — the
lexicographically lowest project id — and the letter stands there (`06a`, `06b`):

```
LOCAL DEV STUDIO                         ← the DOORPLATE: the house's studio
PREPARED FOR RUFUS BLACKWOOD
Blackwood Fern Cottage
…
Owed on the open invoice from the studio, not for this house
$600 · due 6 October
THE LETTERBOX
  From the studio · not for a house
  Site visit · Fern and Barn
  INV-0001 · $600 total · $0 paid. Balance $600, due October 6.
…
THE MAT · THE PEOPLE, WHERE THEY WORK   Local Dev Studio · the studio
YOUR OTHER HOUSES  Blackwood Stone Barn
```

And the payee/letterhead names the **letter's** studio, not the house's (`letter-payee.ts`) —
check rail (`06c`) and print (`06d`):

```
MAIL YOUR PAYMENT TO … Write invoice INV-0001 on the memo line.
LET LEAH HARTWELL KNOW A CHECK IS COMING            ← the letter's studio

/invoices/ca8be8e2-…/print :
Leah Hartwell
INTERIOR DESIGN · VIA PATINA
INVOICE INV-0001                       Sent
BILLED TO  Rufus Blackwood · m1-duo@patina.test
REGARDING  Site visit · Fern and Barn
…  NET 30 · USD · PREPARED WITH PATINA
print names Leah Hartwell: true | names Local Dev Studio: false
```

Carry fix proved: doorplate = Local Dev Studio, letterhead + check payee = Leah Hartwell.

### 6 · Record a check → paid → `designer_earnings` with `project_id` NULL ✔

Folio for `INV-0001 / Site visit · Fern and Barn` → `Record payment` → $600.00 · Check ·
`CHK-9902` → `POST /rest/v1/rpc/record_invoice_payment -> 200` (`07a`, `07b`, `07c`):

```
Invoice INV-0001 · RUFUS BLACKWOOD · SITE VISIT · FERN AND BARN · PAID
TOTAL $600.00   PAID $600.00   BALANCE $0.00
PAYMENTS  Sep 5, 2026  Check CHK-9902  SUCCEEDED  $600.00
```

```sql
-- invoices
invoice_number INV-0001 · status paid · total_cents 60000 · amount_paid_cents 60000
paid_at 2026-09-05 17:00:00+00 · project_id (null)

-- invoice_payments (exactly one row)
method check · status succeeded · amount_cents 60000 · reference CHK-9902

-- designer_earnings
source_type design_fee · gross_amount 60000 · net_amount 60000 · status paid
description "Invoice INV-0001 — Site visit · Fern and Barn"
project_id (null) · designer_id a0000000-…0004
```

Plan risk 3 closed again. The only write the app made was `record_invoice_payment`; the rollup
is the 00178/00277 trigger's.

### 7 · Void a fresh draft ✔ (r2's W2-4 is fixed)

The spare draft `746a8506-…` → `VOID`. Confirm copy (`08a`):

> *"Voiding keeps the number and marks the invoice void. Nothing else is released; a studio
> invoice holds no milestones or time. This cannot be undone."*

Reason required (`aria-label="Void reason"`, placeholder *"Reason (required) — duplicate, wrong
amounts…"*) → `Drawn in error — duplicate` → `POST /rest/v1/rpc/void_invoice -> 200` (`08b`):

```
Voided Sep 5, 2026 — Drawn in error — duplicate
INVOICE VOIDED · THE LETTER WITHDRAWN, NOTHING ELSE RELEASED
mentions milestones: false | mentions released: true
```

```sql
invoice_number (null) · status void · void_reason 'Drawn in error — duplicate'
voided_at 2026-09-06 02:35:28.439391+00
```

r2's nit W2-4 (the folio note used to say "linked milestones and time released", contradicting
the confirm copy) is **fixed** by `4be21baea` / `37b15a35f` and re-proved here.

### 8 · Approvals-program smoke on the same client page ✔ — the merge did not break the peer

The seed carries one Stage-2 approval: `client_decisions` row
`b0000000-0000-0000-0000-00000005c301 · "Design Development sign-off — drawing set B" ·
decision_kind = 'approval' · status pending · project Aspen Loft Refresh`. (The
`project_approval_artifacts` / `project_approval_action_receipts` tables from 00569 exist but
are empty in this seed — `count = 0`.)

As `client@patina.dev` on Aspen Loft Refresh (`09b`, `09c`), the Wave-2 ceremony renders in full
beside the studio rail:

```
YOUR ACCEPTANCE IS NEEDED BEFORE THE LINE CONTINUES.
Paintwork and plaster
TRADE SCOPE · $3,850
TYPE YOUR FULL NAME
5 September 2026
Your typed name acts as your electronic signature.
ACCEPT THE FINISHED WORK
Press and hold to accept the finished work.
```

— the plate, the weighing sentence, the typed name and the press-and-hold, all present. So are
the eleven stamps and the key (`09d`):

```
One mark stands open on this drawing.
KEY · THE WHOLE HOUSE
  Paintwork and plaster  HATCHED   — $3,850, held back until you accept it.
  Everything else in the house stands open.  OPEN
WHAT THE HOUSE SENT   5 SEPTEMBER  A sign-off needs you  SENT
THE PAPERS  The drawing set · Trade scope · … · INV-2026-0142
```

The same page also carries the letterbox and the invoice — the two programs coexist. The only
console error on that page is a pre-existing CSP block on a seeded product image
(`img-src 'self' data: https: blob:` vs `http://127.0.0.1:54321/storage/...`), unrelated to
either program.

The all-houses front door for that client (`09a`) is clean, `ERRS []`.

### 9 · A PROJECT invoice still issues, sends and settles by check ✔ (regression)

Drew a fresh project invoice on **Cedar Lane Study** (one ad-hoc line, $1,200, net 30) — the
project composer still pulls its three tick-lists (`10a`):

```
PAYMENT MILESTONES · UNBILLED   UNBILLED TIME   FF&E · UNINVOICED   AD-HOC LINES
```

`create_draft_invoice -> 200` → folio → `Issuing assigns the number, locks the totals, and emails
the invoice — to client-solo@patina.dev.` → `issue_invoice -> 200`, `invoice-send -> 200`
(`10b`–`10d`):

```
Invoice INV-0002 · NORA ELLISON · CEDAR LANE STUDY · SENT
DOCUMENT ↗                        ← the project doorway the studio rows do NOT have
ISSUED Sep 6, 2026   DUE Oct 6, 2026   TOTAL $1,200.00
[send-email:dry_run] {"to":"client-solo@patina.dev",
 "subject":"Local Dev Studio sent you invoice INV-0002 — Cedar Lane Study"}
```

Settled by check `CHK-7711` (`11b`) → `record_invoice_payment -> 200`:

```
invoice_number INV-0002 · status paid · amount_paid_cents 120000
project_id  b0000000-…c0d1
designer_earnings: earn_project b0000000-…c0d1 · gross_amount 120000 · status paid
```

Project invoices keep their `project_id` on the earnings row; studio invoices carry NULL. Both
rails work off the same folio.

---

## Extra probes

**Per-studio numbering is not shared with the project series.** `INV-0002` above came off Local
Dev Studio's counter (1 → 2), because Cedar Lane Study's `studio_id` is Local Dev Studio. That
is `00318_studio_invoice_numbering_and_ops.sql` behaviour, not 00571's — 00571 only comments on
it (`-- numbering always comes off studio_invoice_counters (00318) and never the …`). The
`INV-2026-NNNN` numbers in the ledger are hand-seeded legacy rows. Not a regression.

**Console.** Every driven designer-portal page and every studio-invoice client page reported
`ERRS []` — no `pageerror`, no console error. The single console error anywhere in the walk is
the seeded-image CSP block on the Aspen approvals page, above.

**Ledger, end state** (`11c`) — studio rows stamped `STUDIO` with no `document ↗`, project rows
with it:

```
Invoice INV-0002       CEDAR LANE STUDY · $1,200 · DUE OCT 6        paid Sep 5  PAID  document ↗
Invoice INV-0001       SITE VISIT · FERN AND BARN STUDIO · $600     paid Sep 5  PAID
Invoice INV-0001       DESIGN CONSULTATION · SEPTEMBER STUDIO · $475  $475 owed  SENT
Draft invoice          DESIGN CONSULTATION · SEPTEMBER STUDIO · $475   void      VOID
Invoice INV-2026-0301  CEDAR LANE STUDY · $4,060 · DUE SEP 13       $4,060 owed SENT document ↗
```

---

## Findings

| id | sev | conf | what |
|---|---|---|---|
| M1-1 | minor | 1.00 | (was W2-1) No leg of hosted Stripe Checkout can be walked locally — `sk_test_fake_local_no_real_calls`. Environment, not code. Owed to the prod walk. |
| M1-2 | nit | 1.00 | (was W2-6, unchanged) Designer-facing Receivables renders `${days}d overdue` (`accounts-receivables-page.tsx:180`); the program's vocabulary is "past due". Shared renderer with project invoices; `grep "past due"` in that directory returns nothing. |
| M1-3 | nit | 0.85 | (was W2-5, unchanged) On a front door holding several letters, the *pending* and *cancelled* Checkout-return lines do not name the invoice they are about (`letterbox.tsx:226-231`, `road-orders.tsx:108-113`); only the confirmed branch interpolates `returnedRow?.invoice_number`. |
| M1-4 | nit | 0.90 | ADVISORY, seed-shaped — `useCreateDraftInvoice` refuses a project whose `studio_id` is NULL with *"Invoice project is missing its canonical billing tuple"*; the local seed's `Aspen Loft Refresh`, `Birch Hollow`, `Marrow & Vale Residence`, `Chen Residence`, `Olsen Lake House` all have NULL `studio_id`, so a project invoice cannot be drawn there. The guard predates this program (`13a256f56`, SD hardening) and Cedar Lane Study (full tuple) drafts fine. Not a merge regression; noted so the next walker does not re-diagnose it. |
| — | fixed | — | (was W2-4) The post-void folio note now reads **"the letter withdrawn, nothing else released"**, matching the confirm copy. |
| — | holds | — | (was W-1) The composer's default studio is still name-sorted and deterministic after the merge. |

---

## What was NOT verified

- **Hosted Stripe Checkout, the webhook settle, and the ACH leg** — placeholder key, as above.
  No synthetic `invoice_payments` row was hand-inserted to fire a fake webhook; that would write
  payable state outside the rail.
- **Mailpit rendering of the app letter.** `_shared/send-email.ts` has no SMTP path; local app
  mail is `dry_run` only. Proved through the dry-run log lines.
- **The approvals ceremony end-to-end** (typing a name and pressing-and-holding to seal). This
  is a smoke that the peer's surface renders after the merge, not a walk of their program.
- **Firefox / WebKit.** Chromium only. **iOS.** Not touched.
- **No gate command was run** — this brief is a browser walk; the lane gates belong to the
  implementers and the integration steward.
