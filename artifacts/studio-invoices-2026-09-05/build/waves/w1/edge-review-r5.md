# W1 edge lane — adversarial review, round 5

Reviewer context: fresh, did not write the code. Worktree
`/Users/kody/Code/patina-merged/.codex/worktrees/agent-si-edge`, branch
`studio-invoices/w1-edge`, diff `36b4b539e…HEAD` (12 commits, 18 files).

> **Filename note.** The brief said "round 3" and named `edge-review-r3.md`, but
> `edge-review-r1…r4.md` already exist in this lane and the findings handed to me
> are labelled `R4-*`. Writing to `r3` would have destroyed round 3's record, so
> this is `r5` — the truthful next number.

**Verdict: fix** — no blocker, two majors.

---

## Gates, run by me

```
$ deno test --allow-all --config .../supabase/functions/deno.json .../supabase/functions/_shared/
ok | 211 passed | 0 failed (5s)

$ deno test ... .../create-checkout-session/     ok | 17 passed | 0 failed (204ms)
$ deno test ... .../stripe-webhook/              ok | 18 passed | 0 failed (119ms)
   invoice-send · invoice-reminders · invoice-check-intent — no *.test.ts (correct: none exist)

$ deno check --config .../deno.json <each of the five index.ts>
Check create-checkout-session/index.ts
Check invoice-send/index.ts
Check invoice-reminders/index.ts
Check stripe-webhook/index.ts
Check invoice-check-intent/index.ts        (all clean)

$ deno check on the other 15 deploy-set functions
OK client-invite · commercial-document-notify · decision-first-notice ·
   decision-reminders · decision-resolved-notify · expire-decisions ·
   notification-digest · notification-dispatch · po-send · proposal-nudge ·
   proposal-sign-confirmation · quote-request-send · review-requests ·
   spec-pdf · trade-rfq-send        (15/15 clean — the _shared signature change
                                     regresses no other importer)

$ find . -name deno.lock -not -path "*/node_modules/*"    → nothing
$ git status --porcelain                                  → clean (only sandbox
                                                            EPERM lines on .env*)
```

Deploy set, recomputed independently (python reverse-walk of every *relative*
import under `supabase/functions`, not a text grep):

```
studio-identity.ts importers (19): client-invite, commercial-document-notify,
  create-checkout-session, decision-first-notice, decision-reminders,
  decision-resolved-notify, expire-decisions, invoice-reminders, invoice-send,
  notification-digest, notification-dispatch, po-send, proposal-nudge,
  proposal-sign-confirmation, quote-request-send, review-requests, spec-pdf,
  stripe-webhook, trade-rfq-send
invoice-subject.ts importers (5): the five senders   (subset ∪ invoice-check-intent)
invoice-emails.ts importers (4):  subset
UNION = 20  — matches the notes' list exactly.
```

---

## Prior findings — verification

| id | state | proof |
|---|---|---|
| R4-1 headline behaviours mutation-blind | **FIXED** | see mutation table below — 3 of 4 mutations now red |
| R4-2 ship gate understated | **FIXED** | `create-checkout-session/index.ts:296-305` ⚠ block and `edge-notes.md:159-176` both now say "the recipient cannot open the invoice or reach a Pay control at all" |
| R4-3 "21 functions" in the live ship order | **OPEN** | `edge-notes.md:176` still `3. These 21 functions.` under `:133 ## Deploy set — 20 functions` |
| R4-4 invoice-check-intent has no resolver, selects an unread `studio_id` | **OPEN** | `grep -n studio invoice-check-intent/index.ts` → `:66` comment, `:68` type, `:126` select. Nothing else. |
| R4-5 "for your studio" | **OPEN** | rendered below |
| R4-6 "Your project" footer link | **OPEN** | rendered below; `invoice-emails.ts:100-126` `wrap()` still does not thread `opts.footerLinks` |
| R4-7 `_tests/stripe-rail.test.ts` null-project case | **CLOSED by the db lane** | `agent-si-db` `stripe-rail.test.ts:238-256` inserts an org, a member and an invoice with `project_id: null, studio_id: ids.studio, title: …` |
| R4-8 two rewritten project-invoice strings | **OPEN** (needs a ruling, not a fix) | still in the diff at `invoice-emails.ts:253, 324` |
| R4-9 `String(invoiceRow.project_id)` | **OPEN**, unreachable | `commercial-document-notify/index.ts:308` |
| R4-10 Stripe line-item length | advisory | unchanged |

### Mutation evidence, re-run by me on fresh `$TMPDIR` copies

| mutation | result |
|---|---|
| A — drop the title rung inside `invoiceSubjectName` | `FAILED \| 208 passed \| 3 failed` |
| B — `studioId: invoice.studio_id ?? null` → `studioId: null` | `FAILED \| 209 passed \| 2 failed` |
| C — re-inline the interpolated `/projects/${…}` checkout URLs in `create-checkout-session/index.ts` | `FAILED \| 227 passed \| 1 failed` |
| **D — delete `studio_id, title` from the SELECT list of all five `index.ts`** | **`ok \| 246 passed \| 0 failed`** ← still blind |

A, B, C are the round-4 mutations, and all three are now caught. D is new.

---

## Findings

### W5-1 · major · 0.92 — the seam is provable; its *inputs* are not
`supabase/functions/create-checkout-session/index.ts:221` (and the four peers)

Deleting `studio_id, title, ` from the invoice SELECT in **all five** functions
leaves every gate green:

```
$ python3 … replace 'client_id, project_id, studio_id, title, invoice_number'
                 → 'client_id, project_id, invoice_number'      mutated files: 5
$ grep -rn "studio_id, title" $T/functions/*/index.ts | wc -l   0
$ deno test … _shared/ create-checkout-session/ stripe-webhook/
ok | 246 passed | 0 failed (1s)
```

With those columns gone, `invoice.title` and `invoice.studio_id` are `undefined`
at runtime, so `invoiceSubjectName` falls straight to `'your studio'` and
`invoiceBrandingRef` yields `studioId: null` — i.e. **both headline behaviours of
brief item 2 are silently off**, exactly the defect R4-1 existed to prevent, one
layer down. The new source-scanning tests read the five `index.ts` for the
*call*, never for the *query*.

Fix: five more lines in the test that already reads the source —
```ts
assert(src.includes('project_id, studio_id, title, invoice_number'),
  `${name}/index.ts no longer selects the studio invoice's own columns`);
```
inside the existing `SENDERS` loop in `_shared/invoice-subject.test.ts`.

### W5-2 · major · 0.85 — adding `title` to the SELECT makes a wrong deploy order a *silent* money-letter outage, and only a notes file says so
`supabase/functions/stripe-webhook/index.ts:283-301`

`loadInvoiceJoined` destructures **only `data`** and discards `error`:

```ts
const { data } = await admin.from('invoices').select(`
  id, designer_id, client_id, project_id, studio_id, title, invoice_number, ...
`).eq('id', invoiceId).maybeSingle();
return (data as unknown as InvoiceJoined) ?? null;
```

Ship the 20 functions before the migration and PostgREST answers `42703`
(no column `title`) for **every** invoice, project ones included; `data` is
null, and `sendSuccessSideEffects`, `sendFailureSideEffects` and
`sendInvoiceRefundSideEffects` each `if (!invoice) return;` — receipts,
failed-payment notices and refund letters stop, with nothing in the logs, while
the money still settles. `create-checkout-session` and `invoice-send` at least
fail loudly (500 `lookup_failed`); this one does not.

The lane documents the constraint (`edge-notes.md:159-166`) but no code site
says it, and the ⚠ DEPLOY ORDER block in `create-checkout-session/index.ts`
talks only about the client portal.

Fix (one line, and it stays useful after the migration):
`const { data, error } = …; if (error) console.error('stripe-webhook: invoice lookup failed', invoiceId, error);`
Plus: the orchestrator hard-gates the migration ahead of the function deploy.

### W5-3 · minor · 0.98 — R4-3 half-fixed: `21` still sits inside the live ship order
`artifacts/…/w1/edge-notes.md:176` — `3. These 21 functions.`, four lines under
`:133 ## Deploy set — 20 functions`. I recomputed the closure myself: 20 (above).
`:273` is inside the historical Fix-round-1 record and is defensible.

### W5-4 · minor · 0.95 — brief item 2 is four-of-five, and one function selects a column nothing reads
`supabase/functions/invoice-check-intent/index.ts:68,126`

No `resolveStudioIdentity` call anywhere in the file. The omission is
*defensible* — `buildCheckIntentEmail` is designer-addressed and
`CheckIntentEmailParams` carries no `studioName`/`studioLogoUrl` — and it is
recorded under "Left deliberately undone". Consequence: `studio_id` is selected
and typed here purely for symmetry. Either drop it from that select and type, or
the orchestrator rules brief item 2 four-of-five.

### W5-5 · minor · 0.9 — `invoiceSubjectName` guards null but not blank, unlike its neighbour
`supabase/functions/_shared/invoice-subject.ts:37`

```
""    => name ""     SUBJ "Middle West Studio sent you invoice INV-0031 — "
"   " => name "   "  SUBJ "Middle West Studio sent you invoice INV-0031 —    "
prose: "Leah Brandt has sent you an invoice for ."
```

`??` only catches null/undefined. Twenty lines away in the same `_shared`
directory, `studioDisplayName` (`studio-identity.ts:226-232`) does
`identity?.name?.trim(); return name && name.length > 0 ? name : fallback` —
the repo's own convention for exactly this. The DB does btrim and reject a blank
title in `create_draft_studio_invoice` (`00571:799-800`), so this only fires on a
row minted or updated outside that RPC — but the whole point of the new seam is
to be the one place the chain lives. Fix: `invoice.project?.name?.trim() ||
invoice.title?.trim() || fallback`, plus a case.

### W5-6 · minor · 0.85 — "for your studio" tells the homeowner it is *her* studio (R4-5, still open)
Rendered through the real builders, `title` null:

```
SENT    Leah Brandt has sent you an invoice for your studio .
UPCOM   … Leah Brandt's invoice for your studio is coming due.
OVERDUE Invoice INV-0031 from Leah Brandt for your studio is still open.
SECOND  … for your studio is still open, a week on from its due date.
FINAL   … for your studio , now two weeks on from its due date.
RECEIPT We received your payment of $450.00 toward invoice INV-0031 for your
        studio, billed by Leah Brandt.
```

The string is mandated verbatim by the plan (`:70`), so this is a copy ruling,
not a lane fix. Kody's ruling: "the studio", or drop the trailing clause when
there is no name.

### W5-7 · minor · 0.92 — every studio-invoice client letter still carries a "Your project" footer link (R4-6, still open)
All six client letters end `… Patina Your project Email preferences Patina`.
`branded-email.ts:219-222` supplies that as the standing `audience:'client'`
footer; `renderBrandedShell` already accepts `opts.footerLinks`, and
`invoice-emails.ts`'s private `wrap()` (`:100-126`) still does not thread it —
a one-file seam. The lane's own test strips `Your project</a>` before asserting
"no rung invents a house": honest about the exclusion, but the string still
reaches a homeowner who has no project.

### W5-8 · minor · 0.9 — unrequested scope in `studio-identity.ts`: the PGRST202 two-argument retry
`supabase/functions/_shared/studio-identity.ts:52-70`

The brief said "when studioId is given pass `p_studio_id` to the rpc (keep
passing the others)". The implementation **always** names `p_studio_id` (null
included) and adds a fallback that deletes the argument and re-calls on
`PGRST202` when no studio was named. It is defensible — and the always-name half
is genuinely load-bearing against a 42725 "function is not unique" if two
overloads ever coexist — but it changes the wire call for all 19 other
importers, and the db lane's `00571:1220 DROP FUNCTION IF EXISTS
public.resolve_studio_identity(uuid, uuid)` means the retry branch is dead the
moment the migration lands, i.e. it only serves a deploy order the lane's own
notes tell you never to use. The other two callers of this RPC —
`packages/supabase/src/hooks/use-studio-identity.ts:70` and
`apps/mobile/Patina/…/StudioIdentityService.swift:97` — pass one or two named
args and still resolve against the all-DEFAULT three-arg signature, so nothing
else breaks. Orchestrator: rule it in, or trim it to the studio branch only.

### W5-9 · minor · 0.75 — R4-8 still open: two live homeowner strings on *project* invoices rewritten with no ruling
`invoice-emails.ts:253` `so the project can keep moving without interruption` →
`so the work can carry on without interruption`; `:324` `may pause work on the
project` → `may pause work already under way`. Both builders are used today by
`invoice-reminders` for every project invoice, so this ships to letters Patina is
already sending. It reads correctly and it was round 1's F1 fix — but it is a
product copy change inside a lane whose SCOPE is "exactly the listed items".

### W5-10 · nit · 0.95 — stale migration number in shipped comments and a test name
The db lane has renumbered to **00571** (`ls .../agent-si-db/supabase/migrations
| tail` → `00571_studio_invoices.sql`; no 00570 on disk). The edge lane still
says `pre-00570` at `studio-identity.ts:58,66`, in the test name
`studio-identity.test.ts:167`, and at `edge-notes.md:22,159,233,250,366`.

### W5-11 · nit · 0.6 — the source-scanning assertions are literal-text sensitive
`invoice-subject.test.ts:252` asserts `src.includes("from '../_shared/invoice-subject.ts'")`
(single quotes) and `:266` asserts `!src.includes("invoice.project?.name ??")`.
A formatter that switches quote style falsely reds the suite; a re-inline written
with `||` instead of `??` slips past. The `resolveStudioIdentity(\s*admin,\s*…)`
regex at `:276` is reflow-tolerant and is the better pattern. Advisory.

### W5-12 · nit · 0.35 — R4-9 unchanged
`commercial-document-notify/index.ts:308` `projectId: String(invoiceRow.project_id)`
would stringify a null project as `"null"`. Unreachable today (deposit invoices
come from project-bound commercial documents and
`create_draft_studio_invoice` sets no deposit link). Listed so a later change to
how deposit invoices are drawn does not inherit it silently.

### W5-13 · nit · 0.35 — R4-10 unchanged
Stripe line item is `Invoice <number> — <house | title | 'Studio invoice'> · <studio>`.
`title` is capped at 200 (`00571:799-800`); `organizations.name` and
`projects.name` carry no CHECK, so the same overflow already exists on the
project path. Advisory.

---

## Things I checked that are clean

- Every `project` dereference in the five is null-tolerant:
  `invoice.client_id ?? invoice.project?.client_id` (payer check, recipient
  resolution, `clientUserId`) in all four that have one. `grep "your project"`
  across the five → **no hits**.
- `notification_log.metadata.project_id` and `notifyClientAttention`'s metadata
  are jsonb; passing null is safe (`_shared/client-attention.ts:25,60`).
- Money path untouched: no status write, no rollup write, no `invoice_payments`
  change in the diff. The four ungated-looking UPDATEs
  (`stripe_checkout_session_id`, `sent_at`, `reminder_count`, `ar_flagged_at`)
  are byte-identical to base.
- Return address composition: `invoiceCheckoutReturnAddress` →
  `invoiceCheckoutReturnUrl(payable.successUrl, attempt)` yields, for a studio
  invoice, `…/?invoice=<id>&checkout=success&session_id={CHECKOUT_SESSION_ID}&checkout_attempt_id=…&payment_id=…#letterbox`
  — same param set and order as the project path, fragment last, braces
  un-encoded.
- All three of stripe-webhook's client letters plus the refund letter route
  through the seam (`:397, :499, :1655`), as do the two in-app `message` strings
  (`:478, :559`) and the two refund ones (`:1723, :1724`).
- Refusal scan over every added line: `overdue` / `gate` appear only in test
  names, identifiers and code comments — no homeowner string. Rendered client
  prose says "still open" / "second notice" / "final notice", never "overdue".
- Scope: 18 files, all inside the lane. No `.claude/`, no `.env`, no lock file,
  no worktree churn. No file collides with the db lane's diff.
