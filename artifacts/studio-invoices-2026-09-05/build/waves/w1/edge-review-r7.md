# W1 edge lane — adversarial review, round 7

**Reviewer:** separate context; did not write this code.
**Worktree:** `/Users/kody/Code/patina-merged/.codex/worktrees/agent-si-edge`
**Branch:** `studio-invoices/w1-edge` · base `36b4b539e` · HEAD `aa1dc6e8b`
**Verdict:** **ship** — every W1 edge brief item is delivered, all four items this
round was handed (R6-1…R6-4 / plan W5-1, W5-2, W5-6, W5-7) are fixed and pinned by
mutation-sensitive tests, all gates green. No blocker, no major.

> **Filename note.** The brief said `edge-review-r3.md`. That file already exists
> in this worktree (round 3, 16k, 10:12) and the lane history already carries one
> "restore … review, file round 6 under its own name" recovery commit. This review
> is filed as `edge-review-r7.md` rather than clobbering an earlier round's record.

---

## Gates run (this reviewer, in this worktree)

```
$ git -C …/agent-si-edge rev-parse --show-toplevel
/Users/kody/Code/patina-merged/.codex/worktrees/agent-si-edge
$ git -C …/agent-si-edge branch --show-current
studio-invoices/w1-edge

$ deno test --allow-all --config …/supabase/functions/deno.json …/supabase/functions/_shared/
ok | 239 passed | 0 failed (1s)

$ deno test --allow-all --config …/deno.json …/supabase/functions/create-checkout-session/
ok | 17 passed | 0 failed (24ms)

$ deno test --allow-all --config …/deno.json …/supabase/functions/stripe-webhook/
ok | 18 passed | 0 failed (20ms)

  invoice-send · invoice-reminders · invoice-check-intent — no *.test.ts
  ("no matches found" for all three)

$ deno check --config …/deno.json <each of the five index.ts>
Check create-checkout-session/index.ts     Check invoice-send/index.ts
Check invoice-reminders/index.ts           Check stripe-webhook/index.ts
Check invoice-check-intent/index.ts        (all clean, no diagnostics)

$ ls …/deno.lock …/supabase/functions/deno.lock
No such file or directory (both)

$ git status --porcelain   → clean (only sandbox EPERM noise on .env.example paths)
```

**Deploy set — recomputed independently** by walking the reverse transitive
closure of every *relative* import under `supabase/functions`, seeded with all
nine changed shipped modules (studio-identity, invoice-emails, invoice-subject,
invoice-checkout-core + the five `index.ts`):

```
20
client-invite · commercial-document-notify · create-checkout-session ·
decision-first-notice · decision-reminders · decision-resolved-notify ·
expire-decisions · invoice-check-intent · invoice-reminders · invoice-send ·
notification-digest · notification-dispatch · po-send · proposal-nudge ·
proposal-sign-confirmation · quote-request-send · review-requests · spec-pdf ·
stripe-webhook · trade-rfq-send
```

Exactly the 20 in `edge-notes.md:133` and `:757`. The notes' claim that
`_shared/invoice-emails.ts`'s importers are already inside the 20 checks out:
`po-emails.ts → po-send`, `quote-request-emails.ts → quote-request-send`,
`trade-rfq-emails.ts → trade-rfq-send`, all present. `morning-brief` is correctly
excluded (`morning-brief/render.ts:3` is a comment mention only).

---

## Prior round verified

| id | status | proof |
|---|---|---|
| R6-1 loadInvoiceJoined swallowed the error | **FIXED** | `stripe-webhook/index.ts:288` `const { data, error }`; `:305` `console.error('stripe-webhook: invoice lookup failed', invoiceId, error)`. Pinned by *the webhook's invoice lookup reports a failed read instead of swallowing it* (invoice-subject.test.ts), which reads the `loadInvoiceJoined` body and requires both. |
| R6-2 W5-1 SELECT assertion missing | **FIXED** | *every invoice sender still selects the studio anchor and the title* — `/project_id,\s*studio_id,\s*title,\s*invoice_number/` over each of the five `index.ts`. Verified present in all five sources. |
| R6-3 "for your studio" in homeowner copy | **FIXED** | Re-rendered all 10 builders against a null-name fixture: SENT `"Middle West Studio sent you invoice INV-0031"` / body `"…has sent you an invoice."`; UPCOMING `"Reminder: invoice INV-0031 is due soon"`; OVERDUE `"Still open: invoice INV-0031"`; SECOND/FINAL likewise; RECEIPT/FAILED subjects unchanged and bodies drop the clause. `grep -rn "your studio"` over the five + two shared modules → **comments only**, zero rendered strings. |
| R6-4 "Your project" footer | **FIXED** | `wrap()` threads `opts.footerLinks`; the 7 client-audience invoice builders (`audience:"client"` at invoice-emails.ts:202/274/308/344/380/503/737) take `studioInvoice`. 14 tests: studio ⇒ `Your page</a>` and never `Your project`; project ⇒ `Your project` and never `Your page`. |
| R6-11 keep `studio_id` in invoice-check-intent | **CORRECTLY KEPT** | `:67` type, `:126` select; now load-bearing under the W5-1 assertion. |

---

## Findings

### E7-1 (minor, 0.9) — a blank or whitespace `title` still escapes the trim guard in four non-builder sites

R6-5 was closed **inside the email builders only**. `forClause`/`subjectTail`
(invoice-emails.ts:75-86) trim, so every homeowner letter is safe. But
`invoiceSubjectName` (invoice-subject.ts:39) is still `??`, and four sites consume
its result raw. Rendered proof (throwaway deno script over the real functions):

```
title=""      stripeLabel="Invoice INV-0031 —  · Middle West Studio"   deskLine=": payment received."
title="   "   stripeLabel="Invoice INV-0031 —     · Middle West Studio" deskLine="   : payment received."
title="   "   in-app  => "Middle West Studio sent invoice INV-0031 for    ."
```

- `create-checkout-session/index.ts:270-273` — the Stripe **line-item name a
  homeowner reads on the Checkout page**: dangling em dash.
- `stripe-webhook/index.ts:407, :511, :1669` — `deskName = projectName ?? 'Studio
  invoice'`; `""` is not null, so the designer's in-app line begins `": …"`.
- `invoice-check-intent/index.ts:174` — same shape.
- `invoice-send/index.ts:252` and `invoice-reminders/index.ts:181, :325` —
  `projectName ? …` is **truthy for `"   "`**, so the whitespace title reaches the
  in-app row as `for    .`

Reachability: `create_draft_studio_invoice` btrims and rejects blank
(`00571:841-842, :922`), so the W1 write path cannot produce it — but
`00571:50` is a bare `ADD COLUMN IF NOT EXISTS title text;` with **no CHECK**, so
any other UPDATE path can. Every other display name in these files already uses
`?.trim() ||` (designerName, clientName, `studioSuffix` at
create-checkout-session:271).

**Fix:** `invoice.project?.name?.trim() || invoice.title?.trim() || fallback`, plus
a `''` case in `invoice-subject.test.ts`.

### E7-2 (minor, 0.75) — a project invoice with a null `project` embed now says "Studio invoice" on the Stripe page

`create-checkout-session/index.ts:272` went from `invoice.project?.name ?? 'Patina
project'` to `invoiceSubjectName(invoice, 'Studio invoice')`. For a *project*
invoice whose embed comes back null, the homeowner's Checkout line reads `Invoice
INV-0031 — Studio invoice · Middle West Studio` — a lie about a house that exists.
The same substitution reaches the three `deskName` sites in stripe-webhook. Low
reachability (`loadInvoicePayable` reads with service-role, so the embed should
always resolve), but the fallback used to be house-shaped and now is not.
**Fix:** `invoiceSubjectName(invoice, invoice.project_id ? 'Patina project' : 'Studio invoice')`,
or leave and note.

### E7-3 (minor, 0.95) — R6-7 carried: the plan's own W1 gate is still in no lane's brief

Plan `:67` (DB item 10) and the W1 gate list at `:200` both require *"add a
null-project case to `supabase/functions/_tests/stripe-rail.test.ts`"*. The file
still hard-codes `project_id` at `:169`, `:214`, `:1012`. Correctly outside this
lane (it runs against the shared local stack, which this brief forbids), and the
W1 Close split at plan `:34` gives neither agent it. **W1 does not close on its
own stated gate until it lands.** Orchestrator item.

### E7-4 (minor, 0.95) — R6-6 carried and re-verified: the 20 functions must not reach prod before W3

All four citations re-read at this HEAD:
`packages/supabase/src/hooks/use-invoices.ts:465` `.eq('project_id', projectId)`;
`apps/client-portal/src/components/threshold/threshold.tsx:272`
`useProjectInvoices(projectId)`; `letterbox.tsx:139-141`
`invoices.find((row) => row.id === returned.invoiceId)`;
`app/page.tsx:62-69` `if (!projectView) → <ProjectsEmptyState />`.
`grep -rn "useClientInvoices" packages/supabase/src/hooks/use-invoices.ts` → no
hits on this branch. The gate is written in both places a shipper looks
(create-checkout-session/index.ts:292-306 and edge-notes ship-order step 2).
Not lane code; a program ship gate.

### E7-5 (nit, 0.8) — R6-8 carried: two project-invoice reminder clauses were rewritten out of brief

`invoice-emails.ts:300` `"so the project can keep moving"` → `"so the work can
carry on"`; `:375` `"may pause work on the project"` → `"may pause work already
under way"`. Both builders serve **every** invoice, project-bound included. They
are what let *no rung of the reminder ladder invents a house* pass, so the change
is defensible — but no ruling covers rewriting project-invoice reminder prose and
the brief's scope line is "exactly the listed items". Copy owner's awareness.

### E7-6 (nit, 0.98) — R6-9 **not fixed**: eight dead `00570` citations, plus two moved line numbers

```
supabase/functions/_shared/studio-identity.ts:58   "the pre-00570 function"
supabase/functions/_shared/studio-identity.ts:66   "Deployed ahead of 00570"
supabase/functions/_shared/studio-identity.test.ts:167  test NAME "…pre-00570 RPC"
artifacts/…/edge-notes.md:22, :159, :233, :250, :367
```
The migration is `00571_studio_invoices.sql` (db lane worktree; peers hold 00569
and 00570 — plan `:13`). The two cited line numbers also moved: the notes say
`00570:1167` is the `DROP FUNCTION` — it is **`00571:1262`**
(`DROP FUNCTION IF EXISTS public.resolve_studio_identity(uuid, uuid);`, the only
DROP in the file); the notes' `00570:1191-1194` for the `p_studio_id`
short-circuit is likewise stale. `sed 00570 → 00571` across three code/test sites
and five notes sites, and re-read the two line numbers.

### E7-7 (nit, 0.9) — R6-10 widened: the "Left open, deliberately" section now misreports **four** items, not one

`edge-notes.md:370-391`. This round's own work superseded most of it:
- `F-C` "the `?? title ??` chain is untested inside the five … Wants its own item" — closed by `7dd0614d5`; the doc says so at `:439`, but the bullet itself is unannotated.
- `F-E` "`'your studio'` reads oddly … a copy ruling, not a lane defect" — **ruled (W5-6) and fixed this round**; bullet still reads open.
- `F-F` "`branded-email.ts:221`'s 'Your project' … is a W1 addendum" — **ruled (W5-7) and fixed this round**; bullet still reads open.
- `F-H` "invoice-check-intent selects `studio_id` and never reads it … left rather than touch a select for cosmetics" — the W5-1 assertion now makes that column load-bearing (R6-11); the bullet invites exactly the tidy-up the assertion exists to block.

A ship steward reading that section is told four fixed/ruled things are open.
**Fix:** four one-line "superseded by Fix round 2 / …" annotations.

### E7-8 (nit, 0.85) — the two-argument PGRST202 retry becomes dead code the moment 00571 lands

`studio-identity.ts:63-70` retries without `p_studio_id` on `PGRST202` when the
caller named no studio. That is right for the pre-migration window. After
`00571:1262` **drops** the two-argument function, the retry can only ever fail a
second time — and on a stale PostgREST schema cache it costs a wasted round-trip
on every branded email across all 20 functions. Harmless; worth a clause so a
later reader does not mistake it for a permanent fallback.

### E7-9 (nit, 0.7) — the W5-1 SELECT assertion matches anywhere in the file

`/project_id,\s*studio_id,\s*title,\s*invoice_number/` is run against the whole
`index.ts`, not against the invoice `select(` specifically. `stripe-webhook`
carries a second select with `project_id` (`:1124`). Adequate today (mutation-
verified by the lane), but a future second invoice-shaped select would let the
real one lose `title` with the gate still green.

### E7-10 (nit, 0.95) — R6-12 carried: the shipped subject diverges from mockup M6

`proposal.html:531` (M6) shows `Invoice from Middle West Studio · Design
consultation`. Shipped (rendered): `Middle West Studio sent you invoice INV-0031 —
Design consultation · September`. The plan's edge items ask only for "title in
place of project name" (plan `:105`, `:175`), which is exactly what landed;
matching M6 would rewrite the shared subject template for project invoices too.
Taste, surfaced for the copy owner.

### E7-11 (nit, 0.9) — R6-13 carried advisory: `commercial-document-notify` `String(invoiceRow.project_id)`

`index.ts:308` would render the literal `"null"` for a studio invoice; unreachable
today (`:229-234` loads the row only for `transition === 'deposit_ready'`, and
deposit invoices are minted from project-bound commercial documents).
04-blast-radius `§2` marks the row `(c)`. In the 20-function deploy set;
`deno check` clean. Worth a guard only if studio invoices ever gain a deposit path.

---

## What I checked and found clean

- **Every `project` dereference in the five.** `grep -n "project?\.\|project_id\|your project\|projectName"` over all five: zero `'your project'` / `'Patina project'` stand-ins remain; the three payer checks are `invoice.client_id ?? invoice.project?.client_id` (client-first, unchanged, and `chk_invoices_anchor` guarantees `client_id` on a studio row); every `project_id` write is inside `metadata`, never a column.
- **Checkout return address.** `invoiceCheckoutReturnAddress` → project: `https://client.test/projects/proj-1?invoice=inv-1&checkout=success&session_id={CHECKOUT_SESSION_ID}#letterbox` (byte-identical param order to the old interpolation); studio: `https://client.test/?invoice=inv-1&checkout=success&session_id={CHECKOUT_SESSION_ID}#letterbox` — exactly the brief's shape. `{CHECKOUT_SESSION_ID}` un-encoded (asserted `%7B` absent), fragment last, `clientProjectLink`'s `ID_SEGMENT` guard passes UUIDs, trailing base slash tolerated. Cancel leg carries no `session_id`, as before.
- **The three stripe-webhook email sites** (`sendSuccessSideEffects:434`, `sendFailureSideEffects:526`, `sendInvoiceRefundSideEffects:1685`) all route through `invoiceSubjectName`; the two client-facing ones pass `studioInvoice: !invoice.project_id`, the designer-facing refund correctly does not.
- **`resolveStudioIdentity`.** Always names `p_studio_id` (so one signature binds by name, no 42725); six new tests spy the exact argument object, including *a studio caller does NOT retry two-argument* (better no brand than the wrong studio's letterhead) and *no anchor at all → the RPC is never called*.
- **Refusal scan on added lines.** `overdue` appears only in designer-facing AR-escalation prose (pre-existing) and designer in-app rows; the client-facing overdue rung says "Still open"/"past due". `gate` appears only in comments and test names. No badges, count chips, red/green, checkmarks, emoji, "AI", "dashboard", "task" in any homeowner string. `Your page` matches M6's "settle it in your page".
- **Escaping.** `forClause` escapes; a `<b>Retainer</b>` title renders `&lt;b&gt;` (asserted).
- **No `deno.lock` created**; working tree clean; every commit uses explicit pathspecs with `feat(edge):` / `fix(edge):` / `docs(edge):` subjects.
