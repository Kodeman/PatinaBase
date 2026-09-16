# W4 fix log — round 6

Branch `build/people-room-crm-2026-09-11`, worktree `.codex/worktrees/agent-people-build`.

Scope of this pass: `RECONCILE-0` (the uncommitted work of two interrupted fixers),
`R6-BLOCKING-1` (ruling **R-BX**), `R6-MAJOR-1` (ruling **R-BY**) and `M-1` (rulings **R-BW** /
**R-BY**'s last clause). Nothing else was touched. `R-BT`, `R-BU` and `R-BV` are NOT in this
pass — no finding assigned here names them, and nothing below changes the code they govern.

---

## 0. `RECONCILE-0` — blocking — what was on disk before this pass

`git diff` at the start held work from two interrupted fixers, all uncommitted. Read
statement by statement; kept, finished or reverted as follows.

**Kept as correct and complete** (the rulings require exactly this):

- `supabase/migrations/00636_invoice_link_hardening.sql` §2 — the widen-before-empty reorder
  (R-BX's first half).
- `supabase/functions/_shared/invoice-links.ts` — new `letterFallbackUrl`, `letterPortalUrl`
  repointed at it, and the three comments that called the fallback a signed-in
  `/invoices/<id>` form corrected (R-BY).
- `supabase/functions/_shared/invoice-links.test.ts` — the fallback's own test, plus the two
  existing cases moved onto `/?invoice=<id>`.
- `supabase/functions/invoice-reminders/index.ts` — the mid-payment hold.
- `supabase/functions/invoice-send/index.ts`, `supabase/functions/stripe-webhook/index.ts` —
  comment corrections; stripe-webhook's two letters also moved onto `letterFallbackUrl`.
  The brief says the webhook letters are "NOT affected (leave unless required by R-BY)": they
  are kept, because both built the same dead `/invoices/<id>` address inline and R-BY's rule
  is that a letter never carries one. No behaviour changes there beyond the address a letter
  falls back to.
- `packages/supabase/src/hooks/use-invoices.ts`, `.../hooks/index.ts` and the vitest file —
  `InvoiceLink.token` widened to `string | null`, `expiresAt` carried through
  `parseInvoiceLink`, new exported `invoiceLinkIsLive`. This is R-BW's precondition ("status
  and expires_at ride through parseInvoiceLink"), not R-BV work.
- `apps/designer-portal/src/components/document/accounts/invoice-folio.tsx` — the three-sentence
  band and the shown-once sentence beside Copy link (M-1 / R-BW).

**Reverted** — `supabase/tests/billing/invoice_links_test.sql`. The interrupted fixer put the
order guard there, on the REAL `invoice_links` table. R-BX places it "under
`supabase/tests/people` … on a shape-identical probe table holding one row", and two copies of
one guard is a maintenance trap. Reverted with `git checkout --`; the guard now lives in the
new people-suite file below.

**Finished** — everything in §2 and §3 of this log: the SQL test R-BX names, the
`expire_stale_invoice_checkout_attempts` re-head, invoice-send's own hold, the reminders log
line, and the folio's jest coverage (the folio now imports `invoiceLinkIsLive`, which the
suite's `jest.mock('@patina/supabase')` factory did not provide — left as it was, the folio
would have thrown on render).

---

## 1. `R6-BLOCKING-1` — blocking — 00636 §2 emptied a NOT NULL column

**FIXED** — ruling **R-BX** — in `supabase/migrations/00636_invoice_link_hardening.sql`
(unapplied on prod, edited in place) and
`supabase/tests/people/w4_invoice_link_freeze_order_test.sql` (new).

§2 now reads: widen (`ALTER COLUMN token DROP NOT NULL`, `DROP CONSTRAINT
chk_invoice_links_token`) → empty (`UPDATE … SET token = NULL`) → freeze (`ADD CONSTRAINT
chk_invoice_links_token_frozen`). `token_hash` (:106) and the `expires_at` backfill (:119) both
still run before the plaintext goes, so nothing below depends on the old order. The section
carries a banner naming the failure, the reason a local reset cannot see it, and the W7
preflight (Strata row count + `token` nullability, read-only). One correction to the finding's
text, carried into the comment: the error is **23502 `not_null_violation`**, not 23514 — a CHECK
evaluating to NULL passes; it is the column's own NOT NULL that raises.

The test is the part that makes this hold. `supabase db reset` replays migrations before seeds,
so the real table is empty at that statement and the gate is green whatever the order —
which is exactly the defect. So the new file builds a PROBE table with the pre-00636 shape
(`token text NOT NULL`, the 64-hex CHECK, the unique index on the plaintext), puts one row in
it, and replays §2 statement for statement. Block 2 is the negative control: the reviewed order
on the same shape must raise `not_null_violation`.

Evidence — the suite passes, and it is a real gate (a mutant with the two statements swapped
back fails it):

```
$ psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -v ON_ERROR_STOP=1 \
    -f supabase/tests/people/w4_invoice_link_freeze_order_test.sql
NOTICE:  1. 00636 §2 in shipped order lands on a populated table, hash and clock intact: passed
NOTICE:  2. the reviewed order still raises on a row, so block 1 is a real gate: passed
NOTICE:  W4 invoice-link freeze-order suite: all blocks passed

# mutant (UPDATE moved back above the ALTERs), same file otherwise:
ERROR:  BLOCK 1 FAIL: 00636 §2 must survive a populated table — null value in column "token"
        of relation "probe_invoice_links" violates not-null constraint (23502)
```

---

## 2. `R6-MAJOR-1` — major — a letter carried an address the portal has no page for

**FIXED** — ruling **R-BY** — in four places.

**(a) The address.** `letterFallbackUrl(baseUrl, invoiceId)` →
`${baseUrl}/?invoice=<id>`, the Threshold letterbox shape `door-gate.tsx:288` already uses;
`letterPortalUrl` and both `stripe-webhook` letters call it. `/invoices/<id>` is not a
client-portal route (only `/invoices/[invoiceId]/print` exists, and `middleware.ts` neither
rewrites nor exempts the bare path), so that address was a sign-in bounce into `not-found`.
The three comments calling it "today's signed-in `/invoices/<id>` form" are corrected;
`metadata.deep_link` stays `/invoices/<id>` in both letters, because that routes the iOS inbox
by id (I2) and is not a browser address.

**(b) The reminder holds rather than ships.** `invoice-reminders/index.ts` reads
`invoice_checkout_attempts` for the scanned ids (batched 200 at a time) and skips any invoice
with an attempt in `claimed` / `session_created` / `processing`, counting them as
`heldMidPayment` in the run summary and logging one line naming why. A failed attempt scan
fails the whole pass closed (500) rather than dunning blind — the cron returns in an hour.

**(c) The same hold on the designer's own send.** `invoice-send/index.ts` now checks the same
three states after its status guards and before recipient resolution, returning
`409 checkout_in_flight` with a sentence the folio renders inline ("the client is paying this
invoice right now, so Patina held the letter rather than replace the address they are standing
on"), plus one `console.log`. An unreadable attempt table answers `503
checkout_attempt_check_failed`. Issue & Send is unaffected in practice — a draft has no
attempts — so this is the Resend/manual-nudge path.

**(d) The guard cannot be held open forever.** `expire_stale_invoice_checkout_attempts` is
re-headed in 00636 §6 (CREATE OR REPLACE, 00574's body verbatim except the candidate set, the
re-judge under the lock, and the two reason strings). `processing` attempts older than **10
days** now expire with `failure_reason = 'stale_processing_attempt'`; `claimed` /
`session_created` keep the 24h default. The 10 days is a constant inside the body, NOT a second
parameter — the cron entry calls the function with no arguments, and a second defaulted
argument would make that call ambiguous between two overloads. The cron entry, its schedule and
its SQL are untouched; the `pg_cron` registry comment is carried forward from 00630 with only
the "(never processing)" clause corrected.

A late ACH success is still recoverable, which is what makes 10 days safe:
`settle_invoice_checkout_payment` (00428:687) updates `WHERE status IN ('pending','failed')`
and short-circuits only on `succeeded` / `requires_refund` / `refunded`, so a Stripe result
arriving on day 12 still lands the money.

Evidence after `supabase:reset` (local):

```
$ select pg_get_function_identity_arguments(...) where proname='expire_stale_invoice_checkout_attempts'
 p_stale interval                      -- signature unchanged
$ select jobname, schedule, command from cron.job where jobname='invoice-checkout-attempts-expire';
 invoice-checkout-attempts-expire | 17 * * * * | SELECT public.expire_stale_invoice_checkout_attempts();
$ has_function_privilege('service_role', …)=t   has_function_privilege('authenticated', …)=f

# rolled-back probe, two processing attempts on seeded invoices:
NOTICE:  sweep detail: {"expired": 1, "payments_failed": 0, "pointers_cleared": 0, "processing_closed": 1}
NOTICE:  12-day processing -> expired (reason stale_processing_attempt) | 3-day processing -> processing
NOTICE:  PROBE PASS
```

`supabase/seed/00-legacy-grants.sql` regenerated (`python3 scripts/generate-legacy-grants.py`)
— the diff is exactly the two restated statements for that function. `db:generate` produces no
schema change (the only diff the current CLI emits is parenthesis formatting in its own
generic helpers, so it was reverted).

**Fan-out** — `_shared/invoice-links.ts` changed, so W7 must redeploy every importer:
`create-checkout-session`, `invoice-link-checkout`, `invoice-reminders`, `invoice-send`,
`stripe-webhook`. `invoice-reminders` and `invoice-send` changed in their own right.

---

## 3. `M-1` — major — the bounce band said "this invoice has no link yet", which was never true

**FIXED** — rulings **R-BW** / **R-BY** — in
`apps/designer-portal/src/components/document/accounts/invoice-folio.tsx`, with the hook change
it rests on in `packages/supabase/src/hooks/use-invoices.ts`.

The band mounts only from `doIssueAndSend`, and `invoice-send` mints a link through
`ensure_invoice_link` before it attempts the send — so on every invoice the band can appear on,
a link exists. It took the else-branch only because `get_invoice_link` returns `token: NULL`
since 00636. The band now branches on the link's EXISTENCE and its clock, never on whether an
address can be read:

- live link — "Email did not reach the client. This invoice has a live link, but Patina cannot
  show you its address again — an address is shown once, at the mint. Regenerate link, above,
  mints a fresh one you can send them, and the address already sent stops working." That last
  clause is the same fact the Regenerate confirm panel states, so the two no longer contradict
  each other one paragraph apart.
- no link — "…this invoice has no live link."
- expired — "…this invoice's link has expired." (`closed` is a voided invoice's receipt link
  under K5, so it reads as no live link rather than as an expiry.)

`parseInvoiceLink` now keeps the row when the token is null or malformed (a bad token is "no
address to show", never "no link"), carries `expires_at`, and the package exports
`invoiceLinkIsLive` (status first, then the clock — `resolve_invoice_link`'s own order). Beside
Copy link at the mint the folio prints the paperwork mint's sentence: "This address is shown
once. Copy it now — reopening this folio will not show it again."

Tests: four new cases in `__tests__/invoice-folio.test.tsx` (live-but-unreadable, no link,
expired, and the shown-once sentence appearing only after a mint), and the suite's
`jest.mock('@patina/supabase')` factory now provides `invoiceLinkIsLive` — without it the folio
throws on render. `packages/supabase` vitest covers the parser's three shapes and the new
predicate.

---

## Gates

```
pnpm supabase:reset                                        Finished supabase db reset
psql -f supabase/tests/people/w4_invoice_link_freeze_order_test.sql   exit=0, all blocks passed
psql -f supabase/tests/people/w4_channels_touches_paperwork_test.sql  exit=0, all blocks passed
psql -f supabase/tests/billing/invoice_links_test.sql                 exit=0
deno test --allow-all --config supabase/functions/deno.json \
  supabase/functions/_shared/invoice-links.test.ts          ok | 8 passed | 0 failed
deno check --config supabase/functions/deno.json \
  invoice-send/index.ts invoice-reminders/index.ts          Check … (clean)
pnpm --dir packages/supabase type-check                     clean
pnpm --dir packages/supabase test -- use-invoices           64 passed
pnpm --dir apps/designer-portal type-check                  clean
pnpm --dir apps/designer-portal test -- invoice-folio       34 passed
pnpm --dir apps/designer-portal test -- accounts-query-states 3 passed
pnpm --dir apps/admin-portal build                          built (shared-package gate)
pnpm --dir apps/client-portal type-check                    RED, PRE-EXISTING (m-13)
```

`apps/client-portal` type-check fails on `.next/types/app/page.ts(37,29) TS2344`, rooted in
`src/app/page.tsx`'s optional `props?` signature. No client-portal file is touched by this
pass; r2–r6 all measured the same failure (review `w4-review-r6-code.md` m-13). Recorded so the
tail is not read as a regression from this round.

No server was started; ports 3000 and 3002 were not bound.
