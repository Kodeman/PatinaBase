# W1 EDGE — studio invoices, the edge-function half

Worktree `/Users/kody/Code/patina-merged/.codex/worktrees/agent-si-edge`, branch
`studio-invoices/w1-edge`, base `36b4b539e1f2cb732fb722d84edfe758d6b4008a`.

Contract built against (db lane, in parallel): `invoices` gains a nullable
`project_id` and a text `title`; `resolve_studio_identity` becomes
`(p_project_id uuid, p_designer_id uuid, p_studio_id uuid DEFAULT NULL)` and
resolves directly by org when `p_studio_id` is given.

## What changed

### `_shared/studio-identity.ts`
`resolveStudioIdentity(admin, { projectId?, designerId?, studioId? })`. **Every**
call names `p_studio_id`, null included (see Fix round 1 — F4):

```ts
const args = { p_project_id: projectId, p_designer_id: designerId, p_studio_id: studioId };
```

PostgREST resolves an RPC by the argument names it is sent. Naming all three
binds exactly one signature; a two-argument call would match BOTH the pre-00570
function and the new three-argument one if a deploy ever left them side by side,
and Postgres answers that with 42725 — which this wrapper swallows as "no
brand", i.e. silent letterhead loss. A `PGRST202` ("no such function") answer to
a call that carries **no** studio falls back once to the two-argument form; a
call that *does* carry a studio does not retry, because the two-argument RPC
would answer with the designer's primary studio — the wrong letterhead.
`studioId` alone is now anchor enough (previously `!projectId && !designerId`
returned null).

⚠ That fallback protects the **other 14 importers** (they reach the RPC through
`resolveStudioSignature(admin, { designerId?, projectId? })`, which names no
studio) — it does **not** protect the five invoice functions. All five pass
`studioId: invoice.studio_id`, and that column is never null on any row the
schema can produce (`set_invoice_studio_id` raises
`studio_id_not_designer_studio` on a null, `00511_public_sd_hardening.sql:2861`;
00513's studioless index says "Currently unreachable in practice"). So the five
lose co-branding — on project invoices too — if they land ahead of the
migration. Migration first, per the ship order below; the `title` column makes
that mandatory anyway.

### The five functions
Same three moves in each — `create-checkout-session`, `invoice-send`,
`invoice-reminders`, `stripe-webhook`, `invoice-check-intent`:

1. The invoice row type is honest: `project_id: string | null`, plus
   `studio_id: string | null` and `title: string | null`, and `studio_id, title`
   added to the `select`. The `project:projects!invoices_project_id_fkey(...)`
   embed was already a left embed, so `project: null` was always safe at
   runtime; only the local TS type lied.
2. One display-name derivation per file —
   `invoice.project?.name ?? invoice.title ?? 'your studio'`. Where a file names
   it more than once (`invoice-reminders` twice, `stripe-webhook` three times)
   the derivation is a module-level `invoiceSubjectName(invoice)` and both/all
   call sites go through it. Every `'your project'` fallback in these five files
   is gone — `grep -rn "your project" supabase/functions/{create-checkout-session,
   invoice-send,invoice-reminders,stripe-webhook,invoice-check-intent}` → no
   hits. (Eight remain elsewhere in `supabase/functions`, all on project-bound
   surfaces: proposal-sign-confirmation, commercial-document-notify/core.ts ×2,
   comms-notification-dispatch, sms-inbound/pipeline.ts,
   notification-dispatch, comms-mute, _shared/sms.ts.)
3. Branding resolves by the invoice's own studio:
   `resolveStudioIdentity(admin, { projectId: invoice.project_id, designerId:
   invoice.designer_id, studioId: invoice.studio_id })` — a studio invoice has no
   project to read the letterhead from, and `_primary_studio_for(designer)` is
   the wrong name for a two-studio designer.

`notification_log` metadata `project_id` is now null on a studio invoice
(`invoice-send`, `invoice-reminders`, `stripe-webhook`, `invoice-check-intent`);
`notifyClientAttention` already typed it optional.

### `create-checkout-session` — the return address
The success/cancel URLs were interpolated `/projects/${invoice.project_id}?…`.
They now come from a pure helper in `invoice-checkout-core.ts` (the file that
already owns `invoiceCheckoutReturnUrl`, and the one with a test seam):

```ts
export function invoiceCheckoutReturnAddress(
  clientPortalUrl, projectId, invoiceId, checkout: 'success' | 'cancelled'
): string
```

It calls the null-tolerant `clientProjectLink(base, projectId, 'letterbox',
{ invoice, checkout })`, then splices `session_id={CHECKOUT_SESSION_ID}` on the
success leg **after** the params are encoded and **before** the fragment.
That splice is load-bearing: Stripe substitutes its template by literal match,
and `clientProjectLink` would have percent-encoded the braces to
`%7BCHECKOUT_SESSION_ID%7D`, which Stripe hands to the client verbatim.

Addresses produced (project-bound is byte-identical to the old string):

- `…/projects/<pid>?invoice=<id>&checkout=success&session_id={CHECKOUT_SESSION_ID}#letterbox`
- `…/projects/<pid>?invoice=<id>&checkout=cancelled#letterbox`
- `…/?invoice=<id>&checkout=success&session_id={CHECKOUT_SESSION_ID}#letterbox`
- `…/?invoice=<id>&checkout=cancelled#letterbox`

The Stripe product/line name falls back the same way the letters do:
`invoice.project?.name ?? invoice.title ?? 'Studio invoice'`. The payer check is
untouched — `invoice.client_id` first, then `invoice.project?.client_id`.

## Tests added

- `_shared/studio-identity.test.ts` (+4, revised in Fix round 1): the RPC
  argument object is asserted exactly — `p_studio_id` named on every call,
  carrying the studio or null; studio alone resolves; no anchor at all → null
  and the RPC is never called.
- `_shared/invoice-emails.test.ts` (+3): the title reads where the house name
  reads, in the sent letter's subject and the reminder ladder's subjects; a
  title carrying markup is escaped, never rendered.
- `create-checkout-session/invoice-checkout-core.test.ts` (+3): the project
  invoice returns to its own house, the studio invoice returns to the front
  door, and `{CHECKOUT_SESSION_ID}` reaches Stripe un-encoded with the fragment
  still last.

## Gates

```
deno test --allow-all --config …/supabase/functions/deno.json …/supabase/functions/_shared/
  ok | 197 passed | 0 failed        (baseline before this work: 190)
deno test … …/supabase/functions/create-checkout-session/
  ok | 17 passed | 0 failed         (baseline: 14)
deno test … …/supabase/functions/stripe-webhook/
  ok | 18 passed | 0 failed         (baseline: 18)
deno check --config …/deno.json <index.ts>   — clean for all 20 deploy-set functions
```

`invoice-send`, `invoice-reminders` and `invoice-check-intent` have no test
files of their own; they are covered by `deno check` and by the `_shared`
suites their letters and identity resolution come from. No `deno.lock` was
created (`find . -name deno.lock` → nothing).

## Deploy set — 20 functions

Every directory importing `_shared/studio-identity.ts` transitively, ∪ the five.
A `_shared/*` edit requires redeploying EVERY importer. (Round 1 said 21 and
named `morning-brief`; see Fix round 2 / F-D — it is not an importer.)

Direct importers (14): `client-invite`, `commercial-document-notify`,
`create-checkout-session`, `invoice-reminders`, `invoice-send`,
`notification-dispatch`, `po-send`, `proposal-nudge`,
`proposal-sign-confirmation`, `quote-request-send`, `review-requests`,
`spec-pdf`, `stripe-webhook`, `trade-rfq-send`.

Via `_shared/decision-notify.ts` and `_shared/project-approval-notification.ts`
(5): `decision-first-notice`, `decision-reminders`, `decision-resolved-notify`,
`expire-decisions`, `notification-digest`.

Plus `invoice-check-intent` (edited here; not an importer of studio-identity).

14 + 5 + 1 = 20. The list is the reverse transitive closure of every *relative*
import under `supabase/functions`, recomputed by walking the import graph rather
than by text-grepping module names — `morning-brief` mentions
`notification-digest` only in a comment (`morning-brief/render.ts:3`) and does
not belong.

Ship order — **the migration goes first**:

1. `00570_studio_invoices.sql` (db lane). All five functions now `select` the
   `title` column; against a database without it PostgREST answers `42703` and
   the function fails closed — `invoice-send` and `create-checkout-session`
   return 500 `lookup_failed` (nobody can pay), `invoice-reminders` dies on the
   scan, and `stripe-webhook`'s `loadInvoiceJoined` returns null, which SKIPS
   the receipt, failed-payment and refund letters SILENTLY while the money
   still settles.
2. The client portal — and for a studio invoice that means the **W3** client
   page, not merely the currently-deployed one. See Fix round 2 / F-A: the
   letterbox reads its rows from `useProjectInvoices(projectId)`
   (`use-invoices.ts:465`, `.eq('project_id', projectId)`), which can never
   return a studio invoice, so `settlement` stays null
   (`letterbox.tsx:139-141`) and a payer with no house at all lands in
   `ProjectsEmptyState` with no Letterbox mounted at all
   (`app/page.tsx:61-69`). Until W3's `useClientInvoices()` and letterbox-only
   front door land, a paid studio invoice returns to a page that states nothing
   about the payment.
3. These 20 functions.

(The RPC argument change alone is order-tolerant — see the `studio-identity`
section — but the `title` column is not, so the order above is the one to
follow.)

## Left deliberately undone

- **No `resolveStudioIdentity` call added to `invoice-check-intent`.** Its only
  letter is `buildCheckIntentEmail`, addressed to the designer;
  `CheckIntentEmailParams` carries no `studioName`/`studioLogoUrl`, so a resolver
  call there would be dead code. Everything else in the brief (type, `title` in
  the select, display-name fallback, nullable metadata `project_id`) is applied.
- **`_tests/stripe-rail.test.ts` null-project case** — that suite runs against a
  live local stack, which the db lane owns; the case belongs with the migration
  it proves.


---

## Fix round 1 (adversarial review, round 1)

Three findings, all addressed. Gates re-run below.

### F1 (major) — the studio-invoice reminder body told the reader about a project
`_shared/invoice-emails.ts`. Two client-audience prose clauses in the reminder
ladder invented a house that a studio invoice does not have:

- `buildInvoiceOverdueNoticeEmail` (:253) — "so the project can keep moving
  without interruption" → "so **the work** can carry on without interruption".
- `buildInvoiceFinalNoticeEmail` (:324) — the same defect one rung down, found
  by the grep the finding implies: "may pause work **on the project**" → "may
  pause work **already under way**".

Both read the same on a project invoice; neither names a house now. Pinned by a
new null-project case in `_shared/invoice-emails.test.ts`: all four
client-audience rungs are built with `projectName = "Design consultation ·
September"` and asserted to contain no "project" anywhere in subject or body.

One exclusion, deliberate and stated in the test: `renderBrandedShell`'s client
footer carries a **"Your project"** nav link (`_shared/branded-email.ts:221`) on
every letter Patina sends a homeowner. It is shell chrome shared by ~20
functions, not this letter's prose; changing its label is a repo-wide copy
change no ruling covers. Logged as an advisory, not fixed here.

### F3 (major) — the ship-order note read as if the five functions were order-free
`edge-notes.md` only. The "Ship order note" paragraph is now a numbered list
with the migration at #1 and the exact failure mode of each function if it lands
first (42703 → `lookup_failed` / dead cron / silently skipped money letters).
The order-tolerance claim is now scoped explicitly to the RPC argument change.

### F4 (major) — a two-argument RPC call is ambiguous if an overload survives
`_shared/studio-identity.ts`. Took the finding's option (b): `p_studio_id` is
now named on **every** call (null when the caller has none), so the call binds
one signature by name and 42725 is unreachable.

Evidence that the overload risk is real-but-not-taken by the db lane: their
`00570_studio_invoices.sql:1167` is `DROP FUNCTION IF EXISTS
public.resolve_studio_identity(uuid, uuid);` before the three-argument
`CREATE OR REPLACE` at :1169, with REVOKE/GRANT re-issued on `(uuid, uuid,
uuid)` at :1257-1258. So exactly one row survives in `pg_proc` — but this call
no longer depends on that holding.

The deploy-window property the conditional form bought is kept explicitly: a
`PGRST202` error on a **studio-less** call retries once with the two-argument
argument object. A call carrying a studio does not retry (the old RPC would
answer with the designer's primary studio — the wrong letterhead for a
two-studio designer; no brand beats the wrong brand).

Tests, `_shared/studio-identity.test.ts`:
- "no studio given → `p_studio_id` is still named, null" (was: "the
  two-argument call is unchanged") — the argument object is asserted exactly.
- "studio alone is anchor enough" now asserts the argument object exactly too,
  not just the call count.
- NEW "a project caller still brands against the pre-00570 RPC" — both calls
  asserted in order, second one two-argument, identity resolved.
- NEW "a studio caller does NOT retry two-argument" — one call, `null` back.

### Gates, re-run

```
deno test --allow-all --config …/supabase/functions/deno.json …/supabase/functions/_shared/
  ok | 200 passed | 0 failed   (round-1 baseline: 197; +3 = 1 email + 2 identity)
deno test … …/supabase/functions/create-checkout-session/
  ok | 17 passed | 0 failed
deno test … …/supabase/functions/stripe-webhook/
  ok | 18 passed | 0 failed
deno check --config …/deno.json <index.ts> — clean for all five:
  create-checkout-session · invoice-send · invoice-reminders · stripe-webhook ·
  invoice-check-intent
deno check — also clean for the ten other direct importers of studio-identity.ts:
  client-invite · commercial-document-notify · notification-dispatch · po-send ·
  proposal-nudge · proposal-sign-confirmation · quote-request-send ·
  review-requests · spec-pdf · trade-rfq-send
find . -name deno.lock -not -path "./node_modules/*"  →  nothing
```

Deploy set is unchanged: the same 21 functions. (Round-1 record; the
count was wrong — it is 20. See Fix round 2 / F-D.)

---

## Fix round 2 (adversarial review, round 3)

The orchestrator's brief calls this "Fix round 1"; a section by that name
already exists above, written against review round 1. This one answers
`edge-review-r3.md`. One major (F-A) plus the minors whose fix was a false or
stale sentence in this file. Gates re-run at the bottom.

### F-A (major) — a paid studio invoice returns to a page that says nothing

**Not lane code; the fix is a ship gate, and the gate is now written down in
both places a shipper looks.** Re-verified independently in this worktree:

- `packages/supabase/src/hooks/use-invoices.ts:465` — `.eq('project_id', projectId)`.
  A studio invoice has `project_id IS NULL`, so `useProjectInvoices(projectId)`
  can never return one.
- `apps/client-portal/src/components/threshold/threshold.tsx:272` — the
  letterbox's rows are exactly that query.
- `apps/client-portal/src/components/threshold/letterbox.tsx:139-141` —
  `invoices.find((row) => row.id === returned.invoiceId) ?? null`; no row, so
  `settlement` is null and no receipt or cancellation line renders.
- `apps/client-portal/src/app/page.tsx:61-69` — a payer with no house at all
  gets `ProjectsEmptyState`, which mounts no `Letterbox`.

The plan's own ship order (`:100`) puts the edge functions before the client
portal, which opens exactly this window. Recorded as:

1. **Ship order step 2 above**, rewritten to say the client portal that matters
   for the studio leg is the **W3** one (`useClientInvoices()` + the
   letterbox-only front door), not the currently-deployed one.
2. **The code that mints the address.** `create-checkout-session/index.ts`
   already carried a `⚠ DEPLOY ORDER` comment for the 2026-09-04 version of
   this hazard; it now also names the studio leg's stricter requirement, at the
   two lines that build the return URLs. A comment is the only lane-side change
   this finding takes — the constraint is a deploy ordering the code cannot
   express.

No behavior changed. This finding does not close inside W1; it closes when W3
lands.

### F-D (minor) — the deploy set is 20, not 21

Confirmed by recomputing the reverse transitive closure of
`_shared/studio-identity.ts` over every relative import under
`supabase/functions` (graph walk, not a text grep):

```
client-invite  commercial-document-notify  create-checkout-session
decision-first-notice  decision-reminders  decision-resolved-notify
expire-decisions  invoice-reminders  invoice-send  notification-digest
notification-dispatch  po-send  proposal-nudge  proposal-sign-confirmation
quote-request-send  review-requests  spec-pdf  stripe-webhook  trade-rfq-send
count 19
```

∪ `invoice-check-intent` = **20**. `morning-brief` is out:
`grep -rn "notification-digest" morning-brief/` → one hit, a comment at
`morning-brief/render.ts:3`. The deploy-set section is corrected, and the rule
it states is now "reverse transitive closure of the relative-import graph", not
a module-name grep.

### F-B (minor) — the PGRST202 fallback cannot fire for the five

The round-1 claim *"a project-bound letter still brands if the function lands
ahead of the migration"* was **false for the five**: they all pass
`studioId: invoice.studio_id`, and the retry is guarded by `!studioId`
(`studio-identity.ts:62-69`). `invoices.studio_id` is never null on a
schema-produced row — `set_invoice_studio_id` raises
`studio_id_not_designer_studio` when `NEW.studio_id IS NULL`
(`00511_public_sd_hardening.sql:2861-2867`) and 00513's studioless index carries
"Currently unreachable in practice" (`:43-44`). The clause is corrected in the
`_shared/studio-identity.ts` section: the fallback protects the other 14
importers (which reach the RPC via `resolveStudioSignature`, naming no studio)
and not the five. No code change — the `&& !studioId` guard is still right (the
two-argument RPC answers with the designer's *primary* studio, the wrong
letterhead for a two-studio designer; no brand beats the wrong brand), and the
migration-first order is already mandatory because all five `select` `title`.

### F-J (nit) — the deploy-set rule derived from one shared module

Round 1 also edited `_shared/invoice-emails.ts`. Its reverse closure is
`{invoice-check-intent, invoice-reminders, invoice-send, stripe-webhook}` — a
strict subset of the 20, so the set is unchanged. Stated here so a later
`_shared` edit re-derives rather than inherits.

### F-I (nit) — r2's R2-7 is unreachable; closed

Agreed and closed, on the reviewer's own evidence: `set_invoice_studio_id`'s
INSERT arm requires `project.studio_id = NEW.studio_id` **and**
`project.designer_id = NEW.designer_id` (`00511:2851-2854`), and `p_studio_id`
short-circuits the project branch in the new RPC (`00570:1191-1194`). Same org
resolves before and after.

### Left open, deliberately

- **F-C** (minor) — the `?? title ??` chain is untested inside the five.
  Exporting `invoiceSubjectName` from `stripe-webhook` and `invoice-reminders`
  and lifting the three inline forms out of `invoice-send`,
  `invoice-check-intent` and `create-checkout-session` is a refactor of five
  files, not a trivial minor; those three have no test file because their
  `index.ts` runs `Deno.serve` at module load. Wants its own item.
- **F-E** (minor) — `'your studio'` reads oddly to a homeowner. Brief-mandated
  string; a copy ruling, not a lane defect.
- **F-F** (minor) — `branded-email.ts:221`'s "Your project" client footer under
  a studio letter. Shared shell chrome for ~20 functions; threading
  `footerLinks` through `invoice-emails.ts`'s private `wrap()` is a W1 addendum.
- **F-G** (minor) — the plan's `_tests/stripe-rail.test.ts` null-project case.
  Runs against the shared local stack, which this brief forbids; belongs to the
  db or integration lane.
- **F-H** (nit) — `invoice-check-intent` selects and types `studio_id` and never
  reads it (`:67`, `:125`). Harmless; left rather than touch a select for
  cosmetics.
- **F-K** (nit) — Stripe line-item name length. Identical exposure on the
  project path; parity, not new.

### Gates, re-run

```
$ deno test --allow-all --config …/supabase/functions/deno.json …/supabase/functions/_shared/
ok | 200 passed | 0 failed (5s)

$ deno test … …/supabase/functions/create-checkout-session/
ok | 17 passed | 0 failed (139ms)

$ deno test … …/supabase/functions/stripe-webhook/
ok | 18 passed | 0 failed (113ms)
```

`invoice-send`, `invoice-reminders`, `invoice-check-intent` still have no test
files of their own (`ls …/*test*` → no matches).

`deno check --config …/deno.json <index.ts>` — OK for all 20 of the deploy set:

```
create-checkout-session OK   invoice-send OK   invoice-reminders OK
stripe-webhook OK            invoice-check-intent OK
client-invite OK             commercial-document-notify OK
decision-first-notice OK     decision-reminders OK
decision-resolved-notify OK  expire-decisions OK
notification-digest OK       notification-dispatch OK
po-send OK                   proposal-nudge OK
proposal-sign-confirmation OK quote-request-send OK
review-requests OK           spec-pdf OK   trade-rfq-send OK
```

```
$ find . -name deno.lock -not -path "*/node_modules/*"   → nothing
```


---

## Fix round 3 — this fixer's round 2 (adversarial review, round 4)

Two findings, both addressed. (Heading numbered 3 because the file already
carries a "Fix round 2"; this is the pass answering review round 4.)

### R4-1 (major) — the three headline behaviours were mutation-blind
The review deleted `?? invoice.title` from all five `index.ts`, and deleted
`studioId: invoice.studio_id,` from all four resolver call sites, and every gate
stayed green either way. Cause is structural: all five run `Deno.serve` at
module load, so no test may import them, and nothing written inside one of those
files is reachable by an assertion. This also closes **F-C**, which round 2 left
open as "a refactor of five files" — through a shared seam it is a one-line
import and a one-line call per file.

`_shared/invoice-subject.ts` (new, two pure exports):

```ts
invoiceSubjectName(invoice, fallback = 'your studio')  // project.name → title → fallback
invoiceBrandingRef(invoice)  // { projectId, designerId, studioId } for resolveStudioIdentity
```

Call sites now:

- `create-checkout-session:271,274` — `resolveStudioIdentity(admin,
  invoiceBrandingRef(invoice))`, and `invoiceSubjectName(invoice, 'Studio
  invoice')` for the Stripe line item (the only caller with a different last
  rung).
- `invoice-send:246,249` · `invoice-reminders:180,321,335` ·
  `stripe-webhook:397,420,499,510,1655` · `invoice-check-intent:171`.
- The two per-file `function invoiceSubjectName(...)` copies
  (`invoice-reminders`, `stripe-webhook`) are deleted; every call site in those
  files goes through the shared one.
- Behaviour is unchanged: the `??` chain is copied verbatim (a blank title still
  out-ranks the fallback, exactly as before), and `invoiceBrandingRef` coerces an
  absent anchor to `null`, which is what the wrapper already did.

```
$ grep -rn "invoice.title\|invoice.project?.name" <the five>/index.ts   → no hits
```

Tests — `_shared/invoice-subject.test.ts` (new, 11 cases). Five pin the display
chain (house > title > `'your studio'`; the `'Studio invoice'` fallback is the
last rung only; a missing embed reads as a null one); three pin the branding
anchors (studio-only, all three, absent → null); three read the five `index.ts`
**as source** — the only assertion that can reach a `Deno.serve` module — to pin
that each still routes through the seam, that every `resolveStudioIdentity(`
call in the four branding senders passes `invoiceBrandingRef(invoice)`, and that
checkout still returns through `invoiceCheckoutReturnAddress` and interpolates
no `/projects/${…}`.

Mutation evidence — the review's own mutations re-run against the fix, each on a
fresh copy of `supabase/functions` in `$TMPDIR`, `_shared` suite:

```
A  perl -pi -e 's/ \?\? invoice\.title//g' _shared/invoice-subject.ts */index.ts
   FAILED | 208 passed | 3 failed        (before this fix: ok | 200 passed | 0 failed)
B  studioId: invoice.studio_id ?? null,  →  studioId: null,
   FAILED | 209 passed | 2 failed        (before: ok | 200 passed | 0 failed)
C  re-inline the chain in invoice-send/index.ts
   FAILED | 210 passed | 1 failed
D  successUrl: invoiceCheckoutReturnAddress(  →  successUrl: legacyUrl(
   FAILED | 210 passed | 1 failed
```

### R4-2 (major) — the ship gate was stated too weakly
Program gate; the only code change is the comment that stated it wrongly.

**The gate, restated: until W3 lands `useClientInvoices()` and the
letterbox-only front door, a studio invoice is unreachable by its recipient —
do not send one.** Not "no receipt on return": the recipient cannot open the
invoice or reach a Pay control at all, so `create-checkout-session` is never
called for one in the first place — the return address is the *last* thing that
would be wrong.

The chain, as the review traced it: all five functions point letters at
`${CLIENT_PORTAL_URL}/invoices/<id>`; `apps/client-portal/src/lib/
retired-routes.ts:135-142` folds that to `{ path: '/', anchor: 'letterbox',
params: { invoice } }` — the same front door the new return address uses; the
letterbox's rows come from `useProjectInvoices(projectId)`
(`threshold.tsx:272`), which is `.eq('project_id', projectId)`
(`packages/supabase/src/hooks/use-invoices.ts:465`), so a `project_id IS NULL`
row is never in the list and `letterbox.tsx:139-141` leaves settlement null; and
a payer with no house at all renders `ProjectsEmptyState` and mounts no
Letterbox (`app/page.tsx:61-69`).

`create-checkout-session/index.ts`'s ⚠ DEPLOY ORDER block now says exactly that,
in place of the old "the studio return address is mute" framing. The numbered
ship order is unchanged and still correct — migration → client portal (now
specifically the **W3** portal) → the 20 functions — with sending a studio
invoice gated on W3 separately from deploying them.

### Gates, re-run

```
$ deno test --allow-all --config …/supabase/functions/deno.json …/supabase/functions/_shared/
ok | 211 passed | 0 failed (7s)        (round-2 baseline: 200; +11 = invoice-subject.test.ts)

$ deno test … …/supabase/functions/create-checkout-session/
ok | 17 passed | 0 failed (41ms)

$ deno test … …/supabase/functions/stripe-webhook/
ok | 18 passed | 0 failed (93ms)

$ deno check --config …/deno.json <index.ts>   — exit 0 for all five:
create-checkout-session · invoice-send · invoice-reminders · stripe-webhook ·
invoice-check-intent

$ find . -name deno.lock -not -path "*/node_modules/*"   → nothing
```

Deploy set unchanged at **20**: `_shared/invoice-subject.ts` is imported only by
the five, all already in the set.

---

## Fix round 1 (re-handed) — F-A only

> **Numbering note.** This brief is labelled "Fix round 1" and hands a single
> finding, `F-A`, whose evidence is round 3's. Sections named "Fix round 1" and
> "Fix round 2" already exist above; overwriting either would destroy a record,
> so this is appended under its brief's own name. Chronologically it is the
> fourth fix pass on this lane.

### F-A (major) — a paid studio invoice returns to a page that renders nothing

**Already addressed, and re-verified line by line in this worktree today. No
lane code changed, because the finding's own remedy is "Program-level gate …
No change to this lane's code."**

Every cited line still reads as the finding says, checked in
`/Users/kody/Code/patina-merged/.codex/worktrees/agent-si-edge` at HEAD
`72ddcd213`:

| claim | verified |
|---|---|
| the letterbox's rows can never hold a studio invoice | `packages/supabase/src/hooks/use-invoices.ts:465` → `.eq('project_id', projectId)` |
| that query is what the letterbox is fed | `apps/client-portal/src/components/threshold/threshold.tsx:272` → `const invoicesQuery = useProjectInvoices(projectId);` |
| so `settlement` is null and no receipt line renders | `apps/client-portal/src/components/threshold/letterbox.tsx:139-141` → `? (invoices.find((row) => row.id === returned.invoiceId) ?? null) : null` |
| a payer with no house mounts no Letterbox at all | `apps/client-portal/src/app/page.tsx:61-69` → `if (!projectView) { … <ProjectsEmptyState /> … }` |

The gate is recorded in the two places a shipper looks, both already in the
branch (commit `0008e7445`, tightened in `8add1bd31`):

1. `supabase/functions/create-checkout-session/index.ts:292-306` — the ⚠ DEPLOY
   ORDER block, which now states the stronger pre-W3 fact: a studio invoice is
   not merely mute on return, it is unreachable end to end (its letter points at
   `/invoices/<id>`, folded onto the letterbox front door, whose list cannot
   contain the row), so the recipient never reaches a Pay control and this
   function is never called for one. "Do not SEND a studio invoice until W3
   lands the client-invoice read and the letterbox-only front door."
2. The **Ship order** section above, step 2 — the client portal that matters for
   the studio leg is the W3 one (`useClientInvoices()` + the letterbox-only
   front door), not the currently-deployed worker.

F-A does not close inside W1. It closes when W3 lands.

### Trivial minor fixed while in the same paragraph

Ship order step 3 said "These **21** functions" under a `## Deploy set — 20
functions` heading (review round 5, `R4-3`). Corrected to 20; the one other
stale "21" is in the round-1 record and is now annotated as superseded rather
than rewritten.

### Gates, re-run for this round

```
$ deno test --allow-all --config …/supabase/functions/deno.json …/supabase/functions/_shared/
ok | 211 passed | 0 failed (1s)

$ deno test … …/supabase/functions/create-checkout-session/
ok | 17 passed | 0 failed (25ms)

$ deno test … …/supabase/functions/stripe-webhook/
ok | 18 passed | 0 failed (22ms)

  invoice-send · invoice-reminders · invoice-check-intent — still no *.test.ts
  (ls …/<dir>/*test* → "no matches found" for all three)

$ deno check --config …/supabase/functions/deno.json <each of the five index.ts>
OK   create-checkout-session
OK   invoice-send
OK   invoice-reminders
OK   stripe-webhook
OK   invoice-check-intent

$ find <worktree> -name deno.lock -not -path "*/node_modules/*"    → nothing
```

Deploy set unchanged at **20**.
