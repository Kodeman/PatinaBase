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
a call that carries **no** studio falls back once to the two-argument form, so a
project-bound letter still brands if the function lands ahead of the migration;
a call that *does* carry a studio does not retry, because the two-argument RPC
would answer with the designer's primary studio — the wrong letterhead.
`studioId` alone is now anchor enough (previously `!projectId && !designerId`
returned null).

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
deno check --config …/deno.json <index.ts>   — clean for all 21 deploy-set functions
```

`invoice-send`, `invoice-reminders` and `invoice-check-intent` have no test
files of their own; they are covered by `deno check` and by the `_shared`
suites their letters and identity resolution come from. No `deno.lock` was
created (`find . -name deno.lock` → nothing).

## Deploy set — 21 functions

Every directory importing `_shared/studio-identity.ts` transitively, ∪ the five.
A `_shared/*` edit requires redeploying EVERY importer.

Direct importers (14): `client-invite`, `commercial-document-notify`,
`create-checkout-session`, `invoice-reminders`, `invoice-send`,
`notification-dispatch`, `po-send`, `proposal-nudge`,
`proposal-sign-confirmation`, `quote-request-send`, `review-requests`,
`spec-pdf`, `stripe-webhook`, `trade-rfq-send`.

Via `_shared/decision-notify.ts` and `_shared/project-approval-notification.ts`
(5): `decision-first-notice`, `decision-reminders`, `decision-resolved-notify`,
`expire-decisions`, `notification-digest`.

Via `notification-digest/logic.ts` → `morning-brief/render.ts` (1):
`morning-brief`.

Plus `invoice-check-intent` (edited here; not an importer of studio-identity).

Ship order — **the migration goes first**:

1. `00570_studio_invoices.sql` (db lane). All five functions now `select` the
   `title` column; against a database without it PostgREST answers `42703` and
   the function fails closed — `invoice-send` and `create-checkout-session`
   return 500 `lookup_failed` (nobody can pay), `invoice-reminders` dies on the
   scan, and `stripe-webhook`'s `loadInvoiceJoined` returns null, which SKIPS
   the receipt, failed-payment and refund letters SILENTLY while the money
   still settles.
2. The client portal — `create-checkout-session`'s existing ⚠ DEPLOY ORDER
   comment still stands: a return landing on a portal that reads no
   `?checkout=` gets no receipt.
3. These 21 functions.

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

Deploy set is unchanged: the same 21 functions.
