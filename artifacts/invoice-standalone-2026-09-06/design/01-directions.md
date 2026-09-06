# The Invoice, Standing Alone — three directions

Design lead · 2026-09-06 · T1 of the program in `/Users/kody/.claude/plans/invoices-need-to-be-splendid-anchor.md`

The page under design is one URL, `/pay/<token>`, opened by anyone holding the link with no
account. It is the studio's invoice — letterhead, lines, totals, memo, payments — and it is also
the till. It gets **one payload** and can call **one guest endpoint** with `{token, method}`.
Fixture throughout: the **Vale residence**, Des Moines · **Harper Vale** · **Nora Quist of Quist
Interiors** · **Invoice No. 4** · $18,250.00 billed, $9,125.00 received, **balance $9,125.00 due
15 August 2026** (`docs/design/the-client-page/README.md:53-66`).

---

## 0 · The spine — what all three directions share

Three directions, one axis: **where the pay decision sits relative to the record.** At the foot,
as a remittance slip (A). Beside it, in a money column (B). In front of it, as a counter (C).
Everything below is common ground; the directions differ in structure, in typographic argument,
and in what they cost.

### 0.1 One act, three outcomes

The page has exactly **one** act. The chooser decides what it does: claim a card Checkout session,
claim a bank-transfer Checkout session, or tell Nora a check is coming. This falls out of the
architecture (one guest endpoint, `method: card | us_bank_account | check`) and it is the reason
the act's label must move with the method. Two buttons on this page would be a lie about the
system underneath it.

### 0.2 The arithmetic, quoted exactly

From `packages/shared/src/invoice/index.ts:169-223` — `surchargeFormula = floor((cents × bps +
5000) / 10000)`, the integer half-up twin of `invoice_payment_surcharge_cents` (00428).

| Method | Rate | Fee on $9,125.00 | Total to pay |
|---|---|---|---|
| Bank transfer (ACH) | 80 bps, capped at $5.00 | **$5.00** (formula gives $73.00; the cap holds) | **$9,130.00** |
| Card | studio `card_surcharge_bps`, default 300 | **$273.75** | **$9,398.75** |
| Mail a check | none | **$0.00** | **$9,125.00** |

Two rules bind every direction. **Never under-quote** — where `card_surcharge_bps` is not in the
payload the fee reads `—`, not a default. And **the fee is never folded into the balance**: net
and surcharge are separate rows, always, so the reader can see the toll and the debt apart from
each other (00428 invariant).

### 0.3 Letterhead order

**Studio first** — name, logo where the payload carries one, website. **Designer second**, on the
line beneath: "prepared by Nora Quist." **Patina last and smallest**, one colophon line at the
foot of the sheet: *Kept for you by Quist Interiors, on Patina.* Never in the header, never
beside a figure, never in the act. The studio does not notice Patina and neither does the
homeowner (Vision §4).

The studio comes from `resolve_studio_identity(project_id, designer_id, studio_id)` (00571), not
from the designer's primary studio — a two-studio designer must never send the wrong name on a
bill.

### 0.4 Paper, ink, faces

Cream, so the guest page and the folio are the same sheet: paper `--color-off-white #FAF7F2`,
ink `--color-charcoal #2C2926` (13.9:1), body `--color-mocha #5C4A3C` (7.6:1), quiet
`--color-quiet-ink #65594E` (6.4:1), rules `--color-pearl #E5E2DD`, the one accent
`--color-clay #C4A57B` — **marks and rules only, 2.1:1, never text**; where clay must carry type
it is `--color-clay-ink #7C5E30` (5.5:1).

Faces are the house's: **Playfair Display** (display), **Inter** (prose), **DM Mono** (figures,
labels, datelines, tabular-nums). What differs per direction is *the argument the faces make* —
see each direction's typography note.

### 0.5 Decisions I made, so the reviewer can overturn them

- **Status is said, never coloured.** Vision §6 bans red/green status. Both the deleted page
  (`923c0e935^`) and the folio put terracotta on "past due" and sage/terracotta on balance. On
  this page overdue reads *"This has been due since 15 August"* in the same ink as everything
  else. This is a deliberate departure from two shipped surfaces.
- **No badges.** The old chooser carried a `Preferred · lowest fee` chip. It becomes a plain line
  of quiet type under the label. §6 bans badges.
- **The surcharge never prints on an unpaid sheet.** A fee that depends on a choice the reader
  has not made is not part of what is owed. A *paid* sheet prints the charged figure on the
  payment row, because that is a fact.
- **The dead link has no letterhead.** No studio name, no amount, no number, nothing that
  distinguishes void from revoked from never-existed. One sheet, one sentence.
- **One live region.** The fee row, the total, and the act label all move together; marking three
  of them live triple-announces. A single visually-hidden `aria-live="polite"` node carries the
  whole sentence; the visible rows are not live.

### 0.6 States, defined once

Nine states. Each direction below says *where each one lands on its page*, not what it means.

| State | Condition | The one thing that must be unmistakable |
|---|---|---|
| Open | `sent`, balance > 0 | What is owed, and the three ways to settle it |
| Partially paid | `partially_paid` | That Total (18,250) and Balance (9,125) are different numbers |
| ACH processing | pending Stripe row with a payment intent | Money has left; do not send it twice |
| Paid | balance 0 | This is a receipt, and it is keepable |
| Past due | `due_date` passed, balance > 0 | How late, in days, without alarm |
| Void / dead | resolver returns NULL | Nothing is owed and nothing can be paid here |
| Studio invoice, no house | `project_id` null | The title stands where a house name would |
| No payer | `pay.has_payer = false` | A check is the way to pay this one |
| Returning from Stripe | `?checkout=…` | Whether money moved — never inferred from the URL |

---

## 1 · Direction A — **The Remittance**

*A studio letter on Document paper, with a remittance slip at its foot. The slip is the chooser.*

### The argument

Every human over thirty has met this object: a bill, and beneath a dotted rule, a stub you tear
off and send back. Direction A takes that convention literally and makes the stub the only place
on the page where a *total to pay* exists. Choosing a method re-inks the stub — not a row
somewhere in a table, the stub itself. Because there is exactly one such figure on the sheet, the
toggle-and-total mechanic has nowhere to be ambiguous.

The letter runs in one measure, ~66 characters, left-aligned, ragged right. Letterhead, dateline,
a regarding line, then a **standing sentence** in the client page's own register —
`moneyInWords`, the instrument the letterbox already uses: *"Nine thousand one hundred
twenty-five dollars stands due on the fifteenth of August."* Then the lines, as a letter's body
rather than a grid: description left, figure right, hairline between. Then the perforation — a
dotted rule the full measure, with the words *Detach and return with your payment* set small in
the middle of it — and the slip.

The slip is a bordered block, the only bordered block on the page. Inside: the three ways to pay
as a radiogroup, the amount line, and the act. Nothing else on the sheet is enclosed, so the eye
finds it without a heading shouting at it.

Typographic argument: **the letter is prose and the slip is a document.** Playfair carries the
letterhead and exactly one other thing — the slip's amount, set at 28px — and nothing else on the
page reaches that size. Inter runs the body at 16px/1.7 with generous leading, because this is
correspondence and it should read like it. DM Mono is confined to the dateline, the line-item
figures and the slip. The moment your eye crosses the perforation, the type changes register from
letter to instrument.

Why it is worth building: it is the most Patina object of the three. It is honest paper, it
prints as a genuinely mailable stub, and it never once looks like software. Its cost is real and
I will not hide it: **the fee is below the fold**, and on a phone it is two screens down.

### First viewport — desktop (1440 × 900)

```
 ┌──────────────────────────────────────────────────────────────────┐
 │                                                                  │
 │   QUIST INTERIORS                              quistinteriors.com│  ← Playfair 22 / DM Mono 11
 │   Des Moines, Iowa · prepared by Nora Quist                      │
 │  ────────────────────────────────────────────────────────────    │
 │   INVOICE NO. 4          ISSUED 1 AUGUST 2026   DUE 15 AUGUST    │  ← DM Mono 11, .14em
 │                                                                  │
 │   The Vale residence                                             │  ← Playfair 30
 │   for Harper Vale                                                │
 │                                                                  │
 │   Nine thousand one hundred twenty-five dollars stands           │  ← Inter 19/1.5
 │   due on the fifteenth of August.                                │
 │                                                                  │
 │   Sconces, pair — Ilse 12 in.                        $2,340.00   │  ← Inter 16 / DM Mono 13.5
 │   Drapery, library and lounge                        $2,890.00   │
 │   Runner, stair                                      $1,660.00   │
 │   ⋯ (the rest of the lines)                                      │
 │                                             ─────────────────    │
 │                                    Subtotal        $18,250.00    │
 │                                    Tax (0%)             $0.00    │
 └──────────────── fold ────────────────────────────────────────────┘
        below: Total · Received · Balance due · the perforation · the slip
```

### First viewport — phone (390)

```
 ┌────────────────────────────────┐
 │ QUIST INTERIORS                │
 │ Des Moines · Nora Quist        │
 │ ──────────────────────────────  │
 │ INVOICE NO. 4                  │
 │ DUE 15 AUGUST 2026             │
 │                                │
 │ The Vale residence             │  ← Playfair 26
 │ for Harper Vale                │
 │                                │
 │ Nine thousand one hundred      │
 │ twenty-five dollars stands     │
 │ due on the fifteenth of        │
 │ August.                        │
 │                                │
 │ Sconces, pair                  │
 │              $2,340.00         │
 └──────────── fold ──────────────┘
   below: lines · totals · perforation · slip  (≈2 screens)
```

### The toggle-and-total mechanic

Three radios on the slip, stacked, each a full-width 48px row: label, then a quiet fee line
beneath it. Selecting one changes four things at once, and nothing else on the page moves:

1. the slip's **fee line** — `Bank transfer fee $5.00` / `Card processing fee $273.75` /
   *(check: the row is absent)*;
2. the slip's **amount**, the Playfair figure — `$9,130.00` / `$9,398.75` / `$9,125.00`;
3. the **act's label** — `Pay $9,130.00` / `Pay $9,398.75` / `Let Nora know a check is coming`;
4. on check only, the slip **grows the remittance panel** beneath the amount.

The fee is explained where it is charged: one line under the amount, *"The fee is what the
payment rail costs; Quist Interiors doesn't add to it."* Not a tooltip, not a footnote — a
sentence you cannot miss because it sits between the figure and the act.

**When the rate is unknown** (`card_surcharge_bps` absent): the card row's fee line reads `—`,
the slip's amount reads `—`, and the act is present but held (`aria-disabled`), with the sentence
*"This studio's card rate isn't on this letter, so a card can't be taken here. Bank transfer and
check are ready."* Never a default that quotes a studio a number it did not set.

**The check panel** appears inside the slip, indented under the selected row: the remit-to
address in Inter at 16px (it is going to be copied by hand, so it is not set in 11px mono), then
*"Write Invoice No. 4 on the memo line,"* then the act — *Let Nora know a check is coming* —
which becomes *Nora knows a check is on its way.* after it resolves. Where the studio has no
remit-to on file, the address block reads *"Nora hasn't put a mailing address on this letter. Ask
her where to send it,"* and the act still stands.

### States, on this page

| State | Where it lands |
|---|---|
| Open | As drawn |
| Partially paid | The letter's totals gain `Received, with thanks −$9,125.00` and `Balance due $9,125.00` above the perforation; the slip's amount is built from the balance, never the total |
| ACH processing | A sentence replaces the slip's act: *"A bank transfer of $9,125.00 is on its way. The balance updates when it clears."* The radios stay readable but held |
| Paid | The perforation and slip are gone. In their place, `PAID IN FULL · 12 AUGUST 2026` as a mono line, and the payments list: *Bank transfer · received 12 August 2026 · + $5.00 processing fee ($9,130.00 charged)* … $9,125.00 |
| Past due | The standing sentence gains a second clause: *"…and has stood so since the fifteenth of August."* No colour |
| Void / dead | The whole letter is replaced. No letterhead. One centred sheet: *"This link is no longer good."* |
| Studio invoice, no house | The Playfair line reads the invoice **title** — *Design consultation* — and a line beneath reads *From the studio · not for a house*. Letterhead unchanged |
| No payer | The slip carries one row, not three: *Mail a check*, already selected, with the panel open |
| Returning from Stripe | A single sentence directly under the dateline, above the letter's body, so it is read before the balance |

### Letterhead

Studio name in Playfair 22 flush left; logo, where present, at 28px cap-height to its left with
the name still set (a logo never replaces the name — a bill must be readable when images are
blocked). Website flush right in mono. Second line: city, then `prepared by Nora Quist`. Colophon
at the very foot, under the payments: *Kept for you by Quist Interiors, on Patina.*

### Print / save PDF

The strongest print of the three, and the reason the direction exists: **the printed sheet is a
mailable remittance stub.** `@media print` drops the radios, the act, the return sentence and the
Print link; the perforation and slip stay, and the slip prints as it always did on paper — remit-to
address, `Invoice No. 4` on the memo instruction, and a ruled blank `Amount enclosed $______`.
Per §0.5 no surcharge prints on an unpaid sheet. A paid sheet prints without the slip and with
`PAID IN FULL` standing where the perforation was.

### Copy

Strings marked **own** are this direction's; the rest are settled across all three and should not
be re-invented per direction.

| Slot | String | |
|---|---|---|
| Chooser heading | How would you like to send it? | own |
| ACH label | Bank transfer | |
| ACH note | The lowest fee of the three. | |
| ACH fee | + $5.00 processing fee | |
| Card label | Card | |
| Card fee | + $273.75 processing fee | |
| Card fee, unknown | — | |
| Check label | Mail a check | |
| Check fee | No fee | |
| Amount line | Amount to send · $9,130.00 | own |
| Fee explanation | The fee is what the payment rail costs; Quist Interiors doesn't add to it. | own |
| Act (ACH / card) | Pay $9,130.00 | |
| Act (check) | Let Nora know a check is coming | |
| Act (check), done | Nora knows a check is on its way. | |
| Check panel head | Mail your check to | |
| Memo instruction | Write Invoice No. 4 on the memo line. | |
| No remit-to | Nora hasn't put a mailing address on this letter. Ask her where to send it. | |
| Card rate unknown | This studio's card rate isn't on this letter, so a card can't be taken here. Bank transfer and check are ready. | |
| Past due | This has been due since 15 August. | |
| ACH processing | A bank transfer of $9,125.00 is on its way. The balance updates when it clears. | |
| Paid | Paid in full · 12 August 2026 | |
| Receipt row | Bank transfer · received 12 August 2026 · + $5.00 processing fee ($9,130.00 charged) | |
| No payer | A check is the way to pay this one. Nora can arrange anything else directly. | |
| Dead link | This link is no longer good. Ask the studio that sent it for a fresh one. | |
| Return · confirming | Confirming your payment. This usually takes a few seconds. | |
| Return · confirmed | Payment confirmed — thank you. This invoice is up to date. | |
| Return · unconfirmed | Checkout came back, but Patina hasn't confirmed a payment yet. Don't send another one until this settles. | |
| Return · cancelled | Checkout closed. Nothing was paid, and you can come back whenever you're ready. | |
| Return · failed | That payment didn't go through. Nothing was charged; you can try again. | |
| Print | Print / save PDF | |
| Colophon | Kept for you by Quist Interiors, on Patina. | |

### Accessibility

`role="radiogroup"` on the slip's option list, `aria-labelledby` the chooser heading; native
`<input type="radio">` so roving arrow-key selection and the checked state come from the platform.
Rows are 48px tall with the whole row as the label's hit area — comfortably over 44px, and the
same on desktop. `:focus-visible` is a 2px `--color-clay-ink` outline at 3px offset, on the radio
and on the act; never removed, and visible against cream at 5.5:1. One visually-hidden
`aria-live="polite"` node announces the whole change as a sentence: *"Bank transfer. Total to
pay nine thousand one hundred thirty dollars — the balance and a five dollar fee."* The visible
fee line and amount are not live. The check panel is a `role="group"` labelled by its heading and
is announced by the same live region (*"…Mailing details follow."*); focus is never stolen from
the radio. Prose ≥ 16px at 7.6:1; mono never below 11px, at 8.9:1; clay is a rule colour only.

---

## 2 · Direction B — **The Statement**

*The deleted page's bones, re-set in Document paper: the record in one measure, the money in a
column beside it.*

### The argument

The page Kody asked us to look at (`923c0e935^:apps/client-portal/src/app/invoices/[invoiceId]/
page.tsx`) had the right parts in the wrong order. Its chooser sat in a full-width 3-up grid
*above* "What's included"; its fee row and Total to pay sat in a narrow column *below* the entire
line-item list. Toggling a radio changed a number the reader could not see. Worse, the live total
appeared **twice** — in the Pay button at the top and in the totals column at the bottom — with
the whole invoice between them.

Direction B fixes exactly that and changes nothing else about what the old page knew. Two
measures on desktop: the **record** on the left (lines, memo, payments) at ~62 characters, and a
**standing column** on the right, 300px, holding the three figures, the chooser, the totals
stack, the fee row, Total to pay, and the act. One column of the eye, top to bottom: *what you
owe → how you'd like to pay → what that comes to → the act.* The toggle and the number it moves
are 40 pixels apart.

The column is not a card. It has no border, no fill, no shadow — it is separated from the record
by a single hairline rule running the full height, the way a ledger separates its money column
from its narrative. That rule is the only structural device on the page, and it is doing real
work: it is the line between the record and the till.

Typographic argument: **the money column is a mono column, edge to edge.** Every figure in it is
DM Mono, tabular-nums, right-aligned to a hard edge, so the decimal points stack for eleven
rows and the reader can add them by eye. Playfair appears exactly twice on the whole page: the
invoice number at the top, and the Total to pay at the bottom of the column. Those two are the
page's first and last words about money, and they are the only two things set in the display
face. Inter carries the descriptions and the memo.

I would borrow one thing from Direction C before building this: each chooser row carries its
**arrived-at total**, not merely its fee, so a reader sees $9,130.00 / $9,398.75 / $9,125.00 at
once. That is the strongest possible reading of "no hidden fees" and it costs one span per row.

### First viewport — desktop (1440 × 900)

```
 ┌───────────────────────────────────────────────────────────────────────┐
 │ QUIST INTERIORS  Des Moines · prepared by Nora Quist   quistinteriors │
 │ ────────────────────────────────────────────────────────────────────  │
 │                                                                       │
 │ Invoice No. 4                        │  BILLED TO DATE   $18,250.00   │
 │ The Vale residence · for Harper Vale │  RECEIVED          $9,125.00   │
 │                                    ╎ │  BALANCE DUE       $9,125.00   │
 │ WHAT'S INCLUDED                    ╎ │  due 15 August 2026            │
 │ Sconces, pair — Ilse 12 in.        ╎ │  ────────────────────────────  │
 │                        $2,340.00   ╎ │  HOW WOULD YOU LIKE TO PAY?    │
 │ Drapery, library and lounge        ╎ │  ( ) Bank transfer  $9,130.00  │
 │                        $2,890.00   ╎ │      the lowest fee · + $5.00  │
 │ Runner, stair                      ╎ │  ( ) Card           $9,398.75  │
 │                        $1,660.00   ╎ │      + $273.75                 │
 │ ⋯ (the rest of the lines)          ╎ │  ( ) Mail a check   $9,125.00  │
 │                                    ╎ │      no fee                    │
 │                                    ╎ │  ────────────────────────────  │
 │                                    ╎ │  Total          $18,250.00     │
 │                                    ╎ │  Paid            −$9,125.00    │
 └────────────────────── fold ────────╎─┴────────────────────────────────┘
     below-left: memo · payments        below-right: Balance due · fee ·
                                        TOTAL TO PAY $9,130.00 · [ Pay ]
```

Note the fold: on a 900px viewport the three figures, the whole chooser with all three totals, and
the top of the totals stack are above it. Total to pay and the act are just below — one short
scroll, and the reader has already seen every number that act will charge.

### First viewport — phone (390)

The column comes **first**. A homeowner who opened this on a phone from an email opened it to
settle something.

```
 ┌────────────────────────────────┐
 │ QUIST INTERIORS                │
 │ Des Moines · Nora Quist        │
 │ ──────────────────────────────  │
 │ Invoice No. 4                  │  ← Playfair 26
 │ The Vale residence             │
 │ for Harper Vale                │
 │                                │
 │ BILLED TO DATE     $18,250.00  │
 │ RECEIVED            $9,125.00  │
 │ BALANCE DUE         $9,125.00  │
 │ due 15 August 2026             │
 │ ──────────────────────────────  │
 │ HOW WOULD YOU LIKE TO PAY?     │
 │ ( ) Bank transfer   $9,130.00  │
 │     the lowest fee · + $5.00   │
 └──────────── fold ──────────────┘
   below: card · check · totals · TOTAL TO PAY · [ Pay ] · what's
   included · memo · payments
```

### The toggle-and-total mechanic

Selecting a row moves three things, all inside the column and all within one screen of each
other: the **fee row** (`Bank transfer fee $5.00` / `Card processing fee $273.75` / absent for
check), the **Total to pay** in Playfair, and the **act's label**. The three per-row totals do
*not* move — they are constants of the invoice, and their stillness is what makes the moving
total legible.

The fee is explained at the head of the chooser, one line: *"Each way to pay carries what its
rail costs. Nothing is added."* Placed above the rows rather than below the act, so it is read
before the comparison, not after the decision.

**Unknown rate:** the card row's total and fee both read `—`, Total to pay reads `—` when card is
selected, and the act is held with the same sentence as Direction A. ACH and check are unaffected
because their arithmetic is the platform's, not the studio's.

**The check panel** opens directly beneath the check row, inside the column, pushing the totals
stack down — the reader's eye does not have to leave the column to find the address. Same three
strings as A: address, memo instruction, notify act.

### States, on this page

| State | Where it lands |
|---|---|
| Open | As drawn |
| Partially paid | The column's totals stack shows `Total $18,250.00 / Paid −$9,125.00 / Balance due $9,125.00` before the fee row — the old page's own fix, kept verbatim, because a $18,250 total above a $5 fee reads as "$18,255 to pay" without it |
| ACH processing | The chooser is replaced in place by the sentence and the act is gone. The three figures and the totals stack stay, unchanged |
| Paid | The chooser, fee row, Total to pay and act all leave the column. What remains is the three figures (`RECEIVED $18,250.00 / BALANCE $0.00`), `PAID IN FULL · 12 AUGUST 2026`, and the payments list at the column's foot |
| Past due | Under `due 15 August 2026`, a second mono line: `past due · 22 days`. Same ink |
| Void / dead | The whole two-column page is replaced by the letterhead-less sheet |
| Studio invoice, no house | The sub-line under the number reads the **title** — `Design consultation · for Harper Vale` — and a mono line beneath: `from the studio` |
| No payer | The chooser renders one row. The row is not a choice, so it is not a radio: it is the check panel with its heading, already open |
| Returning from Stripe | A sentence in the column, directly above the three figures — the money column is where money news belongs |

### Letterhead

A single rule-bounded band across both measures: studio name (Playfair 18, flush left), city and
`prepared by Nora Quist` in mono beside it, website flush right. It reads as the top of a
statement, not as a masthead, which is right — this is the second page of a relationship, not an
introduction. Colophon at the foot of the record measure, not the money column.

### Print / save PDF

Prints as a conventional invoice, which is what most people will file. `@media print` collapses
the two measures to one: letterhead, number, the three figures, What's included, the totals block
(Subtotal / Tax / Total / Paid / Balance due — **no fee row, no Total to pay**), memo, payments,
colophon. The chooser, act, return sentence and Print link are `display: none`. A paid sheet
prints identically with `PAID IN FULL` under the number and the charged figure on the payment
row. This is the direction whose printed output is most likely to satisfy a bookkeeper.

### Copy

Settled strings carry over from §1 unchanged. This direction's own:

| Slot | String |
|---|---|
| Chooser heading | How would you like to pay? |
| Fee explanation | Each way to pay carries what its rail costs. Nothing is added. |
| Row totals | $9,130.00 / $9,398.75 / $9,125.00 (beside each label) |
| ACH note | the lowest fee · + $5.00 |
| Card note | + $273.75 |
| Check note | no fee |
| Figures block | BILLED TO DATE / RECEIVED / BALANCE DUE |
| Fee row | Bank transfer fee · Card processing fee |
| Total row | Total to pay |
| Act | Pay $9,130.00 |
| Past due | past due · 22 days |
| Studio invoice line | from the studio |

Every other string — check panel, unknown rate, processing, paid, receipt row, no payer, dead
link, the five returns, print, colophon — is the §1 table verbatim.

### Accessibility

The chooser is a `role="radiogroup"` labelled by "How would you like to pay?"; each row is a
44px-minimum `<label>` wrapping a native radio, and the row's total is *inside* the label so a
screen reader hears "Bank transfer, nine thousand one hundred thirty dollars, the lowest fee,
plus five dollars processing fee" as one accessible name rather than as three orphan strings.
The single `aria-live="polite"` node announces "Total to pay nine thousand one hundred thirty
dollars — the balance and a five dollar bank transfer fee." The two-column layout is a CSS grid
in DOM order record-then-column on desktop and column-then-record on phone; **DOM order follows
the phone**, with `order` used only on the desktop breakpoint, so tab order and screen-reader
order always run money-first and never disagree with what a sighted phone user sees.
`:focus-visible` as §1. Both measures reflow at 320px with no horizontal scroll; the mono figure
column is `min-width: 0` with `overflow-wrap` so a six-figure invoice cannot push the page wide.

---

## 3 · Direction C — **The Counter**

*Pay first. The three ways to pay, with their three real totals, are the first thing on the page;
the invoice unfolds beneath as the record.*

### The argument

A link arriving by email says *"Invoice from Quist Interiors."* Direction C takes the position
that the person who clicked it came to pay, and that making them scroll past a line-item table to
find out what it will cost them is a small discourtesy repeated thousands of times.

So the page opens as a counter you step up to. Letterhead in one quiet line. One sentence: *"Nine
thousand one hundred twenty-five dollars stands due on the fifteenth of August."* Then, across
the full measure, three ruled rows — the three ways to pay, each carrying **the whole figure you
would actually pay by that route**, not a fee:

    Bank transfer      $9,130.00      the balance and a $5.00 fee
    Card               $9,398.75      the balance and a $273.75 fee
    Mail a check       $9,125.00      the balance, and nothing else

All three, at once, before any choice is made. This is the most literal possible rendering of
Vision §4's *no hidden fees*: the reader does not have to toggle to discover what the other
options cost, because comparison is the page's opening move rather than a reward for
experimenting. It is also the only direction where a reader can see that the check route is the
cheapest without having to select it.

Beneath the counter, a hairline, and then the invoice as the record: What's included, totals,
memo, payments. The record is complete and unabridged — K2 is satisfied — it is simply second.

Typographic argument: **type carries the state.** All three row totals sit in DM Mono at 15px.
When a row is selected, its total promotes to Playfair at 26px and the other two stay mono. The
selection is a *change of voice*, not a border or a fill — which is exactly the device this house
already uses (the story pole's held graduation, the folio's stamps) and it means the chooser needs
no chrome at all to show its state.

The counter is a temporary structure. On a paid invoice it is not disabled or emptied — it is
**gone**, and the record stands alone as a receipt. The shape of the page tells you where you are
in the transaction before you read a word.

Its cost, stated plainly: it asks for a payment decision before showing what is being bought,
which sits awkwardly against Vision §4's *"you and your designer are looking at the same agreed
direction — the decision record is the relationship."* On this page the record is demoted.

### First viewport — desktop (1440 × 900)

```
 ┌────────────────────────────────────────────────────────────────────┐
 │ QUIST INTERIORS · Des Moines · prepared by Nora Quist              │
 │ INVOICE NO. 4 · THE VALE RESIDENCE · FOR HARPER VALE               │
 │ ──────────────────────────────────────────────────────────────────  │
 │                                                                    │
 │ Nine thousand one hundred twenty-five dollars                      │  ← Playfair 34
 │ stands due on the fifteenth of August.                             │
 │                                                                    │
 │ THREE WAYS TO SETTLE IT                                            │  ← DM Mono 11
 │ ──────────────────────────────────────────────────────────────────  │
 │ (•) Bank transfer        $9,130.00   the balance and a $5.00 fee   │  ← selected: Playfair 26
 │ ──────────────────────────────────────────────────────────────────  │
 │ ( ) Card                 $9,398.75   the balance and a $273.75 fee │  ← mono 15
 │ ──────────────────────────────────────────────────────────────────  │
 │ ( ) Mail a check         $9,125.00   the balance, and nothing else │
 │ ──────────────────────────────────────────────────────────────────  │
 │                                                                    │
 │   [ Pay $9,130.00 by bank transfer ]        Print / save PDF       │
 │                                                                    │
 │   Total to pay $9,130.00 — the balance of $9,125.00 and a $5.00    │
 │   bank transfer fee. The fee is what the rail costs.               │
 └──────────────────────── fold ──────────────────────────────────────┘
        below: THE RECORD — what's included · totals · memo · payments
```

### First viewport — phone (390)

```
 ┌────────────────────────────────┐
 │ QUIST INTERIORS · Nora Quist   │
 │ INVOICE NO. 4                  │
 │ ──────────────────────────────  │
 │ Nine thousand one hundred      │  ← Playfair 26
 │ twenty-five dollars stands     │
 │ due on the fifteenth of        │
 │ August.                        │
 │                                │
 │ THREE WAYS TO SETTLE IT        │
 │ ──────────────────────────────  │
 │ (•) Bank transfer              │
 │     $9,130.00                  │  ← Playfair 24, promoted
 │     balance + $5.00 fee        │
 │ ──────────────────────────────  │
 │ ( ) Card         $9,398.75     │
 │     balance + $273.75 fee      │
 │ ──────────────────────────────  │
 │ ( ) Check        $9,125.00     │
 └──────────── fold ──────────────┘
   below: [ Pay $9,130.00 ] · the sentence · THE RECORD
```

Everything the reader needs to choose is above the fold on a 390 × 844 phone. The act sits just
under it, which is deliberate: the decision precedes the button by one thumb-length.

### The toggle-and-total mechanic

Selection promotes one row's total from mono to Playfair and demotes the previously selected one.
The act's label rewrites in full — `Pay $9,130.00 by bank transfer` — carrying both the figure and
the route, because on this page the route is the thing the reader just chose. The sentence under
the act rewrites to the full arithmetic in words and figures: *"Total to pay $9,130.00 — the
balance of $9,125.00 and a $5.00 bank transfer fee."*

Because all three totals are permanently visible, this direction is the only one where the
"moving total" is genuinely redundant information — and that is its safety property. A reader who
misses the promotion still has the number in front of them.

**Unknown rate:** the card row's total reads `—` and its clause reads *"the studio's card rate
isn't on this letter."* The row remains selectable so the reader learns why rather than finding a
row that silently does nothing; selecting it holds the act and rewrites the sentence to *"A card
can't be taken here. Bank transfer and check are ready."*

**The check panel** opens as a fourth block directly beneath the check row, above the act — the
remit-to address, the memo instruction, and the act itself becomes *Let Nora know a check is
coming*. On check, the sentence under the act reads *"Nothing is charged here. Mail the check and
Nora will mark it received."*

### States, on this page

| State | Where it lands |
|---|---|
| Open | As drawn |
| Partially paid | The standing sentence reads *"…of eighteen thousand two hundred fifty dollars billed, nine thousand one hundred twenty-five stands due…"* and the record's totals carry the Paid / Balance due pair |
| ACH processing | The counter is replaced by one sentence in its place: *"A bank transfer of $9,125.00 is on its way…"* The record is untouched |
| Paid | **The counter is gone.** The page opens on `PAID IN FULL · 12 AUGUST 2026` and the record stands alone, ending with the payments list carrying the charged figure |
| Past due | The standing sentence's second clause: *"…and has stood so since the fifteenth."* No colour, no chip |
| Void / dead | Letterhead-less sheet, one sentence |
| Studio invoice, no house | The doorplate line reads `INVOICE NO. 31 · DESIGN CONSULTATION · FOR HARPER VALE` and the standing sentence names the title, not a house |
| No payer | The counter carries one row and the row is not a choice — the check block, open, with the act beneath it |
| Returning from Stripe | Above the standing sentence, in the counter's place: the page's news comes before its ask |

### Letterhead

The lightest of the three, because the counter must own the first viewport: two mono lines above
the rule — studio · city · designer, then invoice number · house · client. A logo, where present,
sits at 20px cap-height before the studio name. This is the direction where the studio's identity
is quietest, which is a real cost: on a page whose first act is "give us money," a small
letterhead does less trust-work than a large one.

### Print / save PDF

Cleanest of the three, and the only one where print and screen genuinely diverge. The counter
does not print at all: `@media print` drops it entirely and the sheet becomes letterhead ·
number · standing sentence · What's included · totals (no fee, no Total to pay) · memo · payments ·
colophon. A paid sheet prints the same, with `PAID IN FULL` under the number. The printed
document is a plain invoice or receipt with no trace of the till — which is right, and which also
means the printed page and the screen page look like different objects. Some readers will find
that disorienting.

### Copy

Settled strings from §1 carry over. This direction's own:

| Slot | String |
|---|---|
| Counter heading | Three ways to settle it |
| ACH row | Bank transfer · $9,130.00 · the balance and a $5.00 fee |
| Card row | Card · $9,398.75 · the balance and a $273.75 fee |
| Check row | Mail a check · $9,125.00 · the balance, and nothing else |
| Card row, unknown | Card · — · the studio's card rate isn't on this letter |
| Act | Pay $9,130.00 by bank transfer |
| Act sentence | Total to pay $9,130.00 — the balance of $9,125.00 and a $5.00 bank transfer fee. The fee is what the rail costs. |
| Act sentence, check | Nothing is charged here. Mail the check and Nora will mark it received. |
| Act sentence, unknown | A card can't be taken here. Bank transfer and check are ready. |
| Record heading | The record |
| Standing sentence | Nine thousand one hundred twenty-five dollars stands due on the fifteenth of August. |

### Accessibility

The counter is a `role="radiogroup"` labelled by "Three ways to settle it." Each row is a 56px
label — the tallest targets of the three directions, and the easiest thumb target on a phone. The
promotion-on-selection device is typographic, so it must not be the *only* signal: the native
radio's checked state carries it for assistive technology and for anyone who cannot perceive a
size change, and the row also gains a 2px `--color-clay` left rule. The `aria-live="polite"` node
announces the act sentence in full — it is already written as a complete sentence, so this
direction needs no separate hidden string, which is a genuine advantage. Font-size promotion is
animated only under `motion-safe`; under `prefers-reduced-motion` the size changes instantly.
`:focus-visible` as §1. At 320px the row's total wraps under its label rather than truncating —
a truncated total is worse than a tall row.

---

## 4 · Comparison

| | **A · The Remittance** | **B · The Statement** | **C · The Counter** |
|---|---|---|---|
| **Answers the ask** (link, no account, method on the page, total moves live) | Yes — but the mechanic is at the foot | **Yes, and the toggle sits beside the number it moves** | Yes — and the mechanic is the page's opening |
| **First-viewport clarity** | Letterhead, house, what's owed. The ways to pay are below the fold | Figures, full chooser with all three totals, top of the totals stack | Everything needed to choose, on both breakpoints |
| **Fee transparency** | Good — one fee, one place, one explanation. Requires a scroll and a toggle | **Very good** — all three totals visible, fee row separate from balance, one sentence above the rows | **Best** — three real totals, unprompted, before any interaction |
| **Phone (390)** | Weakest: two screens to the slip | Strong: money column first, then the record | **Strongest**: choice complete above the fold |
| **Print** | **Best** — prints a mailable remittance stub | Very good — a conventional invoice a bookkeeper will accept | Clean, but print and screen are visibly different objects |
| **Studio invoice, no house** | Natural — a letter needs no house; the title takes the Playfair line | Natural — the sub-line already carries `title ?? project.name`, as the folio does | Natural, but the doorplate line grows long with a title |
| **Build cost vs the blueprint** | Highest — new letter layout, new slip component, a print stylesheet unlike anything shipped | **Lowest** — the chooser, the totals stack and the surcharge arithmetic all exist; the work is layout, letterhead, states, print | Middle — new counter component and a promotion device; the record reuses the old page's sections |
| **Vision fit** | **Highest** — paper, provenance, the studio's voice; Patina invisible | High — the record and the money stand as equals; matches the folio so designer and homeowner read one sheet | Mixed — §4's "no hidden fees" at its strongest, §4's "the decision record is the relationship" at its weakest |

---

## 5 · Recommendation

**Build B, The Statement** — the deleted page's bones, re-set on Document paper, with the chooser
moved into the money column so the toggle and the total it moves sit forty pixels apart.

**Three reasons.**

1. **It fixes the one real defect in the page Kody asked us to look at.** The old page separated
   the chooser from the fee row by the entire line-item list and printed the live total twice.
   Kody's ask centres precisely on that mechanic — *"the real total-to-pay updating live as the
   method toggles."* B is the only direction where that motion happens inside a single column of
   the eye, and it gets there by moving components that already exist rather than by inventing a
   new object.
2. **It honours K2 without ranking the record against the money.** A link holder who came to read
   the bill and a link holder who came to settle it are served by the same first viewport, side by
   side. A wins on beauty by putting the record first and the till two screens down; C wins on
   speed by putting the till first and the record second. B refuses the trade, and refusing it is
   the answer that matches Vision §4 — the homeowner and the designer looking at the same agreed
   direction, with the money in plain sight beside it.
3. **It is the cheapest and the least risky against the blueprint, and it rhymes with the folio.**
   The chooser, the totals stack, the surcharge arithmetic and every state's copy already exist in
   the repo. B keeps the folio's figures in the folio's order, so the sheet Nora reads in the
   designer portal and the sheet Harper opens from an email are recognisably the same document —
   which is what "one pay surface for everyone" (K1) should feel like, not merely what it means.

**What I would borrow.**

- **From C — all three arrived-at totals on the chooser rows.** This is the single best idea in
  the deck. It costs one span per row and it converts "no hidden fees" from a claim into a thing
  the reader can see without touching anything. Fold it into B's chooser; keep B's single moving
  Total to pay as the promoted figure.
- **From C — the counter's disappearance on paid.** When the balance is nil, B's money column
  should lose the chooser, the fee row, the Total to pay and the act entirely, rather than
  disabling them. A receipt with a greyed-out pay button is not a receipt.
- **From A — the letterhead block and the print-only remittance stub.** A's studio-first
  letterhead is the better letterhead: it does trust-work that B's statement band does not. And
  A's print output is genuinely superior — so give B's `@media print` sheet A's stub at the foot
  when the invoice is unpaid, with the remit-to address, the memo instruction and a ruled
  `Amount enclosed $______`. It costs a print-only block and it makes the printed page useful
  rather than merely accurate.
- **From A — `moneyInWords` in the standing sentence.** It is the instrument the client page
  already speaks in, and it makes the page sound like Nora rather than like a payment processor.

---

## 6 · Six open questions for the adversarial reviewer

1. **When the studio's card rate is not in the payload, does the server send the 300 default or a
   true null?** The deleted page did both: it showed `—` while `get_invoice_payment_options` was
   in flight, then kept the 300 fallback on a hard failure — *"over-quoting is survivable,
   under-quoting is not."* The standalone page renders once from one payload and cannot straddle
   the two. Sending 300 means quoting a studio a rate it never set; sending null means a card can
   never be taken from a studio that never configured one. I have designed for null (`—`, act
   held) in all three directions. I cannot settle which is right from code or vision.

2. **Does the token print?** Every browser stamps the page URL into the print header or footer by
   default, and no stylesheet can remove it. A printed invoice filed with a bookkeeper, pinned to
   a fridge, or scanned into an accounting inbox would then carry a bearer link to a live pay
   surface. Options: accept it; print a visible line saying the sheet carries a payment link;
   render an explicit "printable copy" view at a token-free URL that resolves from a cookie. All
   three have costs I cannot weigh without a ruling.

3. **What does the surcharge do on paper?** I ruled that an unpaid sheet prints no fee and no
   Total to pay, because a fee contingent on an unmade choice is not part of what is owed — and
   that a paid sheet prints the charged figure on the payment row, because that is a fact. That
   leaves a printed unpaid invoice showing $9,125.00 while the reader is about to be charged
   $9,398.75. Is that the right silence, or should the printed sheet carry all three totals as a
   small table?

4. **Void: dead link, or a withdrawn state?** K2 says dead on void. My dead sheet carries no
   letterhead, no studio name and no amount, deliberately, so that void, revoked and
   never-existed are indistinguishable. That design forecloses the softer alternative in Fable's
   review note 2 — *"withdrawn by Quist Interiors"* — because naming the studio requires the
   resolver to return a payload for a void invoice. Which does Kody want, and if the softer one,
   what may the resolver reveal about a void invoice?

5. **Whose name goes on the check?** The letterhead resolves to the studio (00571). The check
   panel says *"Let Nora know a check is coming"* and *"Write Invoice No. 4 on the memo line"* —
   naming the designer. But the payee on the envelope is the studio, and on a studio invoice or a
   two-studio designer those are different entities. The payload carries `studio.name` and
   `designer_display_name`; the copy currently mixes them without a rule. I could not find one in
   the code.

6. **Is ordering bank transfer first a nudge Patina is entitled to make?** ACH is listed first,
   pre-selected, and annotated *"the lowest fee of the three"* — inherited from the deleted page.
   It is also the rail that costs Patina least. Every statement on the row is true, and the order
   still steers. Vision §4 promises no hidden fees on one public page; it does not say whether
   Patina may put its own cheapest rail at the top of a homeowner's choice. Check is in fact the
   cheapest for the homeowner ($9,125.00) and it is listed last.

---

## 7 · One note for the mockup builder (T5)

The fixture pins the totals — **$18,250.00 billed, $9,125.00 received, $9,125.00 balance, due 15
August 2026** — but it does not pin a line-item composition. The named fixture amounts
(authorization No. 7 at $6,890 = sconces $2,340 + drapery $2,890 + runner $1,660; the walnut
credenza $8,400; the paintwork release $1,440) sum to **$16,730**, not $18,250. Do not invent
lines to close the $1,520 gap and do not silently re-cut the fixture amounts. Render the named
lines and mark the remainder as an explicit elision (`⋯ the rest of the lines`), or carry a single
honest line for the difference only if T2 can source it. Every visible figure must either come
from the fixture or be arithmetic on figures that do.
