# W1 CLOSE — edge lane, adversarial review (this hand's round 1; filed as r5)

**Reviewer:** separate context, did not write this code.
**Worktree:** `/Users/kody/Code/patina-merged/.codex/worktrees/agent-si-edge`
**Branch:** `studio-invoices/w1-edge`  ·  **Diff:** `72ddcd213..HEAD` (15 commits, tip `142ecbb05`)
**Verdict: SHIP** — no blocker, no major. Two minor findings and three nits, all
documentation / consistency; nothing on the money path, nothing a homeowner reads.

```
$ git -C .codex/worktrees/agent-si-edge rev-parse --show-toplevel
/Users/kody/Code/patina-merged/.codex/worktrees/agent-si-edge
$ git -C … branch --show-current
studio-invoices/w1-edge
```

**Filename note.** The brief says to write `w1-close/edge-review-r1.md`. That file
already exists — the close phase has run four review rounds (`edge-review-r1.md`
… `r4.md` in the worktree). Writing "round 1" over it would destroy an earlier
reviewer's evidence, so this round is filed as `edge-review-r5.md`, continuing
the close series. See finding E5-5.

---

## 1 · The five ruled items — delivered, and each one re-pinned by my own mutation

I did not take the fixer's word for the pins. Every mutation below was applied to
a fresh copy of `supabase/functions` under `$TMPDIR` and the suite re-run.

| # | ruling | delivered at | my mutation | gate result |
|---|---|---|---|---|
| 1 | **W5-1** — five senders' SELECT still names `studio_id, title` | `_shared/invoice-subject.test.ts:241-249` | `perl -pi -e 's/project_id, studio_id, title, invoice_number/project_id, invoice_number/'` on all five `index.ts` (0 residual) | `FAILED \| 21 passed \| 1 failed` — *every invoice sender still selects the studio anchor and the title* |
| 2 | **W5-2** — `loadInvoiceJoined` destructures and logs the error | `stripe-webhook/index.ts:292, 305-310` | revert to `const { data } =` and delete the `if (error) console.error(...)` block | `FAILED \| 21 passed \| 1 failed` — *the webhook's invoice lookup reports a failed read instead of swallowing it* |
| 3a | **W5-6** — shared seam drops the clause | `_shared/invoice-subject.ts:68-71` (`invoiceForClause`) | restore `` ` for ${invoiceSubjectName(invoice, 'your studio')}` `` | `FAILED \| 247 passed \| 1 failed` — *an invoice naming nothing closes the sentence instead* |
| 3b | **W5-6** — the letters drop the clause | `_shared/invoice-emails.ts:80-85` (`forClause`) | `const trimmed = name?.trim() \|\| "your studio";` | `FAILED \| 237 passed \| 11 failed` — the ten `nameless invoice: … never says "your studio"` tests **plus** *the sent letter closes the sentence and the subject* |
| 4a | **W5-7** — the builder threads `footerLinks` | `_shared/invoice-emails.ts:93-101, 157, 207/279/313/349/385/508/742` (7 sites) | all seven → `footerLinks: undefined` | `FAILED \| 30 passed \| 8 failed` — seven footer tests **plus** *no rung of the reminder ladder invents a house* |
| 4b | **W5-7** — the sender reads the flag off the row | `invoice-send:257`, `invoice-reminders:357`, `stripe-webhook:447,538` | `studioInvoice: !invoice.project_id` → `false` in all three senders | `FAILED \| 21 passed \| 1 failed` — *every client-letter sender reads the footer flag off the invoice row* |
| 5 | **W5-3** — the stale "21 functions" line | `edge-notes.md:176` | n/a (docs) | `:176` now reads `3. These 20 functions.`; the surviving `21` at `:273` sits inside the verbatim round-1 record and is correct as history |

Commits carrying the work, all inside the reviewed range and all Conventional
Commits with no trailers:

```
$ git log --format='%h|%s|TRAILERS:%(trailers)' 72ddcd213..HEAD | head -6
142ecbb05|docs(edge): W1 close — the five ruled items re-verified, each pinned by a red mutation|TRAILERS:
21fdf8599|docs(studio-invoices): W1 close — edge lane adversarial review, round 4|TRAILERS:
1d2998884|fix(edge): compose the letter's name where a test can reach it|TRAILERS:
49374cc13|docs(studio-invoices): W1 close — edge lane adversarial review, round 3|TRAILERS:
e9f6b5f65|docs(studio-invoices): W1 close — edge lane adversarial review, round 2|TRAILERS:
312efc120|docs(edge): W1 edge lane fix round 1 — C1-1, C1-2, C1-3|TRAILERS:
```

`git -C … diff --stat 72ddcd213...HEAD` touches 15 files: 6 program docs and 9
files under `supabase/functions/`. Nothing outside the lane, no `.env`, no
`.claude/`, no migrations.

---

## 2 · The letters, rendered through the real builders

A throwaway Deno script imported the builders and rendered every client letter
twice — with a title, and with `project` and `title` both null.

**Titled studio invoice** (`title = "Design consultation · September"`):

```
sent       SUBJ  Leah Brandt sent you invoice INV-0031 — Design consultation · September
                 Leah Brandt has sent you an invoice for Design consultation · September.
upcoming   SUBJ  Reminder: invoice INV-0031 is due soon — Design consultation · September
still open SUBJ  Still open: invoice INV-0031 — Design consultation · September
second     SUBJ  Second notice: invoice INV-0031 — Design consultation · September
final      SUBJ  Final notice: invoice INV-0031 — Design consultation · September
receipt          We received your payment of $450.00 toward invoice INV-0031 for
                 Design consultation · September, billed by Leah Brandt.
failed           Unfortunately your bank transfer of $450.00 toward invoice INV-0031 for
                 Design consultation · September, billed by Leah Brandt, could not be completed.
```

**Nameless** (`project: null, title: null` — the last-resort path W5-6 rules on):

```
sent       SUBJ  Leah Brandt sent you invoice INV-0031
                 Leah Brandt has sent you an invoice.
upcoming   SUBJ  Reminder: invoice INV-0031 is due soon
                 Just a friendly reminder that Leah Brandt's invoice is coming due.
still open SUBJ  Still open: invoice INV-0031
                 Invoice INV-0031 from Leah Brandt is still open.
second     SUBJ  Second notice: invoice INV-0031
final      SUBJ  Final notice: invoice INV-0031
receipt          We received your payment of $450.00 toward invoice INV-0031, billed by Leah Brandt.
failed           …your bank transfer of $450.00 toward invoice INV-0031, billed by Leah Brandt,
                 could not be completed.
```

The clause is *gone*, not replaced: no "for your studio", no "for the studio", no
dangling "for .", and the comma sits flush against the invoice number. Machine
check on all fourteen renders: `HAS 'your studio': false`, `HAS 'project': false`
(subject + full HTML, case-insensitive) — so the footer is clean too.

**Footer links, every studio letter (`footerLinks` threaded):**

```
sent        >View invoice</a>            | >Your page</a> | >Email preferences</a>
upcoming    >View &amp; pay invoice</a>  | >Your page</a> | >Email preferences</a>
still open  >Pay invoice</a>             | >Your page</a> | >Email preferences</a>
second      >Pay invoice now</a>         | >Your page</a> | >Email preferences</a>
final       >Pay invoice immediately</a> | >Your page</a> | >Email preferences</a>
receipt     >View receipt</a>            | >Your page</a> | >Email preferences</a>
failed      >Try payment again</a>       | >Your page</a> | >Email preferences</a>
```

The shell's client default is exactly two links — `Your project` (href = client
base) and `Email preferences` (`branded-email.ts:219-223`) — so the override is
one-for-one with no link lost, and `href` is the same client base the ruling
names (`studioInvoiceFooterLinks()` → `portalBaseFor("client")`). Project
invoices keep `Your project`; the paired `project invoice: the … footer is
untouched` tests pin that in both directions.

Vision refusal sweep on the seven client letters: no badge, no count chip, no
red/green status word, no checkmark glyph, no emoji, no "AI", no "gate", "task",
"dashboard"; the past-due rungs say "still open", "second notice", "final
notice", "two weeks on from its due date" — never "overdue". The only "overdue"
strings in the module are in `buildInvoiceArEscalationEmail` and the designer's
own `notification_log` lines, which no homeowner reads.

---

## 3 · The rest of the METHOD checklist

**Every `project` dereference in the five functions is optional-chained.**

```
create-checkout-session:239  caller.id === (invoice.client_id ?? invoice.project?.client_id)
invoice-send:210             invoice.client_id ?? invoice.project?.client_id ?? null
invoice-reminders:129        invoice.client_id ?? invoice.project?.client_id ?? null
stripe-webhook:323           invoice.client_id ?? invoice.project?.client_id ?? null
invoice-check-intent:145     caller.id === (invoice.client_id ?? invoice.project?.client_id)
```

No `invoice.project.` (unguarded) anywhere; every local invoice type declares
`project_id: string | null; studio_id: string | null; title: string | null`
(`create-checkout-session:199-201`, `invoice-send:70-72`,
`invoice-reminders:96-98`, `stripe-webhook:156-158`,
`invoice-check-intent:67-69`). Repo-wide grep for `your project` / `your studio`
/ `project?.name ??` across `supabase/functions/` returns no invoice-path hit
outside comments — the survivors are `sms-inbound`, `_shared/sms.ts`,
`comms-notification-dispatch`, `commercial-document-notify`, `po-send`,
`qbo-export`, none of which touch an invoice letter.

**Checkout return URL, null project.** `invoiceCheckoutReturnAddress` routes
through the null-tolerant `clientProjectLink`, and the pinned expectations are
exact:

```
project:  https://client.test/projects/proj-1?invoice=inv-1&checkout=success&session_id={CHECKOUT_SESSION_ID}#letterbox
studio:   https://client.test/?invoice=inv-1&checkout=success&session_id={CHECKOUT_SESSION_ID}#letterbox
cancel:   https://client.test/?invoice=inv-1&checkout=cancelled#letterbox
```

Same params, same order, same fragment last; `{CHECKOUT_SESSION_ID}` is spliced
after encoding so no `%7B` reaches Stripe. Matches the METHOD's expected shape.

**stripe-webhook's three invoice email sites.** `sendSuccessSideEffects:436`
(receipt, `studioInvoice: !invoice.project_id`), `sendFailureSideEffects:528`
(failed transfer, same), `sendInvoiceRefundSideEffects:1687` (refund —
designer-audience, correctly carries no flag). The other four
`sendCompliantEmail` calls in the file are direct-order / ops paths. All three
sites also take `invoiceSubjectName(invoice, null)` for the letter and
`invoiceDeskName(invoice)` for the designer's own line, so no `null` can render
into a desk message.

**Deploy set — recomputed independently.** I walked the relative-import graph
under `supabase/functions/` (skipping `*.test.ts`) and took the reverse
transitive closure of the three shared modules this lane changed
(`studio-identity.ts`, `invoice-subject.ts`, `invoice-emails.ts`):

```
client-invite  commercial-document-notify  create-checkout-session
decision-first-notice  decision-reminders  decision-resolved-notify
expire-decisions  invoice-check-intent  invoice-reminders  invoice-send
notification-digest  notification-dispatch  po-send  proposal-nudge
proposal-sign-confirmation  quote-request-send  review-requests  spec-pdf
stripe-webhook  trade-rfq-send
COUNT 20
```

Identical, set-for-set, to the list at `edge-notes.md:133-152` and `:1193-1198`.
`morning-brief` is correctly absent (comment-only mention).

**No other caller of the changed builders exists.** `buildInvoiceSentEmail`,
the four reminder builders, `buildPaymentReceiptEmail` and
`buildPaymentFailedEmail` — the four now carrying a **required** `studioInvoice`
field — are called only from the four senders in this lane, all updated. There is
no React mirror: `packages/email/src/` contains no invoice template.

**No injection regression.** `forClause` escapes; the markup-in-title test is
still green. `notification-digest` reads only `type = 'proposal_nudge'` rows
(`notification-digest/index.ts:70`), so an invoice `title` never reaches its
unescaped `title:` field.

---

## 4 · Gates, run by me

```
$ deno test --allow-all --config …/functions/deno.json …/functions/_shared/
ok | 248 passed | 0 failed (1s)

$ deno test --allow-all --config …/functions/deno.json …/functions/create-checkout-session/ …/functions/stripe-webhook/
ok | 35 passed | 0 failed (259ms)

$ deno check --config …/functions/deno.json \
    supabase/functions/{create-checkout-session,invoice-send,invoice-reminders,stripe-webhook,invoice-check-intent}/index.ts
Check create-checkout-session/index.ts
Check invoice-send/index.ts
Check invoice-reminders/index.ts
Check stripe-webhook/index.ts
Check invoice-check-intent/index.ts        EXIT=0

$ ls <worktree>/deno.lock <worktree>/supabase/functions/deno.lock
No such file or directory (os error 2)   ×2

$ git -C <worktree> status --porcelain
(only sandbox "Operation not permitted" lines on .env* — no modified tracked file)
```

---

## 5 · Findings

### E5-1 · minor (confidence 0.95) — two clause implementations that disagree on a blank name

`_shared/invoice-subject.ts:68-71` and `_shared/invoice-emails.ts:80-85` both
compose "the for clause", and only one of them trims. The letter treats a
whitespace-only `title` as absent; the shared seam treats it as a name:

```
invoiceSubjectName(inv,null) = "   "
invoiceForClause(inv)        = " for    "
invoiceDeskName(inv)         = "   "
letter subject               = "Leah Brandt sent you invoice INV-0031"
letter sentence              = Leah Brandt has sent you an invoice.
designer desk line           = "Invoice INV-0031 for     is past due."
```

So a `title` of `"   "` yields a clean letter and a broken designer line
(`invoice-reminders:449`, `:375`, `:423`; `invoice-send:313-314`, `:349`) plus a
blank Stripe line item (`create-checkout-session:274`, which would read
`Invoice INV-0031 —     · Middle West Studio`).

Reachability is low: `create_draft_studio_invoice` rejects a blank title
(`00571_studio_invoices.sql:877` `NULLIF(btrim(COALESCE(p_title,'')),'') IS NULL`)
and stores `btrim(p_title)` (`:958`). It is reachable only through a later direct
`UPDATE invoices SET title = '  '`, which the 00571 trigger's `UPDATE OF` list
now admits (`:722-735`).

**Fix (one line, if Fable wants it):** make `invoiceSubjectName` fall through on
blank — `invoice.project?.name?.trim() || invoice.title?.trim() || fallback` — and
delete the duplicate trimming in `forClause`/`subjectTail`. That collapses the two
implementations onto one rule and the existing tests stay green.

### E5-2 · minor (confidence 0.99) — the ship order still names a migration that does not exist

Brief item 5 corrected the function count in `edge-notes.md:176` but left the
wrong migration number two lines above it, in the same numbered ship-order list a
ship steward reads:

```
edge-notes.md:159   1. `00570_studio_invoices.sql` (db lane). All five functions now `select` the
```

```
$ ls .codex/worktrees/agent-si-db/supabase/migrations | tail -3
00567_scope_vocabulary_full_house_custom.sql
00568_decision_first_notice_dispatch.sql
00571_studio_invoices.sql
```

There is no `00570` on disk. The file *does* flag this at `:913-915` and
`:1185-1190` ("the migration to push is 00571"), and calls it review nit W5-10 —
but the correction lives 1,000 lines below the instruction it corrects. Seven
`00570` strings against six `00571`. One `sed` on `:159` (and, if cheap, `:22`,
`:233`, `:250`, `:367`) removes the trap. Not blocking: the plan, the db lane and
the closing paragraph all say 00571.

### E5-3 · nit (confidence 0.9) — the W5-1 assertion is coupled to column *order*, not to the columns

`_shared/invoice-subject.test.ts:245` asserts
`/project_id,\s*studio_id,\s*title,\s*invoice_number/`. The ruling asks that the
SELECT "still names `studio_id, title`". As written, a harmless reorder
(`studio_id, project_id, title, invoice_number`) or an inserted column between
them turns the gate red for no defect. Two independent
`/\bstudio_id\b/` + `/\btitle\b/` asserts inside the select block would carry the
same mutation sensitivity (verified: dropping either still fails) with no false
positive. Cosmetic; the current form works.

### E5-4 · nit (confidence 0.85) — "Studio invoice" reaches a homeowner on Stripe's Checkout page

`create-checkout-session:272-275` builds the Stripe line item with
`invoiceSubjectName(invoice, 'Studio invoice')`, and Stripe renders that string
to the payer. It is not a refusal — "studio invoice" is the feature's own ruled
word (S2), not a badge, chip or stand-in pronoun — and the fallback is
unreachable while `title` is required (S12). Recorded so the ruling is explicit
rather than incidental: the letters may say nothing, the Checkout line may not.

### E5-5 · nit (confidence 1.0) — the review filename the brief names is already occupied

`w1-close/edge-review-r1.md` … `r4.md` already exist in the worktree (four close
rounds ran before this one). Writing "round 1" to `edge-review-r1.md` would have
overwritten another reviewer's evidence, so this review is `edge-review-r5.md`.
If the orchestrator globs for a fixed filename, this is the file.

### E5-6 · minor (confidence 1.0) — the main checkout's `w1-close/` mirror is two rounds behind

```
MAIN:  edge-review-r1.md  edge-review-r2.md
WT:    edge-review-r1.md  edge-review-r2.md  edge-review-r3.md  edge-review-r4.md
```

`edge-review-r3.md` and `edge-review-r4.md` exist only on the lane branch. A
synthesis pass reading `/Users/kody/Code/patina-merged/artifacts/…/w1-close/`
would silently miss two rounds of findings. (`w1/edge-notes.md` itself is
byte-identical between the two copies — `diff -q` → SAME — so only the close
reviews drifted.) This review is written to both paths.

---

## 6 · Advisories (never block)

- **A1** — The plan's `_tests/stripe-rail.test.ts` null-project case is **closed by
  the db lane**, not this one: `agent-si-db/supabase/functions/_tests/stripe-rail.test.ts:250-254`
  inserts `project_id: null, studio_id: ids.studio, title: '<marker> consultation'`.
  The edge lane's "Left deliberately undone" entry (`edge-notes.md:188-190`) is
  now stale in the other direction — the case exists.
- **A2** — The M6 mockup's illustrative subject (*"Invoice from Middle West Studio
  · Design consultation"*) is not the shipped shape (*"Middle West Studio sent
  you invoice INV-0031 — Design consultation · September"*). The mockup's own
  caption rules the intent — "the regarding line stands where the house name
  stands today" — which is exactly what shipped. No change wanted; noted so the
  walk does not read the divergence as a defect.
- **A3** — The designer-audience shell footer still says "Dashboard"
  (`branded-email.ts:226`). Out of this lane and out of the refusal's scope
  (homeowner copy), but it is the one place the banned word survives in an email.
- **A4** — `invoiceDeskName` and `invoiceForClause` are new exports this lane
  added beyond the literal five items. They are not scope creep: once
  `invoiceSubjectName` can return `null`, every designer desk line that
  interpolated `${projectName}` would have rendered the string `"null: …"`.
  Necessary consequence of ruling W5-6.

---

## 7 · Verdict

**SHIP.** All five ruled items are delivered at the sites the brief names, each
independently re-pinned by a mutation I applied and re-ran. The letters a
homeowner reads carry no stand-in house, no "your studio", no "Your project"
footer and no refusal. The money path is untouched: `loadInvoiceJoined` still
returns `data ?? null` and only *logs* the error, no status write was added, no
rollup was touched, integer cents throughout. Deploy set is 20, recomputed
independently and identical.

Everything open is documentation or a defensive nit. E5-2 (the `00570` in the
ship order) is the one worth a `sed` before the ship steward reads it.
