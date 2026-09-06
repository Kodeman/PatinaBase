# W1 edge lane — adversarial review, close round 3

> **Filename note.** The brief named
> `waves/w1/edge-review-r2.md` as the destination. That path is already occupied
> by a *different* review (the first review series, commit `5e33a5723`), and
> overwriting it would repeat the loss that commit `28ae90c81` ("restore
> round-2 review, file round 6 under its own name") had to repair. This round is
> the third of the close series, so it is filed as `w1-close/edge-review-r3.md`.

Reviewer: fresh context, did not write this code.

```
$ git -C /Users/kody/Code/patina-merged/.codex/worktrees/agent-si-edge rev-parse --show-toplevel
/Users/kody/Code/patina-merged/.codex/worktrees/agent-si-edge
$ git -C … branch --show-current
studio-invoices/w1-edge
$ git -C … status --porcelain -- supabase artifacts     → (empty)
```

Range reviewed: `36b4b539e1f2cb732fb722d84edfe758d6b4008a...HEAD` — 24 commits,
23 files (10 program docs + 13 edge files, 4426 insertions).

**Verdict: fix.** No blocker. Every numbered brief item is delivered. Seven of
the eleven prior-round findings are genuinely closed (each re-proved below), one
is closed by the db lane, three remain. The one **major** is the same defect
close-round 2 raised and no fix round followed it: the ruled-out homeowner
phrase can be put back at the call site with all 241 tests and five `deno check`
runs green. Shipped behaviour today is correct; the gate is not.

---

## Gates, re-run by this reviewer

```
$ deno test --allow-all --config …/supabase/functions/deno.json …/supabase/functions/_shared/
ok | 241 passed | 0 failed (1s)

$ deno test --allow-all --config …/deno.json …/create-checkout-session/ …/stripe-webhook/
ok | 35 passed | 0 failed (893ms)

$ deno check --config …/deno.json  (the five index.ts)
Check supabase/functions/create-checkout-session/index.ts
Check supabase/functions/invoice-send/index.ts
Check supabase/functions/invoice-reminders/index.ts
Check supabase/functions/stripe-webhook/index.ts
Check supabase/functions/invoice-check-intent/index.ts
exit=0

$ ls deno.lock supabase/functions/deno.lock
"deno.lock": No such file or directory (os error 2)
"supabase/functions/deno.lock": No such file or directory (os error 2)
```

`invoice-send`, `invoice-reminders` and `invoice-check-intent` hold no test file
of their own; their behaviour is pinned from `_shared/invoice-subject.test.ts`
by source assertion, which is the only reachable seam (all five run `Deno.serve`
at module load).

---

## Brief items — all five delivered

| # | Item | Evidence |
|---|---|---|
| 1 | `resolveStudioIdentity({studioId})` → `p_studio_id` | `studio-identity.ts:44-72`; six new cases at `studio-identity.test.ts:110-224`. Mutation M8 (delete `p_studio_id: studioId` from the args) → **FAILED**. |
| 2 | Honest row type + `title` in the SELECT + one display name | `project_id: string \| null` and `project: {…} \| null` in all five (`:199/:66/:92/:150/:67`, `:208/:76/:103/:160/:75`); `project_id, studio_id, title, invoice_number` in all five SELECTs. `grep -rn "your project"` over the five + `_shared/invoice-emails.ts` + `_shared/invoice-subject.ts` → **exit 1, no hits**. Mutation M6 (drop `title` from `invoice-reminders`' SELECT) → **FAILED**. Mutation M7 (unanchor `resolveStudioIdentity`) → **FAILED**. |
| 3 | Null-tolerant Checkout return | `invoiceCheckoutReturnAddress` (`invoice-checkout-core.ts:138-152`) via `clientProjectLink`. Null project → `https://client.test/?invoice=inv-1&checkout=success&session_id={CHECKOUT_SESSION_ID}#letterbox`; project → `…/projects/proj-1?invoice=…` — same params, same order, same fragment as the strings it replaced. Payer check at `:239` is byte-identical (`client_id ?? project?.client_id`). Line name = `invoiceSubjectName(invoice, 'Studio invoice')` (`:274`). |
| 4 | Tests | `_shared/invoice-subject.test.ts` (new, 266 lines), `_shared/invoice-emails.test.ts` (+267), `_shared/studio-identity.test.ts` (+139), `create-checkout-session/invoice-checkout-core.test.ts` (+40, three URL cases incl. the `%7B` guard). |
| — | deploySet | Recomputed independently. |

### deploySet — independently recomputed, **20**

Reverse transitive closure over the *three* edited `_shared` modules
(`studio-identity.ts`, `invoice-subject.ts`, `invoice-emails.ts`) ∪ the five,
walking every relative import under `supabase/functions` with a script
(`$TMPDIR/si-r2/closure.mjs`), not by grepping module names:

```
deploySet count = 20
client-invite · commercial-document-notify · create-checkout-session ·
decision-first-notice · decision-reminders · decision-resolved-notify ·
expire-decisions · invoice-check-intent · invoice-reminders · invoice-send ·
notification-digest · notification-dispatch · po-send · proposal-nudge ·
proposal-sign-confirmation · quote-request-send · review-requests · spec-pdf ·
stripe-webhook · trade-rfq-send
```

Byte-identical to the notes' list (`edge-notes.md:133-152`). `morning-brief` is
correctly absent.

### Contract, checked against the db lane's file on disk

`…/agent-si-db/supabase/migrations/00571_studio_invoices.sql`:
`:51 ADD COLUMN IF NOT EXISTS title text`; `:1307-1311
resolve_studio_identity(p_project_id, p_designer_id, p_studio_id DEFAULT NULL)`;
`:1326-1338` the studio branch short-circuits before the project branch;
`:1151 COALESCE(pr.name, i.title, 'Studio invoice')` — the same three-rung chain
the edge lane derives. `DROP FUNCTION … (uuid, uuid)` at `:1305` removes the old
overload, so the wrapper's always-named `p_studio_id` is the right call shape and
the two other in-repo direct callers
(`packages/supabase/src/hooks/use-studio-identity.ts:70`,
`apps/mobile/Patina/…/StudioIdentityService.swift:97`, both two named args) still
resolve against the defaulted third. `can_manage_invoice` (true head
`00397:1251-1263`) keys on `designer_id` alone — a studio invoice is manageable.

### The letters, rendered

Both fixtures rendered through the real builders
(`$TMPDIR/si-r2/render.ts`), tags stripped:

*With a title* — SENT subject `Leah Brandt sent you invoice INV-0031 — Design
consultation · September`, body `… has sent you an invoice for Design
consultation · September.`; RECEIPT `We received your payment of $450.00 toward
invoice INV-0031 for Design consultation · September, billed by Leah Brandt.`

*With no title* — SENT subject `Leah Brandt sent you invoice INV-0031`, body
`Leah Brandt has sent you an invoice.`; OVERDUE `Invoice INV-0031 from Leah
Brandt is still open.`; RECEIPT `… toward invoice INV-0031, billed by Leah
Brandt.` Across all ten letters, both fixtures: `hasYourStudio: false`,
`hasYourProject: false`.

Footer on every studio-invoice client letter: `Patina · Your page · Email
preferences · Patina`. The `List-Unsubscribe` header is written by
`send-email.ts:149`, not by `footerLinks`, so no compliance link is lost.

---

## Prior-round findings — status

| id | verdict | proof |
|---|---|---|
| F-A ship-order gate | **open by design**, documented | `create-checkout-session/index.ts:296-306` inline; `edge-notes.md:159-176` step 2. Re-filed below as E-7. |
| F-B PGRST202 clause | **closed** | `edge-notes.md:338-360` corrects it; migration-first is a hard gate anyway. |
| F-C untested chain | **mostly closed**, residual = E-1 | The chain now lives in `_shared/invoice-subject.ts` with 8 unit cases; six source tests pin the five senders to it. |
| F-D deploy set 21 | **closed** | 20, recomputed above, list matches. |
| F-E "for your studio" | **closed** | Rendered above: the clause is dropped, not filled. |
| F-F "Your project" footer | **closed** | `studioInvoiceFooterLinks()`; 14 tests (7 letters × both flag states). Mutation M4 (relabel "Your page" → "Your project") → **FAILED | 233 passed | 8 failed**. |
| F-G stripe-rail null case | **closed by the db lane** | `…/agent-si-db/supabase/functions/_tests/stripe-rail.test.ts:107,235,250` — `project_id: null`. |
| F-H unused `studio_id` | **open**, nit | Re-filed as E-5. |
| F-I R2-7 unreachable | **retired** | Confirmed against `00571:1326-1338`. |
| F-J deploy-set rule text | **materially closed** | `:539` and `:1019` cover `invoice-subject.ts`; the headline clause at `:135` still names only `studio-identity.ts`. Folded into E-3. |
| F-K Stripe name length | advisory | Parity with the project path; `title` capped at 200 (`00571:878`). |

---

## Findings

### E-1 (major, 0.97) — the ruled-out phrase can be reinstated with every gate green

`invoice-subject.test.ts:167-181` pins the *argument* — every
`invoiceSubjectName(…)` call in the four letter senders must read exactly
`invoiceSubjectName(invoice, null)`. It does not pin the *result*. Two one-line
mutations, both leaving that call shape untouched, put the banned copy back:

```
M1  invoice-send/index.ts:251
    const projectName = invoiceSubjectName(invoice, null) ?? 'your studio';
    →  deno test _shared/  →  ok | 241 passed | 0 failed
       deno check invoice-send/index.ts  →  Check … (clean)
    rendered: "Leah Brandt has sent you an invoice for your studio."
              subject "… invoice INV-0031 — your studio"

M9  invoice-send/index.ts:252
    const forClause = projectName ? ` for ${projectName}` : ' for your project';
    →  deno test _shared/  →  ok | 241 passed | 0 failed
    rendered in-app: "Middle West Studio sent invoice INV-0031 for your project."
```

Both restored; `git status --porcelain -- supabase` clean afterwards.

**Fix (one of):** lift the `forClause`/`deskName` composition into
`_shared/invoice-subject.ts` and unit-test it; and/or add one source assertion to
the existing `LETTER_SENDERS` loop that the file contains no `'your studio'` /
`'your project'` literal anywhere, not just inside the call parens.

### E-2 (minor, 0.9) — the shipped copy contract is not the plan's or the brief's

Plan `:105` reads *"`projectName = invoice.project?.name ?? invoice.title ??
'your studio'` in each"* and *"`_shared/invoice-emails.ts` keeps
`projectName: string`; callers pass the fallback"*. The lane ships
`projectName: string | null`, a new **required** `studioInvoice: boolean` on four
param interfaces, and a studio-only footer relabel. All three are better copy and
all three are documented — but they originate in reviewer-invented rulings W5-6
and W5-7, not in Kody's "go with your recommendations", which covered S1–S12 only.
Surface the deviation at synthesis; do not revert it silently.

### E-3 (minor, 0.95) — the notes' ship-order step names the wrong migration

`edge-notes.md:159` — *"1. `00570_studio_invoices.sql` (db lane)"*. The db lane's
file on disk is `00571_studio_invoices.sql`; there is no 00570 in that lane
(00568 → 00571). The notes self-flag the prose drift at `:913-915`, but the
operational step-1 line — the one a ship agent reads — was not corrected, and
neither were `:22, :233, :250, :367`. `:135`'s deploy-set rule likewise still
says "every directory importing `_shared/studio-identity.ts`" when three
`_shared` modules were edited (the closure is the same 20 either way, so this is
wording, not a wrong list).

### E-4 (nit, 0.9) — the Stripe line-item fallback is the one unpinned homeowner string

`create-checkout-session/index.ts:274`. Mutation M5
(`invoiceSubjectName(invoice, 'Studio invoice')` → `'Patina project'`) →
`ok | 258 passed | 0 failed`. `create-checkout-session` is deliberately excluded
from `LETTER_SENDERS`, and the all-senders test bans only the literal
`'your studio'`. The string is rendered on Stripe's own Checkout page.

### E-5 (nit, 0.85) — `invoice-check-intent` selects and types a column it never reads

`index.ts:67` (`studio_id: string | null`) and `:126` (in the SELECT).
`grep -rn 'resolveStudioIdentity|studio-identity|studioCobrand|studioDisplayName'
supabase/functions/invoice-check-intent/index.ts` → exit 1. The omission is
right (its only letter is designer-addressed and `CheckIntentEmailParams` carries
no studio fields), but `invoice-subject.test.ts:198-210` now *requires* the dead
column in that SELECT for all five senders — a test defending a column nothing
reads.

### E-6 (nit, 0.75) — a whitespace-only title survives to the desk lines

`_shared/invoice-emails.ts:73,81` trim before deciding, so the *letters* are
safe. The senders do not: `invoice-send:252` `forClause`,
`stripe-webhook:404,510,1668` `deskName`, `invoice-check-intent:173` `deskName`
and `create-checkout-session:274` all take a truthy `"   "` at face value
(`"   : payment received…"`, `"Invoice INV-31 —    · Middle West Studio"`).
`00571:877` guards this in `create_draft_studio_invoice` only; the table's
`chk_invoices_anchor` (`00571:53-58`) requires `client_id`+`studio_id`, not a
title, and 00511's UPDATE arm permits direct authenticated DML on clean drafts.

### E-7 (minor, 0.9) — F-A carries over: do not send a studio invoice before W3

Not lane code, and fully documented in two places
(`create-checkout-session/index.ts:296-306`; `edge-notes.md:159-176`). The
letterbox reads `useProjectInvoices(projectId)` (`.eq('project_id')`), so a
studio row is never listed, and a payer with no house mounts no Letterbox at all
— which is also why the Checkout function is unreachable for one pre-W3. The
program gate stands: migration 00571 → the **W3** client page → the 20 functions.

---

## Not defects (checked, clean)

- Money path untouched: no `invoice_payments` write, no status write, no rollup
  arithmetic changed anywhere in the diff.
- `loadInvoiceJoined` now surfaces its PostgREST error
  (`stripe-webhook/index.ts:302-306`) — pinned at `invoice-subject.test.ts:213-230`.
- No `_shared/invoice-emails.ts` caller outside the five (repo-wide grep).
- `invoiceCheckoutReturnUrl(payable.successUrl, attempt)` (`:1163-1164`) still
  splices the attempt evidence before the fragment on both branches.
- No `deno.lock` anywhere; working tree clean; commits use explicit pathspecs and
  Conventional Commits subjects with no trailers.
