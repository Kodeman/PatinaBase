# W1 EDGE — studio invoices, the edge-function half

Worktree `/Users/kody/Code/patina-merged/.codex/worktrees/agent-si-edge`, branch
`studio-invoices/w1-edge`, base `36b4b539e1f2cb732fb722d84edfe758d6b4008a`.

Contract built against (db lane, in parallel): `invoices` gains a nullable
`project_id` and a text `title`; `resolve_studio_identity` becomes
`(p_project_id uuid, p_designer_id uuid, p_studio_id uuid DEFAULT NULL)` and
resolves directly by org when `p_studio_id` is given.

## What changed

### `_shared/studio-identity.ts`
`resolveStudioIdentity(admin, { projectId?, designerId?, studioId? })`. The
studio arm is only *named* in the RPC argument object when the caller holds one:

```ts
const args: Record<string, string | null> = {
  p_project_id: projectId,
  p_designer_id: designerId,
};
if (studioId) args.p_studio_id = studioId;
```

PostgREST resolves an RPC by the argument names it is sent, and the third
argument is `DEFAULT NULL`, so every project-bound caller keeps sending exactly
the two-argument call it sent before the studio arm existed — the deployed
functions do not break if they land before the migration. `studioId` alone is
now anchor enough (previously `!projectId && !designerId` returned null).

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

- `_shared/studio-identity.test.ts` (+4): the RPC argument object is asserted
  exactly — `p_studio_id` present when a studio is given, absent when not;
  studio alone resolves; no anchor at all → null and the RPC is never called.
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

Ship order note: `create-checkout-session`'s existing ⚠ DEPLOY ORDER comment
still stands — the client portal ships before these functions, because a return
landing on a portal that reads no `?checkout=` gets no receipt.

## Left deliberately undone

- **No `resolveStudioIdentity` call added to `invoice-check-intent`.** Its only
  letter is `buildCheckIntentEmail`, addressed to the designer;
  `CheckIntentEmailParams` carries no `studioName`/`studioLogoUrl`, so a resolver
  call there would be dead code. Everything else in the brief (type, `title` in
  the select, display-name fallback, nullable metadata `project_id`) is applied.
- **`_tests/stripe-rail.test.ts` null-project case** — that suite runs against a
  live local stack, which the db lane owns; the case belongs with the migration
  it proves.
