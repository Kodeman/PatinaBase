# W1 EDGE — adversarial review, round 3 (independent)

Reviewer: separate context, did not write the code. Dispatched as "round 1";
the lane branch already carries two prior external reviews, so this is **round
3** and is filed under a new name rather than clobbering
`edge-review-r1.md` (commit `9dbc4d22d`) — `edge-review-r2.md` (`5e33a5723`)
cross-references r1's F-numbers and would be made incoherent by an overwrite.

```
$ git -C /Users/kody/Code/patina-merged/.codex/worktrees/agent-si-edge rev-parse --show-toplevel
/Users/kody/Code/patina-merged/.codex/worktrees/agent-si-edge

$ git log --oneline 36b4b539e1f2cb732fb722d84edfe758d6b4008a..HEAD
5e33a5723 docs(studio-invoices): W1 edge lane adversarial review, round 2
a2c65381b docs(edge): W1 edge lane fix round 1 — findings F1, F3, F4
c390cbd97 fix(edge): keep the studio-invoice reminder house-free and bind the identity RPC by name
9dbc4d22d docs(studio-invoices): W1 edge lane adversarial review, round 1
43ab78e9d docs(edge): W1 edge lane notes for studio invoices
a5bcefbf7 feat(edge): carry a studio invoice through the five invoice functions
f45bb8824 feat(edge): resolve studio brand by studio_id, not the designer's primary studio
```

**Verdict: fix.** No blocker. Every numbered brief item is delivered and every
lane gate is green. One major is a program *sequencing* item the lane cannot
fix in its own code; one new minor is mine (a mitigation that does not cover
the case its note claims); the rest are r2 items still open, re-proved here
independently, plus one r2 nit I can now retire with proof.

---

## Brief items — traced

| # | Item | Status | Evidence |
|---|---|---|---|
| 1 | `resolveStudioIdentity(admin, { projectId?, designerId?, studioId? })`, `p_studio_id` passed, tests updated | delivered | `_shared/studio-identity.ts:38-88`; +6 tests in `studio-identity.test.ts` |
| 2 | Honest row type (`project_id: string \| null`, `project: … \| null`, `title: string \| null`), `title` in the select, one display name per file, identity by `studio_id`, nullable `notification_log` metadata `project_id` | delivered | all five; `grep -n "your project"` over the five → **0 hits**; every `project_id` in metadata is inside a `jsonb` object, never a column |
| 3 | Null-tolerant success/cancel URLs via `clientProjectLink`; Stripe name falls back to `title`; payer check unchanged | delivered | project path **byte-identical** to the old string (proof below); `index.ts:236` payer check untouched |
| 4 | Tests for `_shared` studio-identity + invoice-emails (title-as-name) + per-function test files that exist | delivered, with a gap | `invoice-checkout-core.test.ts` +3, `studio-identity.test.ts` +6, `invoice-emails.test.ts` +4; `stripe-webhook/invoice-checkout-integrity.test.ts` not extended (F-C) |

### Item 3 — return address, verified by execution

```
project success : https://client.patina.cloud/projects/7f1c…001?invoice=9a2b…002&checkout=success&session_id={CHECKOUT_SESSION_ID}#letterbox
OLD             : https://client.patina.cloud/projects/7f1c…001?invoice=9a2b…002&checkout=success&session_id={CHECKOUT_SESSION_ID}#letterbox
match: true
project cancel  : …/projects/7f1c…001?invoice=9a2b…002&checkout=cancelled#letterbox      OLDcancel match: true
studio success  : https://client.patina.cloud/?invoice=9a2b…002&checkout=success&session_id={CHECKOUT_SESSION_ID}#letterbox
studio cancel   : https://client.patina.cloud/?invoice=9a2b…002&checkout=cancelled#letterbox
trailing slash  : https://client.patina.cloud/?invoice=9a2b…002&checkout=success&session_id={CHECKOUT_SESSION_ID}#letterbox
```

`checkout=cancelled` (not `cancel`) is right: the portal accepts both
(`apps/client-portal/src/lib/threshold/checkout-return.ts:43`) and `cancelled`
is what the old URL carried. Splicing `session_id` after `clientProjectLink`
rather than passing it as a param is correct and better than the plan's
literal instruction — `clientProjectLink` percent-encodes params, and
`%7BCHECKOUT_SESSION_ID%7D` is handed to the payer verbatim by Stripe.

### Item 2 — rendered letters, null-project fixture

Rendered through the real builders. With a title:

> **Middle West Studio sent you invoice INV-0031 — Design consultation · September**
> … Leah Brandt has sent you an invoice for Design consultation · September.

With `title` null (the `'your studio'` branch):

> **Middle West Studio sent you invoice INV-0031 — your studio**
> … Leah Brandt has sent you an invoice for **your studio**. — see F-E

All four reminder rungs, the receipt and the failed-payment notice were
rendered; the only "project" left in any homeowner-audience body is the shell
footer link (F-F).

### Gates I ran

```
$ deno test --allow-all --config …/supabase/functions/deno.json …/supabase/functions/_shared/
ok | 200 passed | 0 failed (1s)
    studio invoice: the title reads where the house name would ... ok
    studio invoice: the reminder ladder names the title too ... ok
    studio invoice: a title with markup in it is escaped, never rendered ... ok
    studio invoice: no rung of the reminder ladder invents a house ... ok
    resolveStudioIdentity: a studio invoice brands by its own studio ... ok
    resolveStudioIdentity: no studio given → p_studio_id is still named, null ... ok
    resolveStudioIdentity: a project caller still brands against the pre-00570 RPC ... ok
    resolveStudioIdentity: a studio caller does NOT retry two-argument ... ok
    resolveStudioIdentity: studio alone is anchor enough ... ok
    resolveStudioIdentity: no anchor at all → null, and the RPC is never called ... ok

$ deno test … supabase/functions/create-checkout-session/   ok | 17 passed | 0 failed (38ms)
$ deno test … supabase/functions/stripe-webhook/            ok | 18 passed | 0 failed (21ms)

$ deno check --config …/deno.json <each of the five>
Check supabase/functions/create-checkout-session/index.ts
Check supabase/functions/invoice-send/index.ts
Check supabase/functions/invoice-reminders/index.ts
Check supabase/functions/stripe-webhook/index.ts
Check supabase/functions/invoice-check-intent/index.ts
(sample of the deploy set — po-send, notification-dispatch, spec-pdf, notification-digest — also clean)

$ find . -name deno.lock -not -path "*/node_modules/*"   → nothing
$ git status --short                                     → clean
```

---

## Findings

### F-A (major, 0.90) — a paid studio invoice returns to a page that says nothing
*(r2's R2-1, still open; independently re-verified.)* `create-checkout-session`
now returns a studio payer to `/?invoice=<id>&checkout=success#letterbox`.
`apps/client-portal/src/components/threshold/threshold.tsx:272` feeds the
letterbox from `useProjectInvoices(projectId)`, which filters `.eq('project_id')`
and can never return a studio invoice; `letterbox.tsx:138-141` finds no row, so
`settlement` is null and no receipt or cancellation banner renders. A payer with
no house at all lands in `ProjectsEmptyState` (`app/page.tsx:61-69`), which
mounts no `Letterbox` at all. Not lane code — the plan puts `useClientInvoices()`
and the letterbox-only front door in W3 (plan `:77`, `:92-94`) — but the plan's
own ship order (`:100`) ships edge functions *before* the client portal, which
opens exactly this window.
**Fix (program):** gate the ship — these five functions must not reach prod
before the W3 client-page work lands. Nothing to change in this lane.

### F-B (minor, 0.92) — NEW: the PGRST202 fallback cannot fire for the five functions
`studio-identity.ts:62-69` retries two-argument **only when `!studioId`**. All
five invoice functions pass `studioId: invoice.studio_id`, and that column is
never null on any row the schema can produce: `set_invoice_studio_id`'s INSERT
arm raises `studio_id_not_designer_studio` when `NEW.studio_id IS NULL`
(`supabase/migrations/00511_public_sd_hardening.sql:2861-2867`), and 00513's
studioless index carries the comment *"Currently unreachable in practice"*
(`00513:43-44`). So `edge-notes.md`'s claim — *"a project-bound letter still
brands if the function lands ahead of the migration"* — is **false for the five
letters this lane touches**; deployed ahead of 00570 they lose co-branding
silently on every invoice, project ones included. The guard does protect the
other 14 importers, which reach the RPC through `resolveStudioSignature(admin,
{ designerId?, projectId? })` (`studio-identity.ts:191`) and therefore pass no
studio. The test at `studio-identity.test.ts:215` ("a project caller still
brands against the pre-00570 RPC") asserts a call shape none of the five ever
produce, which reads as a guarantee they do not have.
**Fix:** correct that clause in `edge-notes.md` (the migration-first order is
already mandated by the `title` select, so no code change is required); if the
guarantee is wanted for the five, drop the `&& !studioId` condition and accept
the primary-studio letterhead for the pre-migration window.

### F-C (minor, 0.95) — the `?? title ??` chain inside the five is still untested
*(r2's R2-3, open.)* `invoiceSubjectName` is declared module-private and
unexported at `stripe-webhook/index.ts:353` and `invoice-reminders/index.ts:116`;
the inline forms at `invoice-send:254`, `invoice-check-intent:172` and
`create-checkout-session:277` have no seam either. `grep -rn "invoiceSubjectName"
supabase/functions` → 4 hits, all in those two index files, none in a test. The
four `invoice-emails.test.ts` additions prove only that the builders render the
string they are handed. `stripe-webhook/invoice-checkout-integrity.test.ts`
exists (brief item 4: "any per-function test files that exist") and was not
extended — 18 passed, unchanged from baseline. Delete `?? invoice.title` from
any of the five and all 235 tests plus five `deno check`s still pass.
**Fix:** export one `invoiceSubjectName(row)` (or lift it to `_shared`) and
assert the three-step chain once.

### F-D (minor, 0.98) — the deploy set is 20, not 21; `morning-brief` does not belong
*(r2's R2-2, open.)* I recomputed the reverse transitive closure of
`_shared/studio-identity.ts` with a script that walks every relative import
under `supabase/functions` (not a text grep): **19** directories —
`client-invite, commercial-document-notify, create-checkout-session,
decision-first-notice, decision-reminders, decision-resolved-notify,
expire-decisions, invoice-reminders, invoice-send, notification-digest,
notification-dispatch, po-send, proposal-nudge, proposal-sign-confirmation,
quote-request-send, review-requests, spec-pdf, stripe-webhook, trade-rfq-send`
— ∪ `invoice-check-intent` = **20**. `morning-brief`'s only relative imports are
`./compose.ts`, `./render.ts`, `../_shared/send-email.ts`,
`../_shared/branded-email.ts`; its single mention of `notification-digest` is a
comment at `morning-brief/render.ts:3`. `edge-notes.md` still says "Deploy set —
21 functions". An extra redeploy is harmless; a deploy set derived from a
comment is not.
**Fix:** drop `morning-brief`, say 20.

### F-E (minor, 0.80) — `'your studio'` is the homeowner reading it
*(r2's R2-6, open; brief-mandated, so not a lane defect.)* Rendered above:
"Leah Brandt has sent you an invoice for **your studio**." The studio is the
designer's, not the homeowner's. The same string reaches the designer's own
in-app refund line (`stripe-webhook/index.ts:1739`). Reachable only on a
title-less studio invoice; `00570:746-747` rejects a blank title, so the RPC
path cannot produce one, but the DB CHECK (plan `:58`) does not require a title,
so a direct write or a later writer can.
**Fix (copy owner):** "the studio", or drop the trailing clause when there is
no name.

### F-F (minor, 0.85) — the "Your project" footer under every studio letter
*(r2's R2-5, open.)* `_shared/branded-email.ts:221` `{ label: "Your project",
href: base }` is the standing `audience: "client"` footer, confirmed in the
rendered prose of all six client letters (`… Patina Your project Email
preferences Patina`). The seam exists — `renderBrandedShell` takes
`opts.footerLinks` (`branded-email.ts:219`) — but `invoice-emails.ts`'s private
`wrap()` (`:100-126`) does not thread it. Outside the lane's listed scope.
**Fix:** a W1 addendum threading `footerLinks`, not a global relabel.

### F-G (minor, 0.90) — the plan's `_tests/stripe-rail.test.ts` null-project case is unassigned
*(r2's R2-4, open.)* Plan `:67` and W1 gate `:165` both require it; the lane
correctly did not write it (that harness runs against the shared local stack,
which this brief forbids and the db lane owns). It is in neither lane's brief.
**Fix (orchestrator):** assign it to the db or integration lane. W1 does not
close on its own stated gate until it lands.

### F-H (nit, 0.90) — NEW: `invoice-check-intent` selects `studio_id` and never reads it
`invoice-check-intent/index.ts:67` types it and `:125` selects it, but the file
resolves no studio identity (deliberate and correct — its only letter,
`buildCheckIntentEmail`, is designer-addressed and `CheckIntentEmailParams`
carries no studio fields, so a resolver call would be dead code). The column is
the only unused addition among the five.
**Fix:** drop `studio_id` from that select and type, or leave with a one-clause
note. Cosmetic.

### F-I (nit, 0.90) — NEW: r2's R2-7 hazard is unreachable; retire it
r2 flagged that `create-checkout-session` now also passes `designerId`, so a
project with `studio_id IS NULL` whose `designer_id` differs from
`invoice.designer_id` could brand differently. That state cannot exist: the
INSERT arm of `set_invoice_studio_id` requires `project.studio_id =
NEW.studio_id` **and** `project.designer_id = NEW.designer_id`
(`00511:2851-2854`) and raises on a null `NEW.studio_id` (`:2861-2867`), and
`p_studio_id` short-circuits the project branch in the new RPC
(`00570:1191-1194`). The resolved org is identical before and after.
**Fix:** none; close R2-7.

### F-J (nit, 0.90) — the deploy-set rule in the notes is derived from one shared module
*(r2's R2-9, open.)* Round 1's fix also edited `_shared/invoice-emails.ts`, but
`edge-notes.md` still derives the deploy set solely from
`_shared/studio-identity.ts` ∪ the five. Harmless here — the reverse closure of
`invoice-emails.ts` is `{invoice-check-intent, invoice-reminders, invoice-send,
stripe-webhook}`, a strict subset — but the stated rule would mislead a later
`_shared` edit.

### F-K (nit, 0.35) — Stripe line-item name length
`create-checkout-session/index.ts:274-277` builds `Invoice <number> — <name> ·
<studio>`. `title` is capped at 200 chars (`00570:746-747`); `organizations.name`
is uncapped. A long pair can exceed Stripe's product-name limit. Identical
exposure on the project path (`projects.name` is uncapped too) — parity, not new.
Advisory.

---

## Things I checked that are clean

- Every `project` dereference in the five is `invoice.project?.` — no `!`, no
  bare `.name`. `grep -n "your project"` over the five → 0 hits.
- Every `project_id` written by the five sits inside a `jsonb` `metadata` object
  (`invoice-send:304,346`; `invoice-reminders:207,242,374,427,449`;
  `stripe-webhook:456,485,549,571,1705,1733`; `invoice-check-intent:225,265`) —
  no NOT NULL column takes a null.
- `stripe-webhook`'s three invoice letter sites all route through
  `invoiceSubjectName` (`:405`, `:511`, `:1671`); the two client-facing ones
  (`:428`, `:523`) pass `studioId`; the third is designer-addressed and
  uncobranded, as before.
- The payer check is untouched (`create-checkout-session:236`, `client_id` first).
- The TS precedence comment (`studio-identity.ts:6-8`) matches the new RPC body
  (`00570:1191-1206`).
- The 2-argument RPC is dropped by the db lane (`00570:1167`) and the remaining
  in-repo 2-arg callers — `packages/supabase/src/hooks/use-studio-identity.ts:70`
  and `apps/mobile/Patina/…/StudioIdentityService.swift:97` — still bind, because
  all three parameters carry `DEFAULT NULL` (`00570:1170-1173`).
  `supabase/seed/00-legacy-grants.sql:2683,2689` names the old `(uuid, uuid)`
  signature but is wrapped in `EXCEPTION WHEN undefined_function … NULL`, so a
  `db reset` stays green after the drop.
- No `deno.lock`; worktree clean; commits carry explicit pathspecs and
  Conventional Commit subjects; nothing outside `supabase/functions` and the
  program artifacts was touched.
