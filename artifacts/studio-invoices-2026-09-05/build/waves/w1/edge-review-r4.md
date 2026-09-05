# W1 EDGE — adversarial review, round 4

Reviewer: separate context, did not write this code. Worktree
`/Users/kody/Code/patina-merged/.codex/worktrees/agent-si-edge`
(`git rev-parse --show-toplevel` confirmed), branch `studio-invoices/w1-edge`,
diff `36b4b539e1f2cb732fb722d84edfe758d6b4008a..HEAD` (9 commits).

> **Path note.** The brief said to write this to `edge-review-r2.md`. That file
> already exists — written by the actual round-2 reviewer — and so do `-r1` and
> `-r3`. Overwriting it would destroy a prior round's evidence, so this review
> is `edge-review-r4.md`, the next file in the existing sequence.

## Verdict: **fix** — no blocker; two majors, one of which is a program gate,
not lane code.

---

## Gates, run by me

```
$ deno test --allow-all --config …/supabase/functions/deno.json …/supabase/functions/_shared/
ok | 200 passed | 0 failed (1s)

$ deno test --allow-all --config …/deno.json …/supabase/functions/create-checkout-session/
ok | 17 passed | 0 failed (20ms)

$ deno test --allow-all --config …/deno.json …/supabase/functions/stripe-webhook/
ok | 18 passed | 0 failed (20ms)

  invoice-send / invoice-reminders / invoice-check-intent: no test files
  (`ls … | grep -i test` → "(no test files)" for all three).

$ deno check --config …/deno.json <index.ts>
create-checkout-session    Check … exit=0
invoice-send               Check … exit=0
invoice-reminders          Check … exit=0
stripe-webhook             Check … exit=0
invoice-check-intent       Check … exit=0

  … and the fifteen other deploy-set functions, all OK:
  client-invite commercial-document-notify decision-first-notice
  decision-reminders decision-resolved-notify expire-decisions
  notification-digest notification-dispatch po-send proposal-nudge
  proposal-sign-confirmation quote-request-send review-requests spec-pdf
  trade-rfq-send

$ find . -name deno.lock -not -path "*/node_modules/*"   → nothing
$ git status --porcelain                                 → clean (only sandbox
                                                            EPERM lines on .env*)
```

## Deploy set — recomputed independently

Python walk of every *relative* import under `supabase/functions`, reversed:

```
_shared/studio-identity.ts        19  client-invite commercial-document-notify
                                      create-checkout-session decision-first-notice
                                      decision-reminders decision-resolved-notify
                                      expire-decisions invoice-reminders invoice-send
                                      notification-digest notification-dispatch po-send
                                      proposal-nudge proposal-sign-confirmation
                                      quote-request-send review-requests spec-pdf
                                      stripe-webhook trade-rfq-send
_shared/invoice-emails.ts          4  invoice-check-intent invoice-reminders
                                      invoice-send stripe-webhook
```

19 ∪ `invoice-check-intent` = **20**; the `invoice-emails` closure is a strict
subset. `morning-brief` is correctly out. Matches the notes' heading.

## The return address — asserted, not read

Rendered through the real helper:

```
base "https://client.patina.cloud"  project → …/projects/<uuid>?invoice=inv-1&checkout=success&session_id={CHECKOUT_SESSION_ID}#letterbox
                                             …/projects/<uuid>?invoice=inv-1&checkout=cancelled#letterbox
base "https://client.patina.cloud"  null    → …/?invoice=inv-1&checkout=success&session_id={CHECKOUT_SESSION_ID}#letterbox
                                             …/?invoice=inv-1&checkout=cancelled#letterbox
base "https://client.patina.cloud/" (trailing slash) → identical, no double slash
```

Byte-identical to the old project string, param order included; the studio leg
is exactly the address the brief names. `{CHECKOUT_SESSION_ID}` un-encoded, the
fragment last. Correct.

## Prior-round findings — verified

| id | state |
|---|---|
| F-A | **open, and wider than stated** — see R4-2 |
| F-B | **fixed** (notes §`_shared/studio-identity.ts` now says the fallback protects the other 14 importers and NOT the five; migration-first restated) |
| F-C | **open** — see R4-1, now proven by mutation |
| F-D | **half-fixed** — see R4-3 |
| F-E | open, deliberately (plan copy, not lane copy — see R4-5) |
| F-F | open, deliberately (see R4-6) |
| F-G | open, unassigned (see R4-7) |
| F-H | open, deliberately (see R4-4) |
| F-I | closed, correctly |
| F-J | **fixed** (the rule now reads "reverse transitive closure of the relative-import graph"; the `invoice-emails` closure is stated) |
| F-K | advisory, unchanged |

---

## R4-1 (major, 0.95) — the lane's three headline behaviors are mutation-blind

Two mutations against a full copy of `supabase/functions`, all gates re-run:

**Mutation A — delete the entire title fallback from all five.**
`perl -pi -e 's/ \?\? invoice\.title//g'` on the five `index.ts`:

```
_shared                  ok | 200 passed | 0 failed
create-checkout-session  ok |  17 passed | 0 failed
stripe-webhook           ok |  18 passed | 0 failed
deno check ×5            all OK
```

**Mutation B — delete `studioId: invoice.studio_id,` from all four resolver call
sites** (create-checkout-session, invoice-send, invoice-reminders,
stripe-webhook):

```
_shared                  ok | 200 passed | 0 failed
create-checkout-session  ok |  17 passed | 0 failed
stripe-webhook           ok |  18 passed | 0 failed
```

So the entire feature — the title becoming the display name, and branding by the
invoice's own studio — can be deleted from every one of the five functions
without a single red gate. The same is true of the return-address swap: nothing
asserts that `index.ts` calls `invoiceCheckoutReturnAddress` rather than
interpolating `/projects/${project_id}` again.

The `_shared` tests prove the *builders* render a string handed to them and the
*helper* mints an address; nothing proves the five hand them the right one. The
brief's SCOPE line requires "tests for every behavior you change". The cause is
structural — all five `index.ts` run `Deno.serve` at module load, so no test may
import them — and the fix is the seam the lane already used once for the URL: a
`_shared/invoice-subject.ts` exporting
`invoiceSubjectName({ project, title })`, imported by all five, with one test
asserting the three-step chain (name → title → fallback). That seam also gives
the studio-id argument object a place to be asserted.

The lane's own answer (edge-notes, "Left open") calls this "a refactor of five
files, not a trivial minor". It is five one-line import + one-line call changes.

## R4-2 (major, 0.9, program gate — not lane code) — pre-W3 a studio invoice cannot be *reached*, let alone receipted

F-A said the *return* page states nothing. It is wider: the **pay path itself
does not exist** before W3.

- Every letter the five functions send points at `${CLIENT_PORTAL_URL}/invoices/<id>`
  (`invoice-send:256`, `invoice-reminders:352`, `stripe-webhook:456/511`).
- `apps/client-portal/src/lib/retired-routes.ts:135-142` folds `/invoices/<id>`
  to `{ path: '/', anchor: 'letterbox', params: { invoice: <id> } }` — the same
  front door the new studio return address uses.
- The letterbox's rows are `useProjectInvoices(projectId)`
  (`threshold.tsx:272`), which is `.eq('project_id', projectId)`
  (`packages/supabase/src/hooks/use-invoices.ts:465`). A studio invoice has
  `project_id IS NULL` and is never in that list.
- A payer with no house at all renders `ProjectsEmptyState` and mounts no
  Letterbox (`apps/client-portal/src/app/page.tsx:61-69`).

So a homeowner who receives a studio invoice cannot open it, cannot press Pay,
and — if she pays by some other route — sees no receipt. The plan's ship order
(`:100`) still lists the edge functions before the client portal.

`edge-notes.md` step 2 and the `create-checkout-session` comment both name the
W3 dependency, but both frame it as "the studio return address is mute". The
stronger sentence belongs in the ship order: **until W3 lands
`useClientInvoices()` and the letterbox-only front door, nothing about a studio
invoice is reachable by its recipient — do not send one.** No lane code change.

## R4-3 (minor, 0.98) — the deploy set is stated as 20 and then as 21, four lines apart

```
$ grep -n "21 functions\|the same 21\|These 21" …/edge-notes.md
176:3. These 21 functions.
273:Deploy set is unchanged: the same 21 functions.
```

Line 176 is inside the **live** ship order, immediately under the heading
`## Deploy set — 20 functions`. F-D corrected the heading and the list and left
the ship-order line. (273 is inside the historical "Fix round 1" section; that
one is defensible as a record, 176 is not.)

## R4-4 (minor, 0.85) — brief item 2 is literally undelivered for `invoice-check-intent`, which selects a column nothing reads

The brief: "In each of the FIVE functions … resolve branding with
`resolveStudioIdentity({ projectId, designerId, studioId })`."

```
$ grep -n "studio" supabase/functions/invoice-check-intent/index.ts
65:  // NULL on a studio invoice …
67:  studio_id: string | null;
125:      id, designer_id, client_id, project_id, studio_id, title, …
170-172: projectName = invoice.project?.name ?? invoice.title ?? 'your studio'
```

No resolver call. The reasoning is sound — `buildCheckIntentEmail` is
designer-addressed and `CheckIntentEmailParams` carries no studio fields, so the
call would be dead code — and it is written down under "Left deliberately
undone". But the consequence is that `studio_id` is selected and typed in this
one function purely so the type matches its siblings. Either drop it from the
select and type, or keep it and let the orchestrator record that item 2 is
four-of-five by ruling.

## R4-5 (minor, 0.8) — "for your studio" tells the homeowner it is *her* studio

Rendered through the real builders with `projectName = 'your studio'` (title
null):

```
SENT     "Leah Brandt has sent you an invoice for your studio."
UPCOMING "…Leah Brandt's invoice for your studio is coming due."
OVERDUE  "Invoice INV-0031 from Leah Brandt for your studio is still open."
SECOND   "…invoice INV-0031 from Leah Brandt for your studio is still open…"
FINAL    "This is the final automated notice for invoice INV-0031 … for your studio…"
RECEIPT  "We received your payment of $450.00 toward invoice INV-0031 for your
          studio, billed by Leah Brandt."
```

"your studio" is the *homeowner's* possessive; the studio is the designer's.
The string is **plan-mandated** (`plan :70`: `projectName = invoice.project?.name
?? invoice.title ?? 'your studio'`), so this is a plan copy defect, not a lane
defect, and the reach is small: `00570:799-800` rejects a blank title on the
studio-invoice RPC, so the fallback fires only on a row minted outside it. Kody's
ruling to take or leave; "the studio" or dropping the trailing clause both read.

## R4-6 (minor, 0.92) — every studio-invoice client letter still carries a "Your project" footer link

Rendered prose, all six client letters:

```
… Patina  Your project  Email preferences  Patina
```

`_shared/branded-email.ts:221` is the standing `audience:'client'` footer.
`renderBrandedShell` already accepts `opts.footerLinks` (`:219`), and
`invoice-emails.ts`'s private `wrap()` (`:100-126`) does not thread it — a
one-file seam. The lane's test at `invoice-emails.test.ts` explicitly strips
`Your project</a>` before asserting "no rung invents a house", which is honest
about the exclusion but leaves the string in the homeowner's mail. W1 addendum.

## R4-7 (minor, 0.9) — the plan's own W1 gate is still unwritten and unowned

`plan :67` (DB item 10) and the W1 gate list at `plan :165` both require a
null-project case in `supabase/functions/_tests/stripe-rail.test.ts`. It is in no
lane's brief. The edge lane was right not to write it (that harness needs the
shared local stack, which this brief forbids). W1 does not close on its own
stated gate until the db or integration lane lands it.

## R4-8 (minor, 0.75) — two live homeowner strings on *project* invoices were rewritten with no ruling

Round 1's F1 fix edited `_shared/invoice-emails.ts`, which every existing
project invoice already uses:

```
overdue notice  "so the project can keep moving without interruption"
             →  "so the work can carry on without interruption"
final notice    "may pause work on the project"
             →  "may pause work already under way"
```

Both read correctly on a project invoice and the change is an improvement, but
it is a copy change to letters Patina is sending today, made inside a lane whose
SCOPE says "exactly the listed items". Flagging so the orchestrator rules rather
than discovers it in prod prose.

## R4-9 (nit, 0.35) — `commercial-document-notify` would stringify a null project

`commercial-document-notify/index.ts:308` — `projectId: String(invoiceRow.project_id)`
yields the literal `"null"` for a project-less invoice. Unreachable in practice:
deposit invoices are minted from commercial documents, which are project-bound,
and `create_draft_studio_invoice` sets no deposit link. Blast radius marked it
`(c)`. Listed only so a later change to how deposit invoices are drawn does not
inherit it silently.

## R4-10 (nit, 0.35) — Stripe line-item name length (F-K, unchanged)

`Invoice <number> — <project name | title | 'Studio invoice'> · <studio name>`.
`title` is capped at 200 (`00570:799-800`); `organizations.name` and
`projects.name` carry no CHECK, so the same overflow already exists on the
project path. Parity, not new exposure. Advisory.

---

## What is right, and was checked rather than assumed

- **The contract matches the db lane.** `00570_studio_invoices.sql:1222` is
  `resolve_studio_identity(p_project_id, p_designer_id, p_studio_id DEFAULT NULL)`,
  and `:1244-1247` short-circuits the project branch when `p_studio_id` is given.
  `:1220` DROPs the two-argument form, so no overload survives.
- **Naming `p_studio_id` on every call** is the right call and is asserted
  exactly (four `studio-identity.test.ts` cases assert the whole argument
  object, not just the count).
- **The PGRST202 retry** is correctly withheld from studio callers — the
  two-argument RPC answers with `_primary_studio_for(designer)`, the wrong
  letterhead for a two-studio designer.
- **Every `'your project'` / `'Patina project'` is gone from the five**
  (`grep` → "no hits in the five"), and the eight that remain elsewhere are on
  project-bound surfaces.
- **`notification_log` is JSONB metadata only** — `client-attention.ts:24-25,60`
  passes `p_metadata`, no `project_id` column is written anywhere in the five, so
  a null project cannot violate a constraint.
- **No money path touched**: no cents arithmetic, no status write, no
  `invoice_payments` change in the diff.
- **The payer check is unchanged** in both gated functions
  (`create-checkout-session:238`, `invoice-check-intent:144`) — `client_id`
  first, then `project?.client_id`.
- **M6 intent honoured**: the regarding line stands exactly where the house name
  stood, the letter carries the same one link, and the letterhead resolves from
  the invoice's own studio.
- **No `deno.lock`, clean tree, nothing pushed.**
