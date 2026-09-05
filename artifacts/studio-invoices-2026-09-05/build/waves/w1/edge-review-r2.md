# W1 edge lane — adversarial review (this brief: "round 2"; chronologically round 6)

Worktree `/Users/kody/Code/patina-merged/.codex/worktrees/agent-si-edge`,
branch `studio-invoices/w1-edge`, HEAD `ba2003f4c`, base `36b4b539e`.
Reviewer did not write this code.

```
$ git -C <wt> rev-parse --show-toplevel
/Users/kody/Code/patina-merged/.codex/worktrees/agent-si-edge
$ git -C <wt> branch --show-current
studio-invoices/w1-edge
```

19 files changed, 2579 insertions(+), 62 deletions(-) — of which 6 are program
docs; the code surface is 13 files.

---

## Gates, run by the reviewer

```
$ deno test --allow-all --config <wt>/supabase/functions/deno.json <wt>/supabase/functions/_shared/
ok | 211 passed | 0 failed (1s)

$ deno test --allow-all --config … <wt>/supabase/functions/create-checkout-session/
ok | 17 passed | 0 failed (21ms)

$ deno test --allow-all --config … <wt>/supabase/functions/stripe-webhook/
ok | 18 passed | 0 failed (25ms)

  invoice-send · invoice-reminders · invoice-check-intent — no *.test.ts (ls → no matches)
                                                    total 246 Deno tests, 0 failed

$ deno check --config … <index.ts>   — all 20 deploy-set functions
create-checkout-session OK   invoice-send OK   invoice-reminders OK
stripe-webhook OK            invoice-check-intent OK
client-invite OK  commercial-document-notify OK  decision-first-notice OK
decision-reminders OK  decision-resolved-notify OK  expire-decisions OK
notification-digest OK  notification-dispatch OK  po-send OK  proposal-nudge OK
proposal-sign-confirmation OK  quote-request-send OK  review-requests OK
spec-pdf OK  trade-rfq-send OK                                   (20/20 OK)

$ find <wt> -name deno.lock -not -path "*/node_modules/*"   → nothing
$ git -C <wt> status --porcelain -- supabase artifacts        → clean
```

## Deploy set, recomputed independently

Reverse transitive closure of `_shared/studio-identity.ts` over every relative
import under `supabase/functions` (python graph walk, not a name grep): **19**
dirs — client-invite, commercial-document-notify, create-checkout-session,
decision-first-notice, decision-reminders, decision-resolved-notify,
expire-decisions, invoice-reminders, invoice-send, notification-digest,
notification-dispatch, po-send, proposal-nudge, proposal-sign-confirmation,
quote-request-send, review-requests, spec-pdf, stripe-webhook, trade-rfq-send —
∪ `invoice-check-intent` = **20**. Matches the notes. `morning-brief` correctly
absent. Closures of the other two edited `_shared` modules are strict subsets:
`invoice-subject.ts` → the five; `invoice-emails.ts` → four of the five.

## Brief items 1–4

| # | verdict |
|---|---|
| 1 `resolveStudioIdentity({studioId})` | **delivered**, `p_studio_id` always named; 6 new unit cases incl. the no-retry-when-studio branch. Matches db-lane `00571:1222` `(p_project_id, p_designer_id, p_studio_id DEFAULT NULL)` and its `DROP FUNCTION … (uuid,uuid)` at `:1220`. |
| 2 five functions honest + `title` + `invoiceBrandingRef` | **delivered.** `grep "your project\|project?.name"` over the five → 0 hits; every site routes through `invoiceSubjectName`. `notification_log` has no `project_id` column (00041) — `project_id` lives only in jsonb `metadata`, so null is safe. |
| 3 checkout URLs | **delivered, byte-identical on the project path.** Rendered: project success `…/projects/<uuid>?invoice=inv-9&checkout=success&session_id={CHECKOUT_SESSION_ID}#letterbox` (identical to base `36b4b539e:index.ts:292`); studio success `https://client.patina.cloud/?invoice=inv-9&checkout=success&session_id={CHECKOUT_SESSION_ID}#letterbox`. `{CHECKOUT_SESSION_ID}` un-encoded; fragment last; survives `invoiceCheckoutReturnUrl`. Payer check unchanged (`client_id ?? project?.client_id`, `:238`). |
| 4 tests | **partially delivered.** +11 `invoice-subject.test.ts`, +6 `studio-identity.test.ts`, +4 `invoice-emails.test.ts`, +3 `invoice-checkout-core.test.ts`. **`stripe-webhook/invoice-checkout-integrity.test.ts` still not extended** (18 passed, unchanged from baseline), and the plan's ruled W5-1 SELECT assertion is absent. |

---

## Findings

### R6-1 (blocker) — `loadInvoiceJoined` still swallows the PostgREST error, and this lane is what makes that dangerous

`stripe-webhook/index.ts:287` — `const { data } = await admin.from('invoices').select(…)`.
`error` is destructured nowhere; `:300` returns `data ?? null`. The lane added
`title` to that select (`:292`). Against a database without 00571, PostgREST
answers `42703` and `loadInvoiceJoined` returns null — which makes
`sendSuccessSideEffects` (`:394`), `sendFailureSideEffects` (`:497`) and
`sendInvoiceRefundSideEffects` (`:1653`) return early with **no log line at
all**, while the money still settles. The lane's own notes state this outcome
("SKIPS the receipt, failed-payment and refund letters SILENTLY", edge-notes.md
ship-order step 1) and did not close it. Plan `:24` already rules it **W5-2 |
major | FIX**. One-line fix; assigned to the W1 Close edge agent.

### R6-2 (major) — W5-1 not delivered: nothing asserts the five SELECTs still name `studio_id, title`

Plan `:23` — "five-line assertion in `_shared/invoice-subject.test.ts` that every
sender's SELECT still names `studio_id, title` (mutation-sensitive)".
`grep -n "studio_id\|select" supabase/functions/_shared/invoice-subject.test.ts`
→ hits only inside `invoiceBrandingRef` fixtures (`:76`, `:87`); no source-read
assertion of any `select(`. Deleting `title,` from any of the five index.ts
leaves 246 tests and 20 `deno check`s green.

### R6-3 (major) — W5-6 not delivered: the letters still say "for your studio"

Rendered through the real builders with `projectName = invoiceSubjectName({project:null,title:null})`:

```
SENT     Leah Brandt has sent you an invoice for your studio .
UPCOMING Just a friendly reminder that Leah Brandt's invoice for your studio is coming due.
OVERDUE  Invoice INV-0031 from Leah Brandt for your studio is still open.
SECOND   … invoice INV-0031 from Leah Brandt for your studio is still open, a week on …
FINAL    … the final automated notice for invoice INV-0031 from Leah Brandt for your studio , …
RECEIPT  We received your payment of $450.00 toward invoice INV-0031 for your studio, billed by Leah Brandt.
FAILED   … your bank transfer of $450.00 toward invoice INV-0031 for your studio, billed by Leah Brandt, …
subjects "… — your studio" on all five client rungs
```

Plan `:25` rules **W5-6 | copy | RULING** — never say "for your studio"; drop the
"for …" clause entirely. The same string also reaches the in-app bell
(`invoice-send:339`) and the designer's refund line (`stripe-webhook:1723`).

### R6-4 (major) — W5-7 not delivered: every studio letter carries the shell's "Your project" footer

Rendered footer on all six client letters: `… Patina Your project Email
preferences Patina` (`_shared/branded-email.ts:221`, `audience:'client'`).
Plan `:26` rules **W5-7** — thread `footerLinks` with label **"Your page"**
(href = client base). `renderBrandedShell` already accepts `opts.footerLinks`
(`branded-email.ts:219`); `invoice-emails.ts`'s private `wrap()` (`:100-126`)
does not thread it, so this is still a one-file seam.

### R6-5 (minor) — a blank `title` produces "for ." and a dangling em dash, unguarded and untested

`invoiceSubjectName` uses `??`, which does not catch `''`. Rendered with `title: ""`:

```
SENT subj: Middle West Studio sent you invoice INV-0031 — 
SENT body: Leah Brandt has sent you an invoice for .
RECEIPT:   … toward invoice INV-0031 for , billed by Leah Brandt.
UPCOMING:  Leah Brandt's invoice for is coming due.
Stripe line item: "Invoice INV-0031 —  · Middle West Studio"
```

`00571_studio_invoices.sql:49` adds `title text` with **no CHECK**; only
`create_draft_studio_invoice` validates it (`:799` `NULLIF(btrim(…),'') IS NULL`).
Any other write path (a portal title edit, a backfill) can blank it. The
neighbouring code in these very files uses `?.trim() ||` for every other display
name (`designerName`, `clientName`, `studioSuffix` at `create-checkout-session:270`);
`invoiceSubjectName` is the one that does not. No test covers `title: ""`.
The W5-6 fix should use `.trim() ||` and close both at once.

### R6-6 (minor) — F-A re-verified: the ship gate is real, still open, and not lane code

All four citations hold at this HEAD, checked line by line in this worktree:
`packages/supabase/src/hooks/use-invoices.ts:465` `.eq('project_id', projectId)`;
`apps/client-portal/src/components/threshold/threshold.tsx:272`
`useProjectInvoices(projectId)`;
`apps/client-portal/src/components/threshold/letterbox.tsx:139-141`
`invoices.find(row => row.id === returned.invoiceId) ?? null`;
`apps/client-portal/src/app/page.tsx:62-69` `if (!projectView) { … ProjectsEmptyState … }`.
The gate is written in both places a shipper looks
(`create-checkout-session/index.ts:292-306` and edge-notes ship order step 2).
Closes in W3, not W1.

### R6-7 (minor) — the plan's `_tests/stripe-rail.test.ts` null-project case is still in no lane's brief

Plan `:67` (DB item 10) and the W1 gate list `:200` both require it. The file
hard-codes `project_id` at `:169`, `:214`, `:1012`. Correctly out of this lane
(shared local stack). Unassigned as of the W1 Close split (plan `:34` gives the
db close agent R3-1/2/3/7 and the edge close agent W5-1/2/6/7 — neither names it).

### R6-8 (minor) — an out-of-brief copy change landed on the PROJECT path too

`_shared/invoice-emails.ts:253` "so the project can keep moving" → "so the work
can carry on" and `:324` "may pause work on the project" → "may pause work
already under way". Correct for the studio case and defensible, but these rungs
go to every homeowner on every project invoice, and no ruling covers rewriting
project-invoice reminder prose. Flagging for the copy owner's awareness only.

### R6-9 (nit) — 8 dead citations to `00570`; the migration is `00571`

`supabase/functions/_shared/studio-identity.ts:58`, `:66`;
`_shared/studio-identity.test.ts:167` (a test NAME); `edge-notes.md:22, 159,
233, 250, 367`. Two of those carry line numbers that also moved:
`00570_studio_invoices.sql:1167` for the DROP is `00571:1220`; `00570:1191-1194`
for the short-circuit is elsewhere in `00571`. Plan `:207` sets the bar at
"0 dead citations".

### R6-10 (nit) — edge-notes.md's "Left open, deliberately — F-C" is superseded and now false

`edge-notes.md:374-377` says the shared-seam refactor "wants its own item"; the
later "Fix round 2 — R4-1" section (and commit `7dd0614d5`) delivered exactly it
(`_shared/invoice-subject.ts` + 11 tests). A reader of the earlier section is
told a fixed thing is open.

### R6-11 (nit) — `invoice-check-intent` types and selects `studio_id` but never reads it

`:67`, `:126`; `grep resolveStudioIdentity invoice-check-intent/index.ts` → no
hits. The omission is correct (`buildCheckIntentEmail` is designer-addressed and
`CheckIntentEmailParams` carries no studio fields). Note that the ruled W5-1
assertion ("every sender's SELECT names `studio_id, title`") makes this column
load-bearing after all — so it should now be kept, not dropped. Closing the
earlier F-H suggestion in the opposite direction.

### R6-12 (nit) — the shipped subject line diverges from mockup M6

M6 reads `Invoice from Middle West Studio · Design consultation`; shipped is
`Middle West Studio sent you invoice INV-0031 — Design consultation · September`.
The plan's edge item only asks for "title in place of project name"
(`:105`, `:175`), which is what landed; matching M6 exactly would rewrite the
shared subject for project invoices too. Taste, no action.

### R6-13 (advisory) — `commercial-document-notify:308` `String(invoiceRow.project_id)`

Blast radius `§2` marks it `(c)`. Deposit invoices come from commercial
documents, which are project-bound, so `String(null)` → `"null"` is unreachable
today. Untouched; correct.

---

## Verdict

**fix.** No red gate, no rebased function body, no money-rule violation in the
code that landed, and the three mechanical brief items (RPC arg, the five
functions, the null-tolerant return address) are delivered and provably correct.
What is missing is the four items the plan already ruled FIX for this lane —
W5-1, W5-2, W5-6, W5-7 — plus the blank-title guard that shares a fix with W5-6.
W5-2 is a silent money-letter skip and should be first.
