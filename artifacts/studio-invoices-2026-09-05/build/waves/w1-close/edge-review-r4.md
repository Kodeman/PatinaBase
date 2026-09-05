# W1 edge lane — adversarial review, close round 4

Reviewer: separate context, did not write the code. Worktree
`/Users/kody/Code/patina-merged/.codex/worktrees/agent-si-edge`, branch
`studio-invoices/w1-edge`.

> **Filename note.** The brief named `waves/w1/edge-review-r3.md`. That path is
> already occupied by a *different* review (the first series, commit
> `78ded54c2`), and the findings this round was handed (E-1…E-7) come from
> `waves/w1-close/edge-review-r3.md` (commit `49374cc13`). Overwriting either
> would repeat the loss commit `28ae90c81` had to undo, so this is filed as
> `w1-close/edge-review-r4.md`.

## Verdict — **ship** (no blocker, no major)

Round 3's only open major (E-1) is closed and proved closed. Everything else
open is polish or documentation.

## Gates, run by the reviewer

```
$ git -C .../agent-si-edge rev-parse --show-toplevel
/Users/kody/Code/patina-merged/.codex/worktrees/agent-si-edge
$ git -C .../agent-si-edge branch --show-current
studio-invoices/w1-edge

$ deno test --allow-all --config .../deno.json .../_shared/ \
      .../create-checkout-session/ .../stripe-webhook/
ok | 283 passed | 0 failed (1s)

$ deno check --config .../deno.json <each of the five index.ts>
Check supabase/functions/create-checkout-session/index.ts
Check supabase/functions/invoice-send/index.ts
Check supabase/functions/invoice-reminders/index.ts
Check supabase/functions/stripe-webhook/index.ts
Check supabase/functions/invoice-check-intent/index.ts

$ deno check … (the other 15 deploy-set functions)
ok  client-invite / commercial-document-notify / decision-first-notice /
    decision-reminders / decision-resolved-notify / expire-decisions /
    notification-digest / notification-dispatch / po-send / proposal-nudge /
    proposal-sign-confirmation / quote-request-send / review-requests /
    spec-pdf / trade-rfq-send        (15/15 clean)

$ find . -name deno.lock -not -path "*/node_modules/*"   → nothing
$ git status --porcelain -- supabase artifacts            → empty
```

## Prior round: what is fixed

**E-1 (major) — CLOSED.** Both round-3 mutations now fail a gate. Reverted after
each run; tree verified clean.

```
M1  invoice-send:255 → const projectName = invoiceSubjectName(invoice, null) ?? 'your studio';
    deno test .../_shared/invoice-subject.test.ts
    FAILED | 20 passed | 2 failed
      no invoice sender carries a stand-in phrase in any string it can print
      no sender re-composes the name, the clause or the desk line itself

M9  invoice-send:256 → const forClause = projectName ? ` for ${projectName}` : ' for your project';
    FAILED | 20 passed | 2 failed   (same two tests)
```

The new `stringLiterals()` scanner (invoice-subject.test.ts:314-375) reads every
string literal in all five senders with comments stripped, so the ruled-out copy
can no longer be reinstated at a call site the argument pins do not reach.

**Deploy set independently recomputed = 20, matching the notes.** Reverse
transitive closure of the relative-import graph under `supabase/functions`:
studio-identity → 19 dirs, invoice-emails → 4, invoice-subject → 5; union = 20,
exactly the list at edge-notes.md:137-150.

**Checkout return address verified.** `invoiceCheckoutReturnAddress` yields
`https://client.test/?invoice=inv-1&checkout=success&session_id={CHECKOUT_SESSION_ID}#letterbox`
for a null project and the identical param order/fragment for a project
(`/projects/proj-1?...`); `{CHECKOUT_SESSION_ID}` reaches Stripe un-encoded.

**Null-project letters rendered** (throwaway deno script importing the builders):
subject `Leah Brandt sent you invoice INV-0031 — Design consultation · September`,
body `…has sent you an invoice for Design consultation · September.`, footer
`Your page`. With neither house nor title: `Leah Brandt sent you invoice
INV-0031` and the sentence closes after the number. No stand-in phrase anywhere.

## Findings

### R4-1 (minor) — the shipped copy contract is still not the plan's, and grew by two
Carry-over of E-2, now four items rather than three. Plan line 105 and the lane
brief both say `projectName = invoice.project?.name ?? invoice.title ?? 'your
studio'` and `_shared/invoice-emails.ts keeps projectName: string`. Shipped:
(1) `projectName: string | null` on five param interfaces; (2) a NEW REQUIRED
`studioInvoice: boolean` on four of them (invoice-emails.ts:104, 225, 497, 689);
(3) the `Your page` footer override (invoice-emails.ts:87-95, replacing the
shell's default `Your project` at branded-email.ts:219-223); and — not listed in
round 3 — (4) two prose rewrites that change **project-invoice** letters too:
`so the project can keep moving without interruption` → `so the work can carry
on without interruption` (invoice-emails.ts:299) and `may pause work on the
project` → `may pause work already under way` (:375). All four are better copy;
none was ruled by Kody (W5-6/W5-7 are reviewer rulings). **Fix: surface at
synthesis, do not revert.**

### R4-2 (minor) — E-3 not fixed: the ship-order step a ship agent reads still says 00570
`edge-notes.md:159` — "1. `00570_studio_invoices.sql` (db lane)"; also `:22`,
`:233`, `:250`, `:367`. The db lane's file is `00571_studio_invoices.sql`
(`ls .../agent-si-db/supabase/migrations | tail` → … `00568_…`,
`00571_studio_invoices.sql`; no 00570). **New this round:** the notes' own
advisory at `:913-915` asserts "no shipped code carries the number" — false:

```
$ grep -rn "00570" supabase/functions/
_shared/studio-identity.ts:58:    // argument name. A two-argument call would match BOTH the pre-00570
_shared/studio-identity.ts:66:      // Deployed ahead of 00570 the RPC still takes two arguments; a caller
_shared/studio-identity.test.ts:167:Deno.test("resolveStudioIdentity: a project caller still brands against the pre-00570 RPC", …
```

Fix: 00570 → 00571 in those five note lines and the three source lines.

### R4-3 (minor) — the notes' summary of the derivation is the pre-W5-6 one
`edge-notes.md:51-53` still documents item 2 of "The five functions" as
"`invoice.project?.name ?? invoice.title ?? 'your studio'`" and "a module-level
`invoiceSubjectName(invoice)`". Neither is what shipped: the fallback is `null`
for every letter sender, and the signature is `invoiceSubjectName(invoice,
fallback)`. Later sections correct it, but the summary is what a ship or W2/W3
agent reads first. Fix: restate `:51-53` as the shipped contract.

### R4-4 (minor) — E-6 not fixed: a whitespace title is trimmed by the letters, not by the lines
`invoiceSubjectName` (invoice-subject.ts:39) does not trim; `forClause`/
`subjectTail` inside invoice-emails.ts do. Rendered proof:

```
desk/derived for whitespace title: {"subject":"   ","clause":" for    ","desk":"   "}
emails for the same fixture:  "Leah Brandt sent you invoice INV-0031"  (clean)
```

So the letters are safe but `invoice-send:349` (the homeowner's push/in-app body
`… sent invoice INV-0031 for    .`), `invoice-send:311-313`,
`invoice-reminders:375/423/449`, `stripe-webhook:493/576/1741` and
`invoice-check-intent:230` take `"   "` at face value. `create_draft_studio_invoice`
rejects a blank title (`00571:877`), so this needs direct DML on a clean draft
(00511's UPDATE arm) or a whitespace project name. Fix (one line, fixes all
sites): `invoice.project?.name?.trim() || invoice.title?.trim() || fallback`.

### R4-5 (nit) — E-4 not fixed: the Stripe line-item fallback still has no gate
```
$ perl -0pi -e "s/invoiceSubjectName\(invoice, 'Studio invoice'\)/invoiceSubjectName(invoice, 'Patina project')/" create-checkout-session/index.ts
$ deno test --allow-all --config .../deno.json .../_shared/ .../create-checkout-session/
ok | 265 passed | 0 failed (1s)
```
`create-checkout-session` is outside LETTER_SENDERS, and `STAND_IN_PHRASES`
bans only `your studio|your project|your home`. The string renders on Stripe's
own Checkout page. Fix: one assertion pinning
`invoiceSubjectName(invoice, 'Studio invoice')` in create-checkout-session.

### R4-6 (nit) — E-5 not fixed: invoice-check-intent selects a column nothing reads
`index.ts:68` types and `:126` selects `studio_id`; `grep -n
"resolveStudioIdentity\|studio_id" invoice-check-intent/index.ts` returns only
those two lines. The omitted resolver call is correct (its only letter is
designer-addressed and `CheckIntentEmailParams` carries no studio fields) and is
documented under "Left deliberately undone", but invoice-subject.test.ts:241-252
now pins `studio_id` in that SELECT for all five senders. Cosmetic.

### R4-7 (nit, NEW) — a code comment warns of a hazard the migration makes impossible
`studio-identity.ts:56-61` explains that naming all three args avoids a 42725
"function is not unique" "if a deploy ever left them side by side". The db lane
drops the old signature before creating the new one
(`00571_studio_invoices.sql:1305` `DROP FUNCTION IF EXISTS
public.resolve_studio_identity(uuid, uuid);` then CREATE with three
`DEFAULT NULL` params), so the two forms can never coexist. The defensive code
is still right (and the `PGRST202` retry is genuinely needed for the pre-migration
window); only the stated reason is wrong. Fix: restate the comment as
"pre-migration the RPC takes two arguments" and drop the 42725 story.

### R4-8 (nit, NEW) — project invoices change letterhead precedence, undocumented
Every one of the four branding senders now passes `studioId: invoice.studio_id`
via `invoiceBrandingRef`, and the new RPC short-circuits on it *before* the
project (`00571:1327-1340` step 0, ahead of step 1's `p.studio_id`). Today the
two agree — `set_invoice_studio_id` stamps `NEW.studio_id := COALESCE(NEW.studio_id,
v_project.studio_id)` (`00511:2797`). They diverge for a project whose
`studio_id` changed after the invoice was stamped, or a row created with an
explicit studio: such a project invoice's mail now carries the invoice's stamped
studio, not the project's current one. Arguably the correct answer (the
letterhead at issue time) and sanctioned by plan item 8, but it is a live
behavior change for existing house invoices and edge-notes.md does not say so.
Fix: one line in the notes.

### R4-9 (gate, carried) — the five must not reach prod before the W3 client page
E-7 / F-A, unchanged and correctly documented in two places
(`create-checkout-session/index.ts:296-306`; `edge-notes.md:159-176`). Program
order: migration 00571 → the W3 client page → the 20 functions. No lane code
defect.

## Checks that found nothing

- Every `project` dereference in the five: only `invoice.project?.client_id`
  (payer/recipient resolution, unchanged) and the embed itself. No
  `'your project'` remains in any of the five.
- No `!inner` embed and no `if (!invoice.project) return` guard anywhere in the
  five — a null project never filters a row out. `invoice-reminders`' scan
  (`:276-278`) filters on status/due_date/ar_flagged_at only, so studio invoices
  are chased.
- `notify_client_attention` (true head `00534`) builds its deep link as
  `/invoices/<id>`; `metadata.project_id: null` is inert.
- `create-checkout-session`'s payer check is byte-unchanged (`:239`,
  `client_id` first); a studio invoice always carries `client_id` under
  `chk_invoices_anchor`.
- `invoice-checkout-core.ts` touches `project` only in the new return-address
  helper — no other project coupling on the money path.
- The four client-facing builders all carry `audience: "client"` alongside the
  new `footerLinks` override, so the studio footer resolves the client base.
- `invoice-emails.ts` has exactly four importers besides its own test
  (`po-emails.ts` + the three invoice functions + stripe-webhook); all compile.
- The plan's `_tests/stripe-rail.test.ts` null-project case is the db lane's
  (78 added lines on `studio-invoices/w1-db`), correctly not duplicated here.
