# W1 EDGE — adversarial review, round 1

Reviewer: separate context, did not write the code.
Worktree `/Users/kody/Code/patina-merged/.codex/worktrees/agent-si-edge`
(`git rev-parse --show-toplevel` → `/Users/kody/Code/patina-merged/.codex/worktrees/agent-si-edge`),
branch `studio-invoices/w1-edge`, base `36b4b539e1f2cb732fb722d84edfe758d6b4008a`.

```
43ab78e9d docs(edge): W1 edge lane notes for studio invoices
a5bcefbf7 feat(edge): carry a studio invoice through the five invoice functions
f45bb8824 feat(edge): resolve studio brand by studio_id, not the designer's primary studio
```

**Verdict: fix.** No blocker. Every numbered brief item is delivered and the four
lane gates are green. Two majors (one homeowner-copy defect the rendered letter
proves, one cross-lane RPC-signature hazard), one deploy-order hazard the notes
currently read as safe, and five smaller items.

---

## Brief items — delivered

| # | Item | Status |
|---|---|---|
| 1 | `resolveStudioIdentity({ projectId?, designerId?, studioId? })`, `p_studio_id` passed, tests updated | ✅ `_shared/studio-identity.ts:38-79`; +4 tests |
| 2 | Honest row type + `title` in select + one display name per file, in all five | ✅ all five; `grep -n "your project"` over the five → **0 hits** |
| 3 | Null-tolerant success/cancel URLs via `clientProjectLink`; product name falls back to `title`; payer check unchanged | ✅ project path **byte-identical**, studio path correct (proof below) |
| 4 | Tests: `_shared` studio-identity + invoice-emails, per-function URL seam | ✅ +4 / +3 / +3; gap noted in F5 |

### Gates I ran

```
$ deno test --allow-all --config …/supabase/functions/deno.json …/supabase/functions/_shared/
ok | 197 passed | 0 failed (2s)

$ deno test --allow-all --config supabase/functions/deno.json supabase/functions/create-checkout-session/
ok | 17 passed | 0 failed (22ms)

$ deno test --allow-all --config supabase/functions/deno.json supabase/functions/stripe-webhook/
ok | 18 passed | 0 failed (27ms)

$ deno check --config supabase/functions/deno.json <each of the five index.ts>
Check supabase/functions/create-checkout-session/index.ts
Check supabase/functions/invoice-send/index.ts
Check supabase/functions/invoice-reminders/index.ts
Check supabase/functions/stripe-webhook/index.ts
Check supabase/functions/invoice-check-intent/index.ts      (all clean, no diagnostics)

$ find . -name deno.lock -not -path "*/node_modules/*"      → nothing
```

`invoice-send`, `invoice-reminders`, `invoice-check-intent` have no test files of
their own (`ls supabase/functions/<dir>/*.test.ts` → no matches) — nothing to
extend there beyond F5.

### Checkout return address — proved, not paraphrased

Composed through the real helpers (`deno run` against
`create-checkout-session/invoice-checkout-core.ts`):

```
project success identical to the old interpolated string: true
  https://client.patina.cloud/projects/<pid>?invoice=<inv>&checkout=success&session_id={CHECKOUT_SESSION_ID}#letterbox
project cancel  identical: true
  https://client.patina.cloud/projects/<pid>?invoice=<inv>&checkout=cancelled#letterbox
studio success: https://client.patina.cloud/?invoice=<inv>&checkout=success&session_id={CHECKOUT_SESSION_ID}#letterbox
studio cancel : https://client.patina.cloud/?invoice=<inv>&checkout=cancelled#letterbox
after invoiceCheckoutReturnUrl(): …&session_id={CHECKOUT_SESSION_ID}&checkout_attempt_id=a1&payment_id=p1#letterbox
trailing-slash base: https://client.patina.cloud/?invoice=…   (no double slash)
```

Same params, same order, fragment last, `{CHECKOUT_SESSION_ID}` un-encoded.

---

## Findings

### F1 · major (confidence 0.95) — the studio-invoice reminder tells the homeowner about a project that doesn't exist
`supabase/functions/_shared/invoice-emails.ts:253`

Rendered prose for a null-project fixture (`buildInvoiceOverdueNoticeEmail`,
`projectName = "Design consultation · September"`, the exact value
`invoice-reminders/index.ts:117` now passes):

> Invoice INV-0031 from Leah Brandt for Design consultation · September is still open. … **When you have a moment, please settle the balance so the project can keep moving without interruption.**

A studio invoice is "an invoice with no house" (plan, principle). This is the
second reminder rung on the ladder `invoice-reminders` drives, homeowner-
addressed (`audience: "client"`, `invoice-emails.ts:261`). The subject line was
fixed; the body was not. Fix: make the sentence house-free, or take the clause
from a param the studio branch blanks, and pin it with a null-project test in
`_shared/invoice-emails.test.ts` beside the three added here. (Scope note: the
file is `_shared`, not one of the five, so the orchestrator may prefer this as a
W1 addendum rather than a lane amendment — but it ships with the feature.)

### F2 · minor (confidence 0.9) — every studio-invoice letter footers a link labelled "Your project"
`supabase/functions/_shared/branded-email.ts:221` — `{ label: "Your project", href: base }`
is the standing client-audience footer, so it renders under the sent letter, the
whole reminder ladder, the receipt and the failed-payment notice for a household
that may have no house at all (the S5/W3 letterbox-only front door case).
Pre-existing and shared with every client letter, so not this lane's doing, but
the studio invoice is the first letter where the label is simply untrue.

### F3 · major (confidence 0.9) — `title` in the select makes these functions migration-ordered, and the notes read as if they are not
All five now select `title` (`invoice-send:152`, `invoice-reminders:270`,
`create-checkout-session:220`, `stripe-webhook:291`, `invoice-check-intent:125`).
No migration in this worktree adds it:

```
$ grep -rn "invoices" supabase/migrations/*.sql | grep -i "add column .*title"   → no hits
```

Deployed before the db lane's migration, PostgREST answers 42703 and:
- `invoice-send` → `500 lookup_failed` (`index.ts:161-165`)
- `create-checkout-session` → `500 lookup_failed` (`index.ts:228-231`) — nobody can pay
- `invoice-reminders` → `500` on the scan, the whole cron run dies (`index.ts:283-286`)
- `stripe-webhook` → `loadInvoiceJoined` returns null, so **receipt, failed-payment
  and refund letters are silently skipped while the money still settles**
  (`index.ts:402/509/1668` all `if (!invoice) return;`)

`edge-notes.md` says "the deployed functions do not break if they land before the
migration". In context that sentence is about the RPC argument only, but it is
the sentence a shipper reads. The ship-order note in `edge-notes.md` should say,
in its own line: **migration first, then these functions** (which is what the
plan's ship order already says).

### F4 · major (confidence 0.6) — the two-argument RPC call becomes ambiguous if the db lane adds an overload instead of replacing
True head, anchored grep:

```
$ grep -rln "CREATE OR REPLACE FUNCTION[^(]*resolve_studio_identity" supabase/migrations/*.sql | sort | tail -1
supabase/migrations/00320_studio_branding_read_and_logos.sql
```

`00320:27-30` declares `resolve_studio_identity(p_project_id uuid DEFAULT NULL,
p_designer_id uuid DEFAULT NULL)` and `00320:104-105` REVOKE/GRANTs the
**two-argument signature by name**. Postgres cannot `CREATE OR REPLACE` across a
changed argument list — the db lane must `DROP FUNCTION
public.resolve_studio_identity(uuid, uuid)` and re-issue REVOKE/GRANT on
`(uuid, uuid, uuid)`. If the 2-arg function survives, this lane's deliberate
two-argument call (`studio-identity.ts:57-61`, `if (studioId) args.p_studio_id = …`)
matches **both** candidates and Postgres raises `function … is not unique`
(42725) — every project invoice loses its letterhead and `resolveStudioIdentity`
returns null (it swallows the error at `:62-65`, so the failure is silent
co-brand loss, not an alarm).

Two cheap belts, either one closes it: (a) a SQL test in the db lane asserting
exactly one `resolve_studio_identity` row in `pg_proc`; (b) after the migration
is confirmed live, send `p_studio_id: studioId` unconditionally (including
`null`) so the call binds only the 3-arg signature. The conditional form is
still the right thing during the pre-migration window.

### F5 · minor (confidence 0.9) — the display-name fallback is untested inside all five functions
`invoiceSubjectName` is module-private and unexported in both
`invoice-reminders/index.ts:116-118` and `stripe-webhook/index.ts:352-355`; the
inline forms at `invoice-send:254`, `invoice-check-intent:172` and
`create-checkout-session:277` have no seam either. The three tests added to
`_shared/invoice-emails.test.ts` only prove the builders render whatever string
they are handed. Delete `?? invoice.title` from any of the five and every gate
in this lane stays green. Brief item 4 / "tests for every behavior you change" is
met for items 1 and 3, not for item 2.

### F6 · minor (confidence 0.95) — the deploy set is 20, not 21; `morning-brief` is not an importer
`edge-notes.md` lists `morning-brief` "via `notification-digest/logic.ts` →
`morning-brief/render.ts`". Every relative import in that directory:

```
$ grep -rhn "from \"\|from '" supabase/functions/morning-brief/*.ts | grep -v "://"
25:} from "./compose.ts";
26:import { renderBriefEmailHtml } from "./render.ts";
27:import { sendCompliantEmail } from "../_shared/send-email.ts";
6:import type { BriefContent } from "./compose.ts";
7:import { renderBrandedShell, heading, muted } from "../_shared/branded-email.ts";
```

The `notification-digest/logic.ts` mention in `render.ts` is a comment on line 3,
not an import. Transitive closure of `_shared/studio-identity.ts` computed by
walking every relative import under `supabase/functions` = **19** function
directories; ∪ the five = **20**:

```
client-invite, commercial-document-notify, create-checkout-session,
decision-first-notice, decision-reminders, decision-resolved-notify,
expire-decisions, invoice-check-intent, invoice-reminders, invoice-send,
notification-digest, notification-dispatch, po-send, proposal-nudge,
proposal-sign-confirmation, quote-request-send, review-requests, spec-pdf,
stripe-webhook, trade-rfq-send
```

The 14 direct importers the notes list are exactly right
(`grep -rln "studio-identity.ts"`). An extra redeploy is harmless; the wrong
evidence in a build note is not.

### F7 · minor (confidence 0.8) — `'your studio'` reads wrong in the two places it can surface
Brief-mandated, and the implementer complied exactly — recording it for the copy
owner. Rendered: "Leah Brandt has sent you an invoice for **your studio**." The
studio is the designer's, not the homeowner's. It also reaches the designer's own
in-app line: `stripe-webhook:1739` → "your studio: partial refund of $450.00 on
INV-0031". S12 makes `title` required, so the fallback should only fire on a
malformed row — but "the studio" or dropping the trailing clause reads true in
both directions.

### F8 · minor (confidence 0.7) — `create-checkout-session` now also passes `designerId`, which changes brand resolution for some project invoices
Was `resolveStudioIdentity(admin, { projectId })`; is now
`{ projectId, designerId, studioId }` (`index.ts:270-274`). In the RPC,
`p_designer_id` wins as the fallback owner
(`00320:47-51`, `COALESCE(v_designer, p.designer_id)`). For a project with
`studio_id IS NULL` whose `designer_id` differs from `invoice.designer_id` (a
studio co-member drawing on a colleague's project), the letterhead now resolves
off the invoice's designer's primary studio instead of the project designer's.
On-brief ("keep passing the others") and arguably more correct, but nothing pins
it; a SQL test in the db lane's suite would.

### F9 · minor / advisory (confidence 0.95) — the plan's `stripe-rail.test.ts` null-project case is not in W1 yet
Plan §"Edge functions"/Wave-1 item 8 and blast radius §8 both name it. The lane
deferred it with cause: the harness runs against a live local stack and
`supabase functions serve` (`_tests/stripe-rail.test.ts:1-17`), and this lane is
barred from stack commands. Correct call — but W1 does not close on its stated
gate until the db or integration lane picks it up.

### F10 · nit (confidence 0.95) — `invoice-check-intent` got no `resolveStudioIdentity` call
Brief item 2 says all five resolve branding. It doesn't, and shouldn't: its only
letter is `buildCheckIntentEmail`, addressed to the designer, and
`CheckIntentEmailParams` carries no `studioName`/`studioLogoUrl` — the call would
be dead code. Everything else of item 2 (type, `title` in the select, display
name, nullable metadata `project_id`) is applied there. Recorded so the
orchestrator can confirm the brief's intent rather than the brief's letter.

---

## Checked and clean

- `grep -n "your project"` over the five → 0 hits; the eight remaining in
  `supabase/functions` are all project-bound surfaces, as the notes state.
- Row types: `project: {…} | null` in all five; `project_id`, `studio_id`,
  `title` all `| null`.
- Every `notification_log` / `notify_client_attention` `project_id` is inside a
  jsonb `metadata` object (`invoice-send:304,346`; `invoice-reminders:207,242,374,427,449`;
  `stripe-webhook:456,485,549,571,1705,1733`; `invoice-check-intent:225,265`) —
  null is safe; `AttentionInput.metadata` is `Record<string, unknown>`
  (`_shared/client-attention.ts:25`).
- Recipient resolution is `invoice.client_id` first in both `invoice-send:205`
  and `invoice-reminders:132`; the CHECK guarantees a studio invoice carries one.
- Payer check untouched: `caller.id === (invoice.client_id ?? invoice.project?.client_id)`
  (`create-checkout-session:238`).
- Stripe product/line name: `invoice.project?.name ?? invoice.title ?? 'Studio invoice'`
  (`:277`) — matches the brief exactly.
- All three stripe-webhook email sites carry the new name and the studio-anchored
  co-brand: receipt `:405/429`, failed `:511/523`, refund `:1671` (designer-facing,
  correctly no co-brand).
- Money rules: no status write, no cents arithmetic, no rollup touched anywhere in
  this diff. Nothing rebased onto a stale function body — no SQL in this lane.
- Homeowner refusals in the strings this lane authored: no badge, chip, red/green,
  checkmark, shadow, tab, dashboard, emoji, "AI", "gate", "task" or "overdue"
  (the two `overdue` hits, `_shared/invoice-emails.ts:366,372`, are the
  designer-addressed A/R escalation and pre-existing).
- Commit hygiene: three commits, explicit pathspecs, Conventional subjects, no
  trailers, no `git add -A`, no `deno.lock`, working tree clean, nothing outside
  the worktree, no `.claude/`/`.env`/hook touches, no stack or prod command run.
