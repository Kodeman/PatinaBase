# W1 DB lane — studio invoices (00571)

Branch `studio-invoices/w1-db`, worktree `/Users/kody/Code/patina-merged/.codex/worktrees/agent-si-db`,
base `36b4b539e1f2cb732fb722d84edfe758d6b4008a`.

`deploySet = ['migration 00571_studio_invoices.sql']`

## The migration — `supabase/migrations/00571_studio_invoices.sql`

Minted 00571 (worktree tip was 00568; 00569 is a peer session's). One transaction,
six parts, banner naming rulings S1–S12.

1. **The anchor.** `invoices.project_id` DROP NOT NULL (FK + cascade kept),
   `ADD COLUMN title text` with a COMMENT, and
   `CONSTRAINT chk_invoices_anchor CHECK (project_id IS NOT NULL OR (client_id IS NOT NULL AND studio_id IS NOT NULL))`.
2. **`public.set_invoice_studio_id()` — the real gate.** Body copied from its true head
   (`00511_public_sd_hardening.sql:2616-3057`, confirmed by the anchored grep) with an
   `IF NEW.project_id IS NULL THEN … END IF` branch inserted in BOTH arms, before the
   project lookups; on UPDATE it sits *after* 00511's identity-immutability check, so
   project_id/designer_id/client_id/studio_id stay as immutable on a studio invoice as on a
   project one. `diff` old→new body: **96 lines added, 0 removed** (48 per arm) — every
   project-path line byte-identical. The branch requires an active `design_studio`
   organization, `NEW.designer_id` an active non-guest member of it, `NEW.client_id` present,
   and then either the service_role/postgres early return (same semantics as the project
   path) or an actor that is an active non-guest member. It reads no project and takes no
   lock, so the canonical `root -> user_roles -> memberships -> organization` lock order the
   00511 DO block and the contract test pin is untouched (no `PERFORM role.id`,
   `PERFORM user_role.id`, `PERFORM membership.id`, `PERFORM studio.id`, `FOR SHARE;` or
   `FOR UPDATE;` strings introduced ahead of the root lock).
3. **`public.create_draft_studio_invoice(p_client_id, p_studio_id, p_title, p_tax_rate,
   p_payment_terms_days, p_memo, p_lines) RETURNS uuid`.** SECURITY DEFINER,
   `search_path = pg_catalog, public, pg_temp`, `REVOKE ALL … FROM PUBLIC, anon,
   authenticated, service_role, dashboard_user` then `GRANT EXECUTE … TO authenticated`.
   Guards: `is_active_studio_member(p_studio_id)` plus an explicit active-`design_studio`
   check; the household resolved through `designer_clients` joined to an active non-guest
   `organization_members` row of that studio (the actor's own roster row wins, else the
   lowest-id roster owner), and THAT member stamped as `invoices.designer_id`; memberships
   then organizations locked `FOR SHARE` in canonical order and every authority row
   re-validated after the lock; the 00511:3482-3560 payload checks (array bounds, key
   allowlist, metadata object + reserved-anchor rejection, tax/terms/memo bounds,
   per-line description/quantity/unit_amount_cents/sort_order bounds) minus the
   project-child clauses; a dedicated `kind <> 'adhoc'` rejection with a readable message
   (S6); required non-blank `p_title` (S12); totals computed with 00511's exact rounding
   (`round(quantity * unit_amount_cents)::integer`, `round(subtotal * tax_rate)::integer`).
   Inserts the header (`project_id NULL`, `status 'draft'`, `currency 'USD'`) and its
   `kind='adhoc'` lines, returns the id.
4. **`public.apply_invoice_payment_effects(uuid)`.** Body from its true head
   (`00277_refund_reconciliation.sql:128-271`) with exactly two deltas on the forward
   earnings INSERT: `JOIN projects pr` → `LEFT JOIN projects pr`, and the description
   `'… — ' || pr.name` → `'… — ' || COALESCE(pr.name, i.title, 'Studio invoice')`.
   The refund-contra leg is untouched.
5. **Client RLS, additive.** `invoices_household_select`,
   `invoice_line_items_household_select`, `invoice_payments_household_select` —
   `TO authenticated`, `client_id = auth.uid() AND status <> 'draft'` (child tables via
   `EXISTS invoices i`). 00178's three project-keyed client policies are untouched.
6. **`public.resolve_studio_identity`.** `DROP FUNCTION … (uuid, uuid)` then CREATE the
   3-arg form with `p_studio_id uuid DEFAULT NULL`; when it is given, the organizations row
   is read directly and neither the project nor `_primary_studio_for` is consulted (S8).
   Grants/COMMENT re-applied. Drop+create rather than an overload so PostgREST `rpc` stays
   unambiguous; every in-repo caller passes two arguments and still resolves.

### Deliberate deviations from the brief, and why

- **`designer_earnings.project_id` stays `i.project_id`, not `pr.id`.** With the LEFT JOIN the
  two are identical (both NULL when there is no house), and keeping `i.project_id` leaves that
  line byte-identical to 00277.
- **SD roster registration.** 00511's canonical-lock-order roster (migration `:7189`,
  contract test `:2443`) is a closed VALUES list that requires a `PERFORM user_role.id`
  roles-catalog lock; a studio invoice has no project lead, so no designer-domain role is
  read and that lock does not exist. Instead 00571 carries its own
  `DO $studio_draft_roster$` block asserting the same things 00511 asserts about
  `create_draft_invoice`: overload universe = 1, owner postgres, plpgsql, SECURITY DEFINER,
  volatile, non-strict, non-leakproof, `proconfig = search_path=pg_catalog, public, pg_temp`,
  result `uuid`, `PERFORM membership.id` before `PERFORM studio.id`, and an exact ACL tuple
  of `authenticated/postgres/EXECUTE/not-grantable`. The contract test's closed lists are
  unmodified apart from the re-pinned hash below.
- **`supabase/seed/00-legacy-grants.sql` regenerated** (`python3 scripts/generate-legacy-grants.py`).
  Not named in the brief, but required: the seed's baseline grants EXECUTE on every public
  function to anon/authenticated/service_role and then replays the migrations' REVOKEs, so
  without the regen `create_draft_studio_invoice` would be anon-executable on every fresh
  local stack. The generator also dropped the two now-dead 2-arg
  `resolve_studio_identity` grant statements. +36/−12 lines.

## Hashes re-pinned

`supabase/tests/edge_api/public_sd_hardening_contract_test.sql` (17-row manifest, unchanged count):

| function | old `body_sha256` | new |
|---|---|---|
| `public.set_invoice_studio_id()` | `3ce8183f5490b21a6a087a6a21e8e36c2c1b4c51d1577da614799a473f99099b` | `06609af25c627f49c7b489c07968790c593ce1ad269e6a42e5bda6b1eb0a065a` |

Computed the way the manifest computes it, against the deployed body after the reset:
`encode(extensions.digest(convert_to(prosrc,'UTF8'),'sha256'),'hex')`.

`apply_invoice_payment_effects` is **not** pinned anywhere under `supabase/tests/`
(only referenced by name in an assertion message in `commercial/trade_scope_test.sql`), so
nothing to re-pin. Its new hash, for the record:
`e9bfb420504644f22a81e2c2353bbb5cfdb771f56dfe5ea786de6d0a0d231c93` (5057 bytes).
`resolve_studio_identity` is not pinned in any contract manifest either.

## Tests

- **New:** `supabase/tests/billing/studio_invoice_test.sql` — 15 DO blocks: draft (project_id
  NULL, studio/designer/household stamped, exact totals, two ad-hoc lines) → issue
  (`INV-0001` off `studio_invoice_counters`) → pay (invoice paid, `designer_earnings` row with
  `project_id NULL` and the title in the description) → refund contra (`net_amount = -66000`,
  project still NULL, invoice back to `sent`) → void a fresh draft; the two-studio designer
  drawing off Studio Two's counter while Studio One's stays at 1; the read boundary
  (household reads the issued invoice + its lines + payments but not a draft, co-member
  reads, stranger reads zero rows and is never told the row exists); rejections
  (non-adhoc kind 23514, blank title 23514, empty line array 23514, off-roster household
  42501, non-member studio 42501, hand-rolled foreign-studio INSERT P0001); and
  `resolve_studio_identity(NULL, designer, studioTwo)` returning Studio Two's letterhead.
- **Deno:** `supabase/functions/_tests/stripe-rail.test.ts` gained a studio fixture
  (`ids.studio` / `ids.studioInvoice` / `ids.studioInvPay`, `EVT.studioInv`, `SESS.studioInv`,
  cleanup) and step (a2) — a `checkout.session.completed` on a project-less invoice settles
  and writes a `designer_earnings` row with `project_id === null` and the title in the
  description. **It could not be RUN in this lane** (it is an integration test needing the
  edge-function runtime + Stripe signing secret); it passes `deno check --config
  supabase/functions/deno.json` and must run at integration.
- **`packages/supabase/src/hooks/__tests__/use-invoices.test.ts`**: 4 new cases for
  `useCreateDraftStudioInvoice` (exact RPC arg shape, kind forced to `adhoc`, error surfaced
  verbatim, invalidation of `['invoices']` + `['document-state']` + `['ffe-invoice-coverage']`
  with no `['projects', …]` key) and 1 for `useClientInvoices` (key + unscoped select). 48
  tests pass.
- **New:** `apps/designer-portal/src/lib/document/__tests__/desk-receivables.test.ts` — a
  project invoice still keys on its house; an overdue studio invoice produces no Desk entry
  and does not displace the house rows (ruling S9).
- **`apps/designer-portal/src/components/document/accounts/__tests__/invoice-folio.test.tsx`**:
  `title: null` added to the fixture, plus a studio-invoice case — no `document ↗` doorway,
  and issue/send are called with `projectId: undefined`.

## Portal null-safety (minimal; the feature is Wave 2)

- `invoice-folio.tsx` — five `projectId: invoice.project_id` → `?? undefined`; a
  `documentProjectId` const gates the `document ↗` doorway.
- `accounts-receivables-page.tsx` — two `projectId` → `?? undefined`; house label
  `project?.name ?? title ?? 'Studio'`.
- `accounts-ledger-page.tsx` — house label `project?.name ?? title ?? 'Studio'`.
- `desk-receivables.ts` — `if (!inv.project_id) continue;` before the per-project map.
- `invoice-overlays.tsx` — `if (!projectId) return;` before `router.push('/doc/…')`.
- `apps/client-portal` needed **no** changes; its type-check is green as-is (it reads
  invoices through `useProjectInvoices`, which never dereferences a nullable `project_id`).

## Hooks

`packages/supabase/src/hooks/use-invoices.ts`: `Invoice.project_id: string | null`,
`Invoice.title: string | null` (every invoice select is `*`, so no select changes were
needed), `CreateDraftStudioInvoiceInput`, `useCreateDraftStudioInvoice(options?)` and
`useClientInvoices()`; all four exported from `hooks/index.ts`.
`packages/supabase/src/database.types.ts` regenerated (`pnpm --filter @patina/supabase
generate` against the local stack): `project_id: string | null` and `title` on every
invoices shape, the new RPC, and `resolve_studio_identity` gaining `p_studio_id?`.

## Stack

`supabase db reset` was run twice. The **first** run picked up the main checkout instead of
this worktree (this agent's cwd resets between tool calls, so a bare `cd` does not stick);
it replayed main's ledger to 00568 and so dropped the peer 00569 that was on the shared
local stack. The **second** run used `supabase db reset --workdir
/Users/kody/Code/patina-merged/.codex/worktrees/agent-si-db` and applied this branch's
ledger, tip **00571**. Both are logged in `stack-reset-notice.md`. Nothing was pushed and no
production object was touched.

## Deferred / for later waves

- Wave 2 owns the composer branch, the ledger/folio "studio" stamp and the `studio-invoice`
  flag; Wave 3 owns the client page and iOS. Nothing of either was built here.
- Edge functions (`invoice-send`, `invoice-reminders`, `create-checkout-session`,
  `stripe-webhook`, `invoice-check-intent`, `_shared/studio-identity.ts`) are NOT in this
  lane's brief and are unchanged — the DB is inert for them until they select `title` and
  pass `p_studio_id`.
- Latent, documented not fixed (plan item 9): `invoices.client_id … ON DELETE SET NULL`
  (00178:33) now conflicts with `chk_invoices_anchor` on a hard profile delete. The purge
  path (00538/00539) anonymizes rather than deletes, so it cannot fire today.

---

## Fix round 1 (review `db-review-r1.md`)

Both listed findings addressed; minors F3–F8 left as advisories (none trivial enough
to touch without widening scope, and none blocks the program).

### F1 — BLOCKER, fixed · `supabase/migrations/00571_studio_invoices.sql`

The studio branch used to `RETURN NEW` for any active non-guest member, on both
arms, with no predicate on state or money. Direct PostgREST DML
(`current_user = 'authenticated'`) could therefore hand-write a `paid` studio
invoice with a spoofed `invoice_number` and a pre-set `amount_paid_cents` — an
ungated status write, and a number that would later collide with
`studio_invoice_counters` under `uniq_invoices_studio_number`.

Both studio branches now apply, after the actor-membership check, the same
clean-draft predicate the project path applies at the `current_user =
'authenticated'` fork: `status = 'draft'`, `invoice_number / issue_date /
sent_at / paid_at / voided_at / void_reason / stripe_checkout_session_id IS
NULL`, `amount_paid_cents = 0`, `reminder_count = 0`, `last_reminder_at /
ar_flagged_at / ar_last_chased_at IS NULL`, plus (UPDATE arm only)
`updated_at` unchanged — `created_at`, `id` and the four identity columns are
already pinned by 00511's immutability check at the top of that arm. When
`current_user = 'postgres'` (every SECURITY DEFINER billing RPC) the branch
returns `NEW` exactly as before, so `issue_invoice`, `void_invoice`,
`record_payment` and the Checkout RPCs are unaffected.

Trigger ordering makes the `updated_at` term safe: on `public.invoices` the
BEFORE-UPDATE triggers are `set_invoice_studio_id` and
`set_invoices_updated_at`, fired in name order (`_` < `s`), so the gate reads
`NEW.updated_at` before `update_updated_at_column()` bumps it — a plain draft
edit from the composer still passes.

Diff against the true head (`00511_public_sd_hardening.sql`) body:
**145 lines added across the two arms, 0 removed** — every project-path line is
still byte-identical.

Re-pinned body SHA-256 at
`supabase/tests/edge_api/public_sd_hardening_contract_test.sql:1708`:

| | value |
|---|---|
| was (round 0) | `06609af25c627f49c7b489c07968790c593ce1ad269e6a42e5bda6b1eb0a065a` |
| fix round 1 | `e329335f260c48e56032a7445feffea2505cdd11972d23f75949ea9394509c97` (23106 bytes) |
| now (fix round 2, after the 00570→00571 renumber) | `99100c8e3832adf7d7a27a22eab3651f3154d28be28dfeabe8d1dbd3f7ed2878` |

Computed exactly as the contract test computes it, against the deployed body
after the reset:

```
$ psql … -At -c "SELECT encode(extensions.digest(convert_to(prosrc,'UTF8'),'sha256'),'hex')
                 FROM pg_proc WHERE oid = 'public.set_invoice_studio_id()'::regprocedure;"
e329335f260c48e56032a7445feffea2505cdd11972d23f75949ea9394509c97
```

The review's own probes, re-run against the fixed body (transaction rolled
back), now refuse:

```
=== P1 direct INSERT of a non-draft studio invoice as an authenticated member
ERROR:  studio_id_not_designer_studio
CONTEXT:  PL/pgSQL function set_invoice_studio_id() line 197 at RAISE
 P1 spoofed paid studio row exists |     0
=== P1e clean draft direct INSERT still allowed
 P1e clean draft landed |     1
=== P1c direct UPDATE of a studio draft as authenticated
ERROR:  studio_id_not_designer_studio
CONTEXT:  PL/pgSQL function set_invoice_studio_id() line 98 at RAISE
 P1c after refused update | 0 |  | 0 | draft
=== P1f benign draft edit still allowed
 P1f memo | edited
```

Two new blocks in `supabase/tests/billing/studio_invoice_test.sql` pin this as
member A: a direct INSERT of a `paid` row with `INV-9999` → `P0001` and no row;
a direct UPDATE setting `amount_paid_cents`, then one setting `invoice_number`
/ `status` / `sent_at` → `P0001` each, the draft unchanged after both; and a
positive control (a `memo` edit) so the gate cannot pass by refusing
everything. The blocks use a `v_accepted` sentinel rather than a `RAISE
EXCEPTION` sentinel — `RAISE EXCEPTION` defaults to SQLSTATE `P0001`, so the
suite's existing sentinel style cannot distinguish "refused" from "accepted"
when the expected code is itself `P0001`.

### F2 — MAJOR, fixed · `supabase/tests/billing/studio_invoice_test.sql`

The payment leg no longer settles with a direct `invoice_payments` INSERT. It
now drives the same three RPCs the sibling suite drives
(`invoice_checkout_integrity_test.sql:766 / 854 / 999`), as `service_role`,
with the household's `stripe_customer_id` seeded first:

`claim_invoice_checkout_attempt(v_id, household, 'cus_studio_invoice_household',
false, 'card')` → asserts `amount_cents = 66000` and `surcharge_cents = 1980`
(the studio's own 300 bps, read off `studio_billing_settings` by `studio_id` —
the project-less path) → `finalize_invoice_checkout_attempt(…,
'cs_studio_invoice_1')` → `settle_invoice_checkout_payment(…, 67980, 'card')`
→ `outcome = succeeded`, invoice `paid` at `66000` with `paid_at` set, and one
`designer_earnings` row with `status = 'confirmed'` (the stripe rail's status,
where the old direct check-payment insert produced `'paid'`), `project_id
NULL`, `net_amount 66000`, and the title in the description. Plan risk #2 is
now proven by the lane's own suite rather than only by a reviewer probe. The
refund-contra block that follows is unchanged and still passes against the
Stripe payment row.

The Deno case in `supabase/functions/_tests/stripe-rail.test.ts` still needs
the integration runtime and did not run here (unchanged from round 0).

### Gates, fix round 1

| Gate | Result |
|---|---|
| `supabase --workdir <wt> db reset` | clean (logged in `stack-reset-notice.md`) |
| `bash scripts/run-sql-tests.sh` | `total 157 · green 136 · expected-fail 21 · unexpected-fail 0` |
| — `billing/studio_invoice_test.sql` | PASS |
| — `edge_api/public_sd_hardening_contract_test.sql` | PASS (re-pinned hash) |
| — `billing/invoice_checkout_integrity_test.sql` | PASS |
| — `commercial/multi_studio_signature_test.sql` | PASS |
| — `rls/00563_proposal_signing_multi_studio.test.sql` | PASS |
| `pnpm --filter @patina/supabase type-check` | clean |
| `pnpm --filter @patina/supabase test -- use-invoices` | 48 passed |
| `pnpm --filter @patina/designer-portal type-check` | clean |
| `pnpm --filter @patina/client-portal type-check` | clean |
| `pnpm --filter @patina/designer-portal test -- accounts desk-receivables` | 3 suites, 12 tests passed |

### Not regenerated: `packages/supabase/src/database.types.ts`

This round changed no schema shape (one function body, plus tests), so the
committed types stay as round 0 left them. `pnpm db:generate` was run twice
against the local stack to confirm nothing was owed, and **its output is not
deterministic on this machine**: two consecutive runs against the same
unchanged database differ from each other, and both differ from the committed
file by thousands of lines of view-derived `Relationships` entries
(`edge_catalog_products`, `admin_studio_overview`, …) that come and go even
though both views exist (`SELECT relkind FROM pg_class` → `v`, `v`). The
generated file was discarded with `git checkout --`. Flagged as an advisory,
not a lane defect.

### Left as advisories (from the review's minors)

- **F3** — the round-0 reset log is incomplete and the first round-0 reset ran
  against the main checkout, dropping a peer's `00569`. Nothing to fix in code.
- **F4** — `create_draft_studio_invoice` is registered by a `DO` block in the
  migration, not pinned in the contract test's `atomic_draft_catalog_contract`
  manifest, so its body/ACL can drift silently after merge.
- **F5** — `resolve_studio_identity(NULL, designer, <unknown studio id>)` falls
  to the profile identity instead of the project derivation. Unreachable from a
  real invoice (`studio_id` is FK-checked).
- **F6** — the studio branch does not require `has_designer_domain_role
  (NEW.designer_id)` where the project path does. Deliberate (no project lead);
  a member with no designer-domain role can hold a studio invoice's earnings.
- **F7** — `useCreateDraftStudioInvoice` forces `kind: 'adhoc'`, so a
  milestone line becomes an adhoc line instead of surfacing the RPC's
  `check_violation`.
- **F8** — `ADD CONSTRAINT chk_invoices_anchor` is unguarded (harmless on a
  fresh apply); `title` has no length CHECK, so direct DML can exceed the RPC's
  200-char bound.

---

## Fix round 2 — R2-1 (major): migration renumbered 00570 → 00571

**The collision.** `00570` was claimed twice across live worktrees on 2026-09-05:

```
$ for w in …; do ls .codex/worktrees/$w/supabase/migrations | tail -3; done
== agent-si-db:        00567_… 00568_… 00570_studio_invoices.sql
== agent-cae-w2-web:   00567_… 00568_… 00570_approval_response_signature.sql
== agent-cae-w2-backend: 00567_… 00568_… 00569_approval_why_viewer_role_and_receipt.sql
== agent-si-edge / agent-si-integration / agent-cae-w2-{designer,iosc,iosd}: tip 00568
main checkout tip:     00568_decision_first_notice_dispatch.sql
```

The concurrent client-approval program holds `00569` and `00570`. Two files sharing
one version prefix land as one ledger row; whichever merges second risks being read
as already applied and silently skipped on Strata
(`patina-parallel-work` SKILL.md:132 — "re-check the target tip right before merge;
renumber on collision").

**What changed.** Nothing inside the migration body's logic. Only:

- `git mv supabase/migrations/00570_studio_invoices.sql supabase/migrations/00571_studio_invoices.sql`
- the literal string `00570` → `00571` in the migration banner and in every in-repo
  reference to it: `supabase/seed/00-legacy-grants.sql` (6 generated comments),
  `supabase/tests/edge_api/public_sd_hardening_contract_test.sql`,
  `supabase/tests/billing/studio_invoice_test.sql`,
  `supabase/functions/_tests/stripe-rail.test.ts`,
  `packages/supabase/src/hooks/use-invoices.ts`,
  `packages/supabase/src/hooks/__tests__/use-invoices.test.ts`,
  `apps/designer-portal/src/lib/document/__tests__/desk-receivables.test.ts`.
  (`services/aesthete-inference/tests/fixtures/golden_vectors.json` also matches
  `00570` — that is a float in an embedding vector, left alone.)

**Hash consequence.** Two of those strings sit *inside* the `set_invoice_studio_id()`
body (the studio-branch comment on the INSERT arm and on the UPDATE arm), so the
pinned body SHA-256 moved even though no statement changed:

```
$ psql … -At -c "select encode(extensions.digest(convert_to(prosrc,'UTF8'),'sha256'),'hex')
                 from pg_proc where oid='public.set_invoice_studio_id()'::regprocedure;"
99100c8e3832adf7d7a27a22eab3651f3154d28be28dfeabe8d1dbd3f7ed2878
```

Re-pinned at `supabase/tests/edge_api/public_sd_hardening_contract_test.sql:1710`.
No other pin moved — a repo-wide grep for the recomputed digests of
`apply_invoice_payment_effects`, `resolve_studio_identity(uuid,uuid,uuid)` and
`create_draft_studio_invoice` returns no hits, i.e. none of them is pinned anywhere.

**Renumber is not permanent proof.** `00571` was free across every live worktree and
the main tip at the time of this fix. The integration/ship lane must re-check the
target tip once more immediately before merge.

### Gates re-run after the renumber

```
$ supabase --workdir …/agent-si-db db reset
Finished supabase db reset on branch main.
{"target":"local","version":"","message":"Reset local database."}
$ psql … -c "select version from supabase_migrations.schema_migrations order by version desc limit 4"
00571 / 00568 / 00567 / 00566

$ bash scripts/run-sql-tests.sh
total:             157
green:             136
expected-fail:      21  (documented in supabase/tests/KNOWN_FAILURES.md)
unexpected-fail:     0
effective-green:   157 / 157
  PASS supabase/tests/billing/studio_invoice_test.sql
  PASS supabase/tests/billing/invoice_checkout_integrity_test.sql
  PASS supabase/tests/edge_api/public_sd_hardening_contract_test.sql
  PASS supabase/tests/commercial/multi_studio_signature_test.sql
  PASS supabase/tests/rls/00563_proposal_signing_multi_studio.test.sql

$ pnpm --filter @patina/supabase type-check          → tsc --noEmit, clean
$ pnpm --filter @patina/supabase test -- use-invoices → 1 file, 48 tests passed
$ pnpm --filter @patina/designer-portal type-check   → tsc --noEmit, clean
$ pnpm --filter @patina/client-portal type-check     → tsc --noEmit, clean
$ pnpm --filter @patina/designer-portal test -- accounts desk-receivables
    Test Suites: 3 passed, 3 total · Tests: 12 passed, 12 total
```

`deploySet` is now `['migration 00571_studio_invoices.sql']`.

## Fix round 1 — re-verification (fixer re-dispatched on the same F1/F2 list)

The round-1 fix list (F1 blocker, F2 major) was dispatched a second time. On
entry the worktree was **clean** — `git status --short` printed nothing — and
the two fixes were already on the branch as committed work:

```
$ git -C …/agent-si-db branch --show-current
studio-invoices/w1-db
$ git -C …/agent-si-db status --short
(no output)
$ git -C …/agent-si-db log --oneline -8
07bfdd55c docs(studio-invoices): W1 DB lane fix round 2 notes
5cddbe157 chore(db): renumber the studio-invoices migration 00570 to 00571
31fd3b89d docs(studio-invoices): W1 DB lane adversarial review round 2
6bd7a3e61 docs(studio-invoices): W1 DB lane fix round 1 notes
d74af98f1 test(billing): drive the studio invoice through the Checkout rail
feb4903a6 fix(db): hold direct DML on a studio invoice to a clean draft
232de29e4 docs(studio-invoices): W1 DB lane review round 1
c6cacaee8 docs(studio-invoices): W1 DB lane notes and stack-reset log
```

No further code change was owed. Both findings were re-read in the tree rather
than taken on trust:

**F1** — `00571_studio_invoices.sql`. Both studio branches carry the
clean-draft gate, and the identity-immutability check that guards the UPDATE
arm runs *before* either branch:

| what | where |
|---|---|
| UPDATE identity immutability (`id`, `created_at`, `project_id`, `designer_id`, `client_id`, `studio_id`) | :98–106, ahead of the studio branch |
| UPDATE-arm studio branch, clean-draft gate | :159–178 (`current_user = 'authenticated' AND NOT (…)` → `RAISE`), incl. `updated_at IS NOT DISTINCT FROM OLD.updated_at` at :174 |
| INSERT-arm studio branch, clean-draft gate | :259–277 (same predicate, no `updated_at` term — there is no `OLD` on INSERT) |
| machine roles keep the early return | :136–138 / :236–238 (`v_active_role = 'service_role' OR v_postgres_migration`) |

The predicate is field-for-field the project path's own (`:503–541`): `status
= 'draft'`, `invoice_number`/`issue_date`/`sent_at`/`paid_at`/`voided_at`/
`void_reason`/`stripe_checkout_session_id` NULL, `amount_paid_cents = 0`,
`reminder_count = 0`, `last_reminder_at`/`ar_flagged_at`/`ar_last_chased_at`
NULL.

**F2** — `supabase/tests/billing/studio_invoice_test.sql:155–214`. The payment
leg drives the Checkout RPCs, not a direct `invoice_payments` INSERT: the
household's `stripe_customer_id` is seeded (:163), then
`claim_invoice_checkout_attempt` (:177, asserting `amount_cents = 66000` and
`surcharge_cents = 1980`) → `finalize_invoice_checkout_attempt` (:188,
asserting the session id lands on a project-less invoice) →
`settle_invoice_checkout_payment` (:196, `outcome = 'succeeded'`), then the
invoice `paid`/`66000`/`paid_at` and one `designer_earnings` row with
`project_id IS NULL`, `net_amount = 66000` and the title in the description.

### Gates re-run this round (fresh, after a full reset)

```
$ supabase --workdir …/agent-si-db db reset
Finished supabase db reset on branch main.
{"target":"local","version":"","message":"Reset local database."}

$ psql … -At -c "select version from supabase_migrations.schema_migrations order by version desc limit 5"
00571
00568
00567
00566
00565

$ bash …/agent-si-db/scripts/run-sql-tests.sh
total:             157
green:             136
expected-fail:      21  (documented in supabase/tests/KNOWN_FAILURES.md)
unexpected-fail:    0
effective-green:   157 / 157  (green + expected-fail)

  PASS supabase/tests/billing/invoice_checkout_integrity_test.sql       0s
  PASS supabase/tests/billing/studio_invoice_test.sql                   0s
  PASS supabase/tests/commercial/multi_studio_signature_test.sql        0s
  PASS supabase/tests/edge_api/public_sd_hardening_contract_test.sql    2s
  PASS supabase/tests/rls/00563_proposal_signing_multi_studio.test.sql  0s

$ psql … -At -c "SELECT encode(extensions.digest(convert_to(prosrc,'UTF8'),'sha256'),'hex'), length(prosrc)
                 FROM pg_proc WHERE oid = 'public.set_invoice_studio_id()'::regprocedure;"
99100c8e3832adf7d7a27a22eab3651f3154d28be28dfeabe8d1dbd3f7ed2878|23102
```

That digest is byte-identical to the value pinned at
`supabase/tests/edge_api/public_sd_hardening_contract_test.sql:1710`, so the
re-pin is still correct against the deployed body after a clean replay.

```
$ pnpm --filter @patina/supabase type-check
> tsc --noEmit                                        (clean, no diagnostics)

$ pnpm --filter @patina/supabase test -- use-invoices
 ✓ src/hooks/__tests__/use-invoices.test.ts  (48 tests) 10ms
 Test Files  1 passed (1)      Tests  48 passed (48)

$ pnpm --filter @patina/designer-portal type-check
> tsc --noEmit                                        (clean, no diagnostics)

$ pnpm --filter @patina/client-portal type-check
> tsc --noEmit                                        (clean, no diagnostics)

$ pnpm --filter @patina/designer-portal test -- accounts desk-receivables
PASS src/components/document/accounts/__tests__/invoice-folio.test.tsx
PASS src/lib/document/__tests__/desk-receivables.test.ts
PASS src/components/document/accounts/accounts-query-states.test.tsx
Test Suites: 3 passed, 3 total     Tests: 12 passed, 12 total
```

Still deferred, unchanged: the Deno case in
`supabase/functions/_tests/stripe-rail.test.ts` needs the integration runtime
and did not run in this lane. The advisories listed under "Left as advisories"
above (F3–F8) are untouched — none were on this round's fix list.

---

## Fix round 3 (dispatched on review round 3 — findings R3-1, R3-2)

Both findings were one hole with two halves: `set_invoice_studio_id()`'s studio
branch judged the studio and the actor but never the pair the money hangs off —
the household and the member stamped to carry it. Closed in the INSERT arm of
the branch, which is where the project path judges the same things.

### R3-1 (blocker) — a studio invoice could be addressed to any profile

`00571:PART 2`, INSERT arm. Added, after the actor-membership `EXISTS`:

```sql
OR NOT EXISTS (
  SELECT 1
  FROM public.designer_clients AS studio_roster
  WHERE studio_roster.designer_id = NEW.designer_id
    AND studio_roster.client_id = NEW.client_id
)
```

S4 is now the row's law, not only the composer RPC's. The roster read is
RLS-safe for every actor the branch admits: `designer_clients_studio_rw`
(00316:39) is `USING (is_studio_comember(designer_id))`, so a co-member sees
the whole studio's roster, and the SECURITY DEFINER billing RPCs arrive as the
table owner. It takes no lock, so the pinned
`root -> user_roles -> memberships -> organization` order is untouched.

### R3-2 (major) — earnings could be routed to a non-designer

Same block: `OR NOT public.has_designer_domain_role(NEW.designer_id)`, and the
same requirement in `create_draft_studio_invoice` — on the roster-resolution
`SELECT` (`AND public.has_designer_domain_role(relationship.designer_id)`) and
on the post-lock re-validation. A household reachable only through a member who
holds no designer-domain role now raises `42501` from the RPC instead of
resolving to that member. PART 3's header comment, which used to say no
designer-domain role is required, was corrected.

### Where the two predicates are NOT applied, and why (evidence)

The UPDATE arm's studio branch carries a comment instead of the predicates.
`project_id`, `designer_id`, `client_id` and `studio_id` are immutable at the
top of that arm, so every row reaching it was already judged on insert — the
project path likewise judges its lead only on the insert path
(`has_designer_domain_role` at 00571:432/:514 sits under `IF NOT
v_immutable_update`). Re-asking on UPDATE is not free: with the predicates in
both arms, deleting the roster row while an invoice was outstanding stranded
it, because `issue_invoice`/`void_invoice` reach that arm as the owner.

```
PROBE issued: sent
PROBE void after roster deletion: accepted=f state=P0001 status=sent   <- both arms
PROBE void after roster deletion: accepted=t state=<NULL> status=void  <- INSERT arm only
```

Machine roles (`service_role`, a bare-postgres migration) still return before
this block, exactly as they did before this round — unchanged scope.

### The reviewer's probes, re-run against the fix

```
R3-1 P1 stranger household accepted=f state=P0001 rows=0
R3-2 P6 non-designer stamped accepted=f state=P0001 rows=0
CONTROL roster household   rows=1
```

### Hash re-pinned

`public.set_invoice_studio_id()` in
`supabase/tests/edge_api/public_sd_hardening_contract_test.sql`:

- was `99100c8e3832adf7d7a27a22eab3651f3154d28be28dfeabe8d1dbd3f7ed2878`
- now `03db693656dbaf6b747709b9514543bfabd19873b3f812d9054ec8d0371b7307`

Recomputed against the deployed body after `db reset`:
`encode(extensions.digest(convert_to(prosrc,'UTF8'),'sha256'),'hex')`. The
banner's inserted-line count moved 145 -> 171 (still zero project-path lines
removed). `create_draft_studio_invoice` is not pinned by the manifest (F4
stands), so no second hash moved.

### Tests added — `supabase/tests/billing/studio_invoice_test.sql`

Fixtures: member A now holds a `studio_designer` (designer-domain) role and
co-member B deliberately holds none; a second household (`…0006`) sits on B's
roster only, so it is roster-reachable and designer-unreachable.

- RPC: a household held only by a non-designer -> `42501`.
- Direct DML as A: a household on nobody's roster -> `P0001`, no row.
- Direct DML as A: stamping co-member B (roster satisfied, no designer role)
  -> `P0001`, no row.
- Direct DML as A: the roster household stamped to A still writes a clean
  draft — the predicates refuse only what they mean to.
- **Co-member edit as B** — the regression the RLS analysis predicted: B owns
  no roster row, so if the trigger's roster read were owner-only the co-member
  draft edit would break. It passes, proving the studio-wide policy.

`packages/supabase/src/database.types.ts` did not move (`pnpm db:generate`
produced no diff — neither function's signature changed), and no TypeScript was
touched this round.

### Gates

```
supabase db reset                     clean (tip 00571)
scripts/run-sql-tests.sh              total 157 | green 136 | expected-fail 21 | unexpected-fail 0
  billing/studio_invoice_test.sql               PASS
  billing/invoice_checkout_integrity_test.sql   PASS
  edge_api/public_sd_hardening_contract_test    PASS
  commercial/multi_studio_signature_test.sql    PASS
  rls/00563_proposal_signing_multi_studio       PASS
@patina/supabase type-check           clean
@patina/supabase test use-invoices    48 passed (48)
@patina/designer-portal type-check    clean
@patina/client-portal type-check      clean
@patina/designer-portal test accounts desk-receivables   3 suites, 12 passed
```

### Advisories still standing

F3, F4, F5, F7, F8 from round 1 are unchanged. **F6 is now closed** by R3-2.

---

## Close — the four ruled items (W1 CLOSE, 2026-09-05)

Fable ruled on `db-review-r3.md` / `db-review-r4.md`. Four items, nothing else.

### 1. The roster is the row's law on BOTH trigger arms (was R3-1 / R3-2's neighbour)

`public.set_invoice_studio_id()`, studio branch, both arms. The roster rule is
now the RPC's rule verbatim — the household must sit on the `designer_clients`
roster of an **active non-guest member of `NEW.studio_id`**, not (as the
previous round had it) of the stamped designer only:

```sql
OR NOT EXISTS (
  SELECT 1
  FROM public.designer_clients AS studio_roster
  JOIN public.organization_members AS roster_membership
    ON roster_membership.organization_id = NEW.studio_id
   AND roster_membership.user_id = studio_roster.designer_id
  WHERE studio_roster.client_id = NEW.client_id
    AND roster_membership.status = 'active'
    AND roster_membership.role <> 'guest'
)
```

- INSERT arm: the designer-keyed `EXISTS` is replaced by the studio-keyed one.
  `OR NOT public.has_designer_domain_role(NEW.designer_id)` stays as it was —
  identity is settled on insert, so that is where it is judged.
- UPDATE arm: the same predicate is **added** to the actor `IF`, replacing the
  comment that argued the arm should judge neither. The designer-domain check
  is deliberately not added there (designer_id is immutable on that arm).
- Error family unchanged: `RAISE EXCEPTION 'studio_id_not_designer_studio'`
  (`P0001`), the same the project path raises.
- Project-path lines stay byte-identical; the branch is now **187 inserted
  lines, 0 removed** across the two arms (the banner says so).
- Body hash re-pinned in `supabase/tests/edge_api/public_sd_hardening_contract_test.sql`:
  `03db693656db…` → `f39043a2f3d9f70f5bb8d97c23f436a1f159085a49dc961d928ca25723ee94a6`
  (`octet_length 25627`), and the pin's note now says both arms carry the roster.

Isolation probe (scratch transaction, not the suite) — the roster row is the
only variable:

```
no designer_clients row  → UPDATE invoices SET memo=… → ERROR: studio_id_not_designer_studio
                            CONTEXT: set_invoice_studio_id() line 91 at RAISE
same row, roster row added → UPDATE memo … OK; UPDATE title … OK
```

### 2. `resolve_studio_identity` short-circuits on an active design studio only

Step 0 no longer assigns `p_studio_id` blind. It resolves

```sql
SELECT o.id INTO v_studio_id
FROM organizations o
WHERE o.id = p_studio_id AND o.type = 'design_studio' AND o.status = 'active';
```

so a manufacturer id, an archived studio, or a dead id leaves `v_studio_id`
NULL and **falls through** to the project (step 1) and designer (step 2)
derivations. Closes R3-5 and R2-5: the anon-granted brand resolver cannot be
used as an organization-name lookup.

### 3. `title` joins the trigger's `UPDATE OF` list

00511's list predates the column, so a direct `UPDATE … SET title = …` never
fired the gate. 00571 now recreates the trigger with 00511:3076-3083's list
verbatim plus `title` appended. Both contract-test column arrays and the
normalized definition string are re-pinned (`…created_at,updated_at,title
oninvoices…`); `tgattr` orders `title` last (attnum 30), matching the arrays'
`array_position` ordering.

### 4. `idx_invoices_client`

```sql
CREATE INDEX IF NOT EXISTS idx_invoices_client
  ON public.invoices (client_id)
  WHERE client_id IS NOT NULL;
```

placed with PART 5, the household read path it exists for. `pg_indexes` for
`invoices` now lists it alongside the seven that were there.

### Tests added — `supabase/tests/billing/studio_invoice_test.sql`

New fixture: a `manufacturer` organization (`5f110000-…0004`, "Studio Invoice
Maker"). New blocks, all at the tail so nothing upstream shifts:

- structural — `pg_get_triggerdef` contains `title`; `pg_indexes` has
  `idx_invoices_client`.
- positive — a clean studio draft still edits its regarding line by direct DML.
- UPDATE-arm roster gate — `service_role` writes a studio invoice for a
  household on nobody's roster (it returns before the actor checks, as the
  project path lets it reconcile history); member A then cannot edit it:
  `memo` → `P0001`, `title` → `P0001` (that one reaches the trigger only
  because `title` is now watched), and the row is unchanged after both.
- resolver, as `anon` — a manufacturer id with a non-designer designer arg
  returns the all-NULL row (never "Studio Invoice Maker"); with designer A it
  falls through to `source = 'studio'` on a studio that is not the
  manufacturer; an active design studio id still returns "Studio Invoice Two".

The round-3 stranger-bill rejection and its positive control were already in
the suite (`'a household on nobody''s roster cannot be billed by hand'` and
`'a roster household stamped to a designer still writes a clean draft'`) and
still pass under the studio-wide rule.

`packages/supabase/src/database.types.ts` did not move — no signature changed;
no TypeScript was touched this round; no GRANT/REVOKE changed, so
`supabase/seed/00-legacy-grants.sql` needs no regeneration.

### Gates (W1 CLOSE)

```
supabase --workdir <wt> db reset                      "Finished supabase db reset" (clean, tip 00571)
bash <wt>/scripts/run-sql-tests.sh                    total 157 | green 136 | expected-fail 21
                                                      | unexpected-fail 0 | effective-green 157/157
  billing/studio_invoice_test.sql                     PASS
  edge_api/public_sd_hardening_contract_test.sql      PASS
  billing/invoice_checkout_integrity_test.sql         PASS
  commercial/multi_studio_signature_test.sql          PASS
  rls/00563_proposal_signing_multi_studio.test.sql    PASS
pnpm --filter @patina/supabase type-check             clean (tsc --noEmit)
pnpm --filter @patina/designer-portal type-check      clean (tsc --noEmit)
```

### Advisory left standing by these four

Widening the INSERT arm's roster from the stamped designer's to the studio's is
what the ruling asks for and is what the composer RPC resolves through, but it
is a real widening at the row: member A can now hand-write an invoice stamped
to themselves for a household that sits only on co-member B's roster (A still
needs a designer-domain role, and B must be an active non-guest member of the
same studio). The RPC would have stamped B for that household; direct DML may
now stamp A. Intra-studio, and the shared-workspace model already makes the
roster studio-wide (`designer_clients_studio_rw`, 00316:39).

Adding the roster to the UPDATE arm means an outstanding studio invoice becomes
uneditable — including by `issue_invoice` / `void_invoice`, which reach that arm
as the actor — the day the household leaves **every** member's roster of that
studio. Wider than the designer-keyed version would have been, so the stranding
window is narrower, but it is not zero.

`deploySet = ['migration 00571_studio_invoices.sql']`

---

## Fix round 1 (W1-close db lane) — C-1

**Finding C-1 (major, pre-existing from W1, not from the close round).** On the
UPDATE arm of `public.set_invoice_studio_id()`, the studio branch's
membership/studio-active `EXISTS` sat ABOVE the `service_role` / postgres early
return. So once the stamped designer was suspended or removed from the studio —
or the studio itself deactivated — every machine write to an outstanding studio
invoice raised `P0001 studio_id_not_designer_studio`: money captured at Stripe,
`invoice_payments` never flipped, invoice stranded at `sent`. The project path
has never behaved that way; its machine UPDATE checks only the project tuple and
`previous_lead`, never live membership status.

### The change

`supabase/migrations/00571_studio_invoices.sql`, UPDATE arm only:

- the `studio_id / designer_id / client_id IS NOT NULL` checks stay above the
  early return (they are cheap and they are the row's shape, not its authority);
- `IF v_active_role = 'service_role' OR v_postgres_migration THEN RETURN NEW`
  now comes next;
- the `organization_members` × `organizations` `EXISTS` (active non-guest member
  stamped as designer, of an active `design_studio`) moved BELOW it, into its own
  `IF NOT EXISTS ... RAISE` block.

The INSERT arm is untouched: live authority is still judged in full before the
row exists. The roster (`designer_clients`) check on the UPDATE arm was already
below the early return, inside the authenticated-actor block, so it did not move.
Every project-path line stays byte-identical to 00511's body; the branch is now
199 inserted lines across the two arms, zero removed (header count updated from
187).

Nothing can be reparented by the replay: `project_id`, `designer_id`,
`client_id` and `studio_id` are compared against `OLD` at the top of the arm and
raise on any drift, before this branch is reached.

### Re-pin

`supabase/tests/edge_api/public_sd_hardening_contract_test.sql`:

```
f39043a2f3d9f70f5bb8d97c23f436a1f159085a49dc961d928ca25723ee94a6   (before)
b6f0ab2a38d6bbbf286df30d115dac544dcae96ed494c3235692feafb9a3cc89   (after)
```

read back from the reset stack with

```
SELECT encode(extensions.digest(convert_to(prosrc,'UTF8'),'sha256'),'hex')
FROM pg_proc WHERE oid = to_regprocedure('public.set_invoice_studio_id()');
-> b6f0ab2a38d6bbbf286df30d115dac544dcae96ed494c3235692feafb9a3cc89
```

### Test

`supabase/tests/billing/studio_invoice_test.sql`, new final section "A settle
replays after the stamped designer has left the studio": a fresh studio invoice
is drafted and issued by member A; co-member B is promoted to owner so the studio
is never ownerless; A's own membership goes `suspended`; then as `service_role`
the Checkout rail runs claim -> finalize -> settle and the row must reach
`paid` / `amount_paid_cents = 40000` / `paid_at IS NOT NULL`.

**Negative control** (the test is not vacuous). The pre-fix function body
(`git show HEAD:supabase/migrations/00571_studio_invoices.sql`) was loaded into a
scratch transaction and the same suite replayed:

```
psql -v ON_ERROR_STOP=1 -f negctl.sql   EXIT=3
psql:supabase/tests/billing/studio_invoice_test.sql:905: ERROR:  studio_id_not_designer_studio
  PL/pgSQL function apply_invoice_payment_effects(uuid) line 42 at SQL statement
  SQL statement "SELECT public.apply_invoice_payment_effects(NEW.invoice_id)"
  PL/pgSQL function trg_invoice_payments_apply_effects() line 3 at PERFORM
  PL/pgSQL function claim_invoice_checkout_attempt(uuid,uuid,text,boolean,text) line 178
```

so the old ordering strands the money as early as the claim's rollup, and the fix
is what carries it.

### Gates (fix round 1)

```
supabase --workdir .codex/worktrees/agent-si-db db reset
  -> "Finished supabase db reset on branch main." / {"target":"local","message":"Reset local database."}

bash scripts/run-sql-tests.sh
  total:             157
  green:             136
  expected-fail:      21  (documented in supabase/tests/KNOWN_FAILURES.md)
  unexpected-fail:     0
  effective-green:   157 / 157
  billing/studio_invoice_test.sql                     PASS
  billing/invoice_checkout_integrity_test.sql         PASS
  edge_api/public_sd_hardening_contract_test.sql      PASS

pnpm --filter @patina/supabase type-check             clean (tsc --noEmit)
pnpm --filter @patina/designer-portal type-check      clean (tsc --noEmit)
```

### Advisory now standing

The UPDATE arm no longer refuses a machine write when the stamped designer has
left, but an **authenticated** actor still cannot touch an outstanding studio
invoice once the household has left every member's roster of that studio —
`issue_invoice` / `void_invoice` reach that arm as the actor. That stranding
window (unchanged by this fix) is the one recorded in the close-round advisory
above.

`deploySet = ['migration 00571_studio_invoices.sql']`
