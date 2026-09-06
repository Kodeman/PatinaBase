# W1 CLOSE — edge lane, adversarial review round 1

Reviewer: fresh context, did not write this code.
Worktree `/Users/kody/Code/patina-merged/.codex/worktrees/agent-si-edge`
(`git rev-parse --show-toplevel` → that path), branch `studio-invoices/w1-edge`.
Diff reviewed: `72ddcd213..HEAD` — 7 commits, 11 files (3 program docs + 8 edge files).

**Verdict: fix** — no blocker; all five brief items delivered and provable; three
majors, all of the same shape (a ruled behaviour whose *call sites* can be
reverted with every gate green — the exact defect W5-1 was raised to close, one
layer up from where it was closed).

---

## Where the work actually is

```
$ git -C … log --oneline 72ddcd213..HEAD
9de5995b5 docs(edge): W1 edge lane close — W5-1, W5-2, W5-3, W5-6, W5-7 verified and mutation-pinned
b880daf23 docs(studio-invoices): W1 edge lane adversarial review, round 7
aa1dc6e8b docs(edge): W1 edge lane fix round 2 — R6-1 through R6-4
988c70d5d fix(edge): a studio invoice's letter names nothing it has not got
28ae90c81 docs(studio-invoices): restore round-2 review, file round 6 under its own name
7f214535b docs(studio-invoices): W1 edge lane adversarial review, round 6
ba2003f4c docs(edge): W1 edge lane fix round 1 (re-handed) — F-A re-verified, ship-order count
```

Every shipped-code change in the range is in one commit, `988c70d5d`
(`fix(edge):`, explicit pathspecs, no trailer). The close commit `9de5995b5` is
docs only — it re-verified work that had already landed answering review round 6.
That is honest and it is recorded as such in the notes; the brief's
"`fix(edge):` / `test(edge):`" instruction is satisfied by `988c70d5d`.

---

## Gates, run by me

```
$ deno test --allow-all --config …/supabase/functions/deno.json …/supabase/functions/_shared/
ok | 239 passed | 0 failed (1s)

$ deno test … …/supabase/functions/create-checkout-session/     ok | 17 passed | 0 failed (22ms)
$ deno test … …/supabase/functions/stripe-webhook/              ok | 18 passed | 0 failed (21ms)
  invoice-send · invoice-reminders · invoice-check-intent — no *.test.ts (none exist)

$ deno check --config …/deno.json <each of the five index.ts>
Check create-checkout-session/index.ts   Check invoice-send/index.ts
Check invoice-reminders/index.ts         Check stripe-webhook/index.ts
Check invoice-check-intent/index.ts      (all clean)

$ deno check … on all 20 deploy-set functions   → 20/20 OK (ALL_CLEAN=1)

$ find …/agent-si-edge -name deno.lock -not -path '*/node_modules/*'   → nothing
$ git status --porcelain                                               → clean
   (only sandbox "Operation not permitted" lines on .env*)
```

Whole-tree run, for collateral (not a lane gate):
`deno test --no-check … supabase/functions/` → `FAILED | 1164 passed | 1 failed`.
The single failure is `_tests/stripe-rail.test.ts` → `Error: supabaseKey is
required.` — a live-stack integration suite with no env here, not a lane defect.
`deno test` **with** type-check over the whole tree fails on
`fulfillment-po/core.ts:314` (`TS2345 Uint8Array … not assignable to
ArrayBuffer`); `git diff --stat 36b4b539e..HEAD -- supabase/functions/fulfillment-po/`
is empty, so it is pre-existing and untouched.

## Deploy set, recomputed independently

Reverse-walked every *relative* import under `supabase/functions` (python, not a
grep) from the four files this lane changed outside a function directory
(`_shared/invoice-emails.ts`, `_shared/invoice-subject.ts`,
`_shared/studio-identity.ts`, `create-checkout-session/invoice-checkout-core.ts`):

```
count: 20
client-invite · commercial-document-notify · create-checkout-session ·
decision-first-notice · decision-reminders · decision-resolved-notify ·
expire-decisions · invoice-check-intent · invoice-reminders · invoice-send ·
notification-digest · notification-dispatch · po-send · proposal-nudge ·
proposal-sign-confirmation · quote-request-send · review-requests · spec-pdf ·
stripe-webhook · trade-rfq-send
```

Identical to the notes' list at `edge-notes.md:893`. **deploySet = 20.**

---

## Brief items — verified one by one

| item | state | proof |
|---|---|---|
| **W5-1** SELECT gated in all five | **DELIVERED** | mutation D below now red |
| **W5-2** webhook logs the lookup error | **DELIVERED** | `stripe-webhook/index.ts:288, 301-305`; mutation E red |
| **W5-3** "21 functions" in the ship order | **DELIVERED** | `edge-notes.md:176` → `3. These 20 functions.` `:273` kept as a verbatim round-1 record with its own inline correction |
| **W5-6** last-resort name = no name | **DELIVERED** | rendered below; mutation F red |
| **W5-7** "Your page" footer | **DELIVERED** | rendered below; mutation G red; the ladder test no longer strips the footer (`invoice-emails.test.ts:159-178`) |

### Mutations I ran myself (fresh `$TMPDIR` copies of `supabase/functions`)

| # | mutation | result |
|---|---|---|
| D | delete `studio_id, title, ` from the SELECT of all five `index.ts` (5 files, `grep "studio_id, title" → 0`) | **`FAILED \| 238 passed \| 1 failed`** (round 5 recorded this as green — now red) |
| E | `const { data, error }` → `const { data }` + delete the `console.error` | **`FAILED \| 238 passed \| 1 failed`** |
| F | `forClause` falls back to `"your studio"` instead of `""` | **`FAILED \| 228 passed \| 11 failed`** |
| G | `wrap()` stops threading `opts.footerLinks` | **`FAILED \| 231 passed \| 8 failed`** |
| **I** | **all four call sites `invoiceSubjectName(invoice, null)` → `(invoice, 'your studio')`** (4 files, `grep "your studio" → 10` live hits in `index.ts`) | **`ok \| 239 passed \| 0 failed`** ← blind |
| **J** | **`studioInvoice: !invoice.project_id` → `false` at all three call sites** (3 files) | **`ok \| 239 passed \| 0 failed`** ← blind |

### Rendered, through the real builders, `project = null` and `title = null`

```
[sent]       SUBJ  Middle West Studio sent you invoice INV-0031
             BODY  Hi Dana Rivera, Leah Brandt has sent you an invoice.
[upcoming]   SUBJ  Reminder: invoice INV-0031 is due soon
[still open] SUBJ  Still open: invoice INV-0031
[second]     SUBJ  Second notice: invoice INV-0031
[final]      SUBJ  Final notice: invoice INV-0031
[receipt]    BODY  … toward invoice INV-0031, billed by Leah Brandt.
FOOTER on all six client letters: "Your page"   (project fixture: "Your project")
```

Raw HTML checked for the punctuation an empty clause could break:
`… toward invoice <strong>INV-0031</strong>, billed by Leah Brandt.` — no stray
` ,`, no double space, in the sent / final / receipt letters.

`grep -rn "your studio" supabase/functions` → code **comments and test names
only**; the one live string is `_shared/sms.ts:322`, pre-existing and unreachable
for a studio invoice (both `sms.ts` fallbacks are gated on
`recipient.projectId`, and none of the five call `sms.ts`).

### Other things I checked that are clean

- **Checkout return address**, rendered: null project →
  `https://client.patina.cloud/?invoice=inv-1&checkout=success&session_id={CHECKOUT_SESSION_ID}&checkout_attempt_id=att-1&payment_id=pay-1#letterbox`;
  project → the same params in the same order under `/projects/proj-9`. Fragment
  last, braces un-encoded. Cancel path matches.
- **stripe-webhook's three email sites**: `:432` receipt and `:524` failed both
  pass `studioInvoice: !invoice.project_id`; `:1683` refund is designer-addressed
  (`.from('profiles')… invoice.designer_id`, comment at `:1674`) and correctly
  takes no client footer.
- **Every `project` dereference in the five** is null-tolerant:
  `invoice.client_id ?? invoice.project?.client_id` for the payer check /
  recipient / `clientUserId`; every other hit is `project_id` written into
  jsonb metadata.
- **All builder callers are inside the five** — `grep` over
  `supabase/functions` for the ten builders returns only
  `invoice-send`, `invoice-reminders`, `invoice-check-intent`, `stripe-webhook`.
  No other function can send an unflagged studio letter.
- **`studioInvoiceFooterLinks()` matches the shell** it replaces
  (`branded-email.ts:219-222`): same `portalBaseFor("client")` base, same
  `${base}/preferences` href, label only differs. All seven builders that pass
  it also pass `audience: "client"`.
- **Money path untouched**: `git diff 72ddcd213..HEAD -- supabase/` contains no
  `.update(`, no `status`, no `invoice_payments`, no rollup write. The only
  runtime change outside email composition is one `console.error`.
- **Refusal scan on added lines**: `overdue` appears only in designer-facing
  copy (the A/R escalation letter and desk notifications) and in identifiers /
  test names; client prose is "still open" / "a week on from its due date" /
  "two weeks on from its due date". No emoji, no badge, no "dashboard", no "AI".
- **Mockup fidelity**: `proposal.html:534` — *"Leah has sent you an invoice for
  the design consultation on 12 September."* The title-present render is
  `has sent you an invoice for <strong>Design consultation · September</strong>.`
  Same shape. `:536` "in your page" agrees with the new footer label.
- **Notes mirror**: `md5 -q` of the worktree and main-checkout `edge-notes.md`
  are identical (`c81d12fd6aee5315adfaabd345254a93`).
- **Scope**: 11 files, all in the lane. No `.claude/`, no `.env`, no lock file,
  no worktree churn, no `git add -A`.

---

## Findings

### C1-1 · major · 0.90 — the ruled string `"your studio"` can be put straight back with every gate green
`supabase/functions/{invoice-send:251, invoice-reminders:180,324, invoice-check-intent:171, stripe-webhook:406,510,1668}/index.ts`

W5-1 closed exactly this hole for the SELECT list. The same hole is open one
layer up, for the argument that *carries* the W5-6 ruling:

```
$ python3 … replace 'invoiceSubjectName(invoice, null)'
                  → "invoiceSubjectName(invoice, 'your studio')"    files: 4
$ grep -rn "your studio" $T/functions/*/index.ts | wc -l             10
$ deno test … _shared/                       ok | 239 passed | 0 failed
```

Ten live `'your studio'` strings in shipped `index.ts`, every homeowner letter
with no house *and* no title back to "…has sent you an invoice for your studio.",
and the suite stays green. The source-scanning test asserts only that
`invoiceSubjectName(` is *called* (`invoice-subject.test.ts:133`), never with what.

Bounded, not unbounded: `create_draft_studio_invoice` requires a non-blank title
(`00571:799-800`), so the null-name rung fires only for rows minted outside that
RPC. But that is precisely the argument W5-1 rejected — the seam exists to be the
one provable place the chain lives.

Fix, in the loop that already reads the source (five lines, mirroring W5-1):
```ts
// invoice-subject.test.ts, in the SENDERS loop
assert(!/invoiceSubjectName\([^)]*['"]your studio['"]/.test(src),
  `${name}/index.ts reinstated the "your studio" fallback (ruling W5-6)`);
```
plus, for the four letter senders, `assert(src.includes('invoiceSubjectName(invoice, null)'))`.

### C1-2 · major · 0.90 — the "Your page" footer can be reverted at the call sites with every gate green
`invoice-send/index.ts:253`, `invoice-reminders/index.ts:353`,
`stripe-webhook/index.ts:443,534`

```
$ python3 … 'studioInvoice: !invoice.project_id' → 'studioInvoice: false'
            'const studioInvoice = !invoice.project_id;' → '= false;'   files: 3
$ deno test … _shared/                       ok | 239 passed | 0 failed
```

Every studio-invoice client letter goes back to offering **"Your project"** to a
reader who has none — the string ruling W5-7 exists to remove — and nothing
reds. The paired footer tests (`invoice-emails.test.ts:182-239`) prove the
*builder*; no test proves any sender sets the flag.

Fix: one more assertion in the same SENDERS loop, for the three flag senders —
`assert(/studioInvoice:\s*!invoice\.project_id|const studioInvoice = !invoice\.project_id/.test(src))`.

### C1-3 · major · 0.85 — `projectName` went from required to optional, so a forgotten name is now a silent nameless letter instead of a compile error
`_shared/invoice-emails.ts:103,105 · 224,226 · 394 · 448,450 · 624 · 688,690 · 752`

Base had `projectName: string` (required) on all seven param interfaces;
the diff makes it `projectName?: string | null`. Adding `| null` is the ruling;
adding `?` is not, and it removes the only thing that forced a **project**
invoice's letter to be named. Proof — omitting both new fields entirely
typechecks and renders:

```
$ deno check …/omit-si.ts     Check file:///…/omit-si.ts     (clean)
$ deno run   …/omit-si.ts
SUBJECT: Leah Brandt sent you invoice INV-0031
FOOTER: Your project
```

A future sender that forgets `projectName` sends a house-less letter about a
house, with no type error and no red gate. `studioInvoice?: boolean` has the same
shape and is the type-level half of C1-2.

Fix: `projectName: string | null` (required, nullable) on all seven interfaces —
callers already pass it explicitly, so nothing in-tree changes.

### C1-4 · minor · 0.95 — W5-5 (r5) is unfixed on the two rungs the trim does not reach
`_shared/invoice-subject.ts:39` still uses `??`, which catches null/undefined but
not blank. The letters are now safe (`forClause`/`subjectTail` trim), but the two
callers that read the value *directly* are not:

```
title = "   "
STRIPE LINE ITEM: "Invoice INV-0031 —     · Middle West Studio"
DESK LINE       : "   : Dana Rivera is mailing a check…"
```

(`create-checkout-session/index.ts:272-275`;
`invoice-check-intent/index.ts:172` / `stripe-webhook/index.ts:407,511,1669`
`deskName = projectName ?? 'Studio invoice'`.) The repo's own convention twenty
lines away is `studio-identity.ts:226-232` (`name?.trim(); name && name.length > 0`).
Not in the close brief — carried over from r5 W5-5. Fix is
`invoice.project?.name?.trim() || invoice.title?.trim() || fallback`.

### C1-5 · minor · 0.90 — r5 W5-8 unruled and still live: the `PGRST202` two-argument retry
`_shared/studio-identity.ts:52-70`. Unchanged since r5. The db lane's
`00571:1293 DROP FUNCTION … resolve_studio_identity(uuid, uuid)` makes the retry
branch dead the moment the migration lands, and the migration is a hard ship gate
ahead of the functions — so the branch only serves a deploy order the lane's own
notes forbid. It changes the wire call for all 19 other importers. Out of the
close brief; still needs the orchestrator's "rule it in, or trim it".

### C1-6 · minor · 0.75 — r5 W5-9 unruled and still live: two rewritten *project*-invoice strings
`_shared/invoice-emails.ts:300` `so the work can carry on without interruption`
(was "so the project can keep moving without interruption") and `:375`
`may pause work already under way` (was "may pause work on the project"). Both
builders are used today by `invoice-reminders` for every project invoice, so this
ships to letters Patina already sends. Reads correctly; still a product copy
change with no ruling, inside a lane whose SCOPE is "exactly the listed items".

### C1-7 · nit · 0.95 — stale `00570` in shipped comments and a test name
The db lane's migration is **`00571_studio_invoices.sql`** (`ls
…/agent-si-db/supabase/migrations | tail` — no 00570 exists). Still `pre-00570`
at `_shared/studio-identity.ts:58,66` and in the test name
`_shared/studio-identity.test.ts:167`. r5 W5-10, unchanged.

### C1-8 · nit · 0.60 — the new SELECT assertion is column-order sensitive
`invoice-subject.test.ts:156` `/project_id,\s*studio_id,\s*title,\s*invoice_number/`.
Reordering the select list (`title, studio_id`) or inserting a column between
them false-reds the suite while the behaviour is intact. Two independent
`assert(/\bstudio_id\b/…)` / `assert(/\btitle\b/…)` scoped to the select block
would be order-tolerant. Same family as r5 W5-11, which is also unchanged
(`:129` asserts a single-quoted import literal; `:143` matches `??` but not `||`).

### C1-9 · nit · 0.50 — the three designer-facing letters drop the name where their desk lines keep it
`buildInvoiceArEscalationEmail`, `buildPaymentRefundedEmail`,
`buildCheckIntentEmail` render `…on invoice INV-0031.` for a nameless invoice,
while the desk notification beside each of them leads with `Studio invoice:`
(`deskName`). Defensible — the letter names the invoice number, so nothing is
ambiguous — but the lane's own stated rule is "the designer's own line must lead
with something", and these are designer lines.

### C1-10 · nit · 0.35 — r5 W5-12 unchanged
`commercial-document-notify/index.ts:308` `projectId: String(invoiceRow.project_id)`
would stringify a null project as `"null"`. Unreachable today.

### C1-11 · nit · 0.30 — the close pass's only commit is `docs(edge):`
The brief asked for `fix(edge):` / `test(edge):`. The code had already landed in
`988c70d5d` (`fix(edge):`), which the close pass re-verified rather than
rewrote — the honest outcome, and the notes say so at
`edge-notes.md:774-782`. Recorded so the orchestrator is not surprised by a
close step whose git trail is documentation.

---

## What the orchestrator has to decide

- C1-1 / C1-2 / C1-3 are one decision: **pin the ruled behaviours at the call
  sites and in the types, the way W5-1 pinned the SELECT.** ~8 lines of test in
  `invoice-subject.test.ts` and a `?` removed from seven interfaces.
- C1-5 and C1-6 are r5 rulings that were never handed down and were not in the
  close brief. They are unchanged, not regressions.
