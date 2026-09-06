# W1 EDGE — adversarial review, round 2

Worktree `/Users/kody/Code/patina-merged/.codex/worktrees/agent-si-edge`
(`git rev-parse --show-toplevel` → `/Users/kody/Code/patina-merged/.codex/worktrees/agent-si-edge`),
branch `studio-invoices/w1-edge`, base `36b4b539e1f2cb732fb722d84edfe758d6b4008a`.

```
a2c65381b docs(edge): W1 edge lane fix round 1 — findings F1, F3, F4
c390cbd97 fix(edge): keep the studio-invoice reminder house-free and bind the identity RPC by name
9dbc4d22d docs(studio-invoices): W1 edge lane adversarial review, round 1
43ab78e9d docs(edge): W1 edge lane notes for studio invoices
a5bcefbf7 feat(edge): carry a studio invoice through the five invoice functions
f45bb8824 feat(edge): resolve studio brand by studio_id, not the designer's primary studio
```

**Verdict: fix** — no blocker, no lane-code defect. One major, and it is a
*program sequencing* item (W3), not a change to this lane's code. The lane's
four brief items are delivered; every gate is green; the round-1 majors are
genuinely fixed.

## Gates, re-run by the reviewer

```
deno test --allow-all --config .../supabase/functions/deno.json .../supabase/functions/_shared/
  ok | 200 passed | 0 failed (1s)
deno test ... .../supabase/functions/create-checkout-session/
  ok | 17 passed | 0 failed (22ms)
deno test ... .../supabase/functions/stripe-webhook/
  ok | 18 passed | 0 failed (24ms)
deno check .../create-checkout-session/index.ts   Check ...            (clean)
deno check .../invoice-send/index.ts              Check ...            (clean)
deno check .../invoice-reminders/index.ts         Check ...            (clean)
deno check .../stripe-webhook/index.ts            Check ...            (clean)
deno check .../invoice-check-intent/index.ts      Check ...            (clean)
deno check — also clean for all 16 other deploy-set candidates:
  client-invite · commercial-document-notify · decision-first-notice ·
  decision-reminders · decision-resolved-notify · expire-decisions ·
  notification-digest · notification-dispatch · po-send · proposal-nudge ·
  proposal-sign-confirmation · quote-request-send · review-requests · spec-pdf ·
  trade-rfq-send · morning-brief
find . -name deno.lock -not -path "./node_modules/*"   →  nothing
git status --porcelain                                  →  clean
```

`invoice-send`, `invoice-reminders`, `invoice-check-intent` have no test files
of their own (`ls .../<dir>/*.test.ts` → no matches).

## Round-1 findings — verified

| id | state | evidence |
|---|---|---|
| F1 major | **FIXED** | `grep -ni "project\|house\|home\b\|room" _shared/invoice-emails.ts` → one hit, a code comment at :476. Rendered all ten invoice letters with `projectName = "Design consultation · September"` via a throwaway deno script against the real builders: the only "project" left in any client-audience body is the shell footer link (F2). Overdue body now "so the work can carry on without interruption"; final notice "may pause work already under way". `grep -rn "so the project can keep moving"` and `"pause work on the project"` over the whole worktree → no hits, so no stale copy anywhere. |
| F3 major | **FIXED** | `edge-notes.md` "Ship order — **the migration goes first**" is now a numbered list naming each function's failure mode on a 42703 (`lookup_failed`, dead cron, silently skipped money letters), and the order-tolerance claim is scoped to the RPC argument change only. |
| F4 major | **FIXED** | `studio-identity.ts:52-72`: `p_studio_id` is named on **every** call (null when absent), so the call binds one signature by name; a `PGRST202` on a studio-less call retries once two-argument, a studio-carrying call does not. Four new tests assert the argument object exactly. The db lane's file confirms the overload never lands: `agent-si-db/supabase/migrations/00570_studio_invoices.sql:1167` `DROP FUNCTION IF EXISTS public.resolve_studio_identity(uuid, uuid);` before the three-argument `CREATE OR REPLACE` at :1169, REVOKE/GRANT re-issued on `(uuid, uuid, uuid)` at :1257-1258. The RPC body's precedence (`:1188-1206`) matches the TS doc comment: named studio → project → designer's primary. |
| F10 nit | **correct, no change** | `invoice-check-intent` still resolves no studio identity; its only letter is designer-addressed and `CheckIntentEmailParams` carries no studio fields. Every other part of item 2 is applied there (`:66-69, :125, :172, :225, :265`). |
| F2 minor | open | see R2-5 |
| F5 minor | open | see R2-3 |
| F6 minor | open | see R2-2 |
| F7 minor | open | see R2-6 |
| F8 minor | open | see R2-7 |
| F9 minor | open, correctly deferred | see R2-4 |

## Findings, round 2

### R2-1 (major, 0.9) — a paid studio invoice returns to a page that says nothing
`create-checkout-session/index.ts:299-311` now returns a studio payer to
`/?invoice=<id>&checkout=success#letterbox` — exactly what the brief ordered.
The page there does not speak to it:

- `apps/client-portal/src/app/page.tsx:37-42` resolves the named instrument's
  own house via `resolveHouseForInstrument(projectIds, { invoiceId })`; a studio
  invoice belongs to no project, so it falls through to the active house.
- `components/threshold/threshold.tsx:272` feeds the letterbox from
  `useProjectInvoices(projectId)`, which the plan (`:77`) confirms filters
  `.eq('project_id')` and never returns a studio invoice.
- `components/threshold/letterbox.tsx:138-141` —
  `returnedRow = invoices.find(row => row.id === returned.invoiceId) ?? null`,
  then `:142` `const settlement = returnedRow ? returned : null`, and the
  receipt paragraph at `:212` renders only `{settlement && …}`. No row → **no
  receipt banner, no cancellation notice**, silently.
- A homeowner with no house at all lands in `ProjectsEmptyState`
  (`page.tsx:61-69`) after paying.

Not a lane defect: the plan puts the client page in W3 and names the missing
piece (`useClientInvoices()`, plan `:77`). But the plan's own ship order
(`:100`) is *migration → edge fns → types → designer portal → client portal*,
which would open exactly this window.
**Fix:** program-level. Add to the W1→ship gate: these five functions must not
reach prod before the W3 client-page work that lists a studio invoice in the
letterbox. No change to this lane's code.

### R2-2 (minor, 0.95) — the deploy set is 20, not 21; `morning-brief` is still listed
Unfixed from F6. `edge-notes.md` still says "Deploy set — 21 functions" and
"Via `notification-digest/logic.ts` → `morning-brief/render.ts` (1):
`morning-brief`". I recomputed the transitive reverse-closure of
`_shared/studio-identity.ts` by walking every relative import under
`supabase/functions` (script, not grep): **19 function directories** —
client-invite, commercial-document-notify, create-checkout-session,
decision-first-notice, decision-reminders, decision-resolved-notify,
expire-decisions, invoice-reminders, invoice-send, notification-digest,
notification-dispatch, po-send, proposal-nudge, proposal-sign-confirmation,
quote-request-send, review-requests, spec-pdf, stripe-webhook, trade-rfq-send.
∪ `invoice-check-intent` = **20**. Every relative import in `morning-brief`:
`./compose.ts`, `./render.ts`, `../_shared/send-email.ts`,
`../_shared/branded-email.ts`; and `notification-digest/logic.ts`'s only
relative imports are `../_shared/branded-email.ts`,
`../_shared/decision-notify.ts`, `../_shared/client-portal-links.ts`. The
`notification-digest` mention in `morning-brief/render.ts:3` is a comment.
An extra redeploy is harmless; wrong evidence in a build note is not.
**Fix:** drop `morning-brief`, say 20.

### R2-3 (minor, 0.95) — the `?? title ??` chain inside the five is still untested
Unfixed from F5. `grep -rn "invoiceSubjectName"` → declared at
`stripe-webhook/index.ts:353` and `invoice-reminders/index.ts:116`, both
module-private, both unexported, zero test references. The inline forms at
`invoice-send:254`, `invoice-check-intent:172` and
`create-checkout-session:277` have no seam either. The three tests added to
`_shared/invoice-emails.test.ts` prove only that the builders render whatever
string they are handed. `stripe-webhook/invoice-checkout-integrity.test.ts`
exists and was not extended (18 passed, unchanged from baseline). By
construction: delete `?? invoice.title` from any of the five and all 235 tests
plus five `deno check`s still pass. Brief item 4 is met for items 1 and 3, not
for item 2.
**Fix:** export one `invoiceSubjectName(row)` (or lift it to `_shared`) and
assert the three-step chain once.

### R2-4 (minor, 0.95) — `_tests/stripe-rail.test.ts` null-project case still absent
Unfixed from F9, and correctly so: that harness serves the LOCAL functions
against the shared local stack (`stripe-rail.test.ts:1-17`), which this brief
forbids. Plan Wave-1 item 8 and blast radius §8 both name it.
**Fix:** assign to the db or integration lane. W1 does not close on its stated
gate until it lands.

### R2-5 (minor, 0.9) — the "Your project" footer, and the stated reason to leave it
`_shared/branded-email.ts:221` `{ label: "Your project", href: base }` is the
standing `audience: "client"` footer, so it renders under the sent letter, all
four reminder rungs, the receipt and the failed-payment notice — confirmed in
the rendered prose of all six (`… Patina Your project Email preferences Patina`).
The lane's justification (edge-notes, F1 section) is that changing it is "a
repo-wide copy change". That overstates it: `renderBrandedShell` already takes
a per-call `opts.footerLinks` override (`branded-email.ts:219`), so a
studio-invoice letter can carry a house-free footer without touching any other
function. Threading it would mean adding the option to `invoice-emails.ts`'s
private `wrap()` (`:100-126`), which does not pass it today.
Still outside this lane's listed scope.
**Fix:** copy owner or a W1 addendum; the seam is `opts.footerLinks`, not a
global relabel.

### R2-6 (minor, 0.9) — `'your studio'` reads wrong in both directions
Unfixed from F7, and brief-mandated, so not a lane defect. Rendered:
"Leah Brandt has sent you an invoice for your studio." — the studio is the
designer's, not the homeowner's. It also reaches the designer's own in-app line,
`stripe-webhook/index.ts:1739`: `"your studio: partial refund of $450.00 on
INV-0031 — reconcile in Stripe (balance unchanged)."` S12 makes `title`
required (`00570:746-747` rejects a blank title and caps it at 200 chars), so
the fallback only fires on a malformed row.
**Fix:** "the studio", or drop the trailing clause. Copy owner's ruling.

### R2-7 (nit, 0.8) — `create-checkout-session` now also passes `designerId`, unpinned
Unfixed from F8. `index.ts:270-274` was `{ projectId }`, is now
`{ projectId, designerId, studioId }`. In the new RPC body
(`00570:1196-1201`) `SELECT p.studio_id, COALESCE(v_designer, p.designer_id)`
keeps the *invoice's* designer, so for a project with `studio_id IS NULL` whose
`designer_id` differs from `invoice.designer_id`, the resolved brand changes.
Blast radius here is one string: the Stripe line-item suffix
`` ` · ${identity.name}` `` (`:275`). On-brief ("keep passing the others") and
consistent with what `invoice-send`/`invoice-reminders` already did.
**Fix:** a SQL test in the db lane asserting a project invoice brands
identically before and after.

### R2-8 (nit, 0.35) — Stripe line-item name length
`index.ts:274-277` builds `Invoice <number> — <project name | title | 'Studio
invoice'> · <studio name>`. `title` is capped at 200 chars
(`00570:746-747`); `organizations.name` has no cap
(`grep -rn "CHECK (char_length" supabase/migrations/*.sql | grep -i
"project\|organization"` → no name constraints), so a long title plus a long org
name can exceed Stripe's product-name limit and 400 the checkout. **Pre-existing
and identical on the project path** — `projects.name` is uncapped too — so this
is parity, not new exposure. Advisory only.

### R2-9 (nit, 0.9) — the deploy-set rule in the notes no longer covers every `_shared` edit
Round 1's F1 fix edited `_shared/invoice-emails.ts`, a second shared module, but
`edge-notes.md` still derives the deploy set solely from
`_shared/studio-identity.ts` ∪ the five. Harmless here — I computed the reverse
closure of `_shared/invoice-emails.ts` and it is `{invoice-check-intent,
invoice-reminders, invoice-send, stripe-webhook}`, a strict subset of the five —
so the set is unchanged. Worth one clause in the note so a later `_shared` edit
is not derived from the stale rule.
